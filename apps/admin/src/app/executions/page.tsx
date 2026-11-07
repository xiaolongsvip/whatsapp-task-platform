"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminSidebar from "../../components/AdminSidebar";
import { Search, RefreshCw, Eye, ChevronLeft, ChevronRight, PackageOpen } from "lucide-react";

type RecordStatus = "AVAILABLE" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CLOSED" | "FROZEN" | "VOIDED";
type TaskRecord = {
  id: string; taskId: string; taskName: string; phoneNumber: string; groupName: string;
  rewardAmount: string; currency: string; messageTemplate: string; countryRegion: string;
  status: RecordStatus; createdAt: string; claimId: string | null; claimedAt: string | null;
  claimedUserId: string | null;
};
type ExecutionDetail = {
 id:string;task:{id:string;title:string;category:string;status:string;groupName:string;messageTemplate:string|null;linkUrl:string|null};phone:{id:string;number:string;countryCode:string|null;countryName:string|null;status:string;consentStatus:string};status:string;rewardAmount:string;currency:string;createdAt:string;openWhatsAppAt:string|null;openInfo:{result:string;whatsappInstalled:boolean|null;skippedSteps:boolean|null;skipReason:string|null;targetPackage:string|null;intentType:string|null};supplementRequestedAt:string|null;supplementDeadlineAt:string|null;assignedAt:string|null;usedAt:string|null;releasedAt:string|null;
 claim:{id:string;status:string;claimedAt:string;expiresAt:string|null;user:{id:string;phone:string};assignment:{status:string;assignedAt:string;releasedAt:string|null;completedAt:string|null}|null}|null;
 submissions:Array<{id:string;status:string;originalName:string|null;mimeType:string|null;sizeBytes:number|null;note:string|null;submittedAt:string;evidenceUrl:string;screenshotHash:string|null;aiReview:{status:string;decision:string|null;confidence:number|null;reason:string|null;extractedText:string|null;lastError:string|null}|null;reviews:Array<{decision:string;reason:string|null;reviewedAt:string;reviewer:string}>}>;
 behavior:Array<{key:string;title:string;at:string;detail:unknown}>;auditEvents:Array<{id:string;action:string;actorType:string;createdAt:string;metadata:unknown}>;risk:{level:string;score:number|null;events:Array<{id:string;action:string;createdAt:string;metadata:unknown}>};supplements:Array<unknown>;
};
type ResponseData = {
  items: TaskRecord[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  stats: { total: number; available: number; inProgress: number; review: number; completed: number; closed: number; frozen: number; voided: number };
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
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

function EmptyDetail({text}:{text:string}) { return <div style={{border:"1px solid #e2e8f0",borderRadius:7,padding:34,textAlign:"center",color:"#64748b"}}>{text}</div>; }

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
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("基本信息");
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [evidenceZoom, setEvidenceZoom] = useState(1);

  const load = useCallback(async () => {
    const apiStatus: Partial<Record<TabKey, RecordStatus>> = { CREATED: "AVAILABLE", ASSIGNED: "IN_PROGRESS", OPENED: "IN_PROGRESS", REVIEW: "REVIEW", MANUAL: "REVIEW", REJECTED: "VOIDED", RESUBMIT: "CLOSED", FROZEN: "FROZEN", SETTLED: "COMPLETED", EXPIRED: "CLOSED", CANCELLED: "CLOSED" };
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), keyword: appliedKeyword, status: apiStatus[tab] || "ALL" });
    if (period !== "all") {
      const now = new Date();
      const start = new Date(now);
      if (period === "today") start.setUTCHours(0, 0, 0, 0);
      if (period === "yesterday") { start.setUTCDate(start.getUTCDate() - 1); start.setUTCHours(0, 0, 0, 0); }
      if (period === "7d") start.setUTCDate(start.getUTCDate() - 7);
      if (period === "30d") start.setUTCDate(start.getUTCDate() - 30);
      const end = new Date(now);
      if (period === "yesterday") { end.setUTCHours(0, 0, 0, 0); end.setUTCMilliseconds(-1); }
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

  async function createTestData() {
    if (!window.confirm("生成 6 条独立的执行记录测试数据？不会产生真实结算流水。")) return;
    setTestBusy(true); setTestMessage("");
    try { const result = await api<{createdCount:number;message:string}>("/api/v1/admin/tasks/records/dev-test-data", { method: "POST" }); setTestMessage(result.message); setPage(1); setPeriod("all"); setTab("ALL"); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "生成测试数据失败"); }
    finally { setTestBusy(false); }
  }

  async function deleteTestData() {
    if (!window.confirm("确定清理所有带有 DEV-EXEC-TEST 标记的执行记录测试数据？真实业务数据不会被清理。")) return;
    setTestBusy(true); setTestMessage("");
    try { const result = await api<{deletedCount:number;message:string}>("/api/v1/admin/tasks/records/dev-test-data", { method: "DELETE" }); setTestMessage(result.message); setSelected(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "清理测试数据失败"); }
    finally { setTestBusy(false); }
  }

  async function openDetail(item: TaskRecord) { setSelected(item); setDetail(null); setDetailTab("基本信息"); setDetailLoading(true); try { setDetail(await api<ExecutionDetail>("/api/v1/admin/tasks/records/" + item.id + "/detail")); } catch(e) { setError(e instanceof Error ? e.message : "详情加载失败"); } finally { setDetailLoading(false); } }

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
    <AdminSidebar />
    <main className="dashboard-main" style={{ minHeight: "100vh", padding: 18 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}><div><h1 style={{ fontSize: 22, margin: 0 }}>执行记录</h1><p style={{ color: "#64748b", fontSize: 13, margin: "6px 0 0" }}>查看任务执行进度、审核结果与结算状态</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button disabled={testBusy} onClick={createTestData} style={{border:"1px solid #2563eb",borderRadius:6,background:"#eff6ff",color:"#1d4ed8",padding:"9px 12px",cursor:testBusy?"wait":"pointer"}}>{testBusy?"处理中…":"生成测试数据"}</button>
      <button disabled={testBusy} onClick={deleteTestData} style={{border:"1px solid #fecaca",borderRadius:6,background:"#fff",color:"#dc2626",padding:"9px 12px",cursor:testBusy?"wait":"pointer"}}>清理测试数据</button>
      <button onClick={() => load().catch((e) => setError(e.message))} style={{ border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", padding: "9px 14px", cursor: "pointer" }}><RefreshCw size={14} style={{ verticalAlign: "middle", marginRight: 6 }}/>刷新</button>
      </div></header>
      {testMessage && <p style={{color:"#047857",fontSize:12,margin:"0 0 10px"}}>{testMessage}</p>}
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
            <td style={{ padding: "12px 9px" }}><button onClick={()=>openDetail(item)} style={{ border: 0, background: "transparent", color: "#2563eb", cursor: "pointer" }}><Eye size={14} style={{verticalAlign:"middle",marginRight:4}}/>详情</button></td>
          </tr>)}</tbody>
        </table></div>
        {filtered.length===0 && <div style={{ textAlign: "center", padding: 70, color: "#64748b" }}>暂无任务记录</div>}
        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, color: "#64748b", fontSize: 12 }}><span>共 {total.toLocaleString()} 条</span><div style={{ display: "flex", alignItems: "center", gap: 8 }}><button disabled={page<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))} style={{ padding: 7, border: "1px solid #cbd5e1", borderRadius: 5, background: "#fff" }}><ChevronLeft size={15}/></button><span>{page} / {totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage((p)=>Math.min(totalPages,p+1))} style={{ padding: 7, border: "1px solid #cbd5e1", borderRadius: 5, background: "#fff" }}><ChevronRight size={15}/></button><select value={pageSize} onChange={(e)=>{setPageSize(Number(e.target.value));setPage(1);}} style={{ padding: 7, border: "1px solid #cbd5e1", borderRadius: 5 }}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select></div></footer>
      </section>
      {selected && <div onClick={()=>setSelected(null)} style={{position:"fixed",inset:0,zIndex:60,background:"rgba(15,23,42,.22)"}}>
<aside onClick={e=>e.stopPropagation()} style={{position:"absolute",right:0,top:0,bottom:0,width:"min(800px,96vw)",maxWidth:"100vw",minWidth:0,background:"#fff",boxShadow:"-8px 0 28px #0f172a20",display:"flex",flexDirection:"column"}}>
<header style={{padding:"15px 20px",borderBottom:"1px solid #e2e8f0"}}><div style={{display:"flex",justifyContent:"space-between",gap:10}}><strong>{detail?.task.title??selected.taskName} <span style={{color:"#059669",fontSize:11}}>{detail?.claim?.status??statusText[selected.status]}</span></strong><button onClick={()=>setSelected(null)} style={{border:0,background:"transparent",fontSize:22,cursor:"pointer"}}>×</button></div><div style={{fontSize:12,color:"#64748b",marginTop:6}}>{detail?.phone.number??selected.phoneNumber}</div></header>
<nav style={{display:"flex",gap:3,padding:"10px 18px 0",borderBottom:"1px solid #e2e8f0",overflowX:"auto"}}>{["基本信息","行为链路","证据截图","审核结果","风险记录","任务补发"].map(t=><button key={t} onClick={()=>setDetailTab(t)} style={{whiteSpace:"nowrap",padding:"10px 12px",border:0,borderBottom:detailTab===t?"2px solid #2563eb":"2px solid transparent",background:detailTab===t?"#eff6ff":"transparent",color:detailTab===t?"#2563eb":"#475569",cursor:"pointer"}}>{t}</button>)}</nav>
<div style={{padding:18,overflowY:"auto",overflowX:"hidden",flex:1,minWidth:0,width:"100%",boxSizing:"border-box",fontSize:12}}>
{detailLoading&&<p style={{textAlign:"center",padding:40,color:"#64748b"}}>正在加载详情记录…</p>}
{!detailLoading&&!detail&&<p style={{textAlign:"center",padding:40,color:"#dc2626"}}>详情加载失败，请关闭后重新打开。</p>}
{detail&&detailTab==="基本信息"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>{[["目标手机号",detail.phone.number],["任务账号",detail.claim?.user.phone??"—"],["打开 WhatsApp",detail.openWhatsAppAt?new Date(detail.openWhatsAppAt).toLocaleString("zh-CN",{hour12:false}):"—"],["操作时间",new Date(detail.createdAt).toLocaleString("zh-CN",{hour12:false})],["补图截止时间",detail.supplementDeadlineAt?new Date(detail.supplementDeadlineAt).toLocaleString("zh-CN",{hour12:false}):"—"],["补图请求时间",detail.supplementRequestedAt?new Date(detail.supplementRequestedAt).toLocaleString("zh-CN",{hour12:false}):"—"],["任务名称",detail.task.title],["用户ID",detail.claim?.user.id??"—"],["领取状态",detail.claim?.status??"—"],["设备摘要","当前数据未关联设备信息"],["芯片/ABI","—"],["安全补丁","—"],["奖励金额",detail.rewardAmount+" "+detail.currency]].map(([k,v])=><div key={k}><div style={{color:"#64748b",marginBottom:5}}>{k}</div><div style={{overflowWrap:"anywhere"}}>{v}</div></div>)}</div>}
{detail&&detailTab==="行为链路"&&<div style={{display:"grid",gap:14}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",columnGap:20,rowGap:16}}>{[["打开结果",detail.openInfo.result],["WhatsApp 已安装",detail.openInfo.whatsappInstalled===null?"—":detail.openInfo.whatsappInstalled?"是":"否"],["已跳过打开步骤",detail.openInfo.skippedSteps===null?"—":detail.openInfo.skippedSteps?"是":"否"],["跳过原因",detail.openInfo.skipReason??"—"],["目标包名",detail.openInfo.targetPackage??"—"],["Intent 类型",detail.openInfo.intentType??"—"]].map(([k,v])=><div key={k}><div style={{color:"#64748b",marginBottom:5}}>{k}</div><div style={{overflowWrap:"anywhere"}}>{v}</div></div>)}</div><div style={{display:"grid",gap:9}}>{detail.behavior.length?detail.behavior.map((ev,i)=><div key={i} style={{border:"1px solid #dbe3ef",borderRadius:6,padding:12,minWidth:0,width:"100%",boxSizing:"border-box",overflow:"hidden"}}><div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(120px,auto)",alignItems:"start",columnGap:12,rowGap:5}}><strong style={{minWidth:0,overflowWrap:"anywhere"}}>{ev.title}</strong><time style={{color:"#64748b",textAlign:"right",whiteSpace:"normal",overflowWrap:"anywhere",fontVariantNumeric:"tabular-nums"}}>{new Date(ev.at).toLocaleString("zh-CN",{hour12:false})}</time></div><p style={{color:"#64748b",marginBottom:0,overflowWrap:"anywhere"}}>{typeof ev.detail==="string"?ev.detail:JSON.stringify(ev.detail)}</p></div>):<EmptyDetail text="暂无行为链路记录"/>}</div></div>}
{detail&&detailTab==="证据截图"&&<div style={{display:"grid",gap:16}}>{detail.submissions.length?detail.submissions.map(s=><section key={s.id} style={{border:"1px solid #dbe3ef",borderRadius:7,overflow:"hidden"}}><div style={{padding:"14px 12px",background:"#f8fafc",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #dbe3ef"}}><strong>截图查看器</strong><div style={{display:"flex",gap:14,alignItems:"center"}}><button title="缩小" onClick={()=>setEvidenceZoom(z=>Math.max(.5,z-.1))} style={{border:0,background:"transparent",cursor:"pointer"}}>⌕−</button><button title="放大" onClick={()=>setEvidenceZoom(z=>Math.min(2,z+.1))} style={{border:0,background:"transparent",cursor:"pointer"}}>⌕＋</button><button title="重置" onClick={()=>setEvidenceZoom(1)} style={{border:0,background:"transparent",cursor:"pointer"}}>↻</button><button title="新窗口打开" onClick={()=>window.open(s.evidenceUrl,"_blank","noopener,noreferrer")} style={{border:0,background:"transparent",cursor:"pointer"}}>↗</button></div></div><div style={{padding:14,background:"#f8fafc",textAlign:"center",minHeight:420,maxHeight:640,overflow:"auto"}}>{s.mimeType?.startsWith("image/")?<img src={s.evidenceUrl} alt="任务截图" style={{maxWidth:"100%",maxHeight:600,objectFit:"contain",transform:"scale("+evidenceZoom+")",transformOrigin:"center top",transition:"transform .15s"}}/>:<span>暂无可预览图片</span>}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",background:"#f8fafc",borderTop:"1px solid #dbe3ef"}}><div style={{padding:12,borderRight:"1px solid #dbe3ef"}}><div style={{color:"#64748b",fontSize:12}}>截图 hash</div><div style={{overflowWrap:"anywhere",marginTop:5}}>{s.screenshotHash??"真实证据 Hash 读取中"}</div></div><div style={{padding:12}}><div style={{color:"#64748b",fontSize:12}}>上传时间</div><div style={{marginTop:5}}>{new Date(s.submittedAt).toLocaleString("zh-CN",{hour12:false})}</div></div></div><div style={{padding:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><div><div style={{color:"#64748b",fontSize:12}}>提交来源</div><div style={{marginTop:5}}>{Boolean(s.screenshotHash)?"APP 自动提交（测试模拟）":s.note??"APP 用户上传"}</div></div><div><div style={{color:"#64748b",fontSize:12}}>截图方式</div><div style={{marginTop:5}}>{Boolean(s.screenshotHash)?"APP 自动截图（测试模拟）":"APP 实际提交"}</div></div><div><div style={{color:"#64748b",fontSize:12}}>证据来源</div><div style={{marginTop:5}}>{Boolean(s.screenshotHash)?"测试账号演示证据":"APP 用户上传"}</div></div><div><div style={{color:"#64748b",fontSize:12}}>证据可信等级</div><div style={{marginTop:5}}>{Boolean(s.screenshotHash)?"测试展示 · 非真实评估":"待审核评估"}</div></div><div style={{gridColumn:"1 / -1"}}><div style={{color:"#64748b",fontSize:12}}>SHA-256</div><div style={{marginTop:5,overflowWrap:"anywhere"}}>{s.screenshotHash??"真实证据 Hash 将由服务器计算"}</div></div></div></section>):<EmptyDetail text="当前任务没有提交截图"/>}</div>}
{detail&&detailTab==="审核结果"&&<div style={{border:"1px solid #dbe3ef",borderRadius:7,padding:14,display:"grid",gap:14}}>{detail.submissions.length?detail.submissions.map(s=><div key={s.id} style={{display:"grid",gap:12}}><strong>审核结论与原因</strong><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><div><div style={{color:"#64748b",marginBottom:6}}>当前状态</div><span style={{display:"inline-block",border:"1px solid #a7f3d0",borderRadius:5,padding:"3px 8px",color:"#059669",background:"#ecfdf5"}}>{s.status==="APPROVED"?"已通过":s.status==="REJECTED"?"已拒绝":s.status==="UNDER_REVIEW"?"审核中":"待审核"}</span></div><div><div style={{color:"#64748b",marginBottom:6}}>AI 建议</div>{s.aiReview?.decision==="APPROVE"?"建议通过":s.aiReview?.decision==="REJECT"?"建议拒绝":"待分析"}</div></div><section style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6,padding:12}}><strong>任务话术</strong><p style={{color:"#64748b",fontSize:11,margin:"6px 0"}}>本条任务保存的话术，审核按此内容核对。</p><div style={{whiteSpace:"pre-wrap",lineHeight:1.65}}>{detail.task.messageTemplate??"当前任务未保存话术"}</div></section><div><div style={{color:"#64748b",marginBottom:6}}>AI 图像识别置信度</div>{s.aiReview?.confidence==null?"—":Math.round(s.aiReview.confidence*100)+"%"}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><section style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6,padding:12,minWidth:0}}><strong>AI 原始说明</strong><p style={{whiteSpace:"pre-wrap",lineHeight:1.65,marginBottom:0}}>{s.aiReview?.reason??"暂无 AI 审核说明"}</p>{s.aiReview?.extractedText&&<p style={{whiteSpace:"pre-wrap",color:"#64748b"}}>{s.aiReview.extractedText}</p>}</section><section style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6,padding:12,minWidth:0}}><strong>系统判定原因</strong><p style={{whiteSpace:"pre-wrap",lineHeight:1.65,marginBottom:0}}>{s.reviews.length?s.reviews[s.reviews.length-1].reason??"人工审核未填写原因":s.aiReview?.reason??"系统尚未生成判定原因。"}</p></section></div>{s.reviews.length>0&&<section><strong>人工审核记录</strong>{s.reviews.map((rv,i)=><div key={i} style={{padding:10,borderBottom:"1px solid #e2e8f0"}}>{rv.decision==="APPROVE"?"审核通过":"审核拒绝"} · {rv.reviewer}<p style={{color:"#64748b",marginBottom:0}}>{new Date(rv.reviewedAt).toLocaleString("zh-CN",{hour12:false})} · {rv.reason??"—"}</p></div>)}</section>}</div>):<EmptyDetail text="当前任务没有审核记录"/>}</div>}
{detail&&detailTab==="风险记录"&&<div style={{display:"grid",gap:14}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",columnGap:16,rowGap:14}}><div><div style={{color:"#64748b",marginBottom:5}}>风险等级</div><strong style={{display:"inline-block",padding:"3px 8px",border:"1px solid #a7f3d0",borderRadius:6,color:"#059669",background:"#ecfdf5",fontSize:12}}>{detail.risk.level}</strong></div><div><div style={{color:"#64748b",marginBottom:5}}>风险分</div><strong>{detail.risk.score??"未计算"}</strong></div><div style={{gridColumn:"1 / -1"}}><div style={{color:"#64748b",marginBottom:5}}>未处理风险事件数</div><strong>{detail.risk.events.length}</strong></div></div><div><strong>风险原因说明</strong><p style={{fontSize:12,color:"#64748b",margin:"8px 0 12px"}}>共 {detail.risk.events.length} 项，请按每项事实和处理建议复核。</p>{detail.risk.events.length?detail.risk.events.map(ev=><div key={ev.id} style={{padding:"12px 0",borderTop:"1px solid #e2e8f0"}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{color:"#f97316"}}>⚠</span><strong>{typeof ev.metadata==="object"&&ev.metadata!==null&&"title" in ev.metadata?String((ev.metadata as {title?:unknown}).title??ev.action):ev.action}</strong><span style={{fontSize:11,color:"#ea580c",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:5,padding:"2px 7px"}}>需要核查</span></div><p style={{color:"#475569",whiteSpace:"pre-wrap",margin:"9px 0"}}>{typeof ev.metadata==="object"&&ev.metadata!==null&&"reason" in ev.metadata?String((ev.metadata as {reason?:unknown}).reason??"—"):typeof ev.metadata==="string"?ev.metadata:JSON.stringify(ev.metadata,null,2)}</p>{typeof ev.metadata==="object"&&ev.metadata!==null&&"recommendation" in ev.metadata&&<p style={{color:"#475569",whiteSpace:"pre-wrap",margin:"0 0 9px"}}>处理建议：{String((ev.metadata as {recommendation?:unknown}).recommendation??"—")}</p>}<div style={{fontSize:12,color:"#64748b"}}>{new Date(ev.createdAt).toLocaleString("zh-CN",{hour12:false})}</div></div>):<EmptyDetail text="当前没有关联的风险事件记录"/>}</div></div>}
{detail&&detailTab==="任务补发"&&<div style={{border:"1px solid #dbe3ef",borderRadius:7,minHeight:150,display:"grid",placeItems:"center",padding:22}}>{detail.supplements.length?<div style={{width:"100%"}}>{detail.supplements.map((item,i)=><div key={i} style={{padding:12,borderBottom:"1px solid #e2e8f0"}}><strong>{(item as {action?:string}).action??"补发记录"}</strong><p style={{color:"#64748b"}}>{new Date((item as {createdAt:string}).createdAt).toLocaleString("zh-CN",{hour12:false})}</p><pre style={{whiteSpace:"pre-wrap",fontSize:12}}>{JSON.stringify((item as {metadata?:unknown}).metadata,null,2)}</pre></div>)}</div>:<div style={{textAlign:"center",color:"#64748b"}}><PackageOpen size={30} style={{marginBottom:12,color:"#64748b"}}/><strong style={{display:"block",color:"#0f172a",marginBottom:10}}>当前任务没有补发记录</strong><span>只有命中自动补发规则的终态任务才会生成补发条目。</span></div>}</div>}
</div></aside></div>}
</main>
  </div>;
}
