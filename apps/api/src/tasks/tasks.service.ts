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
}) {
  return {
    id: submission.id,
    claimId: submission.claimId,
    status: submission.status,
    submittedAt: submission.submittedAt.toISOString(),
    mimeType: submission.mimeType,
    sizeBytes: submission.sizeBytes,
    originalName: submission.originalName,
  };
}

@Injectable()
export class TasksService {
  constructor(private readonly storage: S3ObjectStorageService) {}

  async listPublished(userId: string) {
    const now = new Date();
    const [tasks, claims] = await Promise.all([
      prisma.task.findMany({
        where: {
          status: "PUBLISHED",
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          rewardMinor: true,
          currency: true,
          capacity: true,
          claimedCount: true,
          startsAt: true,
          endsAt: true,
          messageTemplate: true,
          linkUrl: true,
          previewTitle: true,
          previewDescription: true,
          previewImageUrl: true,
        },
      }),
      prisma.taskClaim.findMany({
        where: { userId },
        select: { id: true, taskId: true, status: true },
      }),
    ]);
    const claimsByTask = new Map(claims.map((claim) => [claim.taskId, claim]));

    return {
      tasks: tasks.map((task) => {
        const claim = claimsByTask.get(task.id);
        return {
          ...task,
          rewardMinor: task.rewardMinor.toString(),
          myClaim: claim ? { id: claim.id, status: claim.status } : null,
          remainingCapacity: task.capacity === null
            ? null
            : Math.max(0, task.capacity - task.claimedCount),
        };
      }),
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

  async claimTask(userId: string, timezone: string, taskId: string, rawKey: string) {
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
        // Serialize this user's claim counter, so two simultaneous task taps
        // cannot bypass the daily limit.
        await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

        const task = await tx.task.findUnique({ where: { id: taskId } });
        if (!task || task.status !== "PUBLISHED") {
          throw new NotFoundException("任务不存在或当前未开放。");
        }
        if (task.startsAt && task.startsAt > now) {
          throw new ConflictException("任务尚未开始。");
        }
        if (task.endsAt && task.endsAt < now) {
          throw new ConflictException("任务已结束。");
        }

        const existingClaim = await tx.taskClaim.findUnique({
          where: { taskId_userId: { taskId, userId } },
        });
        if (existingClaim) {
          throw new ConflictException("你已经领取过这个任务，请在“我的任务”中继续处理。");
        }

        const activeClaims = await tx.taskClaim.count({
          where: { userId, status: { in: ["CLAIMED", "IN_PROGRESS", "REJECTED"] } },
        });
        if (activeClaims >= 3) {
          throw new ConflictException("最多同时保留 3 个未完成任务，请先完成或放弃一个任务。");
        }

        const claimedToday = await tx.taskClaim.count({
          where: { userId, claimedAt: { gte: today } },
        });
        if (claimedToday >= DAILY_TASK_LIMIT) {
          throw new ConflictException(`已达到每日领取上限（${DAILY_TASK_LIMIT} 个任务）。`);
        }

        // Lock the oldest eligible number. SKIP LOCKED makes concurrent
        // claim requests move to the next number instead of double-assigning it.
        const availableNumbers = await tx.$queryRaw<Array<{ id: string; phone_e164: string }>>`
          SELECT id, phone_e164
          FROM contact_numbers
          WHERE status = 'AVAILABLE'::"ContactNumberStatus"
            AND consent_status = 'GRANTED'::"ContactConsentStatus"
          ORDER BY import_order ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;
        const contactNumber = availableNumbers[0];
        if (!contactNumber) {
          throw new ConflictException("当前没有可分配的已授权号码，请稍后再试。");
        }

        const numberReserved = await tx.contactNumber.updateMany({
          where: {
            id: contactNumber.id,
            status: "AVAILABLE",
            consentStatus: "GRANTED",
          },
          data: { status: "ASSIGNED" },
        });
        if (numberReserved.count !== 1) {
          throw new ConflictException("号码刚刚被其他任务占用，请重新领取。");
        }

        const capacityUpdate = await tx.task.updateMany({
          where: {
            id: taskId,
            status: "PUBLISHED",
            ...(task.capacity === null ? {} : { claimedCount: { lt: task.capacity } }),
          },
          data: { claimedCount: { increment: 1 } },
        });
        if (capacityUpdate.count !== 1) {
          throw new ConflictException("该任务名额已满。");
        }

        return tx.taskClaim.create({
          data: {
            taskId,
            userId,
            status: "CLAIMED",
            idempotencyKey: key,
            // The three-minute execution window starts on the user's first
            // explicit "Go to WhatsApp" action, not while they are reading details.
            expiresAt: null,
            contactAssignment: {
              create: {
                contactNumberId: contactNumber.id,
                userId,
                status: "ASSIGNED",
              },
            },
          },
          include: {
            task: true,
            contactAssignment: {
              include: { contactNumber: { select: { phoneE164: true } } },
            },
          },
        });
      });
      return this.claimResponse(claim);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        const existing = await prisma.taskClaim.findUnique({
          where: { idempotencyKey: key },
          include: { task: true, contactAssignment: { include: { contactNumber: { select: { phoneE164: true } } } } },
        });
        if (existing && existing.userId === userId && existing.taskId === taskId) {
          return this.claimResponse(existing);
        }
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
            status: "SUBMITTED",
            idempotencyKey: key,
            mimeType: detected.mimeType,
            sizeBytes: file.buffer.length,
            originalName: safeName || null,
          },
        });
        await tx.taskClaim.update({
          where: { id: claimId },
          data: { status: "SUBMITTED" },
        });
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
