import { Injectable } from "@nestjs/common";
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

function startOfDay(timezone: string): Date {
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

    return {
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
}
