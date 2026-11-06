import { Injectable } from "@nestjs/common";
import { prisma } from "@wtp/database";
type DailyCount = { day: string; count: number | bigint };
type DailyReviewCount = { day: string; decision: "APPROVE" | "REJECT"; count: number | bigint };
@Injectable()
export class AdminDashboardService {
  async summary() {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 86400000);
    const [todayClaims, pendingReviews, todayApprovals, activeUsers, pendingWithdrawals, todayRewards, claimStatuses, dailySubmissions, dailyReviews] = await Promise.all([
      prisma.taskClaim.count({ where: { claimedAt: { gte: startOfToday } } }),
      prisma.taskSubmission.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
      prisma.taskReview.count({ where: { decision: "APPROVE", reviewedAt: { gte: startOfToday } } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.withdrawalRequest.count({ where: { status: { in: ["REQUESTED", "UNDER_REVIEW"] } } }),
      prisma.ledgerEntry.groupBy({ by: ["currency"], where: { sourceType: "TASK_REWARD", direction: "CREDIT", createdAt: { gte: startOfToday } }, _sum: { amountMinor: true } }),
      prisma.taskClaim.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.$queryRaw<DailyCount[]>\`SELECT to_char(date_trunc('day', submitted_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count FROM task_submissions WHERE submitted_at >= ${sevenDaysAgo} GROUP BY 1 ORDER BY 1\`,
      prisma.$queryRaw<DailyReviewCount[]>\`SELECT to_char(date_trunc('day', reviewed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, decision::text AS decision, COUNT(*)::int AS count FROM task_reviews WHERE reviewed_at >= ${sevenDaysAgo} GROUP BY 1, 2 ORDER BY 1\`,
    ]);
    const count = (status: string) => Number(claimStatuses.find((item) => item.status === status)?._count._all ?? 0);
    const taskTrend = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(sevenDaysAgo.getTime() + index * 86400000).toISOString().slice(0, 10);
      const submitted = dailySubmissions.find((item) => item.day === day);
      const approved = dailyReviews.find((item) => item.day === day && item.decision === "APPROVE");
      const rejected = dailyReviews.find((item) => item.day === day && item.decision === "REJECT");
      return { day, submitted: Number(submitted?.count ?? 0), approved: Number(approved?.count ?? 0), rejected: Number(rejected?.count ?? 0) };
    });
    return {
      cards: { todayClaims, pendingReviews, todayApprovals, activeUsers, pendingWithdrawals, todayRewards: todayRewards.map((item) => ({ currency: item.currency.trim(), amountMinor: (item._sum.amountMinor ?? 0n).toString() })) },
      claimDistribution: { waiting: count("CLAIMED"), inProgress: count("IN_PROGRESS"), pendingReview: count("SUBMITTED") + count("UNDER_REVIEW"), completed: count("APPROVED"), rejected: count("REJECTED") },
      taskTrend,
    };
  }
}
