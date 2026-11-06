import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@wtp/database";
import type { Prisma } from "@wtp/database";
import type { CreateAdminTaskDto, UpdateAdminTaskDto } from "./task-admin.dto";
import { allocateAvailableNumbersToOldestPublishedTask } from "../tasks/task-slot-allocation";

function toMinorUnits(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new BadRequestException("奖励金额格式无效，最多支持两位小数。");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  if (amount <= 0n) throw new BadRequestException("奖励金额必须大于 0。");
  return amount;
}

function dateValue(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException("任务时间格式无效。");
  return parsed;
}

function cleanOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function publicTask(task: {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  rewardMinor: bigint;
  currency: string;
  capacity: number | null;
  claimedCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  messageTemplate: string | null;
  linkUrl: string | null;
  previewTitle: string | null;
  previewDescription: string | null;
  previewImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { claims: number };
}) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    category: task.category,
    status: task.status,
    rewardMinor: task.rewardMinor.toString(),
    rewardAmount: (Number(task.rewardMinor) / 100).toFixed(2),
    currency: task.currency.trim(),
    capacity: task.capacity,
    claimedCount: task.claimedCount,
    remainingCapacity: task.capacity === null
      ? null
      : Math.max(0, task.capacity - task.claimedCount),
    startsAt: task.startsAt?.toISOString() ?? null,
    endsAt: task.endsAt?.toISOString() ?? null,
    messageTemplate: task.messageTemplate,
    linkUrl: task.linkUrl,
    previewTitle: task.previewTitle,
    previewDescription: task.previewDescription,
    previewImageUrl: task.previewImageUrl,
    claimCount: task._count?.claims ?? task.claimedCount,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

@Injectable()
export class TaskAdminService {
  async list() {
    const tasks = await prisma.task.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: { _count: { select: { claims: true, slots: true } } },
    });
    const taskIds = tasks.map((task) => task.id);
    const grouped = taskIds.length
      ? await prisma.taskSlot.groupBy({
          by: ["taskId", "status"],
          where: { taskId: { in: taskIds } },
          _count: { _all: true },
        })
      : [];
    return {
      tasks: tasks.map((task) => {
        const counts = grouped.filter((entry) => entry.taskId === task.id);
        const count = (status: string) => counts.find((entry) => entry.status === status)?._count._all ?? 0;
        return {
          ...publicTask(task),
          inventory: {
            total: task._count.slots,
            available: count("AVAILABLE"),
            assigned: count("ASSIGNED"),
            used: count("USED"),
          },
        };
      }),
    };
  }


  async listRecords(input: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(input.pageSize) || 20)));
    const keyword = input.keyword?.trim() ?? "";
    const searchConditions: Prisma.TaskSlotWhereInput[] = [
      { task: { is: { title: { contains: keyword, mode: "insensitive" } } } },
      { task: { is: { category: { contains: keyword, mode: "insensitive" } } } },
      { contactNumber: { is: { phoneE164: { contains: keyword } } } },
    ];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyword)) {
      searchConditions.push({ id: keyword }, { taskId: keyword });
    }
    const baseWhere: Prisma.TaskSlotWhereInput = keyword ? { OR: searchConditions } : {};
    const notFrozen: Prisma.TaskSlotWhereInput = {
      contactNumber: { is: { status: { not: "BLOCKED" }, consentStatus: { not: "REVOKED" } } },
    };
    const activeTask: Prisma.TaskSlotWhereInput = {
      task: { is: { status: { notIn: ["DRAFT", "PAUSED", "CLOSED"] } } },
    };
    const statusWhere = (status: string): Prisma.TaskSlotWhereInput => {
      switch (status) {
        case "AVAILABLE":
          return { status: "AVAILABLE", task: { is: { status: "PUBLISHED" } }, contactNumber: { is: { status: "AVAILABLE", consentStatus: "GRANTED" } } };
        case "IN_PROGRESS":
          return { AND: [notFrozen, activeTask, { status: "ASSIGNED", claim: { is: { status: { in: ["CLAIMED", "IN_PROGRESS"] } } } }] };
        case "REVIEW":
          return { AND: [notFrozen, activeTask, { status: "ASSIGNED", claim: { is: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } } }] };
        case "COMPLETED":
          return { AND: [notFrozen, { OR: [{ status: "USED" }, { claim: { is: { status: "APPROVED" } } }] }] };
        case "CLOSED":
          return { AND: [
            notFrozen,
            { NOT: [{ status: "USED" }, { claim: { is: { status: "APPROVED" } } }] },
            { OR: [
              { task: { is: { status: { in: ["DRAFT", "PAUSED", "CLOSED"] } } } },
              { claim: { is: { status: { in: ["REJECTED", "EXPIRED", "CANCELLED"] } } } },
            ] },
          ] };
        case "FROZEN":
          return { contactNumber: { is: { OR: [{ status: "BLOCKED" }, { consentStatus: "REVOKED" }] } } };
        default:
          return {};
      }
    };
    const selectedWhere: Prisma.TaskSlotWhereInput = input.status && input.status !== "ALL"
      ? { AND: [baseWhere, statusWhere(input.status)] }
      : baseWhere;
    const countFor = (status: string) => prisma.taskSlot.count({ where: { AND: [baseWhere, statusWhere(status)] } });
    const [total, available, inProgress, review, completed, closed, frozen, selectedTotal, rows] = await Promise.all([
      prisma.taskSlot.count({ where: baseWhere }),
      countFor("AVAILABLE"), countFor("IN_PROGRESS"), countFor("REVIEW"),
      countFor("COMPLETED"), countFor("CLOSED"), countFor("FROZEN"),
      prisma.taskSlot.count({ where: selectedWhere }),
      prisma.taskSlot.findMany({
        where: selectedWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          task: { select: { id: true, title: true, category: true, status: true, rewardMinor: true, currency: true, messageTemplate: true } },
          contactNumber: { select: { id: true, phoneE164: true, status: true, consentStatus: true } },
          claim: { select: { id: true, status: true, claimedAt: true, userId: true } },
        },
      }),
    ]);
    const items = rows.map((slot) => {
      const claimStatus = slot.claim?.status ?? null;
      let status = slot.status === "VOIDED" ? "VOIDED" : "CLOSED";
      if (slot.status !== "VOIDED" && (slot.contactNumber.status === "BLOCKED" || slot.contactNumber.consentStatus === "REVOKED")) status = "FROZEN";
      else if (slot.status !== "VOIDED" && (slot.status === "USED" || claimStatus === "APPROVED")) status = "COMPLETED";
      else if (slot.status !== "VOIDED" && (slot.task.status === "DRAFT" || slot.task.status === "CLOSED" || slot.task.status === "PAUSED" || ["REJECTED", "EXPIRED", "CANCELLED"].includes(claimStatus ?? ""))) status = "CLOSED";
      else if (slot.status !== "VOIDED" && (claimStatus === "SUBMITTED" || claimStatus === "UNDER_REVIEW")) status = "REVIEW";
      else if (slot.status !== "VOIDED" && (claimStatus === "CLAIMED" || claimStatus === "IN_PROGRESS" || slot.status === "ASSIGNED")) status = "IN_PROGRESS";
      else if (slot.status !== "VOIDED" && slot.status === "AVAILABLE" && slot.task.status === "PUBLISHED" && slot.contactNumber.status === "AVAILABLE" && slot.contactNumber.consentStatus === "GRANTED") status = "AVAILABLE";
      return {
        id: slot.id, taskId: slot.task.id, taskStatus: slot.task.status, taskName: slot.task.title,
        phoneNumber: slot.contactNumber.phoneE164, groupName: slot.task.category || "未分组",
        rewardAmount: (Number(slot.task.rewardMinor) / 100).toFixed(3),
        currency: slot.task.currency.trim(), messageTemplate: slot.task.messageTemplate ?? "",
        countryRegion: "—", status, createdAt: slot.createdAt.toISOString(),
        claimId: slot.claim?.id ?? null, claimedAt: slot.claim?.claimedAt?.toISOString() ?? null,
        claimedUserId: slot.claim?.userId ?? null,
      };
    });
    return {
      items,
      pagination: { page, pageSize, total: selectedTotal, totalPages: Math.max(1, Math.ceil(selectedTotal / pageSize)) },
      stats: { total, available, inProgress, review, completed, closed, frozen },
    };
  }



  async voidTaskRecord(slotId: string) {
    return prisma.$transaction(async (tx) => {
      const identity = await tx.taskSlot.findUnique({ where: { id: slotId }, select: { id: true, claimId: true, contactNumberId: true } });
      if (!identity) throw new NotFoundException("任务号码记录不存在。");
      if (identity.claimId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM task_claims WHERE id = ${identity.claimId}::uuid FOR UPDATE`;
      }
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM contact_numbers WHERE id = ${identity.contactNumberId}::uuid FOR UPDATE`;
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM task_slots WHERE id = ${slotId}::uuid FOR UPDATE`;
      const slot = await tx.taskSlot.findUnique({
        where: { id: slotId },
        include: { task: true, claim: { include: { contactAssignment: true } } },
      });
      if (!slot) throw new NotFoundException("任务号码记录不存在。");
      if (slot.status === "VOIDED") return { id: slot.id, status: "VOIDED", alreadyVoided: true };
      if (slot.status === "USED" || slot.claim?.status === "APPROVED") {
        throw new ConflictException("已完成或已结算的任务不能作废，请保留历史记录。");
      }
      if (slot.claim) {
        const claim = slot.claim;
        if (!["CLAIMED", "IN_PROGRESS", "REJECTED", "EXPIRED", "CANCELLED"].includes(claim.status)) {
          throw new ConflictException("当前领取状态不能作废。");
        }
        const pending = await tx.taskSubmission.findFirst({
          where: { claimId: claim.id, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
          select: { id: true },
        });
        if (pending) throw new ConflictException("该任务正在审核中，不能作废。");
        if (["CLAIMED", "IN_PROGRESS", "REJECTED"].includes(claim.status)) {
          await tx.taskClaim.update({ where: { id: claim.id }, data: { status: "CANCELLED" } });
          if (claim.contactAssignment?.status === "ASSIGNED") {
            await tx.contactAssignment.update({
              where: { id: claim.contactAssignment.id },
              data: { status: "RELEASED", releasedAt: new Date() },
            });
            await tx.contactNumber.updateMany({
              where: { id: claim.contactAssignment.contactNumberId, status: "ASSIGNED", consentStatus: "GRANTED" },
              data: { status: "AVAILABLE" },
            });
          }
          await tx.task.updateMany({
            where: { id: claim.taskId, claimedCount: { gt: 0 } },
            data: { claimedCount: { decrement: 1 } },
          });
        }
      }
      await tx.taskSlot.update({
        where: { id: slot.id },
        data: { status: "VOIDED", releasedAt: new Date() },
      });
      return { id: slot.id, status: "VOIDED", alreadyVoided: false };
    });
  }

  async deleteTaskRecord(slotId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM task_slots WHERE id = ${slotId}::uuid FOR UPDATE`;
      const slot = await tx.taskSlot.findUnique({ where: { id: slotId }, include: { task: true } });
      if (!slot) throw new NotFoundException("任务号码记录不存在。");
      if (slot.task.status === "PUBLISHED") throw new ConflictException("已发布任务不能删除号码记录，请先暂停任务。");
      if (slot.status !== "AVAILABLE" || slot.claimId) {
        throw new ConflictException("已领取、已执行或已作废的任务记录不能删除，请使用作废操作保留审计记录。");
      }
      await tx.taskSlot.delete({ where: { id: slot.id } });
      await allocateAvailableNumbersToOldestPublishedTask(tx);
      return { id: slot.id, deleted: true };
    });
  }

  async updateTaskGroup(taskId: string, groupName: string) {
    const normalized = groupName.trim();
    if (!normalized || normalized.length > 80) {
      throw new BadRequestException("任务组名称不能为空，且不能超过 80 个字符。");
    }
    const existing = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!existing) throw new NotFoundException("任务不存在。");
    return prisma.task.update({
      where: { id: taskId },
      data: { category: normalized },
      select: { id: true, category: true },
    });
  }

  async create(input: CreateAdminTaskDto) {
    const startsAt = dateValue(input.startsAt);
    const endsAt = dateValue(input.endsAt);
    if (startsAt && endsAt && startsAt >= endsAt) {
      throw new BadRequestException("任务结束时间必须晚于开始时间。");
    }

    const task = await prisma.task.create({
      data: {
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category.trim(),
        status: "DRAFT",
        rewardMinor: toMinorUnits(input.rewardAmount),
        currency: input.currency.trim().toUpperCase(),
        capacity: input.capacity ?? null,
        startsAt: startsAt ?? null,
        endsAt: endsAt ?? null,
        messageTemplate: cleanOptional(input.messageTemplate) ?? null,
        linkUrl: cleanOptional(input.linkUrl) ?? null,
        previewTitle: cleanOptional(input.previewTitle) ?? null,
        previewDescription: cleanOptional(input.previewDescription) ?? null,
        previewImageUrl: cleanOptional(input.previewImageUrl) ?? null,
      },
      include: { _count: { select: { claims: true } } },
    });
    return publicTask(task);
  }

  async update(taskId: string, input: UpdateAdminTaskDto) {
    const existing = await prisma.task.findUnique({ where: { id: taskId } });
    if (!existing) throw new NotFoundException("任务不存在。");
    if (existing.status === "PUBLISHED") {
      throw new ConflictException("请先暂停任务，再编辑任务内容。");
    }
    if (existing.claimedCount > 0) {
      throw new ConflictException("任务已经有领取记录，不能修改任务规则；请创建新任务。");
    }

    const startsAt = dateValue(input.startsAt);
    const endsAt = dateValue(input.endsAt);
    const nextStartsAt = startsAt === undefined ? existing.startsAt : startsAt;
    const nextEndsAt = endsAt === undefined ? existing.endsAt : endsAt;
    if (nextStartsAt && nextEndsAt && nextStartsAt >= nextEndsAt) {
      throw new BadRequestException("任务结束时间必须晚于开始时间。");
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category.trim() } : {}),
        ...(input.rewardAmount !== undefined ? { rewardMinor: toMinorUnits(input.rewardAmount) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency.trim().toUpperCase() } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(startsAt !== undefined ? { startsAt } : {}),
        ...(endsAt !== undefined ? { endsAt } : {}),
        ...(input.messageTemplate !== undefined ? { messageTemplate: cleanOptional(input.messageTemplate) } : {}),
        ...(input.linkUrl !== undefined ? { linkUrl: cleanOptional(input.linkUrl) } : {}),
        ...(input.previewTitle !== undefined ? { previewTitle: cleanOptional(input.previewTitle) } : {}),
        ...(input.previewDescription !== undefined ? { previewDescription: cleanOptional(input.previewDescription) } : {}),
        ...(input.previewImageUrl !== undefined ? { previewImageUrl: cleanOptional(input.previewImageUrl) } : {}),
      },
      include: { _count: { select: { claims: true } } },
    });
    return publicTask(task);
  }

  async publish(taskId: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("任务不存在。");
    if (!["DRAFT", "PAUSED"].includes(task.status)) {
      throw new ConflictException("当前任务状态不能发布。");
    }
    if (!task.messageTemplate?.trim()) {
      throw new BadRequestException("请先设置 WhatsApp 消息模板，再发布任务。");
    }
    if (task.startsAt && task.endsAt && task.startsAt >= task.endsAt) {
      throw new BadRequestException("任务结束时间必须晚于开始时间。");
    }

    return prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: { status: "PUBLISHED" },
      });

      // The allocator applies FIFO across all currently published tasks.
      // A task may be published with zero slots while an older task owns the
      // current inventory; future imports will be routed by the same rule.
      await allocateAvailableNumbersToOldestPublishedTask(tx);

      const updated = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: { _count: { select: { claims: true, slots: true } } },
      });
      return {
        ...publicTask(updated),
        inventory: await tx.taskSlot.groupBy({
          by: ["status"],
          where: { taskId },
          _count: { _all: true },
        }),
      };
    });
  }

  async pause(taskId: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("任务不存在。");
    if (task.status !== "PUBLISHED") {
      throw new ConflictException("只有已发布任务才能暂停。");
    }
    return prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: { status: "PAUSED" },
      });
      await allocateAvailableNumbersToOldestPublishedTask(tx);
      const updated = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: { _count: { select: { claims: true } } },
      });
      return publicTask(updated);
    });
  }

  async close(taskId: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("任务不存在。");
    if (task.status === "CLOSED") return publicTask({ ...task, _count: { claims: task.claimedCount } });
    return prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: { status: "CLOSED" },
      });
      await allocateAvailableNumbersToOldestPublishedTask(tx);
      const updated = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: { _count: { select: { claims: true } } },
      });
      return publicTask(updated);
    });
  }
}
