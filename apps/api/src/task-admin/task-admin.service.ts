import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@wtp/database";
import type { Prisma } from "@wtp/database";
import type { CreateAdminTaskDto, UpdateAdminTaskDto } from "./task-admin.dto";
import { allocateAvailableNumbersToOldestPublishedTask, lockTaskSlotAllocation } from "../tasks/task-slot-allocation";

const DEV_EXECUTION_TEST_SCREENSHOT = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
<defs><pattern id="chatbg" width="72" height="72" patternUnits="userSpaceOnUse"><rect width="72" height="72" fill="#efe9df"/><g fill="none" stroke="#d8d0c4" stroke-width="2" opacity=".55"><circle cx="16" cy="18" r="8"/><path d="M45 12l12 12m-12 0l12-12M8 55q12-15 24 0M48 52h16v12H48z"/></g></pattern></defs>
<rect width="720" height="1280" fill="#fff"/><text x="42" y="43" font-family="Arial" font-size="23" fill="#6b7280">12:21 PM</text><text x="555" y="43" font-family="Arial" font-size="20" fill="#475569">4G  ▮▮▮  84%</text>
<rect y="68" width="720" height="110" fill="#fff"/><path d="M42 122l-14 14 14 14" fill="none" stroke="#263238" stroke-width="6"/><circle cx="112" cy="123" r="32" fill="#f5e6c8"/><circle cx="112" cy="113" r="10" fill="#a87936"/><path d="M92 140q20-25 40 0" fill="#a87936"/><text x="165" y="132" font-family="Arial" font-size="31" fill="#17212b">+254 711 300 123</text><circle cx="565" cy="122" r="20" fill="none" stroke="#263238" stroke-width="4"/><path d="M555 122h20M565 112v20" stroke="#263238" stroke-width="4"/><path d="M620 105q-18 16 0 34m-10-25q-8 10 0 20" fill="none" stroke="#263238" stroke-width="4"/>
<rect y="178" width="720" height="1020" fill="url(#chatbg)"/><rect x="275" y="205" width="170" height="42" rx="20" fill="#fff" opacity=".9"/><text x="360" y="233" text-anchor="middle" font-family="Arial" font-size="22" fill="#65706b">Today</text>
<rect x="105" y="278" width="510" height="112" rx="18" fill="#fff4d5" opacity=".96"/><text x="360" y="320" text-anchor="middle" font-family="Arial" font-size="20" fill="#52616b">Messages and calls are end-to-end</text><text x="360" y="350" text-anchor="middle" font-family="Arial" font-size="20" fill="#52616b">encrypted. Only people in this chat</text><text x="360" y="378" text-anchor="middle" font-family="Arial" font-size="20" fill="#52616b">can read, listen to, or share them.</text>
<rect x="145" y="420" width="520" height="500" rx="22" fill="#d9fdd3"/><text x="174" y="468" font-family="Arial" font-size="26" font-weight="bold" fill="#263238">🎁 Welcome! Task completed</text><text x="174" y="520" font-family="Arial" font-size="24" fill="#263238">Hello! This is a demonstration message</text><text x="174" y="557" font-family="Arial" font-size="24" fill="#263238">for the execution-record screenshot.</text><text x="174" y="620" font-family="Arial" font-size="24" fill="#263238">Please review the submitted task details</text><text x="174" y="657" font-family="Arial" font-size="24" fill="#263238">and confirm the required information.</text><text x="174" y="720" font-family="Arial" font-size="24" fill="#263238">Reference: DEMO-EXEC-001</text><text x="174" y="783" font-family="Arial" font-size="24" fill="#16804a">https://example.invalid/demo</text><text x="174" y="870" font-family="Arial" font-size="19" fill="#64746b">2:18 PM  ✓✓</text>
<rect x="24" y="960" width="672" height="82" rx="18" fill="#fff" opacity=".95"/><circle cx="65" cy="1000" r="20" fill="none" stroke="#64748b" stroke-width="4"/><text x="105" y="1010" font-family="Arial" font-size="24" fill="#94a3b8">Message</text><path d="M585 980v40m-12-20h24" stroke="#64748b" stroke-width="4"/><circle cx="650" cy="1000" r="24" fill="#111827"/><path d="M650 987v26m-10-13a10 10 0 0020 0" stroke="#fff" stroke-width="3" fill="none"/>
<rect x="0" y="1198" width="720" height="82" fill="#f8fafc"/><path d="M290 1230h30m-15-15v30" stroke="#64748b" stroke-width="4"/><circle cx="360" cy="1240" r="17" fill="none" stroke="#64748b" stroke-width="4"/><path d="M520 1224l20 32h-40z" fill="none" stroke="#64748b" stroke-width="4"/>
<rect x="18" y="18" width="684" height="1244" rx="8" fill="none" stroke="#cbd5e1" stroke-width="3"/><rect x="420" y="1140" width="270" height="42" rx="10" fill="#fff7ed" stroke="#fdba74"/><text x="555" y="1168" text-anchor="middle" font-family="Arial" font-size="18" fill="#c2410c">DEV TEST · NOT REAL EVIDENCE</text></svg>`;
const DEV_EXECUTION_TEST_SCREENSHOT_SHA256 = createHash("sha256").update(DEV_EXECUTION_TEST_SCREENSHOT).digest("hex");

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


  async listRecords(input: { page?: number; pageSize?: number; keyword?: string; status?: string; groupName?: string; createdFrom?: string; createdTo?: string; countryRegion?: string; useStage?: string; taskId?: string; reviewResult?: string }) {
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
    if (input.taskId?.trim()) {
      const taskId = input.taskId.trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) {
        throw new BadRequestException("任务编号必须填写完整编号。");
      }
      filters.push({ taskId });
    }
    if (input.useStage === "USED") filters.push({ status: "USED" });
    if (input.useStage === "UNUSED") filters.push({ status: { not: "USED" } });
    if (input.reviewResult === "APPROVED") filters.push({ claim: { is: { status: "APPROVED" } } });
    if (input.reviewResult === "PENDING") filters.push({ claim: { is: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } } });
    if (input.reviewResult === "REJECTED") filters.push({ claim: { is: { status: "REJECTED" } } });
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
          return { AND: [
            { status: { not: "VOIDED" } },
            notFrozen,
            { OR: [{ status: "USED" }, { claim: { is: { status: "APPROVED" } } }] },
          ] };
        case "CLOSED":
          return { AND: [
            { status: { not: "VOIDED" } },
            notFrozen,
            { NOT: [{ status: "USED" }, { claim: { is: { status: "APPROVED" } } }] },
            { OR: [
              { task: { is: { status: { in: ["DRAFT", "PAUSED", "CLOSED"] } } } },
              { claim: { is: { status: { in: ["REJECTED", "EXPIRED", "CANCELLED"] } } } },
            ] },
          ] };
        case "FROZEN":
          return { AND: [
            { status: { not: "VOIDED" } },
            { contactNumber: { is: { OR: [{ status: "BLOCKED" }, { consentStatus: "REVOKED" }] } } },
          ] };
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
        category: slot.task.category, phoneNumber: slot.contactNumber.phoneE164, groupName: slot.task.group?.name ?? "未分组",
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


  private readonly executionTestPrefix = "[DEV-EXEC-TEST]";

  async createExecutionTestData(adminId: string) {
    if (process.env.NODE_ENV === "production") throw new BadRequestException("生产环境禁止生成执行记录测试数据。");
    const token = Date.now().toString(36).toUpperCase();
    const groupName = this.executionTestPrefix + token;
    const now = new Date();
    const definitions = [
      { suffix: "执行中", slot: "ASSIGNED" as const, claim: "IN_PROGRESS" as const, contact: "ASSIGNED" as const },
      { suffix: "审核中", slot: "ASSIGNED" as const, claim: "UNDER_REVIEW" as const, contact: "ASSIGNED" as const },
      { suffix: "已结算", slot: "USED" as const, claim: "APPROVED" as const, contact: "USED" as const },
      { suffix: "已拒绝", slot: "VOIDED" as const, claim: "REJECTED" as const, contact: "AVAILABLE" as const },
      { suffix: "已超时", slot: "VOIDED" as const, claim: "EXPIRED" as const, contact: "AVAILABLE" as const },
      { suffix: "未领取", slot: "AVAILABLE" as const, claim: null, contact: "AVAILABLE" as const },
      { suffix: "已冻结", slot: "ASSIGNED" as const, claim: "IN_PROGRESS" as const, contact: "BLOCKED" as const },
    ];
    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.taskGroup.create({ data: { name: groupName, description: "系统自动生成的执行记录测试数据；可通过测试数据清理功能删除。" } });
      const ids: string[] = [];
      for (let index = 0; index < definitions.length; index += 1) {
        const definition = definitions[index];
        const suffix = token + index;
        const user = await tx.user.create({ data: {
          phone: "+254700" + suffix.padStart(6, "0").slice(-6),
          referralCode: "T" + suffix.padStart(10, "0").slice(-10),
          passwordHash: "DEV_TEST_ONLY_NOT_A_REAL_PASSWORD_HASH",
          status: "ACTIVE",
        } });
        const contact = await tx.contactNumber.create({ data: {
          phoneE164: "+254711" + suffix.padStart(6, "0").slice(-6),
          countryCode: "KE", countryName: "肯尼亚",
          status: definition.contact, consentStatus: "GRANTED",
          consentSource: "开发环境模拟数据",
          consentedAt: now,
        } });
        const task = await tx.task.create({ data: {
          title: this.executionTestPrefix + " " + definition.suffix,
          description: "仅供执行记录页面开发验证，不是真实推广任务。",
          category: "开发测试", groupId: group.id, status: "PUBLISHED",
          rewardMinor: 100n, currency: "KES", capacity: 1, claimedCount: definition.claim ? 1 : 0,
          messageTemplate: "【测试话术】此内容仅用于后台页面展示。",
          linkUrl: "https://example.invalid/dev-test",
        } });
        let claimId: string | null = null;
        if (definition.claim) {
          const claim = await tx.taskClaim.create({ data: {
            taskId: task.id, userId: user.id, status: definition.claim,
            claimedAt: new Date(now.getTime() - (index + 1) * 3600000),
            expiresAt: definition.claim === "EXPIRED" ? new Date(now.getTime() - 60000) : new Date(now.getTime() + 3600000),
            idempotencyKey: "dev-execution-test-" + suffix,
          } });
          claimId = claim.id;
          await tx.contactAssignment.create({ data: {
            contactNumberId: contact.id, claimId: claim.id, userId: user.id,
            status: definition.claim === "APPROVED" ? "COMPLETED" : definition.claim === "REJECTED" || definition.claim === "EXPIRED" ? "RELEASED" : "ASSIGNED",
            assignedAt: claim.claimedAt,
            ...(definition.claim === "APPROVED" ? { completedAt: now } : {}),
            ...(definition.claim === "REJECTED" || definition.claim === "EXPIRED" ? { releasedAt: now } : {}),
          } });
        }
        const slot = await tx.taskSlot.create({ data: {
          taskId: task.id, contactNumberId: contact.id, claimId,
          status: definition.slot,
          assignedAt: claimId ? new Date(now.getTime() - (index + 1) * 3600000) : null,
          usedAt: definition.slot === "USED" ? now : null,
          releasedAt: definition.slot === "VOIDED" ? now : null,
        } });
        ids.push(slot.id);
        if (claimId && ["IN_PROGRESS", "UNDER_REVIEW", "APPROVED", "REJECTED"].includes(definition.claim ?? "")) {
          const submissionStatus = definition.claim === "IN_PROGRESS" ? "SUBMITTED" : definition.claim === "UNDER_REVIEW" ? "UNDER_REVIEW" : definition.claim === "APPROVED" ? "APPROVED" : "REJECTED";
          const submission = await tx.taskSubmission.create({ data: {
            claimId, objectKey: "dev-execution-test/" + suffix + ".svg",
            originalName: "测试任务截图-" + definition.suffix + ".svg",
            mimeType: "image/svg+xml", sizeBytes: Buffer.byteLength(DEV_EXECUTION_TEST_SCREENSHOT, "utf8"), note: "APP 自动提交（测试模拟），不是真实用户上传。",
            status: submissionStatus,
          } });
          await tx.aiReviewJob.create({ data: {
            submissionId: submission.id, status: definition.claim === "IN_PROGRESS" ? "PENDING" : "COMPLETED",
            decision: definition.claim === "IN_PROGRESS" ? null : definition.claim === "REJECTED" ? "REJECT" : "APPROVE",
            confidence: definition.claim === "IN_PROGRESS" ? null : 0.98,
            reason: definition.claim === "IN_PROGRESS" ? "【测试数据】截图已提交，等待 AI 审核。" : "【测试数据】模拟 AI 审核说明，仅用于页面展示。",
            extractedText: "DEV TEST · " + definition.suffix,
          } });
          if (definition.claim !== "UNDER_REVIEW") {
            await tx.taskReview.create({ data: {
              submissionId: submission.id, reviewerAdminId: adminId,
              decision: definition.claim === "APPROVED" ? "APPROVE" : "REJECT",
              reason: "【测试数据】模拟人工审核意见。",
            } });
          }
        }
        await tx.auditEvent.create({ data: {
          actorType: "SYSTEM", actorId: adminId, action: "DEV_TEST_" + definition.suffix,
          targetType: "TaskSlot", targetId: slot.id,
          metadata: { testData: true, testBatch: token, note: "开发测试事件，不代表真实用户行为" },
        } });
        if (definition.suffix === "执行中") {
          await tx.auditEvent.create({ data: {
            actorType: "SYSTEM", actorId: adminId, action: "OPEN_WHATSAPP",
            targetType: "TaskSlot", targetId: slot.id,
            createdAt: new Date(now.getTime() - 25 * 60000),
            metadata: { testData: true, testBatch: token, source: "模拟打开 WhatsApp" },
          } });
        }
        if (definition.suffix === "审核中") {
          const requestedAt = new Date(now.getTime() - 12 * 60000);
          const deadlineAt = new Date(now.getTime() + 48 * 3600000);
          await tx.auditEvent.create({ data: {
            actorType: "SYSTEM", actorId: adminId, action: "SUPPLEMENT_REQUESTED",
            targetType: "TaskSlot", targetId: slot.id, createdAt: requestedAt,
            metadata: { testData: true, testBatch: token, reason: "模拟要求补充清晰截图", deadlineAt: deadlineAt.toISOString() },
          } });
        }
        if (definition.suffix === "已拒绝") {
          await tx.auditEvent.create({ data: {
            actorType: "SYSTEM", actorId: adminId, action: "DEV_TEST_RISK_REVIEW",
            targetType: "TaskSlot", targetId: slot.id,
            metadata: { testData: true, riskLevel: "需关注", reason: "模拟风险事件" },
          } });
        }
      }
      return { groupName, slotIds: ids };
    });
    return { createdCount: created.slotIds.length, groupName: created.groupName, message: "已生成 7 条独立测试执行记录。测试数据不会产生真实结算流水。" };
  }

  async deleteExecutionTestData() {
    if (process.env.NODE_ENV === "production") throw new BadRequestException("生产环境禁止清理执行记录测试数据。");
    const tasks = await prisma.task.findMany({
      where: { title: { startsWith: this.executionTestPrefix } },
      select: { id: true, groupId: true },
    });
    const taskIds = tasks.map((item) => item.id);
    const groups = await prisma.taskGroup.findMany({
      where: { name: { startsWith: this.executionTestPrefix } },
      select: { id: true },
    });
    if (!taskIds.length && !groups.length) return { deletedCount: 0, message: "没有找到测试数据。" };
    const slots = await prisma.taskSlot.findMany({ where: { taskId: { in: taskIds } }, select: { id: true, claimId: true, contactNumberId: true } });
    const claimIds = slots.map((item) => item.claimId).filter((id): id is string => Boolean(id));
    const contactIds = slots.map((item) => item.contactNumberId);
    const users = claimIds.length ? await prisma.taskClaim.findMany({ where: { id: { in: claimIds } }, select: { userId: true } }) : [];
    const userIds = users.map((item) => item.userId);
    await prisma.$transaction(async (tx) => {
      if (slots.length) await tx.auditEvent.deleteMany({ where: { targetType: "TaskSlot", targetId: { in: slots.map((item) => item.id) } } });
      if (claimIds.length) {
        const submissions = await tx.taskSubmission.findMany({ where: { claimId: { in: claimIds } }, select: { id: true } });
        const submissionIds = submissions.map((item) => item.id);
        if (submissionIds.length) {
          await tx.taskReview.deleteMany({ where: { submissionId: { in: submissionIds } } });
          await tx.aiReviewJob.deleteMany({ where: { submissionId: { in: submissionIds } } });
          await tx.taskSubmission.deleteMany({ where: { id: { in: submissionIds } } });
        }
        await tx.contactAssignment.deleteMany({ where: { claimId: { in: claimIds } } });
      }
      if (slots.length) await tx.taskSlot.deleteMany({ where: { id: { in: slots.map((item) => item.id) } } });
      if (claimIds.length) await tx.taskClaim.deleteMany({ where: { id: { in: claimIds } } });
      if (taskIds.length) await tx.task.deleteMany({ where: { id: { in: taskIds } } });
      if (contactIds.length) await tx.contactNumber.deleteMany({ where: { id: { in: contactIds } } });
      if (userIds.length) await tx.user.deleteMany({ where: { id: { in: userIds } } });
      if (groups.length) await tx.taskGroup.deleteMany({ where: { id: { in: groups.map((item) => item.id) } } });
    });
    return { deletedCount: slots.length, message: "测试数据已清理；真实任务和真实用户未被修改。" };
  }

  async getTaskRecordDetail(slotId: string) {
    const slot = await prisma.taskSlot.findUnique({
      where: { id: slotId },
      include: {
        task: { include: { group: { select: { name: true } } } },
        contactNumber: { select: { id: true, phoneE164: true, countryCode: true, countryName: true, status: true, consentStatus: true } },
        claim: {
          include: {
            user: { select: { id: true, phone: true } },
            contactAssignment: true,
            submissions: {
              orderBy: { submittedAt: "asc" },
              include: {
                aiReviewJob: true,
                reviews: {
                  orderBy: { reviewedAt: "asc" },
                  include: { reviewer: { select: { email: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!slot) throw new NotFoundException("执行记录不存在。");
    const targetIds = [slot.id, slot.claimId, ...(slot.claim?.submissions.map((item) => item.id) ?? [])]
      .filter((id): id is string => Boolean(id));
    const auditEvents = targetIds.length
      ? await prisma.auditEvent.findMany({
          where: { targetId: { in: targetIds } },
          orderBy: { createdAt: "asc" },
          take: 200,
        })
      : [];
    const submissions = slot.claim?.submissions ?? [];
    const openedEvent = auditEvents.find((event) => /OPEN_WHATSAPP|WHATSAPP_OPENED|OPENED_WHATSAPP/i.test(event.action));
    const supplementEvent = auditEvents.find((event) => /SUPPLEMENT_REQUESTED|REQUEST_SUPPLEMENT|SUPPLEMENT_REQUIRED/i.test(event.action));
    const openedAt = openedEvent?.createdAt ?? null;
    const openedMetadata = openedEvent?.metadata && typeof openedEvent.metadata === "object" ? openedEvent.metadata as Record<string, unknown> : {};
    const openInfo = {
      result: typeof openedMetadata.result === "string" ? openedMetadata.result : (openedEvent ? "OPENED" : "—"),
      whatsappInstalled: typeof openedMetadata.whatsappInstalled === "boolean" ? openedMetadata.whatsappInstalled : null,
      skippedSteps: typeof openedMetadata.skippedSteps === "boolean" ? openedMetadata.skippedSteps : null,
      skipReason: typeof openedMetadata.skipReason === "string" ? openedMetadata.skipReason : null,
      targetPackage: typeof openedMetadata.targetPackage === "string" ? openedMetadata.targetPackage : null,
      intentType: typeof openedMetadata.intentType === "string" ? openedMetadata.intentType : null,
    };
    const supplementMetadata = supplementEvent?.metadata && typeof supplementEvent.metadata === "object" ? supplementEvent.metadata as Record<string, unknown> : {};
    const supplementRequestedAt = supplementEvent?.createdAt ?? null;
    const supplementDeadlineAt = typeof supplementMetadata.deadlineAt === "string" ? supplementMetadata.deadlineAt : typeof supplementMetadata.deadline === "string" ? supplementMetadata.deadline : null;
    const behavior = [
      { key: "created", title: "创建任务记录", at: slot.createdAt, detail: slot.task.title },
      ...(slot.assignedAt ? [{ key: "assigned", title: "分配号码", at: slot.assignedAt, detail: slot.contactNumber.phoneE164 }] : []),
      ...(slot.claim ? [{ key: "claimed", title: "用户领取任务", at: slot.claim.claimedAt, detail: slot.claim.user.phone }] : []),
      ...(openedAt ? [{ key: "opened", title: "打开 WhatsApp", at: openedAt, detail: "用户已打开 WhatsApp" }] : []),
      ...(supplementRequestedAt ? [{ key: "supplement", title: "请求补图", at: supplementRequestedAt, detail: supplementMetadata.reason ?? "管理员请求补充截图" }] : []),
      ...submissions.map((item) => ({ key: "submitted", title: "提交任务截图", at: item.submittedAt, detail: item.originalName ?? "已提交证据" })),
      ...submissions.flatMap((item) => item.reviews.map((review) => ({
        key: "review", title: review.decision === "APPROVE" ? "人工审核通过" : "人工审核拒绝",
        at: review.reviewedAt, detail: review.reason ?? "—",
      }))),
      ...auditEvents.map((event) => ({ key: event.action, title: event.action, at: event.createdAt, detail: event.metadata ?? "—" })),
      ...(slot.usedAt ? [{ key: "settled", title: "任务完成/结算", at: slot.usedAt, detail: "任务号码已使用" }] : []),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    return {
      id: slot.id,
      task: { id: slot.task.id, title: slot.task.title, category: slot.task.category, status: slot.task.status, groupName: slot.task.group?.name ?? "未分组", messageTemplate: slot.task.messageTemplate, linkUrl: slot.task.linkUrl },
      phone: { id: slot.contactNumber.id, number: slot.contactNumber.phoneE164, countryCode: slot.contactNumber.countryCode, countryName: slot.contactNumber.countryName, status: slot.contactNumber.status, consentStatus: slot.contactNumber.consentStatus },
      status: slot.status,
      rewardAmount: (Number(slot.task.rewardMinor) / 100).toFixed(3),
      currency: slot.task.currency.trim(),
      createdAt: slot.createdAt.toISOString(),
      openWhatsAppAt: openedAt?.toISOString() ?? null,
      openInfo,
      assignedAt: slot.assignedAt?.toISOString() ?? null,
      usedAt: slot.usedAt?.toISOString() ?? null,
      releasedAt: slot.releasedAt?.toISOString() ?? null,
      claim: slot.claim ? {
        id: slot.claim.id, status: slot.claim.status, claimedAt: slot.claim.claimedAt.toISOString(),
        expiresAt: slot.claim.expiresAt?.toISOString() ?? null,
        user: slot.claim.user,
        assignment: slot.claim.contactAssignment ? {
          status: slot.claim.contactAssignment.status,
          assignedAt: slot.claim.contactAssignment.assignedAt.toISOString(),
          releasedAt: slot.claim.contactAssignment.releasedAt?.toISOString() ?? null,
          completedAt: slot.claim.contactAssignment.completedAt?.toISOString() ?? null,
        } : null,
      } : null,
      submissions: submissions.map((item) => ({
        id: item.id, status: item.status, originalName: item.originalName, mimeType: item.mimeType,
        sizeBytes: item.sizeBytes, note: item.note, submittedAt: item.submittedAt.toISOString(),
        evidenceUrl: item.objectKey.startsWith("dev-execution-test/") ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(DEV_EXECUTION_TEST_SCREENSHOT) : "/api/v1/admin/task-submissions/" + item.id + "/evidence",
        screenshotHash: item.objectKey.startsWith("dev-execution-test/") ? DEV_EXECUTION_TEST_SCREENSHOT_SHA256 : null,
        aiReview: item.aiReviewJob ? {
          status: item.aiReviewJob.status, decision: item.aiReviewJob.decision,
          confidence: item.aiReviewJob.confidence, reason: item.aiReviewJob.reason,
          extractedText: item.aiReviewJob.extractedText, lastError: item.aiReviewJob.lastError,
        } : null,
        reviews: item.reviews.map((review) => ({
          decision: review.decision, reason: review.reason, reviewedAt: review.reviewedAt.toISOString(),
          reviewer: review.reviewer?.email ?? "—",
        })),
      })),
      behavior,
      auditEvents: auditEvents.map((event) => ({
        id: event.id, action: event.action, actorType: event.actorType,
        createdAt: event.createdAt.toISOString(), metadata: event.metadata,
      })),
      risk: {
        level: (() => { const event = auditEvents.find((item) => /RISK|FRAUD|BLOCK/i.test(item.action)); const meta = event?.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {}; return typeof meta.riskLevel === "string" ? meta.riskLevel : event ? "需关注" : "待评估"; })(),
        score: (() => { const event = auditEvents.find((item) => /RISK|FRAUD|BLOCK/i.test(item.action)); const meta = event?.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {}; return typeof meta.score === "number" ? meta.score : null; })(),
        events: auditEvents.filter((event) => /RISK|FRAUD|BLOCK/i.test(event.action)).map((event) => ({
          id: event.id, action: event.action, createdAt: event.createdAt.toISOString(), metadata: event.metadata,
        })),
      },
      supplements: auditEvents.filter((event) => /SUPPLEMENT|RESEND|REISSUE/i.test(event.action)).map((event) => ({ id: event.id, action: event.action, createdAt: event.createdAt.toISOString(), metadata: event.metadata })),
    };
  }



  async voidTaskRecord(slotId: string, actorId?: string) {
    return prisma.$transaction(async (tx) => {
      await lockTaskSlotAllocation(tx);
      const identity = await tx.taskSlot.findUnique({
        where: { id: slotId },
        select: { id: true, claimId: true, contactNumberId: true },
      });
      if (!identity) throw new NotFoundException("任务号码记录不存在。");
      if (identity.claimId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM task_claims WHERE id = ${identity.claimId}::uuid FOR UPDATE`;
      }
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM contact_numbers WHERE id = ${identity.contactNumberId}::uuid FOR UPDATE`;
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM task_slots WHERE id = ${slotId}::uuid FOR UPDATE`;
      // A claim may have won the number/slot race after the initial identity
      // read. Re-lock its claim row before evaluating the now-current slot.
      const currentClaimLink = await tx.taskSlot.findUnique({
        where: { id: slotId },
        select: { claimId: true },
      });
      if (currentClaimLink?.claimId && currentClaimLink.claimId !== identity.claimId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM task_claims WHERE id = ${currentClaimLink.claimId}::uuid FOR UPDATE`;
      }
      const slot = await tx.taskSlot.findUnique({
        where: { id: slotId },
        include: {
          task: true,
          contactNumber: true,
          claim: { include: { contactAssignment: true } },
        },
      });
      if (!slot) throw new NotFoundException("任务号码记录不存在。");
      if (slot.status === "USED" || slot.claim?.status === "APPROVED") {
        throw new ConflictException("已完成或已结算的任务不能回收，请保留历史记录。");
      }
      if (slot.claim) {
        const claim = slot.claim;
        if (!["CLAIMED", "IN_PROGRESS", "REJECTED", "EXPIRED", "CANCELLED"].includes(claim.status)) {
          throw new ConflictException("当前领取状态不能回收号码。");
        }
        const pending = await tx.taskSubmission.findFirst({
          where: { claimId: claim.id, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
          select: { id: true },
        });
        if (pending) throw new ConflictException("该任务正在审核中，不能回收号码。");
        const assignmentWasActive = claim.contactAssignment?.status === "ASSIGNED";
        const slotWasActive = ["ASSIGNED", "AVAILABLE"].includes(slot.status) && slot.claimId === claim.id;

        if (["CLAIMED", "IN_PROGRESS"].includes(claim.status)) {
          await tx.taskClaim.update({ where: { id: claim.id }, data: { status: "CANCELLED" } });
        }
        // New rejected claims have already released their reservation and
        // decremented claimedCount. Only legacy REJECTED rows that still own
        // an active assignment/slot need that one-time counter correction.
        if (["CLAIMED", "IN_PROGRESS"].includes(claim.status) ||
            (claim.status === "REJECTED" && (assignmentWasActive || slotWasActive))) {
          await tx.task.updateMany({
            where: { id: claim.taskId, claimedCount: { gt: 0 } },
            data: { claimedCount: { decrement: 1 } },
          });
        }

        // Release legacy active assignments, but keep a rejected claim as
        // REJECTED in history instead of rewriting it to CANCELLED.
        if (assignmentWasActive) {
          await tx.contactAssignment.update({
            where: { id: claim.contactAssignment!.id },
            data: { status: "RELEASED", releasedAt: new Date() },
          });
        }
      }

      // Recover a stale number reservation even if the slot's claim relation
      // was cleared by an older operation. Consent remains mandatory.
      await tx.contactNumber.updateMany({
        where: { id: slot.contactNumberId, status: "ASSIGNED", consentStatus: "GRANTED" },
        data: { status: "AVAILABLE" },
      });

      // Only consented, currently available numbers can re-enter the pool.
      // Completed, blocked, or consent-revoked numbers are never recycled.
      const currentNumber = await tx.contactNumber.findUnique({
        where: { id: slot.contactNumberId },
        select: { status: true, consentStatus: true },
      });
      const recyclable = currentNumber?.status === "AVAILABLE"
        && currentNumber.consentStatus === "GRANTED";
      if (!recyclable) {
        throw new ConflictException("该号码当前不可重新分配：号码必须处于可用状态且授权有效。");
      }

      const now = new Date();
      await tx.taskSlot.update({
        where: { id: slot.id },
        data: {
          status: "AVAILABLE",
          claimId: null,
          assignedAt: null,
          releasedAt: now,
          usedAt: null,
        },
      });

      // Re-run the shared FIFO allocator. If the old task is paused, closed,
      // future-dated, or expired, its released slot is moved to the oldest
      // currently active published task. If the old task is still active,
      // the available slot remains claimable there.
      await allocateAvailableNumbersToOldestPublishedTask(tx);

      if (actorId) {
        await tx.auditEvent.create({
          data: {
            actorType: "ADMIN",
            actorId,
            action: "TASK_RECORD_VOID",
            targetType: "TASK_SLOT",
            targetId: slot.id,
            metadata: {
              previousTaskId: slot.taskId,
              recycledToPool: true,
              previousClaimId: slot.claimId,
            },
          },
        });
      }
      return { id: slot.id, status: "AVAILABLE", alreadyVoided: false, numberRecycled: true };
    });
  }

  async deleteTaskRecord(slotId: string, actorId?: string) {
    return prisma.$transaction(async (tx) => {
      await lockTaskSlotAllocation(tx);
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
        results.push({ id, success: true, message: result.numberRecycled ? "号码已回收到可分配库存" : "号码回收完成" });
      } catch (error) {
        results.push({ id, success: false, message: error instanceof Error ? error.message : "号码回收失败" });
      }
    }
    return {
      action: "RECYCLE",
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
      await lockTaskSlotAllocation(tx);
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
      await lockTaskSlotAllocation(tx);
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

  async bulkUpdateMessageTemplate(input: { messageTemplate?: string; templatePlatform?: string; keyword?: string; groupName?: string; countryRegion?: string; createdFrom?: string; createdTo?: string }) {
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
    const templatePlatform = input.templatePlatform?.trim();
    if (templatePlatform && templatePlatform !== "通用") {
      const matchedTasks = await prisma.task.findMany({
        where: { id: { in: taskIds }, status: { in: ["DRAFT", "PAUSED"] }, claimedCount: 0 },
        select: { category: true },
      });
      const categories = Array.from(new Set(matchedTasks.map((task) => task.category)));
      if (categories.length !== 1 || categories[0] !== templatePlatform) {
        throw new BadRequestException("所选专用话术模板的平台与当前筛选匹配的任务平台不一致；请缩小筛选范围或改用通用模板。");
      }
    }
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

  async createMessageTemplate(input: { name?: string; platform?: string; platformCode?: string; action?: string; content?: string; language?: string; keywords?: string; enabled?: boolean }) {
    const name = input.name?.trim() ?? "";
    const platform = input.platform?.trim() ?? "";
    const action = input.action?.trim() || "MESSAGE";
    const content = input.content?.trim() ?? "";
    if (name.length < 2 || name.length > 160) throw new BadRequestException("模板名称需要为 2 至 160 个字符。");
    if (!platform || platform.length > 40) throw new BadRequestException("请选择有效的平台。");
    if (action.length > 40) throw new BadRequestException("模板动作名称不能超过 40 个字符。");
    if (!content || content.length > 10000) throw new BadRequestException("话术内容不能为空且不能超过 10000 个字符。");
    return prisma.messageTemplate.create({
      data: { name, platform, platformCode: input.platformCode?.trim() || null, action, content, language: input.language?.trim() || null, keywords: input.keywords?.trim() || null, enabled: input.enabled ?? true },
    });
  }

  async updateMessageTemplate(id: string, input: { name?: string; platform?: string; platformCode?: string; action?: string; content?: string; language?: string; keywords?: string; enabled?: boolean }) {
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
        ...(input.platformCode !== undefined ? { platformCode: input.platformCode.trim() || null } : {}),
        ...(action !== undefined ? { action } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(input.language !== undefined ? { language: input.language.trim() || null } : {}),
        ...(input.keywords !== undefined ? { keywords: input.keywords.trim() || null } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
  }

  async disableMessageTemplate(id: string) {
    const existing = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("话术模板不存在。");
    return prisma.messageTemplate.update({ where: { id }, data: { enabled: false } });
  }

  private async readPlatforms(): Promise<Array<Record<string, unknown>>> {
    const value = await this.getConfiguration("platforms");
    return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  }

  async listPlatforms() {
    const platforms = await this.readPlatforms();
    return { items: platforms, total: platforms.length };
  }

  async createPlatform(input: { name?: string; code?: string; targetApp?: string; description?: string; capabilities?: Record<string, unknown> }) {
    const name = input.name?.trim() ?? "";
    const code = input.code?.trim().toUpperCase() ?? "";
    const targetApp = input.targetApp?.trim() ?? "";
    if (name.length < 2 || name.length > 80) throw new BadRequestException("平台名称需要为 2 至 80 个字符。");
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(code)) throw new BadRequestException("平台代码格式无效，请使用大写英文、数字或下划线。");
    if (!targetApp || targetApp.length > 100) throw new BadRequestException("目标 APP 名称不能为空。");
    const platforms = await this.readPlatforms();
    if (platforms.some((item) => item.code === code)) throw new ConflictException("平台代码已存在。");
    const platform = {
      id: randomUUID(), code, name, targetApp,
      description: input.description?.trim() ?? "",
      capabilities: {
        appSupport: input.capabilities?.appSupport === true,
        nodeSupport: input.capabilities?.nodeSupport === true,
        visualReview: input.capabilities?.visualReview === true,
        backendSupport: input.capabilities?.backendSupport === true,
      },
      enabled: true, archived: false, actions: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    platforms.push(platform);
    await this.saveConfiguration("platforms", platforms);
    return platform;
  }

  async updatePlatform(id: string, input: { name?: string; targetApp?: string; description?: string; capabilities?: Record<string, unknown>; enabled?: boolean }) {
    const platforms = await this.readPlatforms();
    const index = platforms.findIndex((item) => item.id === id);
    if (index < 0) throw new NotFoundException("平台不存在。");
    const current = platforms[index];
    const next = {
      ...current,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.targetApp !== undefined ? { targetApp: input.targetApp.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.capabilities !== undefined ? { capabilities: {
        appSupport: input.capabilities.appSupport === true,
        nodeSupport: input.capabilities.nodeSupport === true,
        visualReview: input.capabilities.visualReview === true,
        backendSupport: input.capabilities.backendSupport === true,
      } } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (typeof next.name !== "string" || next.name.trim().length < 2 || next.name.length > 80) throw new BadRequestException("平台名称无效。");
    if (typeof next.targetApp !== "string" || !next.targetApp.trim()) throw new BadRequestException("目标 APP 名称不能为空。");
    platforms[index] = next;
    await this.saveConfiguration("platforms", platforms);
    return next;
  }

  async createPlatformAction(platformId: string, input: { name?: string; code?: string; evidenceType?: string; requiresTargetPhone?: boolean; requiresDeliveryStatus?: boolean; requiresMessageTemplate?: boolean }) {
    const platforms = await this.readPlatforms();
    const index = platforms.findIndex((item) => item.id === platformId);
    if (index < 0) throw new NotFoundException("平台不存在。");
    const platform = platforms[index];
    if (platform.enabled !== true || platform.archived === true) throw new BadRequestException("请先启用平台，再添加任务动作。");
    const name = input.name?.trim() ?? "";
    const code = input.code?.trim().toUpperCase() ?? "";
    if (name.length < 2 || name.length > 100) throw new BadRequestException("任务动作名称需要为 2 至 100 个字符。");
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(code)) throw new BadRequestException("动作代码格式无效。");
    const actions = Array.isArray(platform.actions) ? platform.actions as Array<Record<string, unknown>> : [];
    if (actions.some((item) => item.code === code)) throw new ConflictException("该平台下已存在相同动作代码。");
    const action = {
      id: randomUUID(), code, name,
      evidenceType: input.evidenceType?.trim() || "SCREENSHOT",
      requiresTargetPhone: input.requiresTargetPhone === true,
      requiresDeliveryStatus: input.requiresDeliveryStatus === true,
      requiresMessageTemplate: input.requiresMessageTemplate === true,
      enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    platforms[index] = { ...platform, actions: [...actions, action], updatedAt: new Date().toISOString() };
    await this.saveConfiguration("platforms", platforms);
    return action;
  }

  async updatePlatformAction(platformId: string, actionId: string, input: { name?: string; evidenceType?: string; requiresTargetPhone?: boolean; requiresDeliveryStatus?: boolean; requiresMessageTemplate?: boolean; enabled?: boolean }) {
    const platforms = await this.readPlatforms();
    const platformIndex = platforms.findIndex((item) => item.id === platformId);
    if (platformIndex < 0) throw new NotFoundException("平台不存在。");
    const platform = platforms[platformIndex];
    const actions = Array.isArray(platform.actions) ? platform.actions as Array<Record<string, unknown>> : [];
    const actionIndex = actions.findIndex((item) => item.id === actionId);
    if (actionIndex < 0) throw new NotFoundException("任务动作不存在。");
    const old = actions[actionIndex];
    const action = {
      ...old,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.evidenceType !== undefined ? { evidenceType: input.evidenceType.trim() } : {}),
      ...(input.requiresTargetPhone !== undefined ? { requiresTargetPhone: input.requiresTargetPhone } : {}),
      ...(input.requiresDeliveryStatus !== undefined ? { requiresDeliveryStatus: input.requiresDeliveryStatus } : {}),
      ...(input.requiresMessageTemplate !== undefined ? { requiresMessageTemplate: input.requiresMessageTemplate } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (typeof action.name !== "string" || action.name.trim().length < 2 || action.name.length > 100) throw new BadRequestException("任务动作名称无效。");
    actions[actionIndex] = action;
    platforms[platformIndex] = { ...platform, actions, updatedAt: new Date().toISOString() };
    await this.saveConfiguration("platforms", platforms);
    return action;
  }

  async getConfiguration(key: string) {
    const allowed = ["platforms", "countries", "sources", "rewards", "claim-limits", "reviews"];
    if (!allowed.includes(key)) throw new BadRequestException("未知的任务配置类型。");
    const row = await prisma.taskConfiguration.findUnique({ where: { key } });
    return row?.value ?? (key === "claim-limits" ? { dailyLimit: 20, minimumIntervalSeconds: 60, taskTimeLimitMinutes: 3 } : []);
  }

  async saveConfiguration(key: string, value: unknown) {
    const allowed = ["platforms", "countries", "sources", "rewards", "claim-limits", "reviews"];
    if (!allowed.includes(key)) throw new BadRequestException("未知的任务配置类型。");
    if (value === undefined || value === null || typeof value !== "object") {
      throw new BadRequestException("配置内容格式无效。");
    }
    if (key === "claim-limits") {
      const input = value as Record<string, unknown>;
      for (const field of ["dailyLimit", "minimumIntervalSeconds", "taskTimeLimitMinutes"]) {
        const n = Number(input[field]);
        if (!Number.isInteger(n) || n < 1 || n > 1000000) throw new BadRequestException("领取限制必须填写有效的正整数。");
      }
    } else if (!Array.isArray(value)) {
      throw new BadRequestException("该配置必须为列表格式。");
    }
    return prisma.taskConfiguration.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
  }

  async close(taskId: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("任务不存在。");
    if (task.status === "CLOSED") return publicTask({ ...task, _count: { claims: task.claimedCount } });
    return prisma.$transaction(async (tx) => {
      await lockTaskSlotAllocation(tx);
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
