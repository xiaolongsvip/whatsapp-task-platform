import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma, type Prisma } from "@wtp/database";

type CommissionSettings = { enabled: boolean; level1: number; level2: number; level3: number; version: number };
const DEFAULT_SETTINGS: CommissionSettings = { enabled: true, level1: 60, level2: 25, level3: 15, version: 1 };
const SETTINGS_KEY = "referral-commission";

@Injectable()
export class AdminReferralsService {
  async auditReferralRelations() {
    const limit = 50000;
    const [edges, ancestors, userCount] = await Promise.all([
      prisma.referralEdge.findMany({ take: limit + 1, select: { inviteeUserId: true, inviterUserId: true } }),
      prisma.referralAncestor.findMany({ take: limit + 1, select: { descendantUserId: true, ancestorUserId: true, depth: true } }),
      prisma.user.count(),
    ]);
    if (edges.length > limit || ancestors.length > limit) {
      return { complete: false, limit, userCount, edgeCount: edges.length, ancestorCount: ancestors.length,
        message: "关系记录超过单次只读审计上限，本次未计算差异；请安排分批审计。" };
    }
    const parentByInvitee = new Map(edges.map((edge) => [edge.inviteeUserId, edge.inviterUserId]));
    const actualByDescendant = new Map<string, Map<number, string>>();
    for (const row of ancestors) {
      const byDepth = actualByDescendant.get(row.descendantUserId) ?? new Map<number, string>();
      byDepth.set(row.depth, row.ancestorUserId);
      actualByDescendant.set(row.descendantUserId, byDepth);
    }
    const descendants = new Set([...parentByInvitee.keys(), ...actualByDescendant.keys()]);
    const issues: Array<{ type: string; descendantUserId: string; depth?: number; expectedAncestorId?: string; actualAncestorId?: string }> = [];
    let missing = 0;
    let unexpected = 0;
    let mismatched = 0;
    let cycles = 0;
    for (const descendantId of descendants) {
      const expected = new Map<number, string>();
      const visited = new Set<string>([descendantId]);
      let current = descendantId;
      for (let depth = 1; depth <= 3; depth += 1) {
        const parent = parentByInvitee.get(current);
        if (!parent) break;
        if (visited.has(parent)) {
          cycles += 1;
          if (issues.length < 100) issues.push({ type: "CYCLE", descendantUserId: descendantId, depth, actualAncestorId: parent });
          break;
        }
        visited.add(parent);
        expected.set(depth, parent);
        current = parent;
      }
      const actual = actualByDescendant.get(descendantId) ?? new Map<number, string>();
      for (const [depth, expectedAncestorId] of expected) {
        const actualAncestorId = actual.get(depth);
        if (!actualAncestorId) {
          missing += 1;
          if (issues.length < 100) issues.push({ type: "MISSING", descendantUserId: descendantId, depth, expectedAncestorId });
        } else if (actualAncestorId !== expectedAncestorId) {
          mismatched += 1;
          if (issues.length < 100) issues.push({ type: "MISMATCH", descendantUserId: descendantId, depth, expectedAncestorId, actualAncestorId });
        }
      }
      for (const [depth, actualAncestorId] of actual) {
        if (![1, 2, 3].includes(depth) || !expected.has(depth)) {
          unexpected += 1;
          if (issues.length < 100) issues.push({ type: "UNEXPECTED", descendantUserId: descendantId, depth, actualAncestorId });
        }
      }
    }
    return { complete: true, userCount, edgeCount: edges.length, ancestorCount: ancestors.length,
      summary: { missing, unexpected, mismatched, cycles, issueCount: missing + unexpected + mismatched + cycles },
      sampleLimit: 100, issues };
  }

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
    const rewardMap = new Map<string, Array<{ currency: string; amountMinor: string }>>();
    for (const row of rewardGroups) {
      const current = rewardMap.get(row.beneficiaryId) ?? [];
      current.push({ currency: row.currency.trim(), amountMinor: (row._sum.amountMinor ?? 0n).toString() });
      rewardMap.set(row.beneficiaryId, current);
    }
    return {
      total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: users.map((user) => ({
        id: user.id, phone: user.phone, referralCode: user.referralCode, status: user.status,
        createdAt: user.createdAt.toISOString(), directInvites: user.invitees.length,
        activeInvites: activeMap.get(user.id) ?? 0,
        teamCounts: {
          level1: user.invitees.length,
          level2: user.descendants.filter((x) => x.depth === 2).length,
          level3: user.descendants.filter((x) => x.depth === 3).length,
        },
        teamCount: user.invitees.length + user.descendants.filter((x) => x.depth === 2 || x.depth === 3).length,
        totalCommissionByCurrency: rewardMap.get(user.id) ?? [],
        totalCommissionMinor: (rewardMap.get(user.id) ?? []).length === 1 ? rewardMap.get(user.id)![0].amountMinor : "0",
        commissionCurrency: (rewardMap.get(user.id) ?? []).length === 1 ? rewardMap.get(user.id)![0].currency : "—",
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
    const [directCount, direct, ancestorCounts, descendants, rewards] = await Promise.all([
      prisma.referralEdge.count({ where: { inviterUserId: userId } }),
      prisma.referralEdge.findMany({ where: { inviterUserId: userId }, orderBy: { createdAt: "desc" },
        select: { createdAt: true, invitee: { select: { id: true, phone: true, referralCode: true, status: true } } } }),
      prisma.referralAncestor.groupBy({ by: ["depth"], where: { ancestorUserId: userId, depth: { in: [2, 3] } }, _count: { _all: true } }),
      prisma.referralAncestor.findMany({ where: { ancestorUserId: userId, depth: { in: [2, 3] } }, orderBy: { createdAt: "desc" },
        select: { descendantUserId: true, depth: true, createdAt: true } }),
      prisma.referralReward.groupBy({ by: ["depth", "currency"], where: { beneficiaryId: userId }, _sum: { amountMinor: true }, _count: { _all: true } }),
    ]);
    const descendantIds = descendants.map((row) => row.descendantUserId);
    const descendantUsers = descendantIds.length ? await prisma.user.findMany({ where: { id: { in: descendantIds } }, select: { id: true, phone: true, referralCode: true, status: true } }) : [];
    const userMap = new Map(descendantUsers.map((row) => [row.id, row]));
    const countByDepth = new Map(ancestorCounts.map((row) => [row.depth, row._count._all]));
    return {
      user: { ...user, createdAt: user.createdAt.toISOString() },
      inviter: user.invitedBy?.inviter ?? null,
      teamCounts: { level1: directCount, level2: countByDepth.get(2) ?? 0, level3: countByDepth.get(3) ?? 0, total: directCount + (countByDepth.get(2) ?? 0) + (countByDepth.get(3) ?? 0) },
      direct: direct.map((row) => ({ ...row.invitee, invitedAt: row.createdAt.toISOString(), depth: 1 })),
      indirect: descendants.map((row) => ({ ...(userMap.get(row.descendantUserId) ?? { id: row.descendantUserId, phone: "未知用户", referralCode: "", status: "UNKNOWN" }), depth: row.depth, invitedAt: row.createdAt.toISOString() })),
      commissionByLevel: rewards.map((row) => ({ depth: row.depth, currency: row.currency.trim(), amountMinor: (row._sum.amountMinor ?? 0n).toString(), count: row._count._all })),
    };
  }

  async listCommissions(searchInput?: string, statusInput?: string, depthInput?: string, fromInput?: string, toInput?: string, pageInput?: string, pageSizeInput?: string) {
    const page = Math.max(1, Number.parseInt(pageInput ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(pageSizeInput ?? "20", 10) || 20));
    const status = statusInput?.trim().toUpperCase() || "ALL";
    if (!["ALL", "CREDITED", "PENDING"].includes(status)) throw new BadRequestException("佣金入账状态筛选无效。");
    const depth = depthInput ? Number.parseInt(depthInput, 10) : undefined;
    if (depth !== undefined && ![1, 2, 3].includes(depth)) throw new BadRequestException("分佣层级筛选无效。");
    const from = fromInput ? new Date(fromInput) : undefined;
    const to = toInput ? new Date(toInput) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw new BadRequestException("日期筛选格式无效。");
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(toInput ?? "")) to.setHours(23, 59, 59, 999);
    if (from && to && from > to) throw new BadRequestException("开始日期不能晚于结束日期。");
    const search = searchInput?.trim();
    const matchedUsers = search ? await prisma.user.findMany({
      where: { OR: [{ phone: { contains: search, mode: "insensitive" } }, { referralCode: { contains: search, mode: "insensitive" } }] },
      select: { id: true }, take: 500,
    }) : [];
    const where: Prisma.ReferralRewardWhereInput = {
      ...(depth ? { depth } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(search ? { OR: [
        { sourceEventId: { contains: search, mode: "insensitive" } },
        ...( /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(search) ? [{ sourceEventId: search }, { sourceUserId: search }, { beneficiaryId: search }] : []),
        ...(matchedUsers.length ? [{ sourceUserId: { in: matchedUsers.map((user) => user.id) } }, { beneficiaryId: { in: matchedUsers.map((user) => user.id) } }] : []),
      ] } : {}),
    };
    const rows = await prisma.referralReward.findMany({ where, orderBy: { createdAt: "desc" },
      select: { id: true, beneficiaryId: true, sourceUserId: true, sourceEventId: true, depth: true, amountMinor: true, currency: true, idempotencyKey: true, createdAt: true } });
    const keys = rows.map((row) => row.idempotencyKey);
    const credits = keys.length ? await prisma.ledgerEntry.findMany({ where: { idempotencyKey: { in: keys }, direction: "CREDIT" }, select: { idempotencyKey: true, createdAt: true } }) : [];
    const creditMap = new Map(credits.map((row) => [row.idempotencyKey, row.createdAt]));
    const allItems = rows.map((row) => ({ ...row,
      status: creditMap.has(row.idempotencyKey) ? "CREDITED" as const : "PENDING" as const,
      creditedAt: creditMap.get(row.idempotencyKey) ?? null,
    }));
    const matching = status === "ALL" ? allItems : allItems.filter((row) => row.status === status);
    const total = matching.length;
    const pageRows = matching.slice((page - 1) * pageSize, page * pageSize);
    const peopleIds = [...new Set(pageRows.flatMap((row) => [row.beneficiaryId, row.sourceUserId]))];
    const sourceIds = [...new Set(pageRows.map((row) => row.sourceEventId).filter((id) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)))];
    const [people, sourceClaims] = await Promise.all([
      peopleIds.length ? prisma.user.findMany({ where: { id: { in: peopleIds } }, select: { id: true, phone: true } }) : [],
      sourceIds.length ? prisma.taskClaim.findMany({ where: { id: { in: sourceIds } }, select: { id: true, task: { select: { title: true } } } }) : [],
    ]);
    const peopleMap = new Map(people.map((row) => [row.id, row.phone]));
    const taskMap = new Map(sourceClaims.map((row) => [row.id, row.task.title]));
    const items = pageRows.map((row) => ({ id: row.id, beneficiaryId: row.beneficiaryId, beneficiaryPhone: peopleMap.get(row.beneficiaryId) ?? "—",
      sourceUserId: row.sourceUserId, sourcePhone: peopleMap.get(row.sourceUserId) ?? "—", sourceEventId: row.sourceEventId, sourceTaskTitle: taskMap.get(row.sourceEventId) ?? null,
      depth: row.depth, amountMinor: row.amountMinor.toString(), currency: row.currency.trim(), status: row.status,
      creditedAt: row.creditedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() }));
    const totals = new Map<string, { creditedCount: number; pendingCount: number; creditedMinor: bigint; pendingMinor: bigint }>();
    for (const row of allItems) {
      const value = totals.get(row.currency) ?? { creditedCount: 0, pendingCount: 0, creditedMinor: 0n, pendingMinor: 0n };
      if (row.status === "CREDITED") { value.creditedCount += 1; value.creditedMinor += row.amountMinor; }
      else { value.pendingCount += 1; value.pendingMinor += row.amountMinor; }
      totals.set(row.currency, value);
    }
    return { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), items,
      statistics: [...totals.entries()].map(([currency, value]) => ({ currency, ...value, creditedMinor: value.creditedMinor.toString(), pendingMinor: value.pendingMinor.toString(), totalCount: value.creditedCount + value.pendingCount, totalMinor: (value.creditedMinor + value.pendingMinor).toString() })) };
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
