import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@wtp/database";

type Range = { from: Date; to: Date };
type TrendRow = { period: string; status: string; count: number | bigint };
type ReviewTrendRow = { period: string; decision: string; count: number | bigint };
const DAY = 86400000;
const validDate = (value: string) => /^\\d{4}-\\d{2}-\\d{2}$/.test(value) && !Number.isNaN(new Date(value + "T00:00:00.000Z").getTime());
function rangeOf(query: Record<string, string | undefined>): Range {
  const today = new Date();
  const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const defaultFrom = new Date(defaultTo.getTime() - 6 * DAY);
  if (query.from && !validDate(query.from)) throw new BadRequestException("开始日期格式不正确");
  if (query.to && !validDate(query.to)) throw new BadRequestException("结束日期格式不正确");
  const from = query.from ? new Date(query.from + "T00:00:00.000Z") : defaultFrom;
  const to = query.to ? new Date(query.to + "T23:59:59.999Z") : new Date(defaultTo.getTime() + DAY - 1);
  if (from > to) throw new BadRequestException("开始日期不能晚于结束日期");
  const days = Math.ceil((to.getTime() - from.getTime() + 1) / DAY);
  if (days > 366) throw new BadRequestException("报表日期范围不能超过 366 天");
  return { from, to };
}
function previousRange(range: Range): Range {
  const duration = range.to.getTime() - range.from.getTime() + 1;
  return { from: new Date(range.from.getTime() - duration), to: new Date(range.from.getTime() - 1) };
}
function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number(((current - previous) / previous * 100).toFixed(1));
}
function moneyRows(rows: Array<{ currency: string; _sum: { amountMinor: bigint | null } }>) {
  return rows.map(row => ({ currency: row.currency.trim(), amountMinor: (row._sum.amountMinor ?? 0n).toString() }));
}
const submissionStatus = (value?: string) => {
  if (!value || value === "ALL") return undefined;
  if (["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"].includes(value)) return value as "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  throw new BadRequestException("不支持的报表状态筛选");
};

@Injectable()
export class ReportsService {
  async summary(query: Record<string, string | undefined>) {
    const range = rangeOf(query);
    const previous = previousRange(range);
    const status = submissionStatus(query.status);
    const period = ["day", "week", "month"].includes(query.period || "day") ? query.period || "day" : "day";
    const submissionWhere = (r: Range) => ({ submittedAt: { gte: r.from, lte: r.to }, ...(status ? { status } : {}) });
    const reviewWhere = (r: Range, decision?: "APPROVE" | "REJECT") => ({ reviewedAt: { gte: r.from, lte: r.to }, ...(decision ? { decision } : {}) });
    const claimWhere = (r: Range) => ({ claimedAt: { gte: r.from, lte: r.to } });
    const paidWhere = (r: Range) => ({ status: "PAID" as const, updatedAt: { gte: r.from, lte: r.to } });
    const [taskTotal, previousTaskTotal, approved, previousApproved, rejected, previousRejected, activeUsers, previousActiveUsers, pendingReviews,
      withdrawalApplications, previousWithdrawalApplications, actualPayout, previousActualPayout, distribution, trendRows, reviewTrendRows] = await Promise.all([
      prisma.taskClaim.count({ where: claimWhere(range) }),
      prisma.taskClaim.count({ where: claimWhere(previous) }),
      prisma.taskReview.count({ where: reviewWhere(range, "APPROVE") }),
      prisma.taskReview.count({ where: reviewWhere(previous, "APPROVE") }),
      prisma.taskReview.count({ where: reviewWhere(range, "REJECT") }),
      prisma.taskReview.count({ where: reviewWhere(previous, "REJECT") }),
      prisma.taskClaim.groupBy({ by: ["userId"], where: claimWhere(range) }),
      prisma.taskClaim.groupBy({ by: ["userId"], where: claimWhere(previous) }),
      prisma.taskSubmission.count({ where: { ...submissionWhere(range), status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
      prisma.withdrawalRequest.groupBy({ by: ["currency"], where: { createdAt: { gte: range.from, lte: range.to } }, _sum: { amountMinor: true } }),
      prisma.withdrawalRequest.groupBy({ by: ["currency"], where: { createdAt: { gte: previous.from, lte: previous.to } }, _sum: { amountMinor: true } }),
      prisma.withdrawalRequest.groupBy({ by: ["currency"], where: paidWhere(range), _sum: { amountMinor: true } }),
      prisma.withdrawalRequest.groupBy({ by: ["currency"], where: paidWhere(previous), _sum: { amountMinor: true } }),
      prisma.taskSubmission.groupBy({ by: ["status"], where: { submittedAt: { gte: range.from, lte: range.to } }, _count: { _all: true } }),
      prisma.$queryRaw<TrendRow[]>\`SELECT to_char(date_trunc(${period}, submitted_at), 'YYYY-MM-DD') AS period, status::text AS status, COUNT(*)::int AS count FROM task_submissions WHERE submitted_at >= ${range.from} AND submitted_at <= ${range.to} ${status ? prisma.$queryRaw\`AND status::text = ${status}\` : prisma.$queryRaw\`\`} GROUP BY 1, 2 ORDER BY 1\`,
      prisma.$queryRaw<ReviewTrendRow[]>\`SELECT to_char(date_trunc(${period}, reviewed_at), 'YYYY-MM-DD') AS period, decision::text AS decision, COUNT(*)::int AS count FROM task_reviews WHERE reviewed_at >= ${range.from} AND reviewed_at <= ${range.to} GROUP BY 1, 2 ORDER BY 1\`,
    ]);
    const periods = new Map<string, { submitted: number; approved: number; rejected: number }>();
    for (const row of trendRows) {
      const item = periods.get(row.period) ?? { submitted: 0, approved: 0, rejected: 0 };
      item.submitted += Number(row.count);
      periods.set(row.period, item);
    }
    for (const row of reviewTrendRows) {
      const item = periods.get(row.period) ?? { submitted: 0, approved: 0, rejected: 0 };
      if (row.decision === "APPROVE") item.approved += Number(row.count);
      if (row.decision === "REJECT") item.rejected += Number(row.count);
      periods.set(row.period, item);
    }
    const trend = [...periods.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value }));
    const currencySet = new Set([...withdrawalApplications, ...actualPayout].map(x => x.currency.trim()));
    const finance = [...currencySet].sort().map(currency => {
      const requested = withdrawalApplications.find(x => x.currency.trim() === currency)?._sum.amountMinor ?? 0n;
      const paid = actualPayout.find(x => x.currency.trim() === currency)?._sum.amountMinor ?? 0n;
      return { currency, requestedMinor: requested.toString(), paidMinor: paid.toString(), estimatedDifferenceMinor: (requested - paid).toString() };
    });
    const totalSubmissions = distribution.reduce((n, x) => n + x._count._all, 0);
    const dist = (key: string) => distribution.find(x => x.status === key)?._count._all ?? 0;
    const countryBreakdown = [{
      country: "未标记",
      taskCount: taskTotal,
      approvedCount: approved,
      rejectedCount: rejected,
      actualPaid: moneyRows(actualPayout),
      approvalRate: taskTotal === 0 ? 0 : Number((approved / taskTotal * 100).toFixed(1)),
      note: "用户资料当前没有国家字段；未按手机号前缀推断国家。",
    }];
    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      filters: { status: status ?? "ALL", period },
      cards: {
        taskTotal: { value: taskTotal, change: change(taskTotal, previousTaskTotal) },
        approved: { value: approved, change: change(approved, previousApproved) },
        rejected: { value: rejected, change: change(rejected, previousRejected) },
        activeUsers: { value: activeUsers.length, change: change(activeUsers.length, previousActiveUsers.length) },
        withdrawalApplications: { amounts: moneyRows(withdrawalApplications), change: null },
        actualPayout: { amounts: moneyRows(actualPayout), change: null },
      },
      reviewDistribution: {
        total: totalSubmissions,
        approved: dist("APPROVED"),
        rejected: dist("REJECTED"),
        pending: dist("SUBMITTED") + dist("UNDER_REVIEW"),
      },
      finance,
      trend,
      countryBreakdown,
      limitations: ["用户资料模型没有国家字段，国家统计暂归类为“未标记”；不会根据手机号猜测国家。", "提现申请金额按申请创建时间统计；实际支出按提现状态变为 PAID 的更新时间统计。", "跨币种金额分别展示，不进行汇率换算。"],
    };
  }
}
