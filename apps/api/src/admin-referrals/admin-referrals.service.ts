import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma, type Prisma } from "@wtp/database";

type CommissionSettings = { enabled: boolean; level1: number; level2: number; level3: number; version: number };
const DEFAULT_SETTINGS: CommissionSettings = { enabled: true, level1: 60, level2: 25, level3: 15, version: 1 };
const SETTINGS_KEY = "referral-commission";

@Injectable()
export class AdminReferralsService {
  async listInvites(searchInput?: string, statusInput?: string, pageInput?: string, pageSizeInput?: string) {
    const page = Math.max(1, Number.parseInt(pageInput ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(pageSizeInput ?? "20", 10) || 20));
    const search = searchInput?.trim();
    const status = statusInput?.trim().toUpperCase();
    const where: Prisma.UserWhereInput = {
      ...(status && status !== "ALL" ? { status: status as Prisma.EnumUserStatusFilter["equals"] } : {}),
      ...(search ? { OR: [
        { phone: { contains: search, mode: "insensitive" as const } },
        { referralCode: { contains: search, mode: "insensitive" as const } },
        ...( /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(search) ? [{ id: search }] : []),
      ] } : {}),
    };
    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
        select: {
          id: true, phone: true, referralCode: true, status: true, createdAt: true,
          invitees: { select: { inviteeUserId: true } },
          descendants: { where: { depth: { in: [1, 2, 3] } }, select: { descendantUserId: true, depth: true } },
        },
      }),
    ]);
    const ids = users.map((user) => user.id);
    const [rewardGroupsResult, directActiveResult] = await Promise.all([
      ids.length ? prisma.referralReward.groupBy({ by: ["beneficiaryId", "currency"], where: { beneficiaryId: { in: ids } }, _sum: { amountMinor: true } }) : null,
      ids.length ? prisma.referralEdge.findMany({ where: { inviterUserId: { in: ids }, invitee: { status: "ACTIVE" } }, select: { inviterUserId: true } }) : null,
    ]);
    const rewardGroups = rewardGroupsResult ?? [];
    const directActive = directActiveResult ?? [];
    const activeMap = new Map<string, number>();
    for (const row of directActive) activeMap.set(row.inviterUserId, (activeMap.get(row.inviterUserId) ?? 0) + 1);
    const rewardMap = new Map<string, string>();
    for (const row of rewardGroups) {
      const key = row.beneficiaryId;
      const amount = row._sum.amountMinor ?? 0n;
      rewardMap.set(key, (BigInt(rewardMap.get(key) ?? "0") + amount).toString());
    }
    return {
      total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: users.map((user) => ({
        id: user.id, phone: user.phone, referralCode: user.referralCode, status: user.status,
        createdAt: user.createdAt.toISOString(), directInvites: user.invitees.length,
        activeInvites: activeMap.get(user.id) ?? 0,
        teamCounts: {
          level1: user.descendants.filter((x) => x.depth === 1).length,
          level2: user.descendants.filter((x) => x.depth === 2).length,
          level3: user.descendants.filter((x) => x.depth === 3).length,
        },
        teamCount: user.descendants.length,
        totalCommissionMinor: rewardMap.get(user.id) ?? "0",
        commissionCurrency: rewardGroups.find((x) => x.beneficiaryId === user.id)?.currency.trim() ?? "USD",
        inviteStatus: user.status === "ACTIVE" ? "可邀请" : "不可邀请",
        commissionEligible: user.status === "ACTIVE",
      })),
    };
  }

  async relation(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, referralCode: true, status: true, createdAt: true,
        invitedBy: { select: { inviter: { select: { id: true, phone: true, referralCode: true } } } } },
    });
    if (!user) throw new NotFoundException("用户不存在。");
    const [direct, descendants, rewards] = await Promise.all([
      prisma.referralEdge.findMany({ where: { inviterUserId: userId }, orderBy: { createdAt: "desc" }, take: 200,
        select: { createdAt: true, invitee: { select: { id: true, phone: true, referralCode: true, status: true } } } }),
      prisma.referralAncestor.findMany({ where: { ancestorUserId: userId, depth: { in: [2, 3] } }, orderBy: { createdAt: "desc" }, take: 300,
        select: { descendantUserId: true, depth: true, createdAt: true } }),
      prisma.referralReward.groupBy({ by: ["depth", "currency"], where: { beneficiaryId: userId }, _sum: { amountMinor: true }, _count: { _all: true } }),
    ]);
    const descendantIds = descendants.map((row) => row.descendantUserId);
    const descendantUsers = descendantIds.length ? await prisma.user.findMany({ where: { id: { in: descendantIds } }, select: { id: true, phone: true, referralCode: true, status: true } }) : [];
    const userMap = new Map(descendantUsers.map((row) => [row.id, row]));
    return {
      user: { ...user, createdAt: user.createdAt.toISOString() },
      inviter: user.invitedBy?.inviter ?? null,
      direct: direct.map((row) => ({ ...row.invitee, invitedAt: row.createdAt.toISOString(), depth: 1 })),
      indirect: descendants.map((row) => ({ ...(userMap.get(row.descendantUserId) ?? { id: row.descendantUserId, phone: "未知用户", referralCode: "", status: "UNKNOWN" }), depth: row.depth, invitedAt: row.createdAt.toISOString() })),
      commissionByLevel: rewards.map((row) => ({ depth: row.depth, currency: row.currency.trim(), amountMinor: (row._sum.amountMinor ?? 0n).toString(), count: row._count._all })),
    };
  }

  async listCommissions(searchInput?: string, statusInput?: string, depthInput?: string, fromInput?: string, toInput?: string, pageInput?: string, pageSizeInput?: string) {
    const page = Math.max(1, Number.parseInt(pageInput ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(pageSizeInput ?? "20", 10) || 20));
    const depth = depthInput ? Number.parseInt(depthInput, 10) : undefined;
    if (depth !== undefined && ![1, 2, 3].includes(depth)) throw new BadRequestException("分佣层级筛选无效。");
    const from = fromInput ? new Date(fromInput) : undefined;
    const to = toInput ? new Date(toInput) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw new BadRequestException("日期筛选格式无效。");
    const where: Prisma.ReferralRewardWhereInput = {
      ...(depth ? { depth } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(searchInput?.trim() ? { OR: [
        { sourceEventId: { contains: searchInput.trim(), mode: "insensitive" as const } },
        ...( /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(searchInput.trim()) ? [{ sourceUserId: searchInput.trim() }, { beneficiaryId: searchInput.trim() }] : []),
      ] } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.referralReward.count({ where }),
      prisma.referralReward.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, beneficiaryId: true, sourceUserId: true, sourceEventId: true, depth: true, amountMinor: true, currency: true, idempotencyKey: true, createdAt: true } }),
    ]);
    const keys = rows.map((row) => row.idempotencyKey);
    const sourceIds = [...new Set(rows.map((row) => row.sourceEventId).filter((id) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)))];
    const [credits, people, sourceClaims] = await Promise.all([
      keys.length ? prisma.ledgerEntry.findMany({ where: { idempotencyKey: { in: keys }, direction: "CREDIT" }, select: { idempotencyKey: true, createdAt: true } }) : [],
      prisma.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((row) => [row.beneficiaryId, row.sourceUserId]))] } }, select: { id: true, phone: true } }),
      sourceIds.length ? prisma.taskClaim.findMany({ where: { id: { in: sourceIds } }, select: { id: true, task: { select: { title: true } } } }) : [],
    ]);
    const creditMap = new Map(credits.map((row) => [row.idempotencyKey, row.createdAt]));
    const peopleMap = new Map(people.map((row) => [row.id, row.phone]));
    const taskMap = new Map(sourceClaims.map((row) => [row.id, row.task.title]));
    const items = rows.map((row) => ({ id: row.id, beneficiaryId: row.beneficiaryId, beneficiaryPhone: peopleMap.get(row.beneficiaryId) ?? "—",
      sourceUserId: row.sourceUserId, sourcePhone: peopleMap.get(row.sourceUserId) ?? "—", sourceEventId: row.sourceEventId, sourceTaskTitle: taskMap.get(row.sourceEventId) ?? null,
      depth: row.depth, amountMinor: row.amountMinor.toString(), currency: row.currency.trim(),
      status: creditMap.has(row.idempotencyKey) ? "CREDITED" : "PENDING",
      creditedAt: creditMap.get(row.idempotencyKey)?.toISOString() ?? null, createdAt: row.createdAt.toISOString() }));
    const filtered = items;
    return { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), items: filtered, note: "任务来源目前按佣金记录中的 sourceEventId 展示；记录模型未保存任务标题。" };
  }

  async getSettings() {
    const row = await prisma.taskConfiguration.findUnique({ where: { key: SETTINGS_KEY } });
    const value = row?.value && typeof row.value === "object" && !Array.isArray(row.value) ? row.value as Record<string, unknown> : {};
    const settings = { ...DEFAULT_SETTINGS, ...value } as CommissionSettings;
    return { ...settings, history: await this.history() };
  }

  async updateSettings(input: Partial<CommissionSettings>, adminId: string) {
    const current = await this.getSettings();
    const next = { enabled: input.enabled ?? current.enabled, level1: input.level1 ?? current.level1,
      level2: input.level2 ?? current.level2, level3: input.level3 ?? current.level3, version: current.version + 1 };
    for (const [name, value] of [["一级", next.level1], ["二级", next.level2], ["三级", next.level3]] as const) {
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new BadRequestException(name + "分佣比例必须在 0–100 之间。");
    }
    if (next.level1 + next.level2 + next.level3 > 100) throw new BadRequestException("三级分佣比例总和不能超过 100%。");
    await prisma.$transaction(async (tx) => {
      await tx.taskConfiguration.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: next as Prisma.InputJsonValue }, update: { value: next as Prisma.InputJsonValue } });
      await tx.auditEvent.create({ data: { actorType: "ADMIN", actorId: adminId, action: "REFERRAL_COMMISSION_SETTINGS_UPDATED", targetType: "REFERRAL_SETTINGS", targetId: "global", metadata: { before: current, after: next } } });
    });
    return { ...next, history: await this.history() };
  }

  private async history() {
    const rows = await prisma.auditEvent.findMany({ where: { targetType: "REFERRAL_SETTINGS", targetId: "global" }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
      const after = metadata.after && typeof metadata.after === "object" ? metadata.after as Record<string, unknown> : {};
      return { id: row.id, version: after.version ?? "—", enabled: after.enabled ?? false, level1: after.level1 ?? 0, level2: after.level2 ?? 0, level3: after.level3 ?? 0, adminId: row.actorId, createdAt: row.createdAt.toISOString(), action: row.action };
    });
  }
}
