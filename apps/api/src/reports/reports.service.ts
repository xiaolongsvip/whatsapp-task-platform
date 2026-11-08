import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@wtp/database";

type Range = { from: Date; to: Date };
type TrendRow = { period: string; status: string; count: number | bigint };
type CountryTaskRow = { country: string; taskCount: number; approvedCount: number; rejectedCount: number };
type CountryPaidRow = { country: string; currency: string; amountMinor: string };
const DAY = 86400000;

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function offsetOf(value: string | undefined) {
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < -840 || parsed > 840) throw new BadRequestException("时区偏移量无效");
  return parsed;
}
function rangeOf(query: Record<string, string | undefined>): Range {
  const now = new Date();
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const defaultFrom = new Date(defaultTo.getTime() - 6 * DAY);
  if (query.from && !validDate(query.from)) throw new BadRequestException("开始日期格式不正确");
  if (query.to && !validDate(query.to)) throw new BadRequestException("结束日期格式不正确");
  const fromOffset = offsetOf(query.fromOffset);
  const toOffset = offsetOf(query.toOffset);
  const fromDate = query.from ? new Date(query.from + "T00:00:00.000Z") : defaultFrom;
  const toDate = query.to ? new Date(query.to + "T00:00:00.000Z") : defaultTo;
  const from = new Date(fromDate.getTime() - fromOffset * 60000);
  const to = new Date(toDate.getTime() - toOffset * 60000 + DAY - 1);
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
type MoneyGroup = { currency: string; _sum: { amountMinor: bigint | null } };
function moneyRows(rows: MoneyGroup[]) {
  return rows.map(row => ({ currency: row.currency.trim(), amountMinor: (row._sum.amountMinor ?? 0n).toString() }));
}
function moneyChanges(current: MoneyGroup[], previous: MoneyGroup[]) {
  const currencies = new Set([...current, ...previous].map(row => row.currency.trim()));
  return [...currencies].sort().map(currency => {
    const now = current.find(row => row.currency.trim() === currency)?._sum.amountMinor ?? 0n;
    const before = previous.find(row => row.currency.trim() === currency)?._sum.amountMinor ?? 0n;
    return { currency, change: change(Number(now), Number(before)) };
  });
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
    const paidWhere = (r: Range) => ({ flow: "PAYOUT" as const, status: "SUCCEEDED" as const, updatedAt: { gte: r.from, lte: r.to } });
    const [
      activeUsers, previousActiveUsers, distribution, previousDistribution,
      withdrawalApplications, previousWithdrawalApplications, actualPayout, previousActualPayout,
      trendRows, countryTaskRows, countryPaidRows,
    ] = await Promise.all([
      prisma.taskClaim.groupBy({ by: ["userId"], where: { submissions: { some: submissionWhere(range) } } }),
      prisma.taskClaim.groupBy({ by: ["userId"], where: { submissions: { some: submissionWhere(previous) } } }),
      prisma.taskSubmission.groupBy({ by: ["status"], where: submissionWhere(range), _count: { _all: true } }),
      prisma.taskSubmission.groupBy({ by: ["status"], where: submissionWhere(previous), _count: { _all: true } }),
      prisma.withdrawalRequest.groupBy({ by: ["currency"], where: { createdAt: { gte: range.from, lte: range.to } }, _sum: { amountMinor: true } }),
      prisma.withdrawalRequest.groupBy({ by: ["currency"], where: { createdAt: { gte: previous.from, lte: previous.to } }, _sum: { amountMinor: true } }),
      prisma.paymentTransaction.groupBy({ by: ["currency"], where: paidWhere(range), _sum: { amountMinor: true } }),
      prisma.paymentTransaction.groupBy({ by: ["currency"], where: paidWhere(previous), _sum: { amountMinor: true } }),
      prisma.$queryRaw<TrendRow[]>`SELECT to_char(date_trunc(${period}, submitted_at + (${-offsetOf(query.fromOffset)} * interval '1 minute')), 'YYYY-MM-DD') AS period, status::text AS status, COUNT(*)::int AS count FROM task_submissions WHERE submitted_at >= ${range.from} AND submitted_at <= ${range.to} AND (${status ?? null}::text IS NULL OR status::text = ${status ?? null}) GROUP BY 1, 2 ORDER BY 1`,
      prisma.$queryRaw<CountryTaskRow[]>`SELECT COALESCE(NULLIF(BTRIM(cn.country_code), ''), 'UNSPECIFIED') AS country, COUNT(DISTINCT ts.id)::int AS "taskCount", COUNT(DISTINCT ts.id) FILTER (WHERE ts.status::text = 'APPROVED')::int AS "approvedCount", COUNT(DISTINCT ts.id) FILTER (WHERE ts.status::text = 'REJECTED')::int AS "rejectedCount" FROM task_submissions ts JOIN task_claims tc ON tc.id = ts.claim_id LEFT JOIN contact_assignments ca ON ca.claim_id = tc.id LEFT JOIN contact_numbers cn ON cn.id = ca.contact_number_id WHERE ts.submitted_at >= ${range.from} AND ts.submitted_at <= ${range.to} AND (${status ?? null}::text IS NULL OR ts.status::text = ${status ?? null}) GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<CountryPaidRow[]>`SELECT COALESCE(NULLIF(BTRIM(pa.country_code), ''), 'UNSPECIFIED') AS country, pt.currency, SUM(pt.amount_minor)::text AS "amountMinor" FROM payment_transactions pt LEFT JOIN withdrawal_requests wr ON wr.id = pt.withdrawal_request_id LEFT JOIN payout_accounts pa ON pa.id = wr.payout_account_id WHERE pt.flow::text = 'PAYOUT' AND pt.status::text = 'SUCCEEDED' AND pt.updated_at >= ${range.from} AND pt.updated_at <= ${range.to} GROUP BY 1, pt.currency ORDER BY 1, pt.currency`,
    ]);

    const periods = new Map<string, { submitted: number; approved: number; rejected: number }>();
    for (const row of trendRows) {
      const item = periods.get(row.period) ?? { submitted: 0, approved: 0, rejected: 0 };
      const count = Number(row.count);
      item.submitted += count;
      if (row.status === "APPROVED") item.approved += count;
      if (row.status === "REJECTED") item.rejected += count;
      periods.set(row.period, item);
    }
    const trend = [...periods.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value }));
    const currencySet = new Set([...withdrawalApplications, ...actualPayout].map(x => x.currency.trim()));
    const finance = [...currencySet].sort().map(currency => {
      const requested = withdrawalApplications.find(x => x.currency.trim() === currency)?._sum.amountMinor ?? 0n;
      const paid = actualPayout.find(x => x.currency.trim() === currency)?._sum.amountMinor ?? 0n;
      const previousRequested = previousWithdrawalApplications.find(x => x.currency.trim() === currency)?._sum.amountMinor ?? 0n;
      const previousPaid = previousActualPayout.find(x => x.currency.trim() === currency)?._sum.amountMinor ?? 0n;
      return { currency, requestedMinor: requested.toString(), paidMinor: paid.toString(), estimatedDifferenceMinor: (requested - paid).toString(), requestedChange: change(Number(requested), Number(previousRequested)), paidChange: change(Number(paid), Number(previousPaid)) };
    });
    const countStatus = (rows: typeof distribution, key: string) => rows.find(x => x.status === key)?._count._all ?? 0;
    const dist = (key: string) => countStatus(distribution, key);
    const totalSubmissions = distribution.reduce((n, x) => n + x._count._all, 0);
    const previousTotalSubmissions = previousDistribution.reduce((n, x) => n + x._count._all, 0);
    const approved = dist("APPROVED");
    const previousApproved = countStatus(previousDistribution, "APPROVED");
    const rejected = dist("REJECTED");
    const previousRejected = countStatus(previousDistribution, "REJECTED");
    const paidByCountry = new Map<string, Array<{ currency: string; amountMinor: string }>>();
    for (const row of countryPaidRows) {
      const values = paidByCountry.get(row.country) ?? [];
      values.push({ currency: row.currency.trim(), amountMinor: row.amountMinor });
      paidByCountry.set(row.country, values);
    }
    const countries = new Set([...countryTaskRows.map(x => x.country), ...paidByCountry.keys()]);
    const countryBreakdown = [...countries].sort().map(country => {
      const task = countryTaskRows.find(x => x.country === country);
      return {
        country,
        taskCount: task?.taskCount ?? 0,
        approvedCount: task?.approvedCount ?? 0,
        rejectedCount: task?.rejectedCount ?? 0,
        actualPaid: paidByCountry.get(country) ?? [],
        approvalRate: task?.taskCount ? Number((task.approvedCount / task.taskCount * 100).toFixed(1)) : 0,
        note: "任务数量按任务关联号码国家统计；实际支出按收款账户国家统计。",
      };
    });
    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      filters: { status: status ?? "ALL", period },
      cards: {
        taskTotal: { value: totalSubmissions, change: change(totalSubmissions, previousTotalSubmissions) },
        approved: { value: approved, change: change(approved, previousApproved) },
        rejected: { value: rejected, change: change(rejected, previousRejected) },
        activeUsers: { value: activeUsers.length, change: change(activeUsers.length, previousActiveUsers.length) },
        withdrawalApplications: { amounts: moneyRows(withdrawalApplications), changes: moneyChanges(withdrawalApplications, previousWithdrawalApplications) },
        actualPayout: { amounts: moneyRows(actualPayout), changes: moneyChanges(actualPayout, previousActualPayout) },
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
      limitations: [
        "任务总数、审核通过数、审核拒绝数及审核状态分布统一按任务提交记录统计；状态筛选会同步作用于这些任务指标。",
        "活跃用户按所选周期内至少提交过一条符合筛选条件任务的去重用户数统计。",
        "提现申请金额按提现申请创建时间统计；实际支出按支付交易成功状态及成功交易更新时间统计。",
        "国家明细中，任务数量按任务关联号码国家统计，实际支出按收款账户国家统计；没有对应国家资料的记录归入“未标记”。",
        "跨币种金额分别展示，不进行汇率换算；申请金额与实际支出的差额不是钱包余额。",
      ],
    };
  }
}