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
  group?: { name: string } | null;
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
    groupName: task.group?.name ?? "未分组",
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
      include: { group: { select: { name: true } }, _count: { select: { claims: true, slots: true } } },
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


  async listRecords(input: { page?: number; pageSize?: number; keyword?: string; status?: string; groupName?: string; createdFrom?: string; createdTo?: string; countryRegion?: string }) {
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
    const filters: Prisma.TaskSlotWhereInput[] = [];
    if (keyword) filters.push({ OR: searchConditions });
    if (input.groupName?.trim() && input.groupName !== "ALL") {
      filters.push({ task: { is: { group: { is: { name: input.groupName.trim() } } } } });
    }
    const countryRegion = input.countryRegion?.trim();
    if (countryRegion) {
      filters.push({ contactNumber: { is: { OR: [
        { countryCode: { equals: countryRegion.toUpperCase() } },
        { countryName: { contains: countryRegion, mode: "insensitive" } },
      ] } } });
    }
    const createdFrom = input.createdFrom ? new Date(input.createdFrom) : undefined;
    const createdTo = input.createdTo ? new Date(input.createdTo) : undefined;
    if (createdFrom && Number.isNaN(createdFrom.getTime())) throw new BadRequestException("开始日期格式无效。");
    if (createdTo && Number.isNaN(createdTo.getTime())) throw new BadRequestException("结束日期格式无效。");
    if (createdFrom && createdTo && createdFrom > createdTo) throw new BadRequestException("开始日期不能晚于结束日期。");
    if (createdFrom || createdTo) {
      filters.push({ createdAt: { ...(createdFrom ? { gte: createdFrom } : {}), ...(createdTo ? { lte: createdTo } : {}) } });
    }
    const baseWhere: Prisma.TaskSlotWhereInput = filters.length ? { AND: filters } : {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
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
        case "VOIDED":
          return { status: "VOIDED" };
        default:
          return {};
      }
    };
    const selectedWhere: Prisma.TaskSlotWhereInput = input.status && input.status !== "ALL"
      ? { AND: [baseWhere, statusWhere(input.status)] }
      : baseWhere;
    const countFor = (status: string) => prisma.taskSlot.count({ where: { AND: [baseWhere, statusWhere(status)] } });
    const [total, available, inProgress, review, completed, closed, frozen, voided, selectedTotal, rows, todayCreated, todayCompleted, todayVoided, approvedClaims, failedClaims] = await Promise.all([
      prisma.taskSlot.count({ where: baseWhere }),
      countFor("AVAILABLE"), countFor("IN_PROGRESS"), countFor("REVIEW"),
      countFor("COMPLETED"), countFor("CLOSED"), countFor("FROZEN"), countFor("VOIDED"),
      prisma.taskSlot.count({ where: selectedWhere }),
      prisma.taskSlot.findMany({
        where: selectedWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          task: { select: { id: true, title: true, category: true, status: true, rewardMinor: true, currency: true, messageTemplate: true, group: { select: { name: true } } } },
          contactNumber: { select: { id: true, phoneE164: true, status: true, consentStatus: true, countryCode: true, countryName: true } },
          claim: { select: { id: true, status: true, claimedAt: true, userId: true } },
        },
      }),
      prisma.taskSlot.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      prisma.taskSlot.count({ where: { usedAt: { gte: today, lt: tomorrow } } }),
      prisma.taskSlot.count({ where: { status: "VOIDED", updatedAt: { gte: today, lt: tomorrow } } }),
      prisma.taskClaim.count({ where: { status: "APPROVED" } }),
      prisma.taskClaim.count({ where: { status: { in: ["REJECTED", "EXPIRED", "CANCELLED"] } } }),
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
        phoneNumber: slot.contactNumber.phoneE164, groupName: slot.task.group?.name ?? "未分组",
        rewardAmount: (Number(slot.task.rewardMinor) / 100).toFixed(3),
        currency: slot.task.currency.trim(), messageTemplate: slot.task.messageTemplate ?? "",
        countryRegion: slot.contactNumber.countryName ?? slot.contactNumber.countryCode ?? "未标记", status, createdAt: slot.createdAt.toISOString(),
        claimId: slot.claim?.id ?? null, claimedAt: slot.claim?.claimedAt?.toISOString() ?? null,
        claimedUserId: slot.claim?.userId ?? null,
      };
    });
    return {
      items,
      pagination: { page, pageSize, total: selectedTotal, totalPages: Math.max(1, Math.ceil(selectedTotal / pageSize)) },
      stats: { total, available, inProgress, review, completed, closed, frozen, voided, todayCreated, todayCompleted, todayVoided, successRate: approvedClaims + failedClaims ? Math.round((approvedClaims / (approvedClaims + failedClaims)) * 10000) / 100 : 0 },
    };
  }



  async voidTaskRecord(slotId: string, actorId?: string) {
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
      if (actorId) {
        await tx.auditEvent.create({
          data: { actorType: "ADMIN", actorId, action: "TASK_RECORD_VOID", targetType: "TASK_SLOT", targetId: slot.id },
        });
      }
      return { id: slot.id, status: "VOIDED", alreadyVoided: false };
    });
  }

  async deleteTaskRecord(slotId: string, actorId?: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM task_slots WHERE id = ${slotId}::uuid FOR UPDATE`;
      const slot = await tx.taskSlot.findUnique({ where: { id: slotId }, include: { task: true } });
      if (!slot) throw new NotFoundException("任务号码记录不存在。");
      if (slot.task.status === "PUBLISHED") throw new ConflictException("已发布任务不能删除号码记录，请先暂停任务。");
      if (slot.status !== "AVAILABLE" || slot.claimId) {
        throw new ConflictException("已领取、已执行或已作废的任务记录不能删除，请使用作废操作保留审计记录。");
      }
      if (actorId) {
        await tx.auditEvent.create({
          data: { actorType: "ADMIN", actorId, action: "TASK_RECORD_DELETE", targetType: "TASK_SLOT", targetId: slot.id },
        });
      }
      await tx.taskSlot.delete({ where: { id: slot.id } });
      await allocateAvailableNumbersToOldestPublishedTask(tx);
      return { id: slot.id, deleted: true };
    });
  }


  private normalizeBulkRecordIds(ids: unknown): string[] {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException("请至少选择一条任务号码记录。");
    }
    if (ids.length > 100) {
      throw new BadRequestException("单次最多操作 100 条记录，请分批处理。");
    }
    const unique = Array.from(new Set(ids.filter((id): id is string => typeof id === "string").map((id) => id.trim())));
    if (unique.length !== ids.length || unique.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      throw new BadRequestException("所选任务记录编号无效，请刷新列表后重试。");
    }
    return unique;
  }

  async bulkVoidTaskRecords(ids: unknown, actorId: string) {
    const recordIds = this.normalizeBulkRecordIds(ids);
    const results: Array<{ id: string; success: boolean; message: string }> = [];
    for (const id of recordIds) {
      try {
        const result = await this.voidTaskRecord(id, actorId);
        results.push({ id, success: true, message: result.alreadyVoided ? "已经作废" : "作废成功" });
      } catch (error) {
        results.push({ id, success: false, message: error instanceof Error ? error.message : "作废失败" });
      }
    }
    return {
      action: "VOID",
      total: recordIds.length,
      succeeded: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
      results,
    };
  }

  async bulkDeleteTaskRecords(ids: unknown, actorId: string) {
    const recordIds = this.normalizeBulkRecordIds(ids);
    const results: Array<{ id: string; success: boolean; message: string }> = [];
    for (const id of recordIds) {
      try {
        await this.deleteTaskRecord(id, actorId);
        results.push({ id, success: true, message: "删除成功" });
      } catch (error) {
        results.push({ id, success: false, message: error instanceof Error ? error.message : "删除失败" });
      }
    }
    return {
      action: "DELETE",
      total: recordIds.length,
      succeeded: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
      results,
    };
  }

  async bulkUpdateTaskGroups(ids: unknown, groupName: string, actorId: string) {
    const recordIds = this.normalizeBulkRecordIds(ids);
    const normalized = groupName.trim();
    if (!normalized || normalized.length > 80) {
      throw new BadRequestException("任务组名称不能为空，且不能超过 80 个字符。");
    }
    const slots = await prisma.taskSlot.findMany({
      where: { id: { in: recordIds } },
      select: { id: true, taskId: true },
    });
    const missing = recordIds.filter((id) => !slots.some((slot) => slot.id === id));
    if (missing.length) throw new NotFoundException("部分任务号码记录已不存在，请刷新列表后重试。");
    const taskIds = Array.from(new Set(slots.map((slot) => slot.taskId)));
    const results: Array<{ taskId: string; success: boolean; message: string }> = [];
    for (const taskId of taskIds) {
      try {
        await this.updateTaskGroup(taskId, normalized, actorId);
        results.push({ taskId, success: true, message: "任务组更新成功" });
      } catch (error) {
        results.push({ taskId, success: false, message: error instanceof Error ? error.message : "任务组更新失败" });
      }
    }
    return {
      action: "GROUP",
      total: taskIds.length,
      succeeded: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
      results,
    };
  }

  async updateTaskGroup(taskId: string, groupName: string, actorId?: string) {
    const normalized = groupName.trim();
    if (!normalized || normalized.length > 80) {
      throw new BadRequestException("任务组名称不能为空，且不能超过 80 个字符。");
    }
    const existing = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!existing) throw new NotFoundException("任务不存在。");
    return prisma.$transaction(async (tx) => {
      const group = await tx.taskGroup.upsert({
        where: { name: normalized },
        create: { name: normalized },
        update: {},
        select: { id: true, name: true },
      });
      const updated = await tx.task.update({
        where: { id: taskId },
        data: { groupId: group.id },
        select: { id: true, groupId: true },
      });
      if (actorId) {
        await tx.auditEvent.create({
          data: { actorType: "ADMIN", actorId, action: "TASK_GROUP_UPDATE", targetType: "TASK", targetId: taskId, metadata: { groupName: normalized } },
        });
      }
      return updated;
    });
  }

  async create(input: CreateAdminTaskDto) {
    const startsAt = dateValue(input.startsAt);
    const endsAt = dateValue(input.endsAt);
    if (startsAt && endsAt && startsAt >= endsAt) {
      throw new BadRequestException("任务结束时间必须晚于开始时间。");
    }

    if (input.groupId) {
      const group = await prisma.taskGroup.findUnique({ where: { id: input.groupId }, select: { id: true } });
      if (!group) throw new NotFoundException("所选任务组不存在。");
    }

    const task = await prisma.task.create({
      data: {
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category.trim(),
        ...(input.groupId ? { groupId: input.groupId } : {}),
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
      include: { group: { select: { name: true } }, _count: { select: { claims: true } } },
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
    if (input.groupId) {
      const group = await prisma.taskGroup.findUnique({ where: { id: input.groupId }, select: { id: true } });
      if (!group) throw new NotFoundException("所选任务组不存在。");
    }
    if (nextStartsAt && nextEndsAt && nextStartsAt >= nextEndsAt) {
      throw new BadRequestException("任务结束时间必须晚于开始时间。");
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category.trim() } : {}),
        ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
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
      include: { group: { select: { name: true } }, _count: { select: { claims: true } } },
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

  async bulkUpdateMessageTemplate(input: { messageTemplate?: string; keyword?: string; groupName?: string; countryRegion?: string; createdFrom?: string; createdTo?: string }) {
    const messageTemplate = input.messageTemplate?.trim() ?? "";
    if (!messageTemplate || messageTemplate.length > 5000) throw new BadRequestException("话术不能为空且不能超过 5000 个字符。");
    const filters: Prisma.TaskSlotWhereInput[] = [
      { status: "AVAILABLE", claimId: null },
      { task: { is: { status: { in: ["DRAFT", "PAUSED"] }, claimedCount: 0 } } },
    ];
    const keyword = input.keyword?.trim();
    if (keyword) filters.push({ OR: [
      { task: { is: { title: { contains: keyword, mode: "insensitive" } } } },
      { task: { is: { category: { contains: keyword, mode: "insensitive" } } } },
      { contactNumber: { is: { phoneE164: { contains: keyword } } } },
    ] });
    if (input.groupName?.trim() && input.groupName !== "ALL") {
      filters.push({ task: { is: { group: { is: { name: input.groupName.trim() } } } } });
    }
    const countryRegion = input.countryRegion?.trim();
    if (countryRegion) filters.push({ contactNumber: { is: { OR: [
      { countryCode: { equals: countryRegion.toUpperCase() } },
      { countryName: { contains: countryRegion, mode: "insensitive" } },
    ] } } });
    const createdFrom = input.createdFrom ? new Date(input.createdFrom) : undefined;
    const createdTo = input.createdTo ? new Date(input.createdTo) : undefined;
    if (createdFrom && Number.isNaN(createdFrom.getTime())) throw new BadRequestException("开始日期格式无效。");
    if (createdTo && Number.isNaN(createdTo.getTime())) throw new BadRequestException("结束日期格式无效。");
    if (createdFrom && createdTo && createdFrom > createdTo) throw new BadRequestException("开始日期不能晚于结束日期。");
    if (createdFrom || createdTo) filters.push({ createdAt: { ...(createdFrom ? { gte: createdFrom } : {}), ...(createdTo ? { lte: createdTo } : {}) } });

    const slots = await prisma.taskSlot.findMany({
      where: { AND: filters },
      distinct: ["taskId"],
      select: { taskId: true },
    });
    const taskIds = slots.map((slot) => slot.taskId);
    if (!taskIds.length) return { matchedTasks: 0, updatedTasks: 0, message: "当前筛选条件下没有符合批量更换条件的任务。" };
    const result = await prisma.task.updateMany({
      where: { id: { in: taskIds }, status: { in: ["DRAFT", "PAUSED"] }, claimedCount: 0 },
      data: { messageTemplate },
    });
    return { matchedTasks: taskIds.length, updatedTasks: result.count, message: "已更新符合条件任务的话术；已领取或已发布任务保持不变。" };
  }

  async listTaskGroups() {
    const groups = await prisma.taskGroup.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { tasks: true } } },
    });
    return groups.map((group) => ({ id: group.id, name: group.name, description: group.description, taskCount: group._count.tasks, createdAt: group.createdAt.toISOString() }));
  }

  async createTaskGroup(input: { name?: string; description?: string }) {
    const name = input.name?.trim() ?? "";
    if (name.length < 2 || name.length > 100) throw new BadRequestException("任务组名称需要为 2 至 100 个字符。");
    try {
      return await prisma.taskGroup.create({ data: { name, description: cleanOptional(input.description) ?? null } });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ConflictException("任务组名称已存在。");
      throw error;
    }
  }

  async deleteTaskGroup(id: string) {
    const group = await prisma.taskGroup.findUnique({ where: { id }, include: { _count: { select: { tasks: true } } } });
    if (!group) throw new NotFoundException("任务组不存在。");
    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { groupId: id }, data: { groupId: null } });
      await tx.taskGroup.delete({ where: { id } });
    });
    return { id, deleted: true, detachedTasks: group._count.tasks, message: "任务组已删除，任务本身及其号码记录均已保留。" };
  }

  async listMessageTemplates(input: { enabled?: boolean; platform?: string; action?: string } = {}) {
    return prisma.messageTemplate.findMany({
      where: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.platform ? { platform: input.platform } : {}),
        ...(input.action ? { action: input.action } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });
  }

  async createMessageTemplate(input: { name?: string; platform?: string; action?: string; content?: string; enabled?: boolean }) {
    const name = input.name?.trim() ?? "";
    const platform = input.platform?.trim() ?? "";
    const action = input.action?.trim() || "MESSAGE";
    const content = input.content?.trim() ?? "";
    if (name.length < 2 || name.length > 160) throw new BadRequestException("模板名称需要为 2 至 160 个字符。");
    if (!platform || platform.length > 40) throw new BadRequestException("请选择有效的平台。");
    if (action.length > 40) throw new BadRequestException("模板动作名称不能超过 40 个字符。");
    if (!content || content.length > 10000) throw new BadRequestException("话术内容不能为空且不能超过 10000 个字符。");
    return prisma.messageTemplate.create({
      data: { name, platform, action, content, enabled: input.enabled ?? true },
    });
  }

  async updateMessageTemplate(id: string, input: { name?: string; platform?: string; action?: string; content?: string; enabled?: boolean }) {
    const existing = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("话术模板不存在。");
    const name = input.name?.trim();
    const platform = input.platform?.trim();
    const action = input.action?.trim();
    const content = input.content?.trim();
    if (name !== undefined && (name.length < 2 || name.length > 160)) throw new BadRequestException("模板名称需要为 2 至 160 个字符。");
    if (platform !== undefined && (!platform || platform.length > 40)) throw new BadRequestException("请选择有效的平台。");
    if (action !== undefined && (!action || action.length > 40)) throw new BadRequestException("模板动作名称无效。");
    if (content !== undefined && (!content || content.length > 10000)) throw new BadRequestException("话术内容不能为空且不能超过 10000 个字符。");
    return prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(platform !== undefined ? { platform } : {}),
        ...(action !== undefined ? { action } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
  }

  async disableMessageTemplate(id: string) {
    const existing = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("话术模板不存在。");
    return prisma.messageTemplate.update({ where: { id }, data: { enabled: false } });
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
