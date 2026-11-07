import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@wtp/database";
import { S3ObjectStorageService } from "../tasks/s3-object-storage.service";

@Injectable()
export class AiReviewAdminService {
  constructor(private readonly storage: S3ObjectStorageService) {}

  async getEvidence(submissionId: string) {
    const submission = await prisma.taskSubmission.findUnique({
      where: { id: submissionId },
      select: { objectKey: true, mimeType: true, originalName: true },
    });
    if (!submission) throw new NotFoundException("任务提交记录不存在。");
    const buffer = await this.storage.getObjectBuffer(submission.objectKey);
    const mimeType = ["image/jpeg", "image/png", "image/webp"].includes(submission.mimeType || "")
      ? submission.mimeType!
      : "application/octet-stream";
    return { buffer, mimeType, originalName: submission.originalName || "evidence" };
  }

  async list(status?: string, page = 1, pageSize = 20) {
    const allowed = ["PENDING", "PROCESSING", "RETRY", "COMPLETED", "NEEDS_REVIEW"];
    const normalized = status && allowed.includes(status) ? status : undefined;
    const take = Math.min(100, Math.max(1, pageSize));
    const skip = (Math.max(1, page) - 1) * take;
    const where = normalized ? { status: normalized as never } : {};
    const [total, jobs] = await prisma.$transaction([
      prisma.aiReviewJob.count({ where }),
      prisma.aiReviewJob.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
        include: {
          submission: {
            include: {
              claim: {
                include: {
                  task: { select: { id: true, title: true, rewardMinor: true, currency: true } },
                  user: { select: { id: true, phone: true } },
                },
              },
            },
          },
        },
      }),
    ]);
    return {
      page: Math.max(1, page),
      pageSize: take,
      total,
      jobs: jobs.map((job) => ({
        id: job.id,
        status: job.status,
        attemptCount: job.attemptCount,
        nextAttemptAt: job.nextAttemptAt.toISOString(),
        lastError: job.lastError,
        decision: job.decision,
        confidence: job.confidence,
        reason: job.reason,
        extractedText: job.extractedText,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        submission: {
          id: job.submission.id,
          status: job.submission.status,
          originalName: job.submission.originalName,
          mimeType: job.submission.mimeType,
          sizeBytes: job.submission.sizeBytes,
          submittedAt: job.submission.submittedAt.toISOString(),
          note: job.submission.note,
        },
        task: {
          id: job.submission.claim.task.id,
          title: job.submission.claim.task.title,
          rewardMinor: job.submission.claim.task.rewardMinor.toString(),
          currency: job.submission.claim.task.currency.trim(),
        },
        user: {
          id: job.submission.claim.user.id,
          phone: job.submission.claim.user.phone,
        },
      })),
    };
  }
  async review(jobId: string, adminId: string, decision: "APPROVE" | "REJECT", reason: string) {
    const job = await prisma.aiReviewJob.findUnique({
      where: { id: jobId },
      select: { submissionId: true },
    });
    if (!job) throw new NotFoundException("审核记录不存在。");

    // Both admin routes converge on the submission row lock and the same
    // transactional decision path. This prevents the job route and the
    // submission route from making competing decisions for one submission.
    return this.reviewSubmission(job.submissionId, adminId, decision, reason);
  }

  async reviewSubmission(submissionId: string, adminId: string, decision: "APPROVE" | "REJECT", reason: string) {
    const cleanReason = reason.trim();
    if (!cleanReason) throw new BadRequestException("请填写审核理由。");

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM task_submissions WHERE id = ${submissionId}::uuid FOR UPDATE
      `;
      const submission = await tx.taskSubmission.findUnique({
        where: { id: submissionId },
        include: {
          aiReviewJob: true,
          claim: {
            include: {
              task: true,
              contactAssignment: true,
              taskSlot: true,
            },
          },
        },
      });
      if (!submission) throw new NotFoundException("任务提交记录不存在。");
      const claim = submission.claim;
      if (submission.aiReviewJob && submission.aiReviewJob.status !== "NEEDS_REVIEW") {
        throw new ConflictException("AI 审核任务尚未进入人工处理状态，请稍后刷新。");
      }
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(submission.status) ||
          !["SUBMITTED", "UNDER_REVIEW"].includes(claim.status)) {
        throw new ConflictException("该提交已处理或状态已变化，不能重复审核。");
      }

      await tx.taskReview.create({
        data: {
          submissionId: submission.id,
          reviewerAdminId: adminId,
          decision,
          reason: cleanReason,
        },
      });

      if (decision === "APPROVE") {
        const wallet = await tx.wallet.upsert({
          where: { userId_currency: { userId: claim.userId, currency: claim.task.currency } },
          create: { userId: claim.userId, currency: claim.task.currency },
          update: {},
        });
        await tx.ledgerEntry.createMany({
          data: [{
            walletId: wallet.id,
            sourceType: "TASK_REWARD",
            sourceId: claim.id,
            direction: "CREDIT",
            amountMinor: claim.task.rewardMinor,
            currency: claim.task.currency,
            idempotencyKey: `task-reward:${claim.id}`,
          }],
          skipDuplicates: true,
        });
        await tx.taskSubmission.update({ where: { id: submission.id }, data: { status: "APPROVED" } });
        await tx.taskClaim.update({ where: { id: claim.id }, data: { status: "APPROVED" } });
        if (claim.contactAssignment) {
          await tx.contactAssignment.update({
            where: { id: claim.contactAssignment.id },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
          await tx.contactNumber.updateMany({
            where: { id: claim.contactAssignment.contactNumberId, status: "ASSIGNED" },
            data: { status: "USED" },
          });
        }
        if (claim.taskSlot) {
          await tx.taskSlot.updateMany({
            where: { id: claim.taskSlot.id, status: "ASSIGNED", claimId: claim.id },
            data: { status: "USED", usedAt: new Date() },
          });
        }
      } else {
        await tx.taskSubmission.update({ where: { id: submission.id }, data: { status: "REJECTED" } });
        await tx.taskClaim.update({ where: { id: claim.id }, data: { status: "REJECTED" } });
      }

      if (submission.aiReviewJob) {
        await tx.aiReviewJob.update({
          where: { id: submission.aiReviewJob.id },
          data: {
            status: "COMPLETED",
            decision,
            reason: cleanReason,
            lockedAt: null,
            lastError: null,
          },
        });
      }

      return {
        success: true,
        submissionId: submission.id,
        claimId: claim.id,
        decision,
        submissionStatus: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        claimStatus: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      };
    });
  }

  async listSubmissions(status?: string, page = 1, pageSize = 20) {
    const allowed = ["SUBMITTED", "UNDER_REVIEW"];
    const normalized = status && allowed.includes(status) ? status : undefined;
    const take = Math.min(100, Math.max(1, pageSize));
    const skip = (Math.max(1, page) - 1) * take;
    const where = {
      status: normalized ? normalized as never : { in: allowed as never[] },
      OR: [
        { aiReviewJob: { is: null } },
        { aiReviewJob: { is: { status: "NEEDS_REVIEW" as never } } },
      ],
    };
    const [total, submissions] = await prisma.$transaction([
      prisma.taskSubmission.count({ where }),
      prisma.taskSubmission.findMany({
        where,
        orderBy: [{ submittedAt: "asc" }],
        skip,
        take,
        include: {
          aiReviewJob: { select: { id: true, status: true, decision: true, confidence: true, reason: true } },
          claim: {
            include: {
              task: { select: { id: true, title: true, rewardMinor: true, currency: true } },
              user: { select: { id: true, phone: true } },
            },
          },
        },
      }),
    ]);
    return {
      page: Math.max(1, page),
      pageSize: take,
      total,
      submissions: submissions.map((submission) => ({
        id: submission.id,
        status: submission.status,
        originalName: submission.originalName,
        mimeType: submission.mimeType,
        sizeBytes: submission.sizeBytes,
        submittedAt: submission.submittedAt.toISOString(),
        note: submission.note,
        aiReview: submission.aiReviewJob,
        task: {
          id: submission.claim.task.id,
          title: submission.claim.task.title,
          rewardMinor: submission.claim.task.rewardMinor.toString(),
          currency: submission.claim.task.currency.trim(),
        },
        user: {
          id: submission.claim.user.id,
          phone: submission.claim.user.phone,
        },
      })),
    };
  }


  async listCenter(status?: string, page = 1, pageSize = 20) {
    const allowed = ["MANUAL_REVIEW", "SMART_REVIEW", "APPROVED", "REJECTED"];
    const normalized = status && allowed.includes(status) ? status : undefined;
    const take = Math.min(100, Math.max(1, pageSize));
    const currentPage = Math.max(1, page);
    const skip = (currentPage - 1) * take;
    const where = normalized === "MANUAL_REVIEW"
      ? { status: { in: ["SUBMITTED", "UNDER_REVIEW"] as never[] }, OR: [
          { aiReviewJob: { is: null } },
          { aiReviewJob: { is: { status: "NEEDS_REVIEW" as never } } },
        ] }
      : normalized === "SMART_REVIEW"
        ? { aiReviewJob: { is: { status: { in: ["PENDING", "PROCESSING", "RETRY"] as never[] } } } }
        : normalized === "APPROVED" ? { status: "APPROVED" as never }
        : normalized === "REJECTED" ? { status: "REJECTED" as never } : {};
    const [total, submissions, manualReview, smartReview, approved, rejected] = await prisma.$transaction([
      prisma.taskSubmission.count({ where }),
      prisma.taskSubmission.findMany({
        where,
        orderBy: [{ submittedAt: "desc" }],
        skip,
        take,
        include: {
          aiReviewJob: true,
          reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
          claim: {
            include: {
              task: { select: { id: true, title: true, rewardMinor: true, currency: true } },
              user: { select: { id: true, phone: true, profile: { select: { reputationScore: true } } } },
              contactAssignment: { include: { contactNumber: { select: { phoneE164: true } } } },
            },
          },
        },
      }),
      prisma.taskSubmission.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, OR: [
        { aiReviewJob: { is: null } }, { aiReviewJob: { is: { status: "NEEDS_REVIEW" } } },
      ] } }),
      prisma.taskSubmission.count({ where: { aiReviewJob: { is: { status: { in: ["PENDING", "PROCESSING", "RETRY"] } } } } }),
      prisma.taskSubmission.count({ where: { status: "APPROVED" } }),
      prisma.taskSubmission.count({ where: { status: "REJECTED" } }),
    ]);
    const records = submissions.map((submission) => {
      const job = submission.aiReviewJob;
      const latestReview = submission.reviews[0] ?? null;
      const centerStatus = submission.status === "APPROVED" ? "APPROVED"
        : submission.status === "REJECTED" ? "REJECTED"
        : job && ["PENDING", "PROCESSING", "RETRY"].includes(job.status) ? "SMART_REVIEW"
        : "MANUAL_REVIEW";
      return {
        id: submission.id, status: centerStatus, submissionStatus: submission.status,
        submittedAt: submission.submittedAt.toISOString(), originalName: submission.originalName,
        mimeType: submission.mimeType, sizeBytes: submission.sizeBytes, note: submission.note,
        ai: job ? { id: job.id, status: job.status, decision: job.decision, confidence: job.confidence,
          reason: job.reason, extractedText: job.extractedText, attemptCount: job.attemptCount,
          lastError: job.lastError, updatedAt: job.updatedAt.toISOString() } : null,
        latestReview: latestReview ? { decision: latestReview.decision, reason: latestReview.reason,
          reviewedAt: latestReview.reviewedAt.toISOString() } : null,
        task: { id: submission.claim.task.id, title: submission.claim.task.title,
          rewardMinor: submission.claim.task.rewardMinor.toString(), currency: submission.claim.task.currency.trim() },
        claim: { id: submission.claim.id, status: submission.claim.status },
        user: { id: submission.claim.user.id, phone: submission.claim.user.phone,
          reputationScore: submission.claim.user.profile?.reputationScore ?? 60 },
        targetPhone: submission.claim.contactAssignment?.contactNumber.phoneE164 ?? null,
      };
    });
    return { page: currentPage, pageSize: take, total, stats: { manualReview, smartReview, approved, rejected, risk: 0 }, records };
  }
}
