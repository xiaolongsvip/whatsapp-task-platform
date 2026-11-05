import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@wtp/database";
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
