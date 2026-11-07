"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminSidebar from "../../components/AdminSidebar";
import { Bell, CircleHelp, Eye, RefreshCw, Search, UserRound, Languages, ChevronLeft, ChevronRight } from "lucide-react";

type Status = "AVAILABLE" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CLOSED" | "FROZEN" | "VOIDED";
type RecordItem = {
  id: string; taskId: string; taskStatus: string; taskName: string; category: string;
  phoneNumber: string; groupName: string; rewardAmount: string; currency: string;
  messageTemplate: string; countryRegion: string; status: Status; createdAt: string;
  claimId: string | null; claimedAt: string | null; claimedUserId: string | null;
};
type Data = { items: RecordItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number };
  stats: { total: number; available: number; inProgress: number; review: number; completed: number; closed: number; frozen: number; voided: number } };

async function api<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "数据加载失败");
  return data as T;
}
const statusLabel: Record<Status, string> = {
  AVAILABLE: "可领取", IN_PROGRESS: "进行中", REVIEW: "审核中", COMPLETED: "已结算",
  CLOSED: "已关闭", FROZEN: "已冻结", VOIDED: "已作废",
};
const statusColors: Record<Status, { color: string; bg: string; border: string }> = {
  AVAILABLE: { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  IN_PROGRESS: { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  REVIEW: { color: "#d97706", bg: "#fff7ed", border: "#fed7aa" },
  COMPLETED: { color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  CLOSED: { color: "#64748b", bg: "#f8fafc", border: "#cbd5e1" },
  FROZEN: { color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  VOIDED: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};
const filters: Array<{ key: "ALL" | Status; label: string }> = [
  { key: "ALL", label: "全部" }, { key: "AVAILABLE", label: "可领取" },
  { key: "IN_PROGRESS", label: "进行中" }, { key: "REVIEW", label: "审核中" },
  { key: "COMPLETED", label: "已完成" }, { key: "CLOSED", label: "已关闭" },
  { key: "FROZEN", label: "已冻结" }, { key: "VOIDED", label: "已作废" },
];
const fmt = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });

export default function TaskSettingsListPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<RecordItem[]>([]);
  const [stats, setStats] = useState<Data["stats"]>({ total: 0, available: 0, inProgress: 0, review: 0, completed: 0, closed: 0, frozen: 0, voided: 0 });
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [status, setStatus] = useState<"ALL" | Status>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [detail, setDetail] = useState<RecordItem | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), keyword: appliedKeyword, status });
    const result = await api<Data>("/api/v1/admin/tasks/records?" + params.toString());
    setItems(result.items);
    setStats(result.stats);
    setTotal(result.pagination.total);
    setTotalPages(Math.max(1, result.pagination.totalPages));
  }, [page, pageSize, appliedKeyword, status]);

  useEffect(() => {
    api<{ id: string }>("/api/v1/admin-auth/me").then(() => setAuthenticated(true))
      .catch(() => setError("登录状态已失效，请重新登录。"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (authenticated) load().catch((e) => setError(e instanceof Error ? e.message : "任务列表加载失败")); }, [authenticated, load]);

  const cards = useMemo(() => [
    { title: "任务总数", value: stats.total, note: "当前筛选范围", color: "#2563eb", icon: "☷", key: "ALL" as const },
    { title: "待使用", value: stats.available, note: "未领取号码", color: "#3b82f6", icon: "◷", key: "AVAILABLE" as const },
    { title: "已领取", value: stats.inProgress, note: "正在执行任务", color: "#f97316", icon: "♙", key: "IN_PROGRESS" as const },
    { title: "已使用", value: stats.completed, note: "已提交或已结算", color: "#10b981", icon: "⇥", key: "COMPLETED" as const },
    { title: "待审核", value: stats.review, note: "执行状态为审核中", color: "#f97316", icon: "◉", key: "REVIEW" as const },
    { title: "异常任务", value: stats.closed + stats.frozen + stats.voided, note: "需关注状态", color: "#f43f5e", icon: "△", key: "CLOSED" as const },
  ], [stats]);

  const runSearch = () => { setPage(1); setAppliedKeyword(keyword.trim()); };
  const reset = () => { setKeyword(""); setAppliedKeyword(""); setStatus("ALL"); setPage(1); };

  if (loading) return <main style={{ padding: 32 }}>正在加载任务列表…</main>;
  if (!authenticated) return <main style={{ padding: 32, color: "#dc2626" }}>{error || "请先登录"}</main>;

  return <div className="dashboard-app" style={{ minHeight: "100vh" }}>
    <AdminSidebar />
    <main className="dashboard-main" style={{ minWidth: 0, padding: 0 }}>
      <header className="dashboard-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#64748b" }}><span style={{ fontSize: 20 }}>☰</span></div>
        <div className="topbar-search"><Search size={15}/><input placeholder="搜索任务、用户、手机号码…" /></div>
        <div className="topbar-actions"><Languages size={16}/><CircleHelp size={18}/><span style={{ position: "relative" }}><Bell size={18}/></span><span className="profile-avatar"><UserRound size={17}/></span><strong style={{ fontSize: 11 }}>Administrator</strong></div>
      </header>

      <div style={{ padding: "12px 16px 22px", display: "grid", gap: 12 }}>
        <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "nowrap", minWidth: 0 }}>
            <div style={{ position: "relative", flex: "1 1 240px", minWidth: 150 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#94a3b8" }}/>
              <input value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") runSearch(); }} placeholder="搜索任务、号码、用户或编号" style={inputStyle}/>
            </div>
            <select style={selectStyle}><option>全部使用阶段</option><option>未使用</option><option>已使用</option></select>
            <select style={selectStyle}><option>全部执行状态</option>{filters.slice(1).map(f => <option key={f.key}>{f.label}</option>)}</select>
            <input placeholder="任务编号" style={{ ...inputStyle, width: 112, flex: "0 1 112px" }}/>
            <input placeholder="国家" style={{ ...inputStyle, width: 90, flex: "0 1 90px" }}/>
            <select style={selectStyle}><option>全部审核结果</option><option>已通过</option><option>待审核</option><option>已拒绝</option></select>
            <button onClick={runSearch} style={primaryButton}>搜索</button>
            <button onClick={reset} style={buttonStyle}>重置</button>
            <button onClick={() => load().catch(e => setError(e.message))} style={buttonStyle} title="刷新"><RefreshCw size={14}/></button>
            <button style={buttonStyle}>▥ 显示列</button>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 10 }}>
          {cards.map(card => <button key={card.title} onClick={() => { setStatus(card.key); setPage(1); }} style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, minHeight: 82, padding: "12px 14px", textAlign: "left", border: status === card.key ? "1px solid #2563eb" : "1px solid #e2e8f0", borderRadius: 7, background: "#fff", cursor: "pointer" }}>
            <span style={{ width: 38, height: 38, flex: "0 0 38px", display: "grid", placeItems: "center", borderRadius: "50%", color: card.color, background: card.color + "12", fontSize: 19 }}>{card.icon}</span>
            <span style={{ minWidth: 0 }}><small style={{ display: "block", color: "#718096", fontSize: 11 }}>{card.title}</small><strong style={{ display: "block", marginTop: 2, color: "#111827", fontSize: 22, lineHeight: 1.15 }}>{card.value.toLocaleString()}</strong><small style={{ display: "block", marginTop: 3, color: "#94a3b8", fontSize: 10, whiteSpace: "nowrap" }}>{card.note}</small></span>
          </button>)}
        </section>

        <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, minHeight: "calc(100vh - 260px)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", paddingBottom: 9 }}>
            <div style={{ display: "flex", gap: 2, overflowX: "auto", flex: 1, minWidth: 300, background: "#f1f5f9", borderRadius: 6, padding: 3 }}>
              {filters.map(f => <button key={f.key} onClick={() => { setStatus(f.key); setPage(1); }} style={{ border: 0, borderRadius: 5, padding: "7px 10px", whiteSpace: "nowrap", background: status === f.key ? "#2563eb" : "transparent", color: status === f.key ? "#fff" : "#475569", cursor: "pointer", fontSize: 11 }}>{f.label}</button>)}
            </div>
            <button onClick={runSearch} style={primaryButton}>搜索</button>
            <button onClick={reset} style={buttonStyle}>重置</button>
            <button onClick={() => load().catch(e => setError(e.message))} style={buttonStyle}><RefreshCw size={14}/></button>
          </div>
          {error && <p style={{ color: "#dc2626", fontSize: 12 }}>{error}</p>}
          <div style={{ overflow: "auto", flex: 1 }}>
            <table style={{ width: "100%", minWidth: 1160, borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ background: "#f8fafc", color: "#64748b", textAlign: "left" }}>
                {["任务","平台 / 动作","国家 / 地区","目标号码","使用阶段","执行状态","领取用户","领取时间","审核结果","更新时间","话术","奖励金额","操作"].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>{items.map(item => <tr key={item.id} style={{ borderBottom: "1px solid #edf1f6" }}>
                <td style={tdStyle} title={item.taskName}>{item.taskName}</td>
                <td style={tdStyle}>{item.category || "WhatsApp 私信"}</td>
                <td style={tdStyle}>{item.countryRegion || "—"}</td>
                <td style={tdStyle}>{item.phoneNumber || "—"}</td>
                <td style={tdStyle}><span style={pill("#ecfdf5", "#059669", "#a7f3d0")}>{item.status === "COMPLETED" ? "已使用" : item.status === "AVAILABLE" ? "待使用" : "已分配"}</span></td>
                <td style={tdStyle}><span style={pill(statusColors[item.status].bg, statusColors[item.status].color, statusColors[item.status].border)}>{statusLabel[item.status]}</span></td>
                <td style={tdStyle}>{item.claimedUserId || "—"}</td>
                <td style={tdStyle}>{item.claimedAt ? fmt(item.claimedAt) : "—"}</td>
                <td style={tdStyle}>{item.status === "COMPLETED" ? "已通过" : item.status === "REVIEW" ? "待审核" : item.status === "VOIDED" ? "已拒绝" : "—"}</td>
                <td style={tdStyle}>{fmt(item.createdAt)}</td>
                <td style={{ ...tdStyle, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }} title={item.messageTemplate}>{item.messageTemplate || "—"}</td>
                <td style={tdStyle}>{item.rewardAmount} {item.currency}</td>
                <td style={tdStyle}><button onClick={() => setDetail(item)} style={{ border: 0, background: "transparent", color: "#2563eb", cursor: "pointer" }}><Eye size={13} style={{ verticalAlign: "middle", marginRight: 3 }}/>查看</button></td>
              </tr>)}</tbody>
            </table>
            {!items.length && <div style={{ textAlign: "center", padding: 65, color: "#94a3b8" }}>暂无任务记录</div>}
          </div>
          <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, color: "#718096", fontSize: 11 }}>
            <span>共 {total.toLocaleString()} 条</span>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={buttonStyle}><ChevronLeft size={14}/></button>
              <span>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={buttonStyle}><ChevronRight size={14}/></button>
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ ...selectStyle, minWidth: 75 }}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select>
            </div>
          </footer>
        </section>
      </div>
      {detail && <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "#0f172a44" }}>
        <aside onClick={e => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "min(520px,95vw)", background: "#fff", padding: 22, overflow: "auto", boxShadow: "-8px 0 24px #0f172a22" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 style={{ fontSize: 18, margin: 0 }}>任务记录详情</h2><button onClick={() => setDetail(null)} style={buttonStyle}>关闭</button></div>
          <dl style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, marginTop: 22, fontSize: 13 }}>
            {([["任务",detail.taskName],["平台 / 动作",detail.category],["目标号码",detail.phoneNumber],["国家 / 地区",detail.countryRegion],["任务组",detail.groupName],["执行状态",statusLabel[detail.status]],["领取用户",detail.claimedUserId || "—"],["领取时间",detail.claimedAt ? fmt(detail.claimedAt) : "—"],["话术",detail.messageTemplate || "—"],["奖励金额",detail.rewardAmount + " " + detail.currency],["创建时间",fmt(detail.createdAt)]] as Array<[string,string]>).map(([k,v]) => <div key={k} style={{ display: "contents" }}><dt style={{ color: "#718096" }}>{k}</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{v}</dd></div>)}
          </dl>
        </aside>
      </div>}
    </main>
  </div>;
}

const inputStyle: React.CSSProperties = { width: "100%", minWidth: 0, height: 31, padding: "0 10px 0 30px", border: "1px solid #dbe3ed", borderRadius: 6, background: "#fff", color: "#344054", fontSize: 11, outlineColor: "#2563eb" };
const selectStyle: React.CSSProperties = { minWidth: 105, height: 31, padding: "0 8px", border: "1px solid #dbe3ed", borderRadius: 6, background: "#fff", color: "#344054", fontSize: 11 };
const buttonStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 31, padding: "0 10px", border: "1px solid #dbe3ed", borderRadius: 6, background: "#fff", color: "#344054", fontSize: 11, cursor: "pointer" };
const primaryButton: React.CSSProperties = { ...buttonStyle, borderColor: "#2864ed", background: "#2864ed", color: "#fff", padding: "0 13px" };
const thStyle: React.CSSProperties = { padding: "10px 8px", fontWeight: 600, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "10px 8px", color: "#344054", whiteSpace: "nowrap", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis" };
function pill(background: string, color: string, borderColor: string): React.CSSProperties { return { display: "inline-block", padding: "3px 7px", borderRadius: 5, background, color, border: "1px solid " + borderColor, whiteSpace: "nowrap" }; }
