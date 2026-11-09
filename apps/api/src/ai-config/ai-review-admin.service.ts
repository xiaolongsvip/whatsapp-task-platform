import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@wtp/database";
import { S3ObjectStorageService } from "../tasks/s3-object-storage.service";

@Injectable()
export class AiReviewAdminService {
  constructor(private readonly storage: S3ObjectStorageService) {}

  async getEvidence(submissionId: string) {
    const submission = await prisma.taskSubmission.findUnique({
      where: { id: submissionId },
      select: { objectKey: true, mimeType: true, originalName: true, evidenceDeletedAt: true },
    });
    if (!submission) throw new NotFoundException("任务提交记录不存在。");
    if (submission.evidenceDeletedAt) throw new NotFoundException("该截图已超过保留期限并从对象存储删除。");
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

        // Apply the commission rule that is active at the moment the task is
        // approved. The claim row is locked above and this whole settlement is
        // one transaction, so retries cannot pay the same referral twice.
        const commissionRow = await tx.taskConfiguration.findUnique({
          where: { key: "referral-commission" },
          select: { value: true },
        });
        const commissionConfig = commissionRow?.value && typeof commissionRow.value === "object" && !Array.isArray(commissionRow.value)
          ? commissionRow.value as Record<string, unknown>
          : {};
        const commissionEnabled = commissionConfig.enabled !== false;
        if (commissionEnabled && claim.task.rewardMinor > 0n) {
          const ancestors = await tx.referralAncestor.findMany({
            where: { descendantUserId: claim.userId, depth: { in: [1, 2, 3] }, ancestor: { status: "ACTIVE" } },
            select: { ancestorUserId: true, depth: true },
            orderBy: { depth: "asc" },
          });
          const rates = new Map<number, number>([
            [1, Number(commissionConfig.level1 ?? 60)],
            [2, Number(commissionConfig.level2 ?? 25)],
            [3, Number(commissionConfig.level3 ?? 15)],
          ]);
          for (const ancestor of ancestors) {
            const rate = rates.get(ancestor.depth) ?? 0;
            if (!Number.isFinite(rate) || rate <= 0 || rate > 100) continue;
            // Settings accept one decimal place; convert to basis points to
            // keep all money calculations in integer minor units.
            const basisPoints = BigInt(Math.round(rate * 100));
            const commissionMinor = (claim.task.rewardMinor * basisPoints) / 10000n;
            if (commissionMinor <= 0n) continue;
            const idempotencyKey = `referral-commission:${claim.id}:L${ancestor.depth}:${ancestor.ancestorUserId}`;
            await tx.referralReward.create({
              data: {
                beneficiaryId: ancestor.ancestorUserId,
                sourceUserId: claim.userId,
                sourceEventId: claim.id,
                depth: ancestor.depth,
                amountMinor: commissionMinor,
                currency: claim.task.currency,
                idempotencyKey,
              },
            });
            const commissionWallet = await tx.wallet.upsert({
              where: { userId_currency: { userId: ancestor.ancestorUserId, currency: claim.task.currency } },
              create: { userId: ancestor.ancestorUserId, currency: claim.task.currency },
              update: {},
            });
            await tx.ledgerEntry.create({
              data: {
                walletId: commissionWallet.id,
                sourceType: "REFERRAL_COMMISSION",
                sourceId: claim.id,
                direction: "CREDIT",
                amountMinor: commissionMinor,
                currency: claim.task.currency,
                idempotencyKey,
              },
            });
          }
        }
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


  async getEvidenceDetail(submissionId: string) {
    const configuredDays = Number(process.env.TASK_EVIDENCE_RETENTION_DAYS ?? 30);
    const retentionDays = Number.isInteger(configuredDays) && configuredDays >= 1 && configuredDays <= 3650 ? configuredDays : 30;
    const item = await prisma.taskSubmission.findUnique({
      where: { id: submissionId },
      include: {
        aiReviewJob: true,
        reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
        claim: {
          include: {
            task: { select: { id: true, title: true, category: true, rewardMinor: true, currency: true } },
            user: { select: { id: true, phone: true } },
            contactAssignment: { include: { contactNumber: { select: { phoneE164: true } } } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException("截图证据记录不存在。");
    const review = item.reviews[0] ?? null;
    return {
      id: item.id,
      userPhone: item.claim.user.phone,
      targetPhone: item.claim.contactAssignment?.contactNumber.phoneE164 ?? null,
      taskTitle: item.claim.task.title,
      taskId: item.claim.task.id,
      taskCategory: item.claim.task.category,
      claimId: item.claimId,
      claimStatus: item.claim.status,
      submissionStatus: item.status,
      source: "实时屏幕截图",
      captureMode: "APP 任务提交",
      trustLevel: "未评估",
      reviewStatus: item.aiReviewJob?.status === "NEEDS_REVIEW" ? "人工复核" :
        ["PENDING", "PROCESSING", "RETRY"].includes(item.aiReviewJob?.status ?? "") ? "智能审核中" :
        item.status === "APPROVED" ? "AI 自动审核通过" : item.status === "REJECTED" ? "已拒绝" : "已提交",
      reviewDecision: review?.decision ?? item.aiReviewJob?.decision ?? null,
      reviewReason: review?.reason ?? item.aiReviewJob?.reason ?? null,
      reviewedAt: review?.reviewedAt.toISOString() ?? null,
      aiConfidence: item.aiReviewJob?.confidence ?? null,
      aiReason: item.aiReviewJob?.reason ?? null,
      extractedText: item.aiReviewJob?.extractedText ?? null,
      originalName: item.originalName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      note: item.note,
      submittedAt: item.submittedAt.toISOString(),
      objectKey: item.objectKey,
      imageDimensions: null,
      contentHash: item.contentSha256,
      retentionStatus: item.evidenceDeletedAt ? "DELETED" : item.evidenceDeleteLastError ? "DELETE_FAILED" :
        item.submittedAt.getTime() <= Date.now() - retentionDays * 24 * 60 * 60 * 1000 ? "PENDING_DELETION" : "NORMAL",
      retentionUntil: new Date(item.submittedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString(),
      deletionAttempts: item.evidenceDeleteAttempts,
      archivedAt: item.evidenceDeletedAt?.toISOString() ?? null,
      nextRetryAt: item.evidenceDeleteNextAttemptAt?.toISOString() ?? null,
      lastStorageError: item.evidenceDeleteLastError,
    };
  }

  async listEvidenceRecords(input: { page?: number; pageSize?: number; keyword?: string; status?: string; taskType?: string }) {
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(input.pageSize) || 20)));
    const keyword = input.keyword?.trim() ?? "";
    const status = input.status || "ALL";
    const configuredDays = Number(process.env.TASK_EVIDENCE_RETENTION_DAYS ?? 30);
    const retentionDays = Number.isInteger(configuredDays) && configuredDays >= 1 && configuredDays <= 3650 ? configuredDays : 30;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const where: any = {};
    if (status === "SUBMITTED") where.status = { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"] };
    if (status === "URL_ISSUED") where.id = "00000000-0000-0000-0000-000000000000";
    if (keyword) where.OR = [
      { id: { contains: keyword, mode: "insensitive" } },
      { originalName: { contains: keyword, mode: "insensitive" } },
      { claim: { is: { user: { is: { phone: { contains: keyword } } } } } },
      { claim: { is: { task: { is: { title: { contains: keyword, mode: "insensitive" } } } } } },
    ];
    if (input.taskType === "TASK") where.claim = { is: { task: { is: { category: { not: "" } } } } };
    const terminalStatuses = { status: { in: ["APPROVED", "REJECTED"] } };
    const [total, submissions, markedForDeletion, deletedObjects, deleteFailures] = await prisma.$transaction([
      prisma.taskSubmission.count({ where }),
      prisma.taskSubmission.findMany({
        where, orderBy: { submittedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
        include: {
          aiReviewJob: { select: { status: true } },
          claim: {
            include: {
              task: { select: { id: true, title: true, category: true } },
              user: { select: { id: true, phone: true } },
              contactAssignment: { include: { contactNumber: { select: { phoneE164: true } } } },
            },
          },
        },
      }),
      prisma.taskSubmission.count({ where: { ...terminalStatuses, submittedAt: { lte: cutoff }, evidenceDeletedAt: null } }),
      prisma.taskSubmission.count({ where: { evidenceDeletedAt: { not: null } } }),
      prisma.taskSubmission.count({ where: { evidenceDeleteLastError: { not: null }, evidenceDeletedAt: null } }),
    ]);
    return {
      page, pageSize, total,
      stats: { total, filtered: submissions.length, markedForDeletion, deletedObjects, deleteFailures },
      records: submissions.map((item) => ({
        id: item.id, userPhone: item.claim.user.phone, targetPhone: item.claim.contactAssignment?.contactNumber.phoneE164 ?? null,
        status: item.status,
        retentionStatus: item.evidenceDeletedAt ? "DELETED" : item.evidenceDeleteLastError ? "DELETE_FAILED" :
          item.submittedAt <= cutoff && ["APPROVED", "REJECTED"].includes(item.status) ? "PENDING_DELETION" : "NORMAL",
        retentionUntil: new Date(item.submittedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString(),
        deletionAttempts: item.evidenceDeleteAttempts,
        archivedAt: item.evidenceDeletedAt?.toISOString() ?? null,
        nextRetryAt: item.evidenceDeleteNextAttemptAt?.toISOString() ?? null,
        lastStorageError: item.evidenceDeleteLastError,
        source: "实时屏幕截图",
        reviewStatus: item.aiReviewJob?.status === "NEEDS_REVIEW" ? "人工复核" :
          ["PENDING", "PROCESSING", "RETRY"].includes(item.aiReviewJob?.status ?? "") ? "智能审核中" :
          item.status === "APPROVED" ? "AI 自动审核通过" : item.status === "REJECTED" ? "已拒绝" : "已提交",
        submittedAt: item.submittedAt.toISOString(), originalName: item.originalName,
        mimeType: item.mimeType, sizeBytes: item.sizeBytes, taskTitle: item.claim.task.title,
      })),
    };
  }

  async rerunAiReview(submissionId: string, adminId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM task_submissions WHERE id = ${submissionId}::uuid FOR UPDATE
      `;
      const submission = await tx.taskSubmission.findUnique({
        where: { id: submissionId },
        include: { aiReviewJob: true, claim: true },
      });
      if (!submission) throw new NotFoundException("任务提交记录不存在。");
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(submission.status) ||
          !["SUBMITTED", "UNDER_REVIEW"].includes(submission.claim.status)) {
        throw new ConflictException("只有尚未完成审核的提交才能重新触发 AI 审核，已通过或已拒绝的记录不能重审。");
      }
      if (!submission.aiReviewJob) {
        throw new ConflictException("该提交没有 AI 审核任务，不能从此处重新触发。");
      }
      if (submission.aiReviewJob.status === "PROCESSING") {
        throw new ConflictException("AI 正在处理该提交，请勿重复触发。");
      }
      const job = await tx.aiReviewJob.update({
        where: { id: submission.aiReviewJob.id },
        data: {
          status: "PENDING",
          attemptCount: 0,
          nextAttemptAt: new Date(),
          lockedAt: null,
          lastError: null,
          decision: null,
          confidence: null,
          reason: null,
          extractedText: null,
        },
      });
      await tx.taskSubmission.update({ where: { id: submission.id }, data: { status: "SUBMITTED" } });
      await tx.taskClaim.update({ where: { id: submission.claimId }, data: { status: "SUBMITTED" } });
      await tx.auditEvent.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          action: "AI_REVIEW_RERUN",
          targetType: "TaskSubmission",
          targetId: submission.id,
          metadata: { jobId: job.id, previousStatus: submission.aiReviewJob.status },
        },
      });
      return { success: true, submissionId: submission.id, jobId: job.id, status: job.status };
    });
  }


  async listRiskEvents(input: { page?: number; pageSize?: number; keyword?: string; level?: string; status?: string }) {
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(input.pageSize) || 20)));
    const keyword = input.keyword?.trim() || null;
    const level = input.level?.trim() || null;
    const status = input.status?.trim() || null;
    const skip = (page - 1) * pageSize;
    const [statsRows, rows] = await Promise.all([
      prisma.$queryRaw<Array<{ total: bigint; open: bigint; high: bigint; critical: bigint; affectedUsers: bigint }>>`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE COALESCE(metadata->>'status', 'OPEN') = 'OPEN')::bigint AS open,
          COUNT(*) FILTER (WHERE COALESCE(metadata->>'riskLevel',
            CASE
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 90 THEN 'CRITICAL'
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 70 THEN 'HIGH'
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 40 THEN 'MEDIUM'
              ELSE 'LOW'
            END) = 'HIGH')::bigint AS high,
          COUNT(*) FILTER (WHERE COALESCE(metadata->>'riskLevel',
            CASE
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 90 THEN 'CRITICAL'
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 70 THEN 'HIGH'
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 40 THEN 'MEDIUM'
              ELSE 'LOW'
            END) = 'CRITICAL')::bigint AS critical,
          COUNT(DISTINCT COALESCE(NULLIF(metadata->>'userId', ''), actor_id::text))::bigint AS "affectedUsers"
        FROM audit_events
        WHERE (target_type = 'RISK_EVENT' OR LEFT(action, 5) = 'RISK_')
          AND target_type <> 'RISK_RULE'
          AND (${keyword}::text IS NULL OR action ILIKE '%' || ${keyword} || '%'
            OR COALESCE(target_id, '') ILIKE '%' || ${keyword} || '%'
            OR COALESCE(metadata->>'riskType', '') ILIKE '%' || ${keyword} || '%'
            OR COALESCE(metadata->>'phone', '') ILIKE '%' || ${keyword} || '%'
            OR COALESCE(metadata->>'userId', '') ILIKE '%' || ${keyword} || '%'
            OR COALESCE(metadata->>'description', '') ILIKE '%' || ${keyword} || '%')
          AND (${status}::text IS NULL OR COALESCE(metadata->>'status', 'OPEN') = ${status})
          AND (${level}::text IS NULL OR COALESCE(metadata->>'riskLevel',
            CASE
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 90 THEN 'CRITICAL'
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 70 THEN 'HIGH'
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 40 THEN 'MEDIUM'
              ELSE 'LOW'
            END) = ${level})
      `,
      prisma.$queryRaw<Array<{ id: string; action: string; targetId: string | null; metadata: unknown; actorId: string | null; createdAt: Date }>>`
        SELECT id, action, target_id AS "targetId", metadata, actor_id AS "actorId", created_at AS "createdAt"
        FROM audit_events
        WHERE (target_type = 'RISK_EVENT' OR LEFT(action, 5) = 'RISK_')
          AND target_type <> 'RISK_RULE'
          AND (${keyword}::text IS NULL OR action ILIKE '%' || ${keyword} || '%'
            OR COALESCE(target_id, '') ILIKE '%' || ${keyword} || '%'
            OR COALESCE(metadata->>'riskType', '') ILIKE '%' || ${keyword} || '%'
            OR COALESCE(metadata->>'phone', '') ILIKE '%' || ${keyword} || '%'
            OR COALESCE(metadata->>'userId', '') ILIKE '%' || ${keyword} || '%'
            OR COALESCE(metadata->>'description', '') ILIKE '%' || ${keyword} || '%')
          AND (${status}::text IS NULL OR COALESCE(metadata->>'status', 'OPEN') = ${status})
          AND (${level}::text IS NULL OR COALESCE(metadata->>'riskLevel',
            CASE
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 90 THEN 'CRITICAL'
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 70 THEN 'HIGH'
              WHEN (CASE WHEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', '')) ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN COALESCE(NULLIF(metadata->>'riskScore', ''), NULLIF(metadata->>'score', ''))::numeric ELSE 0 END) >= 40 THEN 'MEDIUM'
              ELSE 'LOW'
            END) = ${level})
        ORDER BY created_at DESC, id DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `,
    ]);
    const events = rows.map((row) => {
      const meta = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
      const rawScore = Number(meta.riskScore ?? meta.score ?? 0);
      const score = Number.isFinite(rawScore) ? rawScore : 0;
      const level = String(meta.riskLevel ?? (score >= 90 ? "CRITICAL" : score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW"));
      return { id: row.id, type: String(meta.riskType ?? row.action), level, score, status: String(meta.status ?? "OPEN"), userId: String(meta.userId ?? row.actorId ?? ""), phone: String(meta.phone ?? ""), createdAt: row.createdAt.toISOString(), description: String(meta.description ?? meta.reason ?? "") };
    });
    const stats = statsRows[0];
    return {
      events, total: Number(stats?.total ?? 0n), page, pageSize,
      stats: { open: Number(stats?.open ?? 0n), high: Number(stats?.high ?? 0n), critical: Number(stats?.critical ?? 0n), affectedUsers: Number(stats?.affectedUsers ?? 0n) },
    };
  }

  async listRiskUsers(input: { keyword?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, input.page || 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize || 20));
    const where: any = { isFlagged: true };
    if (input.keyword) where.OR = [{ user: { phone: { contains: input.keyword, mode: "insensitive" } } }, { deviceIdentifier: { contains: input.keyword, mode: "insensitive" } }];
    const [total, devices] = await prisma.$transaction([
      prisma.userDevice.count({ where }),
      prisma.userDevice.findMany({ where, include: { user: { include: { profile: true } } }, orderBy: { lastSeenAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page, pageSize, users: devices.map(d => ({ id: d.user.id, phone: d.user.phone, device: d.deviceIdentifier, reason: d.flagReason, reputationScore: d.user.profile?.reputationScore ?? 0, status: d.status, lastSeenAt: d.lastSeenAt.toISOString() })) };
  }

  async listRiskRules() {
    const count = await prisma.riskRule.count();
    if (count === 0) {
      await prisma.riskRule.createMany({ data: [
        { name: "中风险判定线", category: "RISK_LEVEL_THRESHOLD", description: "综合风险分达到该分值后，用户或任务会被标记为中风险。", impactScore: 40, executionOrder: 10, status: "ACTIVE" },
        { name: "高风险判定线", category: "RISK_LEVEL_THRESHOLD", description: "综合风险分达到该分值后，用户或任务会被标记为高风险。", impactScore: 70, executionOrder: 20, status: "ACTIVE" },
        { name: "严重风险判定线", category: "RISK_LEVEL_THRESHOLD", description: "综合风险分达到该分值后，用户或任务会被标记为严重风险。", impactScore: 90, executionOrder: 30, status: "ACTIVE" },
        { name: "任务通过后的信誉变化", category: "CREDIT_SCORE", description: "任务审核通过后，提高用户信誉分。", impactScore: 1, executionOrder: 200, status: "ACTIVE" },
        { name: "任务拒绝后的信誉变化", category: "CREDIT_SCORE", description: "任务审核被拒绝后，降低用户信誉分。", impactScore: -8, executionOrder: 210, status: "ACTIVE" },
        { name: "任务冻结后的信誉变化", category: "CREDIT_SCORE", description: "任务触发风控冻结后，降低用户信誉分。", impactScore: -12, executionOrder: 220, status: "ACTIVE" },
        { name: "设备关联检测", category: "DEVICE_ASSOCIATION", description: "识别多个账户使用相同设备的异常关联。", impactScore: 20, executionOrder: 100, status: "ACTIVE" },
        { name: "网络关联检测", category: "NETWORK_ASSOCIATION", description: "识别多个账户共享异常网络环境的情况。", impactScore: 20, executionOrder: 110, status: "ACTIVE" },
        { name: "支付关联检测", category: "PAYMENT_ASSOCIATION", description: "识别多个账户之间的异常支付关联。", impactScore: 30, executionOrder: 120, status: "ACTIVE" },
        { name: "任务行为异常检测", category: "TASK_BEHAVIOR_ANOMALY", description: "检测任务领取、执行和提交过程中的异常行为。", impactScore: 10, executionOrder: 250, status: "ACTIVE" },
      ] });
    }
    return prisma.riskRule.findMany({ orderBy: [{ executionOrder: "asc" }, { createdAt: "desc" }] });
  }

  async createRiskRule(input: { name: string; category: string; impactScore: number; executionOrder: number; startsAt?: string; endsAt?: string; status: string; description?: string }, adminId: string) {
    if (!input.name?.trim() || !input.category?.trim()) throw new BadRequestException("规则名称和规则分类不能为空。");
    const rule = await prisma.riskRule.create({ data: { name: input.name.trim(), category: input.category, impactScore: Number(input.impactScore) || 0, executionOrder: Number(input.executionOrder) || 100, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null, status: input.status || "DRAFT", description: input.description?.trim() || null } });
    await prisma.auditEvent.create({ data: { actorType: "ADMIN", actorId: adminId, action: "RISK_RULE_CREATED", targetType: "RISK_RULE", targetId: rule.id, metadata: { category: rule.category } } });
    return rule;
  }

  async updateRiskRule(id: string, input: { name?: string; category?: string; impactScore?: number; executionOrder?: number; startsAt?: string | null; endsAt?: string | null; status?: string; description?: string }, adminId: string) {
    const exists = await prisma.riskRule.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("风控规则不存在。");
    const data: any = { ...input };
    if (input.startsAt !== undefined) data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    const rule = await prisma.riskRule.update({ where: { id }, data });
    await prisma.auditEvent.create({ data: { actorType: "ADMIN", actorId: adminId, action: "RISK_RULE_UPDATED", targetType: "RISK_RULE", targetId: id, metadata: { status: rule.status, category: rule.category } } });
    return rule;
  }


}
