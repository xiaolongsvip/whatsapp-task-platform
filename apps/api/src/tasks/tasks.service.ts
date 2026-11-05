import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { prisma } from "@wtp/database";
import { startOfDay } from "../users/dashboard.service";
import { S3ObjectStorageService } from "./s3-object-storage.service";

const DAILY_TASK_LIMIT = 20;
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

type EvidenceFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

function maskPhoneMiddleFour(value: string): string {
  const chars = Array.from(value);
  if (chars.length <= 4) return "*".repeat(chars.length);
  const start = Math.floor((chars.length - 4) / 2);
  return chars.slice(0, start).join("") + "****" + chars.slice(start + 4).join("");
}

function idempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new BadRequestException("请提供有效的 Idempotency-Key（8–128 个字符）。");
  }
  return key;
}

function evidenceType(buffer: Buffer): { mimeType: string; extension: string } {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) return { mimeType: "image/jpeg", extension: "jpg" };

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return { mimeType: "image/png", extension: "png" };

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) return { mimeType: "image/webp", extension: "webp" };

  throw new BadRequestException("只允许上传真实的 JPEG、PNG 或 WebP 图片。");
}

function publicSubmission(submission: {
  id: string;
  claimId: string;
  status: string;
  submittedAt: Date;
  mimeType: string | null;
  sizeBytes: number | null;
  originalName: string | null;
  reviews?: Array<{ decision: string; reason: string | null; reviewedAt: Date }>;
}) {
  const latestReview = submission.reviews?.[0];
  return {
    id: submission.id,
    claimId: submission.claimId,
    status: submission.status,
    submittedAt: submission.submittedAt.toISOString(),
    mimeType: submission.mimeType,
    sizeBytes: submission.sizeBytes,
    originalName: submission.originalName,
    reviewDecision: latestReview?.decision ?? null,
    reviewReason: latestReview?.reason ?? null,
    reviewedAt: latestReview?.reviewedAt.toISOString() ?? null,
  };
}

@Injectable()
export class TasksService {
  constructor(private readonly storage: S3ObjectStorageService) {}

  async listPublished(userId: string) {
    await this.expireOverdueClaims(userId);
    const now = new Date();
    const slots = await prisma.taskSlot.findMany({
      where: {
        status: "AVAILABLE",
        contactNumber: { status: "AVAILABLE", consentStatus: "GRANTED" },
        task: {
          status: "PUBLISHED",
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500,
      include: {
        task: {
          select: {
            id: true, title: true, description: true, category: true,
            rewardMinor: true, currency: true, startsAt: true, endsAt: true,
            messageTemplate: true, linkUrl: true, previewTitle: true,
            previewDescription: true, previewImageUrl: true,
          },
        },
        contactNumber: { select: { phoneE164: true } },
      },
    });
    return {
      tasks: slots.map((slot) => ({
        id: slot.id,
        slotId: slot.id,
        taskId: slot.taskId,
        title: slot.task.title,
        description: slot.task.description,
        category: slot.task.category,
        rewardMinor: slot.task.rewardMinor.toString(),
        currency: slot.task.currency.trim(),
        startsAt: slot.task.startsAt?.toISOString() ?? null,
        endsAt: slot.task.endsAt?.toISOString() ?? null,
        messageTemplate: slot.task.messageTemplate,
        linkUrl: slot.task.linkUrl,
        previewTitle: slot.task.previewTitle,
        previewDescription: slot.task.previewDescription,
        previewImageUrl: slot.task.previewImageUrl,
        maskedPhoneNumber: maskPhoneMiddleFour(slot.contactNumber.phoneE164),
        remainingCapacity: 1,
      })),
    };
  }

  async myClaims(userId: string) {
    await this.expireOverdueClaims(userId);
    const claims = await prisma.taskClaim.findMany({
      where: { userId },
      orderBy: { claimedAt: "desc" },
      take: 100,
      include: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            rewardMinor: true,
            currency: true,
            messageTemplate: true,
            linkUrl: true,
            previewTitle: true,
            previewDescription: true,
            previewImageUrl: true,
          },
        },
        contactAssignment: {
          include: { contactNumber: { select: { phoneE164: true } } },
        },
        submissions: {
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            submittedAt: true,
            mimeType: true,
            sizeBytes: true,
            originalName: true,
            reviews: {
              orderBy: { reviewedAt: "desc" },
              take: 1,
              select: {
                decision: true,
                reason: true,
                reviewedAt: true,
              },
            },
          },
        },
      },
    });

    return {
      claims: claims.map((claim) => ({
        id: claim.id,
        taskId: claim.taskId,
        status: claim.status,
        claimedAt: claim.claimedAt.toISOString(),
        expiresAt: claim.expiresAt?.toISOString() ?? null,
        assignedPhoneNumber: claim.contactAssignment?.contactNumber.phoneE164 ?? null,
        task: {
          ...claim.task,
          rewardMinor: claim.task.rewardMinor.toString(),
        },
        latestSubmission: claim.submissions[0]
          ? publicSubmission({ ...claim.submissions[0], claimId: claim.id })
          : null,
      })),
    };
  }

  async claimTask(userId: string, timezone: string, taskId: string, slotId: string, rawKey: string) {
    const key = idempotencyKey(rawKey);
    await this.expireOverdueClaims(userId);
    const replay = await prisma.taskClaim.findUnique({
      where: { idempotencyKey: key },
      include: { task: true, contactAssignment: { include: { contactNumber: { select: { phoneE164: true } } } } },
    });
    if (replay) {
      if (replay.userId !== userId || replay.taskId !== taskId) {
        throw new ConflictException("该幂等键已用于其他任务领取。");
      }
      return this.claimResponse(replay);
    }

    const now = new Date();
    const today = startOfDay(timezone);
    try {
      const claim = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const slot = await tx.taskSlot.findUnique({
          where: { id: slotId },
          include: { task: true, contactNumber: true },
        });
        if (!slot || slot.taskId !== taskId || slot.status !== "AVAILABLE") {
          throw new ConflictException("该号码任务已被领取或不再开放，请刷新任务大厅。");
        }
        const task = slot.task;
        if (task.status !== "PUBLISHED") throw new NotFoundException("任务不存在或当前未开放。");
        if (task.startsAt && task.startsAt > now) throw new ConflictException("任务尚未开始。");
        if (task.endsAt && task.endsAt < now) throw new ConflictException("任务已结束。");
        if (slot.contactNumber.status !== "AVAILABLE" || slot.contactNumber.consentStatus !== "GRANTED") {
          throw new ConflictException("该号码当前不可分配，请刷新任务大厅。");
        }

        // A user may hold only one unfinished task at a time. Keep the lock
        // on the user row above so concurrent claim requests cannot bypass this.
        const activeClaims = await tx.taskClaim.count({
          where: {
            userId,
            status: { in: ["CLAIMED", "IN_PROGRESS", "REJECTED", "SUBMITTED", "UNDER_REVIEW"] },
          },
        });
        if (activeClaims >= 1) {
          throw new ConflictException("一次只能领取一个任务，请先完成当前任务后再领取下一个。");
        }
        const claimedToday = await tx.taskClaim.count({ where: { userId, claimedAt: { gte: today } } });
        if (claimedToday >= DAILY_TASK_LIMIT) {
          throw new ConflictException("已达到每日领取上限（" + DAILY_TASK_LIMIT + " 个任务）。");
        }

        const slotReserved = await tx.taskSlot.updateMany({
          where: { id: slotId, status: "AVAILABLE", claimId: null },
          data: { status: "ASSIGNED", assignedAt: now, releasedAt: null },
        });
        if (slotReserved.count !== 1) throw new ConflictException("该号码任务刚刚被其他用户领取，请刷新后重试。");

        const numberReserved = await tx.contactNumber.updateMany({
          where: { id: slot.contactNumberId, status: "AVAILABLE", consentStatus: "GRANTED" },
          data: { status: "ASSIGNED" },
        });
        if (numberReserved.count !== 1) throw new ConflictException("号码刚刚被其他用户领取，请刷新后重试。");

        const created = await tx.taskClaim.create({
          data: {
            taskId, userId, status: "CLAIMED", idempotencyKey: key, expiresAt: null,
            contactAssignment: {
              create: { contactNumberId: slot.contactNumberId, userId, status: "ASSIGNED" },
            },
          },
          include: {
            task: true,
            contactAssignment: { include: { contactNumber: { select: { phoneE164: true } } } },
          },
        });
        await tx.taskSlot.update({ where: { id: slotId }, data: { claimId: created.id } });
        await tx.task.update({ where: { id: taskId }, data: { claimedCount: { increment: 1 } } });
        return created;
      });
      return this.claimResponse(claim);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        const existing = await prisma.taskClaim.findUnique({
          where: { idempotencyKey: key },
          include: { task: true, contactAssignment: { include: { contactNumber: { select: { phoneE164: true } } } } },
        });
        if (existing && existing.userId === userId && existing.taskId === taskId) return this.claimResponse(existing);
      }
      throw error;
    }
  }

  async startClaim(userId: string, claimId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM task_claims WHERE id = ${claimId}::uuid FOR UPDATE
      `;
      const claim = await tx.taskClaim.findUnique({
        where: { id: claimId },
        include: {
          task: true,
          contactAssignment: {
            include: { contactNumber: { select: { phoneE164: true } } },
          },
        },
      });
      if (!claim || claim.userId !== userId) {
        throw new NotFoundException("任务领取记录不存在。");
      }
      if (!["CLAIMED", "IN_PROGRESS", "REJECTED"].includes(claim.status)) {
        throw new ConflictException("当前任务状态不能开始或继续。");
      }
      if (claim.status === "IN_PROGRESS" && claim.expiresAt) {
        if (claim.expiresAt <= new Date()) {
          throw new ConflictException("任务时间已结束，请返回任务大厅重新领取。");
        }
        return this.claimResponse(claim);
      }
      const now = new Date();
      if (claim.task.endsAt && claim.task.endsAt <= now) {
        throw new ConflictException("任务已结束，无法开始。");
      }
      const expiresAt = new Date(Math.min(
        now.getTime() + 3 * 60 * 1000,
        claim.task.endsAt?.getTime() ?? Number.POSITIVE_INFINITY,
      ));
      const started = await tx.taskClaim.update({
        where: { id: claimId },
        data: { status: "IN_PROGRESS", expiresAt },
        include: {
          task: true,
          contactAssignment: {
            include: { contactNumber: { select: { phoneE164: true } } },
          },
        },
      });
      return this.claimResponse(started);
    });
  }

  async cancelClaim(userId: string, claimId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM task_claims WHERE id = ${claimId}::uuid FOR UPDATE
      `;

      const claim = await tx.taskClaim.findUnique({
        where: { id: claimId },
        include: { contactAssignment: true },
      });
      if (!claim || claim.userId !== userId) {
        throw new NotFoundException("任务领取记录不存在。");
      }
      if (claim.status === "EXPIRED" || claim.status === "CANCELLED") {
        return {
          claimId,
          status: claim.status,
          numberReturnedToPool: false,
          alreadyClosed: true,
        };
      }
      if (!["CLAIMED", "IN_PROGRESS", "REJECTED"].includes(claim.status)) {
        throw new ConflictException("当前任务状态不能取消。");
      }

      const pending = await tx.taskSubmission.findFirst({
        where: { claimId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
        select: { id: true },
      });
      if (pending) {
        throw new ConflictException("任务正在审核中，不能取消。");
      }

      await tx.taskClaim.update({
        where: { id: claimId },
        data: { status: "CANCELLED" },
      });

      let numberReturnedToPool = false;
      if (claim.contactAssignment?.status === "ASSIGNED") {
        await tx.contactAssignment.update({
          where: { id: claim.contactAssignment.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
        const released = await tx.contactNumber.updateMany({
          where: {
            id: claim.contactAssignment.contactNumberId,
            status: "ASSIGNED",
            consentStatus: "GRANTED",
          },
          data: { status: "AVAILABLE" },
        });
        numberReturnedToPool = released.count === 1;
        await tx.taskSlot.updateMany({
          where: { claimId, status: "ASSIGNED" },
          data: { status: "AVAILABLE", claimId: null, assignedAt: null, releasedAt: new Date() },
        });
      }

      await tx.task.updateMany({
        where: { id: claim.taskId, claimedCount: { gt: 0 } },
        data: { claimedCount: { decrement: 1 } },
      });

      return { claimId, status: "CANCELLED", numberReturnedToPool };
    });
  }

  private async expireOverdueClaims(userId: string) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const expiredRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM task_claims
        WHERE user_id = ${userId}::uuid
          AND expires_at IS NOT NULL
          AND expires_at <= ${now}
          AND status IN ('CLAIMED', 'IN_PROGRESS', 'REJECTED')
        ORDER BY expires_at ASC
        LIMIT 100
        FOR UPDATE SKIP LOCKED
      `;

      for (const row of expiredRows) {
        const claim = await tx.taskClaim.findUnique({
          where: { id: row.id },
          include: { contactAssignment: true },
        });
        if (!claim || !["CLAIMED", "IN_PROGRESS", "REJECTED"].includes(claim.status)) continue;

        await tx.taskClaim.update({
          where: { id: claim.id },
          data: { status: "EXPIRED" },
        });

        if (claim.contactAssignment?.status === "ASSIGNED") {
          await tx.contactAssignment.update({
            where: { id: claim.contactAssignment.id },
            data: { status: "RELEASED", releasedAt: now },
          });
          await tx.contactNumber.updateMany({
            where: {
              id: claim.contactAssignment.contactNumberId,
              status: "ASSIGNED",
              consentStatus: "GRANTED",
            },
            data: { status: "AVAILABLE" },
          });
          await tx.taskSlot.updateMany({
            where: { claimId: claim.id, status: "ASSIGNED" },
            data: { status: "AVAILABLE", claimId: null, assignedAt: null, releasedAt: now },
          });
        }

        await tx.task.updateMany({
          where: { id: claim.taskId, claimedCount: { gt: 0 } },
          data: { claimedCount: { decrement: 1 } },
        });
      }
    });
  }

  async submitEvidence(
    userId: string,
    claimId: string,
    file: EvidenceFile,
    note: string | undefined,
    rawIdempotencyKey: string,
  ) {
    const key = idempotencyKey(rawIdempotencyKey);
    if (!file?.buffer?.length) throw new BadRequestException("请先选择截图文件。");
    if (file.size > MAX_EVIDENCE_BYTES || file.buffer.length > MAX_EVIDENCE_BYTES) {
      throw new BadRequestException("截图文件不能超过 8 MB。");
    }
    if (note && note.length > 1000) {
      throw new BadRequestException("提交说明不能超过 1000 个字符。");
    }

    const detected = evidenceType(file.buffer);
    const aiConfig = await prisma.aiReviewConfig.findUnique({
      where: { id: "default" },
      select: { enabled: true, apiKeyCiphertext: true },
    });
    const queueForAi = aiConfig?.enabled === true && Boolean(aiConfig.apiKeyCiphertext);
    const replay = await prisma.taskSubmission.findUnique({
      where: { idempotencyKey: key },
      include: { claim: { select: { userId: true, id: true } } },
    });
    if (replay) {
      if (replay.claim.userId !== userId || replay.claimId !== claimId) {
        throw new ConflictException("该幂等键已用于其他证据提交。");
      }
      return publicSubmission(replay);
    }

    const claim = await prisma.taskClaim.findUnique({
      where: { id: claimId },
      include: { task: true },
    });
    if (!claim || claim.userId !== userId) throw new NotFoundException("任务领取记录不存在。");
    if (claim.expiresAt && claim.expiresAt < new Date()) {
      throw new ConflictException("该任务领取已过期，不能再提交证据。");
    }
    if (!["CLAIMED", "IN_PROGRESS", "REJECTED"].includes(claim.status)) {
      throw new ConflictException("该任务当前状态不允许提交证据。");
    }
    const pending = await prisma.taskSubmission.findFirst({
      where: { claimId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      select: { id: true },
    });
    if (pending) throw new ConflictException("该任务已有一份待审核提交，请勿重复提交。");

    const safeName = file.originalname
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .slice(-120);
    const objectKey = `task-evidence/${userId}/${claimId}/${randomUUID()}.${detected.extension}`;

    await this.storage.putObject(objectKey, file.buffer, detected.mimeType);
    try {
      const submission = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM task_claims WHERE id = ${claimId}::uuid FOR UPDATE`;

        const lockedClaim = await tx.taskClaim.findUnique({ where: { id: claimId } });
        if (!lockedClaim || lockedClaim.userId !== userId) {
          throw new NotFoundException("任务领取记录不存在。");
        }

        const idempotent = await tx.taskSubmission.findUnique({
          where: { idempotencyKey: key },
          include: { claim: { select: { userId: true, id: true } } },
        });
        if (idempotent) {
          if (idempotent.claim.userId !== userId || idempotent.claimId !== claimId) {
            throw new ConflictException("该幂等键已用于其他证据提交。");
          }
          return idempotent;
        }

        if (!["CLAIMED", "IN_PROGRESS", "REJECTED"].includes(lockedClaim.status)) {
          throw new ConflictException("任务状态已变化，请刷新后重试。");
        }
        const alreadyPending = await tx.taskSubmission.findFirst({
          where: { claimId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
          select: { id: true },
        });
        if (alreadyPending) {
          throw new ConflictException("该任务已有一份待审核提交，请勿重复提交。");
        }

        const created = await tx.taskSubmission.create({
          data: {
            claimId,
            objectKey,
            note: note?.trim() || null,
            status: queueForAi ? "UNDER_REVIEW" : "SUBMITTED",
            idempotencyKey: key,
            mimeType: detected.mimeType,
            sizeBytes: file.buffer.length,
            originalName: safeName || null,
          },
        });
        await tx.taskClaim.update({
          where: { id: claimId },
          data: { status: queueForAi ? "UNDER_REVIEW" : "SUBMITTED" },
        });
        if (queueForAi) {
          await tx.aiReviewJob.create({
            data: {
              submissionId: created.id,
              status: "PENDING",
              nextAttemptAt: new Date(),
            },
          });
        }
        return created;
      });
      // A concurrent retry with the same idempotency key may have created the
      // database row first. Remove this request's duplicate object in that case.
      if (submission.objectKey !== objectKey) {
        await this.storage.deleteObject(objectKey).catch(() => undefined);
      }
      return publicSubmission(submission);
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        const existing = await prisma.taskSubmission.findUnique({
          where: { idempotencyKey: key },
          include: { claim: { select: { userId: true } } },
        });
        if (existing && existing.claim.userId === userId && existing.claimId === claimId) {
          return publicSubmission(existing);
        }
      }
      throw error;
    }
  }

  private claimResponse(claim: {
    id: string;
    taskId: string;
    userId: string;
    status: string;
    claimedAt: Date;
    expiresAt: Date | null;
    task: {
      id: string;
      title: string;
      rewardMinor: bigint;
      currency: string;
      messageTemplate?: string | null;
      linkUrl?: string | null;
      previewTitle?: string | null;
      previewDescription?: string | null;
      previewImageUrl?: string | null;
    };
    contactAssignment?: { contactNumber: { phoneE164: string } } | null;
  }) {
    return {
      id: claim.id,
      taskId: claim.taskId,
      status: claim.status,
      claimedAt: claim.claimedAt.toISOString(),
      expiresAt: claim.expiresAt?.toISOString() ?? null,
      assignedPhoneNumber: claim.contactAssignment?.contactNumber.phoneE164 ?? null,
      task: {
        id: claim.task.id,
        title: claim.task.title,
        rewardMinor: claim.task.rewardMinor.toString(),
        currency: claim.task.currency.trim(),
        messageTemplate: claim.task.messageTemplate ?? null,
        linkUrl: claim.task.linkUrl ?? null,
        previewTitle: claim.task.previewTitle ?? null,
        previewDescription: claim.task.previewDescription ?? null,
        previewImageUrl: claim.task.previewImageUrl ?? null,
      },
    };
  }
}
