import { Injectable } from "@nestjs/common";
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
}
