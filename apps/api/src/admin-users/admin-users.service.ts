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
        select: { id: true, phone: true, referralCode: true, status: true, createdAt: true, profile: { select: { displayName: true, reputationScore: true, dailyTaskLimit: true } }, wallets: { select: { id: true, currency: true } } },
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
          dailyTaskLimit: user.profile?.dailyTaskLimit ?? 20,
          approvalRate: reviewed ? Math.round((approved / reviewed) * 100) : null,
          riskLabel: reviewed >= 5 && rejected / reviewed >= 0.5 ? "需关注" : reviewed >= 5 && rejected / reviewed >= 0.25 ? "中风险" : "低风险",
          reputationScore: user.profile?.reputationScore ?? 60,
          balances,
        };
      }),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async detail(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        sessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        devices: { orderBy: { lastSeenAt: "desc" }, include: { events: { orderBy: { createdAt: "desc" }, take: 30 } } },
        invitedBy: { select: { inviter: { select: { id: true, phone: true } } } },
        payoutAccounts: { orderBy: { createdAt: "desc" }, select: { id: true, countryCode: true, currency: true, providerCode: true, methodCode: true, accountHolder: true, maskedAccount: true, status: true, isDefault: true, createdAt: true } },
        wallets: { include: { entries: { select: { direction: true, amountMinor: true, currency: true } }, withdrawals: { orderBy: { createdAt: "desc" }, take: 100, include: { payoutAccount: { select: { maskedAccount: true, providerCode: true, methodCode: true } } } } } },
        claims: { orderBy: { claimedAt: "desc" }, take: 100, include: { task: { select: { title: true, category: true, rewardMinor: true, currency: true } }, submissions: { orderBy: { submittedAt: "desc" }, take: 5, include: { reviews: { orderBy: { reviewedAt: "desc" }, take: 5 } } } } },
      },
    });
    if (!user) throw new NotFoundException("用户不存在。");
    const audit = await prisma.auditEvent.findMany({ where: { targetType: "USER", targetId: userId }, orderBy: { createdAt: "desc" }, take: 100 });
    const linkedDeviceRows = user.devices.length ? await prisma.userDevice.findMany({
      where: { deviceIdentifier: { in: [...new Set(user.devices.map((device) => device.deviceIdentifier))] } },
      select: { deviceIdentifier: true, user: { select: { id: true, phone: true, status: true } } },
      orderBy: { lastSeenAt: "desc" },
    }) : [];
    const linkedAccounts = new Map<string, { id: string; phone: string; status: string }[]>();
    for (const row of linkedDeviceRows) {
      const current = linkedAccounts.get(row.deviceIdentifier) ?? [];
      if (!current.some((account) => account.id === row.user.id)) current.push(row.user);
      linkedAccounts.set(row.deviceIdentifier, current);
    }
    const today = utcStart();
    const [todayClaimed, claimGroups] = await Promise.all([
      prisma.taskClaim.count({ where: { userId, claimedAt: { gte: today } } }),
      prisma.taskClaim.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    ]);
    const claimCounts = Object.fromEntries(claimGroups.map((group) => [group.status, group._count._all])) as Record<string, number>;
    const allClaimCount = claimGroups.reduce((sum, group) => sum + group._count._all, 0);
    const approved = claimCounts.APPROVED ?? 0;
    const rejected = claimCounts.REJECTED ?? 0;
    const reviewed = approved + rejected;
    const withdrawals = user.wallets.flatMap((w) => w.withdrawals).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const balanceMap = new Map<string, bigint>();
    for (const wallet of user.wallets) for (const entry of wallet.entries) {
      const signed = entry.amountMinor * (entry.direction === "CREDIT" ? 1n : -1n);
      balanceMap.set(entry.currency.trim(), (balanceMap.get(entry.currency.trim()) ?? 0n) + signed);
    }
    const balances = [...balanceMap.entries()].map(([currency, amountMinor]) => ({ currency, amountMinor: amountMinor.toString() }));
    const effectiveDailyLimit = user.profile?.dailyTaskLimit ?? 20;
    const effectiveInterval = user.profile?.minClaimIntervalSeconds ?? 60;
    return {
      basic: { id: user.id, phone: user.phone, referralCode: user.referralCode, inviter: user.invitedBy?.inviter ?? null, status: user.status, createdAt: user.createdAt, displayName: user.profile?.displayName ?? null, email: null, lastLoginAt: user.sessions[0]?.createdAt ?? null, reputationScore: user.profile?.reputationScore ?? 60, balances, todayClaimed, remainingToday: Math.max(0, effectiveDailyLimit - todayClaimed), effectiveDailyLimit, effectiveMinClaimIntervalSeconds: effectiveInterval, dailyTaskLimit: user.profile?.dailyTaskLimit ?? null, minClaimIntervalSeconds: user.profile?.minClaimIntervalSeconds ?? null, taskLimitSource: user.profile?.dailyTaskLimit == null ? "继承系统默认" : "用户自定义", intervalSource: user.profile?.minClaimIntervalSeconds == null ? "继承系统默认" : "用户自定义" },
      devices: { supported: true, items: user.devices.map((device) => ({
        id: device.id, deviceIdentifier: device.deviceIdentifier, manufacturer: device.manufacturer, model: device.model,
        androidVersion: device.androidVersion, sdkInt: device.sdkInt, appVersion: device.appVersion,
        firstSeenAt: device.firstSeenAt, lastSeenAt: device.lastSeenAt, status: device.status,
        isFlagged: device.isFlagged, flagReason: device.flagReason,
        linkedAccounts: linkedAccounts.get(device.deviceIdentifier) ?? [],
        events: device.events.map((event) => ({
          id: event.id, eventType: event.eventType, manufacturer: event.manufacturer, model: event.model,
          androidVersion: event.androidVersion, sdkInt: event.sdkInt, appVersion: event.appVersion,
          actorId: event.actorId, reason: event.reason, createdAt: event.createdAt,
        })),
      })) },
      payoutAccounts: user.payoutAccounts,
      tasks: { total: allClaimCount, approved, rejected, approvalRate: reviewed ? approved / reviewed : null, items: user.claims.map((x) => ({ id: x.id, taskTitle: x.task.title, category: x.task.category, status: x.status, claimedAt: x.claimedAt, rewardMinor: x.task.rewardMinor.toString(), currency: x.task.currency, submissions: x.submissions.map((s) => ({ id: s.id, status: s.status, submittedAt: s.submittedAt, reviews: s.reviews })) })) },
      withdrawals: { total: withdrawals.length, pending: withdrawals.filter((x) => ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"].includes(x.status)).length, paid: withdrawals.filter((x) => x.status === "PAID").length, items: withdrawals.map((x) => ({ id: x.id, amountMinor: x.amountMinor.toString(), currency: x.currency, status: x.status, createdAt: x.createdAt, payoutReference: x.payoutReference, payoutAccount: x.payoutAccount })) },
      risk: { calculated: reviewed >= 5, label: reviewed >= 5 && rejected / reviewed >= 0.5 ? "需关注" : reviewed >= 5 && rejected / reviewed >= 0.25 ? "中风险" : "低风险", reviewedTasks: reviewed, rejectedTasks: rejected, events: audit.filter((x) => /RISK|FRAUD|SUSPEND/i.test(x.action)).map((x) => ({ id: x.id, type: x.action, metadata: x.metadata, createdAt: x.createdAt })) },
      reputation: { score: user.profile?.reputationScore ?? 60, events: audit.filter((x) => x.action === "USER_REPUTATION_ADJUSTED").map((x) => ({ id: x.id, metadata: x.metadata, createdAt: x.createdAt, actorId: x.actorId })) },
    };
  }


  async deviceHistory(userId: string, deviceId: string, pageInput?: string, pageSizeInput?: string) {
    const page = Math.max(1, Math.min(10000, Number.parseInt(pageInput ?? "1", 10) || 1));
    const pageSize = Math.max(10, Math.min(100, Number.parseInt(pageSizeInput ?? "30", 10) || 30));
    const device = await prisma.userDevice.findFirst({ where: { id: deviceId, userId }, select: { id: true } });
    if (!device) throw new NotFoundException("设备记录不存在。");
    const [total, items] = await Promise.all([
      prisma.userDeviceEvent.count({ where: { deviceId } }),
      prisma.userDeviceEvent.findMany({ where: { deviceId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async updateDevice(userId: string, deviceId: string, adminId: string, body: { status?: "ACTIVE" | "BLOCKED"; isFlagged?: boolean; reason: string }) {
    if (body.status !== undefined && body.status !== "ACTIVE" && body.status !== "BLOCKED") throw new BadRequestException("设备状态无效。");
    if (body.isFlagged !== undefined && typeof body.isFlagged !== "boolean") throw new BadRequestException("设备风险标记无效。");
    const reason = body.reason?.trim();
    if (!reason || reason.length > 500) throw new BadRequestException("请填写 1 到 500 个字符的操作原因。");
    const device = await prisma.userDevice.findFirst({ where: { id: deviceId, userId } });
    if (!device) throw new NotFoundException("设备记录不存在。");
    const nextStatus = body.status ?? device.status;
    const nextFlagged = body.isFlagged ?? device.isFlagged;
    const statusChanged = nextStatus !== device.status;
    const flagChanged = nextFlagged !== device.isFlagged;
    if (!statusChanged && !flagChanged) throw new BadRequestException("设备状态没有变化。");
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.userDevice.update({
        where: { id: deviceId },
        data: {
          status: nextStatus,
          isFlagged: nextFlagged,
          flagReason: nextFlagged ? reason : (flagChanged ? null : device.flagReason),
          statusUpdatedAt: statusChanged ? new Date() : device.statusUpdatedAt,
        },
      });
      const events = [];
      if (statusChanged) events.push({
        deviceId, eventType: nextStatus === "BLOCKED" ? "DEVICE_BLOCKED" : "DEVICE_UNBLOCKED",
        manufacturer: device.manufacturer, model: device.model, androidVersion: device.androidVersion,
        sdkInt: device.sdkInt, appVersion: device.appVersion, actorId: adminId, reason,
      });
      if (flagChanged) events.push({
        deviceId, eventType: nextFlagged ? "DEVICE_FLAGGED" : "DEVICE_UNFLAGGED",
        manufacturer: device.manufacturer, model: device.model, androidVersion: device.androidVersion,
        sdkInt: device.sdkInt, appVersion: device.appVersion, actorId: adminId, reason,
      });
      if (events.length) await tx.userDeviceEvent.createMany({ data: events });
      await tx.auditEvent.create({
        data: { actorType: "ADMIN", actorId: adminId, action: "USER_DEVICE_UPDATED", targetType: "USER", targetId: userId,
          metadata: { deviceId, previousStatus: device.status, status: nextStatus, previousFlagged: device.isFlagged, isFlagged: nextFlagged, reason } },
      });
      return result;
    });
    return { success: true, device: { id: updated.id, status: updated.status, isFlagged: updated.isFlagged, flagReason: updated.flagReason } };
  }

  async updatePolicy(userId: string, body: { dailyTaskLimit?: number | null; minClaimIntervalSeconds?: number | null }) {
    if (body.dailyTaskLimit !== undefined && body.dailyTaskLimit !== null && (!Number.isInteger(body.dailyTaskLimit) || body.dailyTaskLimit < 0 || body.dailyTaskLimit > 100000)) throw new BadRequestException("每日任务上限必须是 0 到 100000 的整数；留空表示继承系统默认。");
    if (body.minClaimIntervalSeconds !== undefined && body.minClaimIntervalSeconds !== null && (!Number.isInteger(body.minClaimIntervalSeconds) || body.minClaimIntervalSeconds < 0 || body.minClaimIntervalSeconds > 86400)) throw new BadRequestException("最小领取间隔必须是 0 到 86400 秒；留空表示继承系统默认。");
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) throw new NotFoundException("用户不存在。");
    await prisma.userProfile.upsert({ where: { userId }, create: { userId, ...body }, update: body });
    return { success: true };
  }

  async adjustReputation(userId: string, adminId: string, body: { amount: number; reason: string }) {
    if (!Number.isInteger(body.amount) || body.amount === 0 || Math.abs(body.amount) > 100) throw new BadRequestException("信誉分调整必须是 -100 到 100 之间的非零整数。");
    const reason = body.reason?.trim();
    if (!reason || reason.length > 500) throw new BadRequestException("请填写 1 到 500 个字符的调整原因。");
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) throw new NotFoundException("用户不存在。");
    const before = user.profile?.reputationScore ?? 60;
    const after = Math.max(0, Math.min(100, before + body.amount));
    await prisma.$transaction(async (tx) => {
      await tx.userProfile.upsert({ where: { userId }, create: { userId, reputationScore: after }, update: { reputationScore: after } });
      await tx.auditEvent.create({ data: { actorType: "ADMIN", actorId: adminId, action: "USER_REPUTATION_ADJUSTED", targetType: "USER", targetId: userId, metadata: { requestedAmount: body.amount, before, after, reason } } });
    });
    return { success: true, before, after };
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

  async setStatus(userId: string, statusInput: string, adminId?: string) {
    if (statusInput !== "ACTIVE" && statusInput !== "SUSPENDED") throw new BadRequestException("只允许启用或冻结用户。");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
    if (!user) throw new NotFoundException("用户不存在。");
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({ where: { id: userId }, data: { status: statusInput } });
      if (statusInput === "SUSPENDED") {
        await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await tx.auditEvent.create({ data: { actorType: "ADMIN", actorId: adminId ?? null, action: statusInput === "SUSPENDED" ? "USER_SUSPENDED" : "USER_ACTIVATED", targetType: "USER", targetId: userId, metadata: { previousStatus: user.status, newStatus: statusInput } } });
      return result;
    });
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
