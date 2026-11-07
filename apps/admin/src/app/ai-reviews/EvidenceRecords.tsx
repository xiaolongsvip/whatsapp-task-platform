"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, CircleHelp, Search, UserRound, RefreshCw, Filter, Columns3, ChevronLeft, ChevronRight, X } from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";

type EvidenceRecord = {
  id: string; userPhone: string; targetPhone: string | null; status: string;
  retentionStatus: string; source: string; reviewStatus: string; submittedAt: string;
  originalName: string | null; mimeType: string | null; sizeBytes: number | null; taskTitle: string;
};
type EvidenceResponse = {
  page: number; pageSize: number; total: number;
  stats: { total: number; filtered: number; markedForDeletion: number; deletedObjects: number; deleteFailures: number };
  records: EvidenceRecord[];
};
const empty: EvidenceResponse = { page: 1, pageSize: 20, total: 0, stats: { total: 0, filtered: 0, markedForDeletion: 0, deletedObjects: 0, deleteFailures: 0 }, records: [] };
const tabs = [{ key: "ALL", label: "全部" }, { key: "URL_ISSUED", label: "已签发上传地址" }, { key: "SUBMITTED", label: "已提交" }];
const fmt = (v: string) => new Date(v).toLocaleString("zh-CN", { hour12: false });
const bytes = (n: number | null) => n == null ? "—" : n < 1024 ? n + " B" : (n / 1024).toFixed(1) + " KB";

export default function EvidenceRecords() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("ALL");
  const [taskType, setTaskType] = useState("TASK");
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<EvidenceResponse>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<EvidenceRecord | null>(null);
  const [showColumns, setShowColumns] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status: tab, taskType });
      if (query) params.set("keyword", query);
      const response = await fetch("/api/v1/admin/ai-reviews/evidence?" + params.toString(), { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "读取截图证据失败");
      setData(body as EvidenceResponse);
    } catch (e) { setError(e instanceof Error ? e.message : "读取截图证据失败"); }
    finally { setLoading(false); }
  }, [page, pageSize, query, tab, taskType]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (searchParams.get("view") !== "evidence") return; }, [searchParams]);
  const pages = Math.max(1, Math.ceil(data.total / pageSize));
  const statCards = [
    ["证据总数", data.stats.total, "来自真实提交记录分页总数", "#2864ed"],
    ["当前筛选", data.stats.filtered, "本页筛选返回条数", "#2864ed"],
    ["已归档待删除", data.stats.markedForDeletion, "保留 90 天后处理", "#64748b"],
    ["对象已删除", data.stats.deletedObjects, "业务证据与识别元数据保留", "#10b981"],
    ["删除失败", data.stats.deleteFailures, "可由授权管理员重新排队删除", "#64748b"],
  ];
  return <div className="dashboard-app">
    <AdminSidebar />
    <section className="dashboard-main">
      <header className="dashboard-topbar">
        <div className="topbar-search"><Search size={16}/><input placeholder="搜索任务、用户、手机号码..." readOnly/></div>
        <div className="topbar-actions"><span className="topbar-language">文</span><button className="topbar-icon" title="帮助"><CircleHelp size={19}/></button><button className="topbar-icon" title="通知"><Bell size={19}/><i/></button><div className="admin-profile"><span className="profile-avatar"><UserRound size={18}/></span><span><strong>Administrator</strong><small>超级管理员</small></span></div></div>
      </header>
      <div className="dashboard-content evidence-page">
        <section className="evidence-toolbar">
          <select value={taskType} onChange={e => { setTaskType(e.target.value); setPage(1); }}><option value="TASK">任务</option><option value="ALL">全部类型</option></select>
          <input value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { setQuery(keyword.trim()); setPage(1); } }} placeholder="输入完整标识或手机号"/>
          <div className="evidence-tabs">{tabs.map(t => <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => { setTab(t.key); setPage(1); }}>{t.label}</button>)}</div>
          <button className="evidence-primary" onClick={() => { setQuery(keyword.trim()); setPage(1); }}><Search size={14}/> 搜索</button>
          <button onClick={() => { setKeyword(""); setQuery(""); setTab("ALL"); setTaskType("TASK"); setPage(1); }}>重置</button>
          <button onClick={() => setShowColumns(v => !v)}><Columns3 size={14}/> 显示列</button>
          <button onClick={() => void load()} title="刷新"><RefreshCw size={14}/></button>
        </section>
        {showColumns && <div className="evidence-column-note">用户 · 目标手机号 · 状态 · 存储生命周期 · 证据来源 · 审核状态 · 提交时间 · 操作</div>}
        <section className="evidence-stats">{statCards.map(([label,value,desc,color]) => <article key={String(label)}><span className="evidence-stat-icon" style={{background:String(color)}}>{label === "证据总数" ? "▧" : label === "当前筛选" ? "⌕" : label === "对象已删除" ? "♲" : "▣"}</span><div><small>{label}</small><strong>{Number(value).toLocaleString()}</strong><p>{desc}</p></div></article>)}</section>
        {error && <div className="notice error">{error}</div>}
        <section className="evidence-table-card">
          <div className="evidence-table-scroll"><table className="evidence-table"><thead><tr><th>用户</th><th>目标手机号</th><th>状态</th><th>存储生命周期</th><th>证据来源</th><th>审核状态</th><th>提交时间</th><th>操作</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={8} className="evidence-empty">正在加载证据记录…</td></tr> : data.records.length === 0 ? <tr><td colSpan={8} className="evidence-empty">暂无截图证据</td></tr> : data.records.map(item => <tr key={item.id}>
            <td>{item.userPhone || "—"}</td><td>{item.targetPhone || "—"}</td>
            <td><span className="evidence-pill submitted">{item.status === "APPROVED" ? "已通过" : item.status === "REJECTED" ? "已拒绝" : "已提交"}</span></td>
            <td><span className="evidence-pill normal">正常</span></td><td>{item.source}</td>
            <td><span className={"evidence-pill " + (item.reviewStatus.includes("通过") ? "success" : item.reviewStatus.includes("复核") ? "warning" : "info")}>{item.reviewStatus}</span></td>
            <td>{fmt(item.submittedAt)}</td><td><button className="evidence-view" onClick={() => setPreview(item)}>查看</button></td>
          </tr>)}</tbody></table></div>
          <footer className="evidence-footer"><span>共 {data.total.toLocaleString()} 条</span><div><button disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)}><ChevronLeft size={15}/></button><span className="current">{page}</span><button disabled={page >= pages || loading} onClick={() => setPage(v => v + 1)}><ChevronRight size={15}/></button><select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select></div></footer>
        </section>
      </div>
    </section>
    {preview && <div className="evidence-preview-backdrop" onClick={() => setPreview(null)}><section className="evidence-preview" onClick={e => e.stopPropagation()}><header><div><strong>截图证据</strong><small>{preview.originalName || preview.id}</small></div><button onClick={() => setPreview(null)}><X size={18}/></button></header><div className="evidence-preview-image"><img src={"/api/v1/admin/task-submissions/" + preview.id + "/evidence"} alt="任务截图证据"/></div><dl><div><dt>提交用户</dt><dd>{preview.userPhone}</dd></div><div><dt>目标手机号</dt><dd>{preview.targetPhone || "—"}</dd></div><div><dt>文件大小</dt><dd>{bytes(preview.sizeBytes)}</dd></div><div><dt>提交时间</dt><dd>{fmt(preview.submittedAt)}</dd></div><div><dt>任务</dt><dd>{preview.taskTitle}</dd></div></dl></section></div>}
  </div>;
}
