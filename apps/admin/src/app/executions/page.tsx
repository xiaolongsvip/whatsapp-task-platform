"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, RefreshCw, Eye, ChevronLeft, ChevronRight, LayoutDashboard, Users, Phone, FileClock, ClipboardCheck, Settings, LogOut, CalendarDays } from "lucide-react";

type RecordStatus = "AVAILABLE" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CLOSED" | "FROZEN" | "VOIDED";
type TaskRecord = {
  id: string; taskId: string; taskName: string; phoneNumber: string; groupName: string;
  rewardAmount: string; currency: string; messageTemplate: string; countryRegion: string;
  status: RecordStatus; createdAt: string; claimId: string | null; claimedAt: string | null;
  claimedUserId: string | null;
};
type ResponseData = {
  items: TaskRecord[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  stats: { total: number; available: number; inProgress: number; review: number; completed: number; closed: number; frozen: number; voided: number };
};

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "请求失败，请检查 API 服务。");
  return data as T;
}

const tabs = [
  { key: "ALL", label: "全部" },
  { key: "CREATED", label: "已创建" },
  { key: "ASSIGNED", label: "已分配号码" },
  { key: "OPENED", label: "已打开 WhatsApp" },
  { key: "REVIEW", label: "审核中" },
  { key: "MANUAL", label: "人工复核" },
  { key: "REJECTED", label: "已拒绝" },
  { key: "RESUBMIT", label: "需要重新提交" },
  { key: "FROZEN", label: "已冻结" },
  { key: "SETTLED", label: "已结算" },
  { key: "EXPIRED", label: "已超时" },
  { key: "CANCELLED", label: "已取消" },
] as const;
type TabKey = typeof tabs[number]["key"];

const statusText: Record<RecordStatus, string> = {
  AVAILABLE: "可领取", IN_PROGRESS: "进行中", REVIEW: "审核中", COMPLETED: "已结算",
  CLOSED: "已关闭", FROZEN: "已冻结", VOIDED: "已作废",
};
const statusStyle: Record<RecordStatus, React.CSSProperties> = {
  AVAILABLE: { color: "#2563eb", background: "#eff6ff", borderColor: "#bfdbfe" },
  IN_PROGRESS: { color: "#d97706", background: "#fff7ed", borderColor: "#fed7aa" },
  REVIEW: { color: "#7c3aed", background: "#f5f3ff", borderColor: "#ddd6fe" },
  COMPLETED: { color: "#059669", background: "#ecfdf5", borderColor: "#a7f3d0" },
  CLOSED: { color: "#64748b", background: "#f8fafc", borderColor: "#cbd5e1" },
  FROZEN: { color: "#7c3aed", background: "#f5f3ff", borderColor: "#ddd6fe" },
  VOIDED: { color: "#dc2626", background: "#fef2f2", borderColor: "#fecaca" },
};

export default function ExecutionRecordsPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<TaskRecord[]>([]);
  const [stats, setStats] = useState<ResponseData["stats"]>({ total: 0, available: 0, inProgress: 0, review: 0, completed: 0, closed: 0, frozen: 0, voided: 0 });
  const [tab, setTab] = useState<TabKey>("ALL");
  const [period, setPeriod] = useState("today");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<TaskRecord | null>(null);

  const load = useCallback(async () => {
    const apiStatus: Partial<Record<TabKey, RecordStatus>> = { CREATED: "AVAILABLE", ASSIGNED: "IN_PROGRESS", OPENED: "IN_PROGRESS", REVIEW: "REVIEW", MANUAL: "REVIEW", REJECTED: "VOIDED", RESUBMIT: "CLOSED", FROZEN: "FROZEN", SETTLED: "COMPLETED", EXPIRED: "CLOSED", CANCELLED: "CLOSED" };
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), keyword: appliedKeyword, status: apiStatus[tab] || "ALL" });
    if (period !== "all") {
      const now = new Date();
      const start = new Date(now);
      if (period === "today") start.setHours(0, 0, 0, 0);
      if (period === "yesterday") { start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0); }
      if (period === "7d") start.setDate(start.getDate() - 7);
      if (period === "30d") start.setDate(start.getDate() - 30);
      const end = new Date(now);
      if (period === "yesterday") end.setHours(0, 0, 0, 0), end.setMilliseconds(-1);
      params.set("createdFrom", start.toISOString());
      params.set("createdTo", end.toISOString());
    }
    const result = await api<ResponseData>("/api/v1/admin/tasks/records?" + params.toString());
    setItems(result.items); setStats(result.stats); setTotal(result.pagination.total); setTotalPages(Math.max(1, result.pagination.totalPages));
  }, [page, pageSize, appliedKeyword, period, tab]);

  useEffect(() => {
    api<{ id: string; email: string }>("/api/v1/admin-auth/me")
      .then(() => { setAuthenticated(true); })
      .catch(() => setError("登录状态已失效，请重新登录。"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (authenticated) load().catch((e) => setError(e instanceof Error ? e.message : "执行记录加载失败")); }, [authenticated, load]);

  const filtered = useMemo(() => items.filter((item) => {
    if (tab === "ALL") return true;
    if (tab === "CREATED") return item.status === "AVAILABLE";
    if (tab === "ASSIGNED" || tab === "OPENED") return item.status === "IN_PROGRESS";
    if (tab === "REVIEW" || tab === "MANUAL") return item.status === "REVIEW";
    if (tab === "REJECTED") return item.status === "VOIDED";
    if (tab === "RESUBMIT") return item.status === "CLOSED";
    if (tab === "FROZEN") return item.status === "FROZEN";
    if (tab === "SETTLED") return item.status === "COMPLETED";
    if (tab === "EXPIRED" || tab === "CANCELLED") return item.status === "CLOSED";
    return true;
  }), [items, tab]);

  const summary = [
    { key: "ALL" as TabKey, title: "全部记录", value: stats.total, note: "所选范围的全部状态", color: "#2563eb", icon: "▤" },
    { key: "ASSIGNED" as TabKey, title: "执行中", value: stats.inProgress, note: "已领取，待提交", color: "#2563eb", icon: "◷" },
    { key: "REVIEW" as TabKey, title: "审核中", value: stats.review, note: "已提交，等待审核", color: "#f97316", icon: "⌕" },
    { key: "SETTLED" as TabKey, title: "已通过", value: stats.completed, note: "已通过 / 已结算", color: "#10b981", icon: "✓" },
    { key: "FROZEN" as TabKey, title: "待补图 / 冻结", value: stats.frozen, note: "需补图 / 已冻结", color: "#8b5cf6", icon: "▣" },
    { key: "REJECTED" as TabKey, title: "拒绝 / 终止", value: stats.closed + stats.voided, note: "已拒绝 / 已过期 / 已取消", color: "#f43f5e", icon: "×" },
  ];

  function chooseTab(next: TabKey) { setTab(next); setPage(1); }
  function search() { setAppliedKeyword(keyword.trim()); setPage(1); }
  function reset() { setKeyword(""); setAppliedKeyword(""); setPeriod("today"); chooseTab("ALL"); }

  const card: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 7, background: "#fff", padding: "18px 16px", minWidth: 0, textAlign: "left", cursor: "pointer" };

  if (loading) return <main style={{ padding: 32, color: "#64748b" }}>正在加载执行记录…</main>;
  if (!authenticated) return <main style={{ padding: 32, color: "#dc2626" }}>{error || "请先登录"}</main>;

  return <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", display: "flex" }}>
    <aside style={{ width: 162, background: "#fff", borderRight: "1px solid #e2e8f0", padding: "18px 10px", flexShrink: 0 }}>
      <div style={{ fontWeight: 700, margin: "0 0 28px 8px" }}>EasyEarn <small style={{ display: "block", color: "#64748b", fontWeight: 400 }}>后台管理</small></div>
      <nav style={{ display: "grid", gap: 7, fontSize: 13 }}>
        <Link href="/" style={{ padding: 10, color: "#475569", textDecoration: "none" }}>控制台</Link>
        <Link href="/users" style={{ padding: 10, color: "#475569", textDecoration: "none" }}>用户管理</Link>
        <Link href="/tasks" style={{ padding: 10, color: "#475569", textDecoration: "none" }}>任务管理</Link>
        <span style={{ padding: 10, borderRadius: 6, background: "#ecfdf5", color: "#059669", fontWeight: 600 }}>执行记录</span>
        <Link href="/ai-reviews" style={{ padding: 10, color: "#475569", textDecoration: "none" }}>审核中心</Link>
        <Link href="/task-settings/messages" style={{ padding: 10, color: "#475569", textDecoration: "none" }}>话术管理</Link>
      </nav>
    </aside>
    <main style={{ flex: 1, minWidth: 0, padding: 18 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}><div><h1 style={{ fontSize: 22, margin: 0 }}>执行记录</h1><p style={{ color: "#64748b", fontSize: 13, margin: "6px 0 0" }}>查看任务执行进度、审核结果与结算状态</p></div><button onClick={() => load().catch((e) => setError(e.message))} style={{ border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", padding: "9px 14px", cursor: "pointer" }}><RefreshCw size={14} style={{ verticalAlign: "middle", marginRight: 6 }}/>刷新</button></header>
      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}><strong style={{ fontSize: 13 }}>领取时间范围（UTC）</strong><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{[["all","全部"],["today","今天"],["yesterday","昨天"],["7d","近7天"],["30d","近30天"]].map(([v,l]) => <button key={v} onClick={() => {setPeriod(v);setPage(1);}} style={{ border: 0, borderRadius: 5, padding: "7px 12px", background: period===v?"#2563eb":"#f1f5f9", color: period===v?"#fff":"#475569", cursor: "pointer" }}>{l}</button>)}</div></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 9 }}>
          {summary.map((s) => <button key={s.key} onClick={() => chooseTab(s.key)} style={{ ...card, borderColor: tab===s.key?s.color:"#e2e8f0", boxShadow: tab===s.key?"0 0 0 1px "+s.color+" inset":"none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 38, height: 38, borderRadius: 50, background: s.color+"12", color: s.color, display: "grid", placeItems: "center", fontSize: 21, flexShrink: 0 }}>{s.icon}</span><span style={{ minWidth: 0 }}><small style={{ display: "block", color: "#64748b", fontSize: 12 }}>{s.title}</small><strong style={{ display: "block", fontSize: 24, lineHeight: 1.35 }}>{s.value.toLocaleString()}</strong><small style={{ color: "#64748b", fontSize: 11 }}>{s.note}</small></span></div>
          </button>)}
        </div>
      </section>
      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ position: "relative", minWidth: 230, flex: "0 1 260px" }}><Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#94a3b8" }}/><input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => {if(e.key==="Enter")search();}} placeholder="任务名称、编号或用户账号" style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px 8px 32px", outlineColor: "#2563eb" }}/></div>
          <div style={{ display: "flex", gap: 3, overflowX: "auto", flex: 1, minWidth: 300, padding: 3, background: "#f1f5f9", borderRadius: 6 }}>{tabs.map((t) => <button key={t.key} onClick={() => chooseTab(t.key)} style={{ whiteSpace: "nowrap", border: 0, borderRadius: 5, padding: "8px 10px", background: tab===t.key?"#2563eb":"transparent", color: tab===t.key?"#fff":"#475569", cursor: "pointer", fontSize: 12 }}>{t.label}</button>)}</div>
          <button onClick={search} style={{ border: 0, borderRadius: 6, background: "#2563eb", color: "#fff", padding: "9px 13px", cursor: "pointer" }}>搜索</button>
          <button onClick={reset} style={{ border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", padding: "8px 12px", cursor: "pointer" }}>重置</button>
          <button onClick={() => load().catch((e) => setError(e.message))} title="刷新" style={{ border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", padding: "8px 10px", cursor: "pointer" }}><RefreshCw size={15}/></button>
        </div>
        {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
          <thead><tr style={{ background: "#f8fafc", color: "#64748b", textAlign: "left" }}>{["任务账号","目标手机号","任务状态","截图证据","审核状态","奖励金额","操作时间","操作"].map((h)=><th key={h} style={{ padding: "12px 9px", fontWeight: 500, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map((item)=><tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
            <td style={{ padding: "12px 9px" }}>{item.claimId || item.id.slice(0,10)}</td><td style={{ padding: "12px 9px" }}>{item.phoneNumber || "—"}</td>
            <td style={{ padding: "12px 9px" }}><span style={{ border: "1px solid "+statusStyle[item.status].borderColor, color: statusStyle[item.status].color, background: statusStyle[item.status].background, borderRadius: 5, padding: "3px 7px" }}>{statusText[item.status]}</span></td>
            <td style={{ padding: "12px 9px", color: "#059669" }}>—</td><td style={{ padding: "12px 9px" }}>{item.status==="COMPLETED"?"已通过":item.status==="REVIEW"?"待审核":"—"}</td>
            <td style={{ padding: "12px 9px" }}>{item.rewardAmount} {item.currency}</td><td style={{ padding: "12px 9px" }}>{new Date(item.claimedAt || item.createdAt).toLocaleString("zh-CN",{hour12:false})}</td>
            <td style={{ padding: "12px 9px" }}><button onClick={()=>setSelected(item)} style={{ border: 0, background: "transparent", color: "#2563eb", cursor: "pointer" }}><Eye size={14} style={{verticalAlign:"middle",marginRight:4}}/>详情</button></td>
          </tr>)}</tbody>
        </table></div>
        {filtered.length===0 && <div style={{ textAlign: "center", padding: 70, color: "#64748b" }}>暂无任务记录</div>}
        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, color: "#64748b", fontSize: 12 }}><span>共 {total.toLocaleString()} 条</span><div style={{ display: "flex", alignItems: "center", gap: 8 }}><button disabled={page<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))} style={{ padding: 7, border: "1px solid #cbd5e1", borderRadius: 5, background: "#fff" }}><ChevronLeft size={15}/></button><span>{page} / {totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage((p)=>Math.min(totalPages,p+1))} style={{ padding: 7, border: "1px solid #cbd5e1", borderRadius: 5, background: "#fff" }}><ChevronRight size={15}/></button><select value={pageSize} onChange={(e)=>{setPageSize(Number(e.target.value));setPage(1);}} style={{ padding: 7, border: "1px solid #cbd5e1", borderRadius: 5 }}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select></div></footer>
      </section>
      {selected && <div onClick={()=>setSelected(null)} style={{ position:"fixed",inset:0,background:"#0f172a66",display:"grid",placeItems:"center",zIndex:50,padding:20 }}><div onClick={(e)=>e.stopPropagation()} style={{ background:"#fff",borderRadius:10,padding:22,width:"min(560px,100%)",maxHeight:"80vh",overflow:"auto" }}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{margin:0,fontSize:18}}>执行记录详情</h2><button onClick={()=>setSelected(null)} style={{border:0,background:"transparent",fontSize:22,cursor:"pointer"}}>×</button></div><dl style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:12,fontSize:13}}>{[["任务名称",selected.taskName],["任务账号",selected.claimId||selected.id],["目标手机号",selected.phoneNumber],["任务分组",selected.groupName],["任务状态",statusText[selected.status]],["奖励金额",selected.rewardAmount+" "+selected.currency],["国家/地区",selected.countryRegion||"—"],["领取时间",selected.claimedAt?new Date(selected.claimedAt).toLocaleString():"—"],["创建时间",new Date(selected.createdAt).toLocaleString()]].map(([k,v])=><><dt key={k+"-k"} style={{color:"#64748b"}}>{k}</dt><dd key={k+"-v"} style={{margin:0,wordBreak:"break-word"}}>{v}</dd></>)}</dl></div></div>}
    </main>
  </div>;
}
