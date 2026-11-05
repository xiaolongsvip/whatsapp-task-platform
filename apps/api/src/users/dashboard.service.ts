import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { prisma } from "@wtp/database";

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedParts(date: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function startOfDay(timezone: string): Date {
  const now = new Date();
  try {
    const local = zonedParts(now, timezone);
    const localMidnightUtc = Date.UTC(local.year, local.month - 1, local.day);
    let candidate = localMidnightUtc;
    for (let i = 0; i < 2; i += 1) {
      const offsetParts = zonedParts(new Date(candidate), timezone);
      const representedAsUtc = Date.UTC(
        offsetParts.year, offsetParts.month - 1, offsetParts.day,
        offsetParts.hour, offsetParts.minute, offsetParts.second,
      );
      const offset = representedAsUtc - candidate;
      candidate = localMidnightUtc - offset;
    }
    return new Date(candidate);
  } catch {
    const utc = new Date(now);
    utc.setUTCHours(0, 0, 0, 0);
    return utc;
  }
}

@Injectable()
export class DashboardService {
  async getSummary(userId: string, timezone = "UTC") {
    const today = startOfDay(timezone);
    const now = new Date();

    const [wallets, settledToday, pendingReview, claimedToday, tasks] = await Promise.all([
      prisma.wallet.findMany({
        where: { userId },
        include: {
          entries: { select: { direction: true, amountMinor: true } },
          withdrawals: {
            where: { status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] } },
            select: { amountMinor: true },
          },
        },
      }),
      prisma.taskReview.count({
        where: {
          decision: "APPROVE",
          reviewedAt: { gte: today },
          submission: { claim: { userId } },
        },
      }),
      prisma.taskSubmission.count({
        where: {
          status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
          claim: { userId },
        },
      }),
      prisma.taskClaim.count({ where: { userId, claimedAt: { gte: today } } }),
      prisma.task.findMany({
        where: {
          status: "PUBLISHED",
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          rewardMinor: true,
          currency: true,
          capacity: true,
          claimedCount: true,
        },
      }),
    ]);

    const balances = wallets.map((wallet) => {
      const credited = wallet.entries
        .filter((entry) => entry.direction === "CREDIT")
        .reduce((sum, entry) => sum + entry.amountMinor, 0n);
      const debited = wallet.entries
        .filter((entry) => entry.direction === "DEBIT")
        .reduce((sum, entry) => sum + entry.amountMinor, 0n);
      const reserved = wallet.withdrawals.reduce((sum, item) => sum + item.amountMinor, 0n);
      const withdrawable = credited - debited - reserved;
      return {
        currency: wallet.currency.trim(),
        amountMinor: (withdrawable > 0n ? withdrawable : 0n).toString(),
      };
    });

    // Stable dashboard contract. The admin-managed persistent setting will
    // replace this provisional display default when the admin settings module is implemented.
    const dailyTaskLimit = 20;
    // Reserved dashboard contract. The protected admin announcement module
    // will populate this from shared persistent storage in a later phase.
    const announcements: string[] = [];

    return {
      announcements,
      dailyTaskLimit,
      // Stable shared-client contract. These values will later be populated
      // from protected admin-managed settings without changing the client API.
      supportUrl: null as string | null,
      supportedLocales: ["zh-CN", "en"],
      stats: {
        settledToday,
        pendingReview,
        claimedToday,
      },
      balances,
      tasks: tasks.map((task) => ({
        ...task,
        rewardMinor: task.rewardMinor.toString(),
      })),
      generatedAt: now.toISOString(),
    };
  }
  async getPromotionSummary(userId: string, timezone = "UTC") {
    const now = new Date();
    const today = startOfDay(timezone);
    const local = zonedParts(now, timezone);
    const monthStart = new Date(Date.UTC(local.year, local.month - 1, 1));
    const [user, directInvites, activeInvites, teamCount, rewards, todayRewards, monthRewards, wallets] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } }),
      prisma.referralEdge.count({ where: { inviterUserId: userId } }),
      prisma.referralEdge.count({ where: { inviterUserId: userId, invitee: { status: "ACTIVE" } } }),
      prisma.referralAncestor.count({ where: { ancestorUserId: userId } }),
      prisma.referralReward.findMany({ where: { beneficiaryId: userId }, select: { amountMinor: true, currency: true } }),
      prisma.referralReward.findMany({ where: { beneficiaryId: userId, createdAt: { gte: today } }, select: { amountMinor: true, currency: true } }),
      prisma.referralReward.findMany({ where: { beneficiaryId: userId, createdAt: { gte: monthStart } }, select: { amountMinor: true, currency: true } }),
      prisma.wallet.findMany({ where: { userId }, include: { entries: { select: { direction: true, amountMinor: true } }, withdrawals: { where: { status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] } }, select: { amountMinor: true } } } }),
    ]);
    const sum = (rows: Array<{ amountMinor: bigint; currency: string }>) => {
      const totals: Record<string, string> = {};
      for (const row of rows) totals[row.currency.trim()] = ((BigInt(totals[row.currency.trim()] ?? "0") + row.amountMinor)).toString();
      return totals;
    };
    const available = wallets.map((wallet) => {
      const credits = wallet.entries.filter((entry) => entry.direction === "CREDIT").reduce((v, entry) => v + entry.amountMinor, 0n);
      const debits = wallet.entries.filter((entry) => entry.direction === "DEBIT").reduce((v, entry) => v + entry.amountMinor, 0n);
      const reserved = wallet.withdrawals.reduce((v, item) => v + item.amountMinor, 0n);
      return { currency: wallet.currency.trim(), amountMinor: (credits - debits - reserved > 0n ? credits - debits - reserved : 0n).toString() };
    });
    let code = user?.referralCode ?? "";
    // Upgrade legacy long codes when the member opens the promotion page.
    // Referral edges reference user IDs, so the existing team relationships remain intact.
    if (code && !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/.test(code)) {
      const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const bytes = randomBytes(5);
        const candidate = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
        const collision = await prisma.user.findUnique({ where: { referralCode: candidate }, select: { id: true } });
        if (collision) continue;
        try {
          const updated = await prisma.user.update({
            where: { id: userId },
            data: { referralCode: candidate },
            select: { referralCode: true },
          });
          code = updated.referralCode;
          break;
        } catch (error) {
          if (attempt === 19) throw error;
        }
      }
      if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/.test(code)) {
        throw new Error("Could not assign a unique five-character referral code.");
      }
    }
    return {
      referralCode: code,
      inviteUrl: code && process.env.WEB_ORIGIN?.trim() ? `${process.env.WEB_ORIGIN.trim().replace(/\/+$/, "")}/r/${encodeURIComponent(code)}` : "",
      inviteCount: directInvites,
      activeCount: activeInvites,
      teamCount,
      todayCommissions: sum(todayRewards),
      totalCommissions: sum(rewards),
      monthCommissions: sum(monthRewards),
      availableBalances: available,
    };
  }

  async getWalletOverview(userId: string) {
    const wallets = await prisma.wallet.findMany({
      where: { userId },
      select: { id: true, currency: true },
    });
    const walletIds = wallets.map((wallet) => wallet.id);
    if (!walletIds.length) return { items: [], totals: [], frozenBalances: [] };
    const [ledger, withdrawals] = await Promise.all([
      prisma.ledgerEntry.groupBy({
        by: ["walletId", "direction"],
        where: { walletId: { in: walletIds } },
        _sum: { amountMinor: true },
      }),
      prisma.withdrawalRequest.groupBy({
        by: ["walletId", "status"],
        where: { walletId: { in: walletIds } },
        _sum: { amountMinor: true },
      }),
    ]);
    const totals = wallets.map((wallet) => {
      const entries = ledger.filter((row) => row.walletId === wallet.id);
      const requests = withdrawals.filter((row) => row.walletId === wallet.id);
      const sumDirection = (direction: "CREDIT" | "DEBIT") =>
        entries.find((row) => row.direction === direction)?._sum.amountMinor ?? 0n;
      const sumStatuses = (statuses: string[]) => requests
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + (row._sum.amountMinor ?? 0n), 0n);
      const income = sumDirection("CREDIT");
      const expense = sumDirection("DEBIT");
      const pending = sumStatuses(["REQUESTED", "UNDER_REVIEW"]);
      const processing = sumStatuses(["APPROVED", "PROCESSING"]);
      const reserved = pending + processing;
      const available = income - expense - reserved;
      return {
        currency: wallet.currency.trim(),
        incomeMinor: income.toString(),
        expenseMinor: expense.toString(),
        availableMinor: (available > 0n ? available : 0n).toString(),
        pendingWithdrawalMinor: pending.toString(),
        processingWithdrawalMinor: processing.toString(),
        frozenMinor: "0",
      };
    });
    return { totals, frozenBalances: [] };
  }

  async getWalletTransactions(userId: string, limit = 100) {
    const take = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 100, 1), 100);
    const wallets = await prisma.wallet.findMany({
      where: { userId },
      select: {
        id: true,
        currency: true,
        entries: {
          orderBy: { createdAt: "desc" },
          take,
          select: { id: true, sourceType: true, sourceId: true, direction: true, amountMinor: true, currency: true, createdAt: true },
        },
        withdrawals: {
          orderBy: { createdAt: "desc" },
          take,
          select: { id: true, amountMinor: true, currency: true, status: true, createdAt: true, updatedAt: true },
        },
      },
    });
    const items = wallets.flatMap((wallet) => [
      ...wallet.entries.map((entry) => ({
        id: entry.id,
        type: entry.direction === "CREDIT" ? "INCOME" : "EXPENSE",
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        direction: entry.direction,
        amountMinor: entry.amountMinor.toString(),
        currency: entry.currency.trim(),
        status: "POSTED",
        createdAt: entry.createdAt.toISOString(),
      })),
      ...wallet.withdrawals.map((withdrawal) => ({
        id: withdrawal.id,
        type: "WITHDRAWAL",
        sourceType: "WITHDRAWAL",
        sourceId: withdrawal.id,
        direction: "DEBIT",
        amountMinor: withdrawal.amountMinor.toString(),
        currency: withdrawal.currency.trim(),
        status: withdrawal.status,
        createdAt: withdrawal.createdAt.toISOString(),
      })),
    ]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, take);
    const totals: Record<string, { incomeMinor: string; expenseMinor: string }> = {};
    for (const wallet of wallets) {
      const currency = wallet.currency.trim();
      const income = wallet.entries.filter((entry) => entry.direction === "CREDIT").reduce((sum, entry) => sum + entry.amountMinor, 0n);
      const expense = wallet.entries.filter((entry) => entry.direction === "DEBIT").reduce((sum, entry) => sum + entry.amountMinor, 0n);
      totals[currency] = { incomeMinor: income.toString(), expenseMinor: expense.toString() };
    }
    return { items, totals, hasMore: wallets.some((wallet) => wallet.entries.length === take || wallet.withdrawals.length === take) };
  }

  async getCommissionRecords(userId: string) {
    const rows = await prisma.referralReward.findMany({
      where: { beneficiaryId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, sourceUserId: true, depth: true, amountMinor: true, currency: true, createdAt: true, idempotencyKey: true },
    });
    // The reward table has no settlement status. Confirm credit from the actual ledger,
    // rather than treating every created reward as paid.
    const keys = rows.map((row) => row.idempotencyKey);
    const credits = keys.length ? await prisma.ledgerEntry.findMany({
      where: { idempotencyKey: { in: keys }, direction: "CREDIT", wallet: { userId } },
      select: { idempotencyKey: true },
    }) : [];
    const credited = new Set(credits.map((row) => row.idempotencyKey));
    const totals = (items: typeof rows) => {
      const result: Record<string, string> = {};
      for (const row of items) {
        const currency = row.currency.trim();
        result[currency] = (BigInt(result[currency] ?? "0") + row.amountMinor).toString();
      }
      return result;
    };
    const pending = rows.filter((row) => !credited.has(row.idempotencyKey));
    return {
      items: rows.map((row) => ({
        id: row.id,
        sourceUserId: row.sourceUserId,
        depth: row.depth,
        amountMinor: row.amountMinor.toString(),
        currency: row.currency.trim(),
        status: credited.has(row.idempotencyKey) ? "CREDITED" : "PENDING",
        createdAt: row.createdAt.toISOString(),
      })),
      pendingCommissions: totals(pending),
      // Totals above cover only the 100 returned records; never label them as lifetime totals.
      hasMore: rows.length === 100,
    };
  }

  async getTeamMembers(userId: string) {
    const rows = await prisma.referralAncestor.findMany({
      where: { ancestorUserId: userId, depth: { in: [1, 2, 3] } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { descendantUserId: true, depth: true, createdAt: true },
    });
    const counts = await Promise.all([1, 2, 3].map((depth) =>
      prisma.referralAncestor.count({ where: { ancestorUserId: userId, depth } })
    ));
    return {
      counts: { level1: counts[0], level2: counts[1], level3: counts[2] },
      items: rows.map((row) => ({
        userId: row.descendantUserId,
        depth: row.depth,
        invitedAt: row.createdAt.toISOString(),
      })),
      hasMore: rows.length === 300,
    };
  }

  async getWithdrawalHistory(userId: string, limit = 50) {
    const rows = await prisma.withdrawalRequest.findMany({
      where: { wallet: { userId } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        amountMinor: true,
        currency: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        amountMinor: row.amountMinor.toString(),
        currency: row.currency.trim(),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

}
