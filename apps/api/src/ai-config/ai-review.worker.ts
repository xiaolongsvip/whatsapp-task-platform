import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import OpenAI from "openai";
import { prisma } from "@wtp/database";
import { AiConfigService } from "../ai-config/ai-config.service";
import { S3ObjectStorageService } from "../tasks/s3-object-storage.service";
import { allocateAvailableNumbersToOldestPublishedTask, lockTaskSlotAllocation } from "../tasks/task-slot-allocation";
import { recycleUnsuccessfulTaskClaimInventory } from "../tasks/task-claim-inventory";

type AiDecision = {
  decision: "APPROVE" | "REJECT" | "UNCERTAIN";
  confidence: number;
  reason: string;
  extractedText: string;
  checks: Array<{ requirement: string; passed: boolean | null; evidence: string }>;
};

const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 5000;

@Injectable()
export class AiReviewWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiReviewWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly configService: AiConfigService,
    private readonly storage: S3ObjectStorageService,
  ) {}

  onModuleInit() {
    // Fail closed: the worker must be explicitly enabled only after the
    // ai_review_jobs migration has been applied to the connected database.
    if (process.env.AI_REVIEW_WORKER_ENABLED !== "true") {
      this.logger.warn("AI review worker is paused. Set AI_REVIEW_WORKER_ENABLED=true only after database migrations are applied.");
      return;
    }
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
        WITH candidate AS (
          SELECT id FROM ai_review_jobs
          WHERE (
              status IN ('PENDING', 'RETRY')
              AND next_attempt_at <= NOW()
            )
            OR (
              status = 'PROCESSING'
              AND (
                locked_at IS NULL
                OR locked_at < NOW() - INTERVAL '10 minutes'
              )
            )
          ORDER BY next_attempt_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE ai_review_jobs AS job
        SET status = 'PROCESSING',
            locked_at = NOW(),
            attempt_count = attempt_count + 1,
            updated_at = NOW()
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING job.id
      `;
      if (claimed.length) await this.processJob(claimed[0].id);
    } catch (error) {
      this.logger.error("AI review queue poll failed", error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }

  private async processJob(jobId: string) {
    const job = await prisma.aiReviewJob.findUnique({
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
    if (!job || job.status !== "PROCESSING") return;

    try {
      const config = await this.configService.getRuntimeConfig();
      if (!config.enabled || !config.apiKey) {
        await this.retryOrEscalate(job.id, job.attemptCount, "AI 审核未启用或 API Key 未配置。");
        return;
      }

      const submission = job.submission;
      const claim = submission.claim;
      const image = await this.storage.getObjectBuffer(submission.objectKey);
      const mimeType = submission.mimeType || "image/jpeg";
      const imageUrl = `data:${mimeType};base64,${image.toString("base64")}`;
      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        timeout: 45_000,
        maxRetries: 0,
      });

      const taskRequirements = [
        `任务标题：${claim.task.title}`,
        `任务说明：${claim.task.description}`,
        `任务分类：${claim.task.category}`,
        `任务消息模板：${claim.task.messageTemplate || "无"}`,
        `用户提交说明：${submission.note || "无"}`,
      ].join("\n");

      const instruction = `你是任务截图审核器。只依据截图中可见证据判断，不得猜测、补全或把模糊内容当成事实。
${config.systemPrompt || ""}
任务要求：
${taskRequirements}

严格返回单个 JSON 对象，不要 Markdown：
{
 "decision":"APPROVE|REJECT|UNCERTAIN",
 "confidence":0.0,
 "reason":"简短中文理由",
 "extractedText":"截图中可辨认的关键文字",
 "checks":[{"requirement":"具体要求","passed":true,"evidence":"截图证据"}]
}
规则：
- 只有所有明确要求均有清晰截图证据支持，才可 APPROVE。
- 只有截图明确证明关键要求未完成或不符合，才可 REJECT。
- 截图模糊、缺失、证据不足、要求无法判断或存在矛盾，一律 UNCERTAIN。
- confidence 必须是 0 到 1 的数字。不要仅凭用户提交说明通过审核。`;

      const response = await client.responses.create({
        model: config.model,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: instruction },
            { type: "input_image", image_url: imageUrl, detail: "high" },
          ],
        }],
        max_output_tokens: 1200,
      });

      const raw = response.output_text?.trim() || "";
      const parsed = this.parseDecision(raw);
      if (!parsed) {
        await this.retryOrEscalate(job.id, job.attemptCount, "AI 返回内容不是有效审核 JSON。");
        return;
      }

      const confidentApprove = parsed.decision === "APPROVE" &&
        parsed.confidence >= config.approveThreshold &&
        parsed.checks.length > 0 &&
        parsed.checks.every((check) => check.passed === true);
      const confidentReject = parsed.decision === "REJECT" &&
        parsed.confidence >= config.rejectThreshold &&
        parsed.checks.some((check) => check.passed === false);

      if (!confidentApprove && !confidentReject) {
        await prisma.$transaction(async (tx) => {
          // Use the same lock order as manual review: submission first, then job.
          // If an admin wins the lock, this worker must observe the completed job
          // and leave the manual decision untouched.
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM task_submissions WHERE id = ${submission.id}::uuid FOR UPDATE
          `;
          const current = await tx.aiReviewJob.findUnique({ where: { id: job.id } });
          if (!current || current.status !== "PROCESSING") return;
          await tx.aiReviewJob.update({
            where: { id: job.id },
            data: {
              status: "NEEDS_REVIEW",
              decision: parsed.decision,
              confidence: parsed.confidence,
              reason: parsed.reason,
              extractedText: parsed.extractedText,
              lockedAt: null,
              lastError: null,
            },
          });
          await tx.taskSubmission.update({
            where: { id: submission.id },
            data: { status: "UNDER_REVIEW" },
          });
          await tx.taskClaim.update({
            where: { id: claim.id },
            data: { status: "UNDER_REVIEW" },
          });
        });
        return;
      }

      if (confidentApprove) {
        await this.approve(job.id, parsed);
      } else {
        await this.reject(job.id, parsed);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "未知审核错误";
      await this.retryOrEscalate(job.id, job.attemptCount, message);
    }
  }

  private parseDecision(raw: string): AiDecision | null {
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const value = JSON.parse(cleaned) as Partial<AiDecision>;
      if (
        !["APPROVE", "REJECT", "UNCERTAIN"].includes(value.decision || "") ||
        typeof value.confidence !== "number" ||
        !Number.isFinite(value.confidence) ||
        value.confidence < 0 || value.confidence > 1 ||
        typeof value.reason !== "string" ||
        typeof value.extractedText !== "string" ||
        !Array.isArray(value.checks)
      ) return null;
      const checks = value.checks.filter((item) =>
        item && typeof item.requirement === "string" &&
        (item.passed === true || item.passed === false || item.passed === null) &&
        typeof item.evidence === "string",
      );
      if (checks.length !== value.checks.length) return null;
      return {
        decision: value.decision as AiDecision["decision"],
        confidence: value.confidence,
        reason: value.reason.slice(0, 4000),
        extractedText: value.extractedText.slice(0, 12000),
        checks,
      };
    } catch {
      return null;
    }
  }

  private async approve(jobId: string, result: AiDecision) {
    await prisma.$transaction(async (tx) => {
      const target = await tx.aiReviewJob.findUnique({
        where: { id: jobId },
        select: { submissionId: true },
      });
      if (!target) return;
      // Match the admin transaction lock order to serialize all decisions
      // for this submission, regardless of whether AI or an admin got there first.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM task_submissions WHERE id = ${target.submissionId}::uuid FOR UPDATE
      `;
      const current = await tx.aiReviewJob.findUnique({
        where: { id: jobId },
        include: {
          submission: {
            include: {
              claim: {
                include: { task: true, contactAssignment: true, taskSlot: true },
              },
            },
          },
        },
      });
      if (!current || current.status !== "PROCESSING") return;
      const submission = current.submission;
      const claim = submission.claim;
      if (submission.status === "APPROVED" || claim.status === "APPROVED") {
        await tx.aiReviewJob.update({ where: { id: jobId }, data: { status: "COMPLETED", lockedAt: null } });
        return;
      }
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(submission.status) ||
          !["SUBMITTED", "UNDER_REVIEW"].includes(claim.status)) {
        await tx.aiReviewJob.update({
          where: { id: jobId },
          data: {
            status: "NEEDS_REVIEW",
            decision: result.decision,
            confidence: result.confidence,
            reason: "提交或领取状态已变化，停止自动结算。",
            lockedAt: null,
          },
        });
        return;
      }

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
      // AI approvals must apply the same referral commission rules as
      // manual approvals; otherwise users receive different settlement
      // outcomes depending on which reviewer handled the submission.
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

      await tx.taskReview.create({
        data: {
          submissionId: submission.id,
          reviewerAdminId: null,
          decision: "APPROVE",
          reason: result.reason,
        },
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
      await tx.aiReviewJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          decision: result.decision,
          confidence: result.confidence,
          reason: result.reason,
          extractedText: result.extractedText,
          lockedAt: null,
          lastError: null,
        },
      });
    });
  }

  private async reject(jobId: string, result: AiDecision) {
    await prisma.$transaction(async (tx) => {
      const target = await tx.aiReviewJob.findUnique({
        where: { id: jobId },
        select: { submissionId: true },
      });
      if (!target) return;

      // Serialize rejection with manual review and all other AI decisions.
      // Always lock the submission before reading or changing the job state.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM task_submissions WHERE id = ${target.submissionId}::uuid FOR UPDATE
      `;
      const current = await tx.aiReviewJob.findUnique({
        where: { id: jobId },
        include: { submission: { include: { claim: true } } },
      });
      if (!current || current.status !== "PROCESSING") return;
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(current.submission.status)
          || !["SUBMITTED", "UNDER_REVIEW"].includes(current.submission.claim.status)) {
        await tx.aiReviewJob.update({
          where: { id: jobId },
          data: { status: "NEEDS_REVIEW", reason: "提交或领取状态已变化，停止自动拒绝。", lockedAt: null },
        });
        return;
      }
      await lockTaskSlotAllocation(tx);
      await tx.taskReview.create({
        data: {
          submissionId: current.submissionId,
          reviewerAdminId: null,
          decision: "REJECT",
          reason: result.reason,
        },
      });
      await tx.taskSubmission.update({
        where: { id: current.submissionId },
        data: { status: "REJECTED" },
      });
      await tx.taskClaim.update({
        where: { id: current.submission.claimId },
        data: { status: "REJECTED" },
      });
      await recycleUnsuccessfulTaskClaimInventory(
        tx,
        current.submission.claimId,
        current.submission.claim.taskId,
      );
      await allocateAvailableNumbersToOldestPublishedTask(tx);
      await tx.aiReviewJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          decision: result.decision,
          confidence: result.confidence,
          reason: result.reason,
          extractedText: result.extractedText,
          lockedAt: null,
          lastError: null,
        },
      });
    });
  }

  private async retryOrEscalate(jobId: string, attemptCount: number, message: string) {
    const terminal = attemptCount >= MAX_ATTEMPTS;
    const delayMinutes = Math.min(60, Math.pow(2, Math.max(0, attemptCount - 1)));
    await prisma.$transaction(async (tx) => {
      const target = await tx.aiReviewJob.findUnique({
        where: { id: jobId },
        select: { submissionId: true },
      });
      if (!target) return;

      // Escalation makes the submission eligible for admin review. Use the
      // same submission-first lock order as every manual/AI decision path.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM task_submissions WHERE id = ${target.submissionId}::uuid FOR UPDATE
      `;
      const current = await tx.aiReviewJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      if (!current || current.status !== "PROCESSING") return;

      await tx.aiReviewJob.update({
        where: { id: jobId },
        data: {
          status: terminal ? "NEEDS_REVIEW" : "RETRY",
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
          lockedAt: null,
          lastError: message,
        },
      });
    });
  }
}
