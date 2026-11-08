import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import OpenAI from "openai";
import { prisma } from "@wtp/database";
import { AiConfigService } from "../ai-config/ai-config.service";
import { S3ObjectStorageService } from "../tasks/s3-object-storage.service";

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
              AND locked_at < NOW() - INTERVAL '10 minutes'
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

      // AI is advisory only: every result must pass through human review
      // before any wallet credit or task settlement can occur. This keeps the
      // business flow deterministic: submit -> AI analysis -> manual decision -> reward.
      await prisma.$transaction(async (tx) => {
        // Use the same lock order as manual review so an admin decision cannot
        // race with a worker update for the same submission.
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
