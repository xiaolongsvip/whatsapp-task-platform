import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { prisma } from "@wtp/database";

const validStatuses = ["ALL", "ACTIVE", "SUSPENDED", "PENDING", "CLOSED"] as const;
type FilterStatus = typeof validStatuses[number];

function utcStart(daysAgo = 0) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
}

@Injectable()
export class AdminUsersService {
  async summary() {
    const today = utcStart();
    const sevenDaysAgo = utcStart(6);
    const [total, todayNew, last7DaysNew, suspended, activeToday] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { status: "SUSPENDED" } }),
      prisma.authSession.findMany({ where: { createdAt: { gte: today }, revokedAt: null }, distinct: ["userId"], select: { userId: true } }),
    ]);
    return { total, todayNew, last7DaysNew, activeToday: activeToday.length, suspended };
  }

  async list(queryInput?: string, statusInput?: string, pageInput?: string, pageSizeInput?: string) {
    const page = Math.max(1, Math.min(1_000_000, Number.parseInt(pageInput ?? "1", 10) || 1));
    const pageSize = Math.max(10, Math.min(100, Number.parseInt(pageSizeInput ?? "20", 10) || 20));
    const status = (statusInput ?? "ALL").toUpperCase() as FilterStatus;
    if (!validStatuses.includes(status)) throw new BadRequestException("用户状态筛选值无效。");
    const search = queryInput?.trim();
    const where = {
      ...(status !== "ALL" ? { status } : {}),
      ...(search ? { OR: [
        { phone: { contains: search, mode: "insensitive" as const } },
        { id: { contains: search, mode: "insensitive" as const } },
        { referralCode: { contains: search, mode: "insensitive" as const } },
        { profile: { is: { displayName: { contains: search, mode: "insensitive" as const } } } },
      ] } : {}),
    };
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, phone: true, referralCode: true, status: true, createdAt: true, profile: { select: { displayName: true } }, wallets: { select: { id: true, currency: true } } },
      }),
    ]);
    const userIds = users.map((u) => u.id);
    const walletIds = users.flatMap((u) => u.wallets.map((w) => w.id));
    const [claimGroups, ledgerGroups] = await Promise.all([
      userIds.length ? prisma.taskClaim.groupBy({ by: ["userId", "status"], where: { userId: { in: userIds } }, _count: { _all: true } }) : [],
      walletIds.length ? prisma.ledgerEntry.groupBy({ by: ["walletId", "currency", "direction"], where: { walletId: { in: walletIds } }, _sum: { amountMinor: true } }) : [],
    ]);
    const walletOwner = new Map(users.flatMap((u) => u.wallets.map((w) => [w.id, u.id] as const)));
    const claimMap = new Map<string, Record<string, number>>();
    for (const group of claimGroups) {
      const values = claimMap.get(group.userId) ?? {};
      values[group.status] = group._count._all;
      claimMap.set(group.userId, values);
    }
    const balanceMap = new Map<string, Record<string, bigint>>();
    for (const group of ledgerGroups) {
      const owner = walletOwner.get(group.walletId);
      if (!owner) continue;
      const values = balanceMap.get(owner) ?? {};
      const key = group.currency.trim();
      const signed = (group._sum.amountMinor ?? 0n) * (group.direction === "CREDIT" ? 1n : -1n);
      values[key] = (values[key] ?? 0n) + signed;
      balanceMap.set(owner, values);
    }
    return {
      users: users.map((user) => {
        const claims = claimMap.get(user.id) ?? {};
        const approved = claims.APPROVED ?? 0;
        const rejected = claims.REJECTED ?? 0;
        const reviewed = approved + rejected;
        const balances = Object.entries(balanceMap.get(user.id) ?? {}).map(([currency, amountMinor]) => ({ currency, amountMinor: amountMinor.toString() }));
        return {
          id: user.id, phone: user.phone, displayName: user.profile?.displayName ?? null,
          referralCode: user.referralCode, status: user.status, createdAt: user.createdAt.toISOString(),
          taskCount: Object.values(claims).reduce((sum, count) => sum + count, 0),
          approvedCount: approved, rejectedCount: rejected,
          approvalRate: reviewed ? Math.round((approved / reviewed) * 100) : null,
          riskLabel: reviewed >= 5 && rejected / reviewed >= 0.5 ? "需关注" : reviewed >= 5 && rejected / reviewed >= 0.25 ? "中风险" : "低风险",
          balances,
        };
      }),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async updateProfile(userId: string, displayNameInput: string | null) {
    const displayName = displayNameInput?.trim() || null;
    if (displayName && displayName.length > 80) throw new BadRequestException("用户昵称不能超过 80 个字符。");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException("用户不存在。");
    await prisma.userProfile.upsert({
      where: { userId }, create: { userId, displayName }, update: { displayName },
    });
    return { success: true };
  }

  async setStatus(userId: string, statusInput: string) {
    if (statusInput !== "ACTIVE" && statusInput !== "SUSPENDED") throw new BadRequestException("只允许启用或冻结用户。");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
    if (!user) throw new NotFoundException("用户不存在。");
    const updated = await prisma.user.update({ where: { id: userId }, data: { status: statusInput } });
    if (statusInput === "SUSPENDED") {
      await prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { id: updated.id, status: updated.status };
  }

  async resetPassword(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException("用户不存在。");
    const temporaryPassword = randomBytes(9).toString("base64url");
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { success: true, temporaryPassword };
  }
}
