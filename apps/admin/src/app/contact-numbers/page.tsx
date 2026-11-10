"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminSidebar from "../../components/AdminSidebar";
import { RefreshCw, Search, Upload, Plus, Trash2, Ban, History, CheckSquare, Square } from "lucide-react";

type NumberRow = {
  id: string; phoneE164: string; status: string; consentStatus: string;
  consentSource: string | null; countryCode: string | null; countryName: string | null;
  consentedAt: string | null; importedAt: string; importOrder: string;
  assignments: Array<{ claimId: string; userId: string; status: string; assignedAt: string }>;
};
type Summary = { total: number; available: number; assigned: number; used: number; blocked: number; batches: number };
type ImportHistory = { total: number; page: number; pageSize: number; records: Array<{
  id: string; fileName: string; status: string; importedCount: number; duplicateCount: number;
  invalidCount: number; totalRows: number; updatedAt: string; operator: string;
}> };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: {
    ...(init?.headers || {}), ...(init?.body ? { "Content-Type": "application/json" } : {}),
  } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "请求失败");
  return data as T;
}
const inputStyle: React.CSSProperties = { height: 36, padding: "0 10px", border: "1px solid #dbe3ed", borderRadius: 6, background: "#fff", color: "#344054", minWidth: 0 };
const buttonStyle: React.CSSProperties = { height: 34, padding: "0 11px", border: "1px solid #dbe3ed", borderRadius: 6, background: "#fff", color: "#344054", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 };
const primaryStyle: React.CSSProperties = { ...buttonStyle, background: "#2563eb", borderColor: "#2563eb", color: "#fff" };
const th: React.CSSProperties = { padding: "11px 10px", textAlign: "left", whiteSpace: "nowrap", fontWeight: 600, color: "#64748b", background: "#f8fafc" };
const td: React.CSSProperties = { padding: "11px 10px", whiteSpace: "nowrap", color: "#344054", borderBottom: "1px solid #edf1f6" };
const fmt = (v: string | null) => v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "—";
const statusText: Record<string,string> = { AVAILABLE: "可用", ASSIGNED: "已分配", USED: "已使用", BLOCKED: "已封禁" };

export default function ContactNumbersPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<Summary>({ total: 0, available: 0, assigned: 0, used: 0, blocked: 0, batches: 0 });
  const [rows, setRows] = useState<NumberRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [limit, setLimit] = useState(100);
  const [tab, setTab] = useState<"inventory" | "history">("inventory");
  const [history, setHistory] = useState<ImportHistory | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [numbersText, setNumbersText] = useState("");
  const [countryCode, setCountryCode] = useState("KE");
  const [countryName, setCountryName] = useState("肯尼亚");
  const [consentSource, setConsentSource] = useState("Admin confirmed valid consent");
  const [consentedAt, setConsentedAt] = useState(new Date().toISOString().slice(0,16));
  const [singlePhone, setSinglePhone] = useState("");
  const [showSingle, setShowSingle] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const load = useCallback(async () => {
    const [s, n] = await Promise.all([
      api<Summary>("/api/v1/admin/contact-numbers/summary"),
      api<{ numbers: NumberRow[] }>("/api/v1/admin/contact-numbers?limit=" + limit + "&search=" + encodeURIComponent(appliedSearch)),
    ]);
    setSummary(s); setRows(n.numbers); setSelected([]);
  }, [limit, appliedSearch]);

  const loadHistory = useCallback(async () => {
    setHistory(await api<ImportHistory>("/api/v1/admin/contact-numbers/import-history?page=" + historyPage + "&pageSize=20"));
  }, [historyPage]);

  useEffect(() => {
    api<{id:string}>("/api/v1/admin-auth/me").then(() => setAuthenticated(true))
      .catch(() => setError("登录状态已失效，请重新登录。"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (authenticated) load().catch(e => setError(e.message)); }, [authenticated, load]);
  useEffect(() => { if (authenticated && tab === "history") loadHistory().catch(e => setError(e.message)); }, [authenticated, tab, loadHistory]);

  const parsedPhones = useMemo(() => numbersText.split(/[\s,，;；]+/).map(v => v.trim()).filter(Boolean), [numbersText]);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(success); await load(); if (tab === "history") await loadHistory(); }
    catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(false); }
  };
  const importNumbers = () => run(async () => {
    if (!parsedPhones.length) throw new Error("请先粘贴要导入的号码。");
    if (!consentSource.trim()) throw new Error("请填写授权来源。");
    await api("/api/v1/admin/contact-numbers/import", { method: "POST", body: JSON.stringify({
      numbers: parsedPhones.map(phone => ({ phone })), countryCode: countryCode.trim().toUpperCase(),
      countryName: countryName.trim(), consentSource: consentSource.trim(),
      consentedAt: new Date(consentedAt).toISOString(), fileName: "后台粘贴导入",
    }) });
    setNumbersText(""); setShowImport(false);
  }, "号码导入完成。");
  const addSingle = () => run(async () => {
    if (!consentConfirmed) throw new Error("请先确认已取得号码持有人的有效授权。");
    await api("/api/v1/admin/contact-numbers/single", { method: "POST", body: JSON.stringify({
      phone: singlePhone, countryCode, countryName, consentConfirmed,
    }) });
    setSinglePhone(""); setConsentConfirmed(false); setShowSingle(false);
  }, "号码添加成功。");
  const deleteSelected = () => {
    if (!selected.length || !window.confirm("确定删除选中的 " + selected.length + " 条号码吗？正在执行任务的号码会被后端拒绝删除。")) return;
    void run(() => api("/api/v1/admin/contact-numbers/sampling-numbers", { method: "DELETE", body: JSON.stringify({ ids: selected }) }), "选中号码已删除。");
  };
  const clearAll = () => {
    if (!window.confirm("确定清空全部号码池吗？此操作不可撤销，正在执行任务的号码会导致清空失败。")) return;
    void run(() => api("/api/v1/admin/contact-numbers/sampling-numbers/all", { method: "DELETE" }), "号码池已清空。");
  };
  const blockNumber = (row: NumberRow) => {
    if (!window.confirm("确定封禁 " + row.phoneE164 + " 并撤销其授权吗？")) return;
    void run(() => api("/api/v1/admin/contact-numbers/" + row.id + "/block", { method: "POST" }), "号码已封禁并撤销授权。");
  };

  if (loading) return <main style={{ padding: 32 }}>正在加载号码池…</main>;
  if (!authenticated) return <main style={{ padding: 32, color: "#dc2626" }}>{error || "请先登录"}</main>;
  return <div className="dashboard-app" style={{ minHeight: "100vh" }}>
    <AdminSidebar />
    <main className="dashboard-main" style={{ minWidth: 0, padding: 0 }}>
      <header className="dashboard-topbar"><strong style={{ color: "#344054", fontSize: 14 }}>号码池管理</strong><span style={{ marginLeft: "auto", color: "#64748b", fontSize: 12 }}>授权号码库存与导入记录</span></header>
      <div style={{ padding: "18px 20px 28px", display: "grid", gap: 14 }}>
        {error && <div role="alert" style={{ padding: 11, borderRadius: 6, color: "#b91c1c", background: "#fef2f2", fontSize: 12 }}>{error}</div>}
        {notice && <div role="status" style={{ padding: 11, borderRadius: 6, color: "#047857", background: "#ecfdf5", fontSize: 12 }}>{notice}</div>}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 10 }}>
          {([["号码总数",summary.total],["可用号码",summary.available],["已分配",summary.assigned],["已使用",summary.used],["已封禁",summary.blocked],["导入批次",summary.batches]] as Array<[string,number]>).map(([label,value]) =>
            <div key={label} style={{ padding: 15, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}><div style={{ color: "#64748b", fontSize: 12 }}>{label}</div><strong style={{ display: "block", marginTop: 7, fontSize: 23, color: "#111827" }}>{value.toLocaleString()}</strong></div>)}
        </section>
        <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button style={{ ...buttonStyle, ...(tab === "inventory" ? { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" } : {}) }} onClick={() => setTab("inventory")}>号码库存</button>
            <button style={{ ...buttonStyle, ...(tab === "history" ? { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" } : {}) }} onClick={() => setTab("history")}><History size={14}/>导入历史</button>
            <span style={{ flex: 1 }}/>
            <button style={primaryStyle} disabled={busy} onClick={() => setShowImport(v => !v)}><Upload size={14}/>批量导入</button>
            <button style={buttonStyle} disabled={busy} onClick={() => setShowSingle(v => !v)}><Plus size={14}/>单条添加</button>
            <button style={buttonStyle} disabled={busy} onClick={() => load().catch(e => setError(e.message))}><RefreshCw size={14}/>刷新</button>
          </div>
          {showImport && <div style={{ marginTop: 14, padding: 14, border: "1px solid #dbeafe", borderRadius: 8, background: "#f8fbff", display: "grid", gap: 10 }}>
            <strong style={{ fontSize: 13 }}>批量导入号码</strong>
            <textarea value={numbersText} onChange={e => setNumbersText(e.target.value)} placeholder="每行一个号码，也支持逗号、分号分隔；请包含国家区号，例如 +2547XXXXXXXX" rows={5} style={{ ...inputStyle, height: "auto", padding: 10, resize: "vertical" }}/>
            <div style={{ color: "#64748b", fontSize: 11 }}>识别到 {parsedPhones.length} 条号码；单次最多 5000 条。无效号码和重复号码会自动统计。</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}>
              <input style={inputStyle} value={countryCode} onChange={e => setCountryCode(e.target.value)} placeholder="国家代码，如 KE"/>
              <input style={inputStyle} value={countryName} onChange={e => setCountryName(e.target.value)} placeholder="国家名称"/>
              <input style={inputStyle} value={consentSource} onChange={e => setConsentSource(e.target.value)} placeholder="授权来源/证明"/>
              <input style={inputStyle} type="datetime-local" value={consentedAt} onChange={e => setConsentedAt(e.target.value)}/>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button style={buttonStyle} onClick={() => setShowImport(false)}>取消</button><button style={primaryStyle} disabled={busy || !parsedPhones.length || parsedPhones.length > 5000} onClick={importNumbers}>{busy ? "处理中…" : "确认导入"}</button></div>
          </div>}
          {showSingle && <div style={{ marginTop: 14, padding: 14, border: "1px solid #e2e8f0", borderRadius: 8, display: "grid", gap: 9 }}>
            <strong style={{ fontSize: 13 }}>单条添加号码</strong>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
              <input style={inputStyle} value={singlePhone} onChange={e => setSinglePhone(e.target.value)} placeholder="完整国际号码，例如 +2547XXXXXXXX"/>
              <input style={inputStyle} value={countryCode} onChange={e => setCountryCode(e.target.value)} placeholder="国家代码"/>
              <input style={inputStyle} value={countryName} onChange={e => setCountryName(e.target.value)} placeholder="国家名称"/>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#475569" }}><input type="checkbox" checked={consentConfirmed} onChange={e => setConsentConfirmed(e.target.checked)}/>我确认已取得号码持有人的有效授权。</label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button style={buttonStyle} onClick={() => setShowSingle(false)}>取消</button><button style={primaryStyle} disabled={busy || !consentConfirmed || !singlePhone.trim()} onClick={addSingle}>确认添加</button></div>
          </div>}
        </section>
        {tab === "inventory" ? <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ position: "relative", flex: "1 1 260px" }}><Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#94a3b8" }}/><input style={{ ...inputStyle, width: "100%", paddingLeft: 30 }} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if(e.key === "Enter") setAppliedSearch(search.trim()); }} placeholder="按号码搜索"/></div>
            <select style={inputStyle} value={limit} onChange={e => setLimit(Number(e.target.value))}><option value={50}>50 条</option><option value={100}>100 条</option><option value={200}>200 条</option></select>
            <button style={primaryStyle} onClick={() => setAppliedSearch(search.trim())}>搜索</button>
            <button style={buttonStyle} onClick={() => {setSearch("");setAppliedSearch("");}}>重置</button>
            <button style={buttonStyle} disabled={!selected.length || busy} onClick={deleteSelected}><Trash2 size={14}/>删除选中 ({selected.length})</button>
            <button style={{ ...buttonStyle, color: "#b91c1c" }} disabled={busy || !summary.total} onClick={clearAll}>清空号码池</button>
          </div>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr>{["选择","号码","国家","号码状态","授权状态","授权来源","授权时间","导入时间","最近任务领取","操作"].map(v => <th key={v} style={th}>{v}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}>
              <td style={td}><button aria-label="选择号码" onClick={() => setSelected(s => s.includes(row.id) ? s.filter(x => x !== row.id) : [...s,row.id])} style={{ border: 0, background: "transparent", cursor: "pointer" }}>{selected.includes(row.id) ? <CheckSquare size={16}/> : <Square size={16}/>}</button></td>
              <td style={td}>{row.phoneE164}</td><td style={td}>{row.countryName || row.countryCode || "—"}</td>
              <td style={td}>{statusText[row.status] || row.status}</td><td style={td}>{row.consentStatus === "GRANTED" ? "已授权" : row.consentStatus === "REVOKED" ? "已撤销" : row.consentStatus}</td>
              <td style={{ ...td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }} title={row.consentSource || ""}>{row.consentSource || "—"}</td>
              <td style={td}>{fmt(row.consentedAt)}</td><td style={td}>{fmt(row.importedAt)}</td>
              <td style={td}>{row.assignments[0] ? fmt(row.assignments[0].assignedAt) : "—"}</td>
              <td style={td}>{row.status !== "BLOCKED" && <button style={{ ...buttonStyle, height: 28, color: "#b91c1c" }} disabled={busy} onClick={() => blockNumber(row)}><Ban size={13}/>封禁</button>}</td>
            </tr>)}</tbody>
          </table>{!rows.length && <div style={{ textAlign: "center", padding: 50, color: "#94a3b8" }}>暂无号码记录</div>}</div>
          <div style={{ marginTop: 10, color: "#94a3b8", fontSize: 11 }}>当前显示 {rows.length} 条，最多显示 {limit} 条；此列表按导入顺序展示。</div>
        </section> : <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 850, borderCollapse: "collapse", fontSize: 12 }}><thead><tr>{["导入批次","文件/来源","状态","总行数","成功导入","重复","无效","操作人","时间"].map(v => <th key={v} style={th}>{v}</th>)}</tr></thead>
            <tbody>{history?.records.map(r => <tr key={r.id}><td style={td}>{r.id.slice(0,8)}</td><td style={td}>{r.fileName}</td><td style={td}>{r.status === "SUCCESS" ? "成功" : "无新增号码"}</td><td style={td}>{r.totalRows}</td><td style={td}>{r.importedCount}</td><td style={td}>{r.duplicateCount}</td><td style={td}>{r.invalidCount}</td><td style={td}>{r.operator}</td><td style={td}>{fmt(r.updatedAt)}</td></tr>)}</tbody>
          </table>{!history?.records.length && <div style={{ textAlign: "center", padding: 45, color: "#94a3b8" }}>暂无导入记录</div>}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, paddingTop: 12, fontSize: 12 }}><span>共 {history?.total ?? 0} 条</span><button style={buttonStyle} disabled={historyPage <= 1} onClick={() => setHistoryPage(p => Math.max(1,p-1))}>上一页</button><span>第 {historyPage} 页</span><button style={buttonStyle} disabled={!history || historyPage * history.pageSize >= history.total} onClick={() => setHistoryPage(p => p+1)}>下一页</button></div>
        </section>}
      </div>
    </main>
  </div>;
}
