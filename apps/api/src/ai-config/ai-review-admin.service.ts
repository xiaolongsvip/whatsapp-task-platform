import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@wtp/database";

@Injectable()
export class AiReviewAdminService {
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
    const cleanReason = reason.trim();
    if (!cleanReason) throw new BadRequestException("请填写审核理由。");

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM ai_review_jobs WHERE id = ${jobId}::uuid FOR UPDATE
      `;
      const job = await tx.aiReviewJob.findUnique({
        where: { id: jobId },
        include: {
          submission: {
            include: {
              claim: {
                include: {
                  task: true,
                  contactAssignment: true,
                  taskSlot: true,
                },
              },
            },
          },
        },
      });
      if (!job) throw new NotFoundException("审核记录不存在。");
      if (job.status !== "NEEDS_REVIEW") {
        throw new ConflictException("只有待人工审核的记录可以执行此操作。");
      }

      const submission = job.submission;
      const claim = submission.claim;
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(submission.status) ||
          !["SUBMITTED", "UNDER_REVIEW"].includes(claim.status)) {
        throw new ConflictException("任务或提交状态已变化，不能重复审核。");
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
        await tx.taskSubmission.update({
          where: { id: submission.id },
          data: { status: "APPROVED" },
        });
        await tx.taskClaim.update({
          where: { id: claim.id },
          data: { status: "APPROVED" },
        });
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
        await tx.taskSubmission.update({
          where: { id: submission.id },
          data: { status: "REJECTED" },
        });
        await tx.taskClaim.update({
          where: { id: claim.id },
          data: { status: "REJECTED" },
        });
      }

      await tx.aiReviewJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          decision,
          reason: cleanReason,
          lockedAt: null,
          lastError: null,
        },
      });

      return {
        success: true,
        jobId: job.id,
        submissionId: submission.id,
        claimId: claim.id,
        decision,
        submissionStatus: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        claimStatus: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      };
    });
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

}
