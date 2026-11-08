"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, RefreshCw, ShieldCheck, XCircle, Users, Wallet, CircleDollarSign, Search, ChevronLeft, ChevronRight } from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";

type Amount = { currency: string; amountMinor: string };
type CardValue = { value: number; change: number | null };
type Report = {
  range: { from: string; to: string };
  filters: { status: string; period: string };
  cards: {
    taskTotal: CardValue;
    approved: CardValue;
    rejected: CardValue;
    activeUsers: CardValue;
    withdrawalApplications: { amounts: Amount[]; changes: { currency: string; change: number | null }[] };
    actualPayout: { amounts: Amount[]; changes: { currency: string; change: number | null }[] };
  };
  reviewDistribution: { total: number; approved: number; rejected: number; pending: number };
  finance: { currency: string; requestedMinor: string; paidMinor: string; estimatedDifferenceMinor: string }[];
  trend: { date: string; submitted: number; approved: number; rejected: number }[];
  countryBreakdown: { country: string; taskCount: number; approvedCount: number; rejectedCount: number; actualPaid: Amount[]; approvalRate: number; note?: string }[];
  limitations: string[];
};
const panel: React.CSSProperties = { background: "#fff", border: "1px solid #e3eaf3", borderRadius: 9 };
const control: React.CSSProperties = { height: 36, border: "1px solid #dce4ef", borderRadius: 6, padding: "0 10px", color: "#34445b", background: "#fff", fontSize: 12 };
const button: React.CSSProperties = { height: 34, border: "1px solid #dce4ef", borderRadius: 6, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#53647c", fontSize: 12, cursor: "pointer" };
const th: React.CSSProperties = { textAlign: "left", padding: "11px 10px", fontSize: 11, color: "#718096", background: "#f8fafc", borderBottom: "1px solid #edf1f6", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "12px 10px", fontSize: 12, color: "#34445b", borderBottom: "1px solid #edf1f6", whiteSpace: "nowrap" };
async function api<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "报表数据读取失败");
  return data as T;
}
function dateString(date: Date) { return date.toISOString().slice(0, 10); }
function money(minor: string, currency: string) { return currency + " " + (Number(minor) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function amountLines(rows: Amount[]) { return rows.length ? rows.map(x => money(x.amountMinor, x.currency)) : ["—"]; }
function amountChangeText(rows: { currency: string; change: number | null }[]) { return rows.length ? rows.map(x => x.currency + " " + (x.change === null ? "暂无对比" : (x.change > 0 ? "+" : "") + x.change.toFixed(1) + "%")).join(" / ") : "暂无可比较数据"; }
function changeText(value: number | null) {
  if (value === null) return "较上一周期：暂无可比较数据";
  return "较上一周期 " + (value > 0 ? "+" : "") + value.toFixed(1) + "%";
}
function TrendChart({ data }: { data: Report["trend"] }) {
  const width = 720, height = 250, left = 45, right = 18, top = 20, bottom = 36;
  const max = Math.max(1, ...data.flatMap(x => [x.submitted, x.approved, x.rejected]));
  const x = (i: number) => left + (data.length <= 1 ? 0 : i * (width - left - right) / (data.length - 1));
  const y = (v: number) => top + (height - top - bottom) * (1 - v / max);
  const path = (key: "submitted" | "approved" | "rejected") => data.map((v, i) => (i ? "L" : "M") + " " + x(i) + " " + y(v[key])).join(" ");
  return <svg viewBox="0 0 720 250" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="任务趋势图">
    {[0, Math.round(max / 3), Math.round(max * 2 / 3), max].map((v, i) => <g key={i}><line x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke="#e7edf5" strokeDasharray="4 5"/><text x={left - 9} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#8a9ab0">{v.toLocaleString()}</text></g>)}
    <path d={path("submitted")} fill="none" stroke="#12b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={path("approved")} fill="none" stroke="#1599e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={path("rejected")} fill="none" stroke="#f04463" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    {data.map((v, i) => <g key={v.date}><circle cx={x(i)} cy={y(v.submitted)} r="3" fill="#12b981"/><circle cx={x(i)} cy={y(v.approved)} r="3" fill="#1599e8"/><circle cx={x(i)} cy={y(v.rejected)} r="3" fill="#f04463"/><text x={x(i)} y={height - 10} textAnchor="middle" fontSize="10" fill="#8492a6">{v.date.slice(5).replace("-", "/")}</text></g>)}
  </svg>;
}
function StatCard({ title, value, sub, icon: Icon, tone }: { title: string; value: string; sub: string; icon: typeof BarChart3; tone: string }) {
  return <div style={{ ...panel, padding: "13px 14px", minWidth: 0, position: "relative" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 40, height: 40, borderRadius: 50, background: tone + "13", color: tone, display: "grid", placeItems: "center" }}><Icon size={19}/></span><div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: "#718096" }}>{title}</div><strong style={{ display: "block", fontSize: 21, color: "#12243c", marginTop: 3, overflowWrap: "anywhere" }}>{value}</strong></div></div>
    <div style={{ margin: "8px 0 0 50px", fontSize: 10, color: "#8a9ab0" }}>{sub}</div>
  </div>;
}
export default function ReportsPage() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(dateString(new Date(today.getTime() - 6 * 86400000)));
  const [to, setTo] = useState(dateString(today));
  const [status, setStatus] = useState("ALL");
  const [period, setPeriod] = useState("day");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [breakdown, setBreakdown] = useState("country");
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = useState(["country", "tasks", "approved", "rejected", "spend", "rate"]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const q = new URLSearchParams({ from, to, status, period });
      setReport(await api<Report>("/api/v1/admin/reports/summary?" + q.toString()));
      setPage(1);
    } catch (e) { setError(e instanceof Error ? e.message : "报表数据读取失败"); }
    finally { setLoading(false); }
  }, [from, to, status, period]);
  useEffect(() => { void load(); }, [load]);
  const dist = report?.reviewDistribution;
  const total = dist?.total ?? 0;
  const approvedPct = total ? (dist!.approved / total) * 100 : 0;
  const rejectedPct = total ? (dist!.rejected / total) * 100 : 0;
  const pendingPct = total ? (dist!.pending / total) * 100 : 0;
  const gradient = "conic-gradient(#20c36b 0% " + approvedPct + "%, #fa4161 " + approvedPct + "% " + (approvedPct + rejectedPct) + "%, #93a4b9 " + (approvedPct + rejectedPct) + "% 100%)";
  const rows = breakdown === "country" ? report?.countryBreakdown ?? [] : report?.countryBreakdown ?? [];
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const countText = (v: number | undefined) => v === undefined ? "—" : v.toLocaleString("en-US");
  const cards = report?.cards;
  const cardAmount = (v: Amount[] | undefined) => v?.length ? v.map(x => money(x.amountMinor, x.currency)).join(" / ") : "—";
  const columnsDef = [{ key: "country", label: "国家/地区" }, { key: "tasks", label: "任务总数" }, { key: "approved", label: "审核通过数" }, { key: "rejected", label: "审核拒绝数" }, { key: "spend", label: "实际支出金额" }, { key: "rate", label: "审核通过率" }];
  return <div className="dashboard-app"><AdminSidebar/><main className="dashboard-main" style={{ minWidth: 0, background: "#f7f9fc" }}><AdminTopbar/>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px 0", background: "#fff" }}><b style={{ fontSize: 14, color: "#23354d" }}>数据报表</b><button style={button} onClick={() => void load()} disabled={loading}><RefreshCw size={14}/>刷新</button></div>
    <div style={{ padding: 18, display: "grid", gap: 14 }}>
      <section style={{ ...panel, padding: 10, display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#53647c" }}><CalendarDays size={14}/><input aria-label="开始日期" type="date" style={control} value={from} max={to} onChange={e => setFrom(e.target.value)}/><span>~</span><input aria-label="结束日期" type="date" style={control} value={to} min={from} onChange={e => setTo(e.target.value)}/></label>
        <select aria-label="任务状态" style={control} value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">全部状态</option><option value="SUBMITTED">已提交</option><option value="UNDER_REVIEW">审核中</option><option value="APPROVED">已通过</option><option value="REJECTED">已拒绝</option></select>
        <button style={{ ...button, marginLeft: "auto" }} onClick={() => void load()} disabled={loading}><RefreshCw size={14}/>刷新数据</button>
      </section>
      {error && <div style={{ padding: "11px 12px", borderRadius: 7, background: "#fff0f0", color: "#c43d3d", fontSize: 12 }}>{error}</div>}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 10 }}>
        <StatCard title="任务总数" value={countText(cards?.taskTotal.value)} sub={changeText(cards?.taskTotal.change ?? null)} icon={BarChart3} tone="#10b981"/>
        <StatCard title="审核通过数" value={countText(cards?.approved.value)} sub={changeText(cards?.approved.change ?? null)} icon={ShieldCheck} tone="#0bbf83"/>
        <StatCard title="审核拒绝数" value={countText(cards?.rejected.value)} sub={changeText(cards?.rejected.change ?? null)} icon={XCircle} tone="#f04463"/>
        <StatCard title="活跃用户" value={countText(cards?.activeUsers.value)} sub={changeText(cards?.activeUsers.change ?? null)} icon={Users} tone="#1599e8"/>
        <StatCard title="提现申请金额" value={cardAmount(cards?.withdrawalApplications.amounts)} sub={"较上一周期：" + amountChangeText(cards?.withdrawalApplications.changes ?? [])} icon={Wallet} tone="#f59e0b"/>
        <StatCard title="实际支出金额" value={cardAmount(cards?.actualPayout.amounts)} sub={"较上一周期：" + amountChangeText(cards?.actualPayout.changes ?? [])} icon={CircleDollarSign} tone="#10b981"/>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(300px,1fr) minmax(250px,.72fr)", gap: 12, alignItems: "stretch" }}>
        <div style={{ ...panel, padding: 16, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}><div><b style={{ fontSize: 14, color: "#152943" }}>任务趋势概览</b><div style={{ fontSize: 10, color: "#8a9ab0", marginTop: 5 }}>按所选周期查看任务提交与审核趋势</div></div><div style={{ display: "flex", background: "#f3f6fa", borderRadius: 6, padding: 2 }}>{[["day","日"],["week","周"],["month","月"]].map(([v,label]) => <button key={v} onClick={() => setPeriod(v)} style={{ height: 27, minWidth: 32, border: 0, borderRadius: 5, background: period === v ? "#10b981" : "transparent", color: period === v ? "#fff" : "#718096", fontSize: 11, cursor: "pointer" }}>{label}</button>)}</div></div>
          <TrendChart data={report?.trend ?? []}/><div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 16, fontSize: 10, color: "#718096", marginTop: 4 }}><span><i style={{ display: "inline-block", width: 7, height: 7, borderRadius: 9, background: "#12b981", marginRight: 5 }}/>任务提交数</span><span><i style={{ display: "inline-block", width: 7, height: 7, borderRadius: 9, background: "#1599e8", marginRight: 5 }}/>审核通过数</span><span><i style={{ display: "inline-block", width: 7, height: 7, borderRadius: 9, background: "#f04463", marginRight: 5 }}/>审核拒绝数</span></div>
        </div>
        <div style={{ ...panel, padding: 16, minWidth: 0 }}>
          <b style={{ fontSize: 14, color: "#152943" }}>审核状态总览</b><div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
            <div style={{ width: 154, height: 154, borderRadius: "50%", background: gradient, display: "grid", placeItems: "center", flexShrink: 0 }}><div style={{ width: 108, height: 108, borderRadius: "50%", background: "#fff", display: "grid", placeContent: "center", textAlign: "center" }}><strong style={{ fontSize: 22, color: "#172b45" }}>{total ? (approvedPct).toFixed(1) + "%" : "—"}</strong><span style={{ fontSize: 10, color: "#8a9ab0" }}>通过率</span></div></div>
            <div style={{ display: "grid", gap: 13, flex: "1 1 120px", fontSize: 11, color: "#53647c" }}>{[{ label: "通过", value: dist?.approved ?? 0, pct: approvedPct, color: "#20c36b" }, { label: "拒绝", value: dist?.rejected ?? 0, pct: rejectedPct, color: "#fa4161" }, { label: "待审核", value: dist?.pending ?? 0, pct: pendingPct, color: "#93a4b9" }].map(x => <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 7 }}><i style={{ width: 8, height: 8, borderRadius: 10, background: x.color }}/><span>{x.label}</span><b style={{ marginLeft: "auto", color: "#34445b" }}>{x.value.toLocaleString()} ({x.pct.toFixed(1)}%)</b></div>)}</div>
          </div><div style={{ fontSize: 10, color: "#8a9ab0", marginTop: 18 }}>统计所选日期内提交的审核记录</div>
        </div>
        <div style={{ ...panel, padding: 16, minWidth: 0 }}>
          <b style={{ fontSize: 14, color: "#152943" }}>财务摘要（本周期）</b><div style={{ display: "grid", gap: 9, marginTop: 13 }}>
            {report?.finance.length ? report.finance.map(x => <div key={x.currency} style={{ border: "1px solid #e9eef5", borderRadius: 8, padding: 10 }}><div style={{ fontSize: 10, color: "#718096" }}>{x.currency} 提现申请金额</div><b style={{ display: "block", fontSize: 16, color: "#152943", marginTop: 4 }}>{money(x.requestedMinor, x.currency)}</b><div style={{ fontSize: 10, color: "#8a9ab0", marginTop: 3 }}>实际支出：{money(x.paidMinor, x.currency)}</div><div style={{ fontSize: 10, color: "#15945b", marginTop: 3 }}>预计结余：{money(x.estimatedDifferenceMinor, x.currency)}</div></div>) : <div style={{ padding: 18, color: "#8a9ab0", fontSize: 11, textAlign: "center", border: "1px solid #e9eef5", borderRadius: 8 }}>所选周期暂无提现财务数据</div>}
          </div>
        </div>
      </section>
      <section style={{ ...panel, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><div><b style={{ fontSize: 14, color: "#152943" }}>数据明细</b><div style={{ fontSize: 10, color: "#8a9ab0", marginTop: 4 }}>按国家统计</div></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><select style={control} value={breakdown} onChange={e => setBreakdown(e.target.value)}><option value="country">按国家统计</option></select><div style={{ position: "relative" }}><button style={button} onClick={() => setShowColumns(v => !v)}>▥ 显示列</button>{showColumns && <div style={{ position: "absolute", zIndex: 5, right: 0, top: 38, width: 170, padding: 10, background: "#fff", border: "1px solid #e1e8f0", borderRadius: 8, boxShadow: "0 8px 24px #172b451c" }}>{columnsDef.map(x => <label key={x.key} style={{ display: "flex", gap: 7, alignItems: "center", padding: "6px 2px", fontSize: 11, color: "#53647c" }}><input type="checkbox" checked={columns.includes(x.key)} onChange={e => setColumns(old => e.target.checked ? [...old, x.key] : old.filter(k => k !== x.key))}/>{x.label}</label>)}</div>}</div></div></div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}><thead><tr>{columnsDef.filter(x => columns.includes(x.key)).map(x => <th key={x.key} style={th}>{x.label}</th>)}</tr></thead><tbody>{visibleRows.length ? visibleRows.map(row => <tr key={row.country}>{columns.includes("country") && <td style={td}>{row.country}</td>}{columns.includes("tasks") && <td style={td}>{row.taskCount.toLocaleString()}</td>}{columns.includes("approved") && <td style={td}>{row.approvedCount.toLocaleString()}</td>}{columns.includes("rejected") && <td style={td}>{row.rejectedCount.toLocaleString()}</td>}{columns.includes("spend") && <td style={td}>{amountLines(row.actualPaid).join(" / ")}</td>}{columns.includes("rate") && <td style={td}>{row.approvalRate.toFixed(1)}%</td>}</tr>) : <tr><td colSpan={columns.length} style={{ padding: 35, textAlign: "center", color: "#8a9ab0", fontSize: 12 }}>{loading ? "正在加载报表…" : "暂无数据"}</td></tr>}</tbody></table></div>
        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, borderTop: "1px solid #edf1f6", fontSize: 11, color: "#718096" }}><span>共 {rows.length} 条</span><select style={{ ...control, height: 30 }} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select><button style={{ ...button, height: 30, padding: "0 8px" }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14}/></button><b style={{ color: "#2868ee" }}>{page}</b><button style={{ ...button, height: 30, padding: "0 8px" }} disabled={page * pageSize >= rows.length} onClick={() => setPage(p => p + 1)}><ChevronRight size={14}/></button></div>
      </section>
      {report?.limitations.map(x => <div key={x} style={{ fontSize: 10, color: "#8a9ab0" }}>说明：{x}</div>)}
    </div>
  </main></div>;
}
