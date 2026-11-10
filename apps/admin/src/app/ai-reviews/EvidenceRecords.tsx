"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CircleHelp, Search, UserRound, RefreshCw, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCw, Maximize2, ExternalLink } from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";

type EvidenceRecord = {
  id: string; userPhone: string; targetPhone: string | null; status: string;
  retentionStatus: string; retentionUntil?: string | null; deletionAttempts?: number; archivedAt?: string | null; nextRetryAt?: string | null; lastStorageError?: string | null; source: string; reviewStatus: string; submittedAt: string;
  originalName: string | null; mimeType: string | null; sizeBytes: number | null; taskTitle: string;
};
type EvidenceDetail = EvidenceRecord & {
  taskId: string; taskCategory: string; claimId: string; claimStatus: string;
  submissionStatus: string; captureMode: string; trustLevel: string;
  reviewDecision: string | null; reviewReason: string | null; reviewedAt: string | null;
  aiConfidence: number | null; aiReason: string | null; extractedText: string | null;
  note: string | null; objectKey: string;
  imageDimensions: string | null; contentHash: string | null;
  retentionUntil: string | null; deletionAttempts: number; archivedAt: string | null;
  nextRetryAt: string | null; lastStorageError: string | null;
};
type EvidenceResponse = {
  page: number; pageSize: number; total: number;
  stats: { total: number; filtered: number; markedForDeletion: number; deletedObjects: number; deleteFailures: number };
  records: EvidenceRecord[];
};
const empty: EvidenceResponse = { page: 1, pageSize: 20, total: 0, stats: { total: 0, filtered: 0, markedForDeletion: 0, deletedObjects: 0, deleteFailures: 0 }, records: [] };
const fmt = (v: string | null | undefined) => v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "—";
const retentionLabel = (v: string) => ({ NORMAL: "保留中", PENDING_DELETION: "待清理", DELETE_FAILED: "删除失败，等待重试", DELETED: "对象已删除" }[v] || v || "未知");
const bytes = (n: number | null) => n == null ? "—" : n < 1024 ? n + " B" : (n / 1024).toFixed(1) + " KB";
const field = (label: string, value: React.ReactNode) => <div className="evidence-detail-field"><span>{label}</span><strong>{value ?? "未记录"}</strong></div>;

export default function EvidenceRecords() {
  const [taskType, setTaskType] = useState("TASK");
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<EvidenceResponse>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<EvidenceRecord | null>(null);
  const [detail, setDetail] = useState<EvidenceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), taskType });
      if (query) params.set("keyword", query);
      const response = await fetch("/api/v1/admin/ai-reviews/evidence?" + params.toString(), { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "读取截图证据失败");
      setData(body as EvidenceResponse);
    } catch (e) { setError(e instanceof Error ? e.message : "读取截图证据失败"); }
    finally { setLoading(false); }
  }, [page, pageSize, query, taskType]);

  useEffect(() => { void load(); }, [load]);

  async function openDetail(item: EvidenceRecord) {
    setPreview(item); setDetail(null); setDetailError(""); setDetailLoading(true); setZoom(1); setRotation(0);
    try {
      const response = await fetch("/api/v1/admin/ai-reviews/evidence/" + item.id + "/detail", { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "读取证据详情失败");
      setDetail(body as EvidenceDetail);
    } catch (e) { setDetailError(e instanceof Error ? e.message : "读取证据详情失败"); }
    finally { setDetailLoading(false); }
  }

  const pages = Math.max(1, Math.ceil(data.total / pageSize));
  const statCards = [
    ["证据总数", data.stats.total, "来自真实提交记录分页总数", "#2864ed"],
    ["当前筛选", data.stats.filtered, "本页筛选返回条数", "#2864ed"],
    ["待清理", data.stats.markedForDeletion, "已完成审核且超过保留期限", "#64748b"],
    ["对象已删除", data.stats.deletedObjects, "业务证据与识别元数据保留", "#10b981"],
    ["删除失败", data.stats.deleteFailures, "系统将自动退避重试", "#64748b"],
  ];
  const imageUrl = preview ? "/api/v1/admin/task-submissions/" + preview.id + "/evidence" : "";
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
          
          <button className="evidence-primary" onClick={() => { setQuery(keyword.trim()); setPage(1); }}><Search size={14}/> 搜索</button>
          <button onClick={() => { setKeyword(""); setQuery(""); setTaskType("TASK"); setPage(1); }}>重置</button>
          <button onClick={() => void load()} title="刷新"><RefreshCw size={14}/></button>
        </section>
        <section className="evidence-stats">{statCards.map(([label,value,desc,color]) => <article key={String(label)}><span className="evidence-stat-icon" style={{background:String(color)}}>{label === "证据总数" ? "▧" : label === "当前筛选" ? "⌕" : label === "对象已删除" ? "♲" : "▣"}</span><div><small>{label}</small><strong>{Number(value).toLocaleString()}</strong><p>{desc}</p></div></article>)}</section>
        {error && <div className="notice error">{error}</div>}
        <section className="evidence-table-card">
          <div className="evidence-table-scroll"><table className="evidence-table"><thead><tr><th>用户</th><th>目标手机号</th><th>状态</th><th>存储生命周期</th><th>证据来源</th><th>审核状态</th><th>提交时间</th><th>操作</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={8} className="evidence-empty">正在加载证据记录…</td></tr> : data.records.length === 0 ? <tr><td colSpan={8} className="evidence-empty">暂无截图证据</td></tr> : data.records.map(item => <tr key={item.id}>
            <td>{item.userPhone || "—"}</td><td>{item.targetPhone || "—"}</td>
            <td><span className="evidence-pill submitted">{item.status === "APPROVED" ? "已通过" : item.status === "REJECTED" ? "已拒绝" : "已提交"}</span></td>
            <td><span className={"evidence-pill " + (item.retentionStatus === "DELETE_FAILED" ? "warning" : item.retentionStatus === "DELETED" ? "info" : "normal")}>{retentionLabel(item.retentionStatus)}</span></td><td>{item.source}</td>
            <td><span className={"evidence-pill " + (item.reviewStatus.includes("通过") ? "success" : item.reviewStatus.includes("复核") ? "warning" : "info")}>{item.reviewStatus}</span></td>
            <td>{fmt(item.submittedAt)}</td><td><button className="evidence-view" onClick={() => void openDetail(item)}>查看</button></td>
          </tr>)}</tbody></table></div>
          <footer className="evidence-footer"><span>共 {data.total.toLocaleString()} 条</span><div><button disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)}><ChevronLeft size={15}/></button><span className="current">{page}</span><button disabled={page >= pages || loading} onClick={() => setPage(v => v + 1)}><ChevronRight size={15}/></button><select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select></div></footer>
        </section>
      </div>
    </section>
    {preview && <div className="evidence-detail-backdrop" onClick={() => setPreview(null)}>
      <section className="evidence-detail-drawer" onClick={e => e.stopPropagation()}>
        <header className="evidence-detail-header"><div><strong>证据详情</strong><span>{detail?.targetPhone || preview.targetPhone || "目标手机号未记录"}</span></div><button onClick={() => setPreview(null)} aria-label="关闭"><X size={20}/></button></header>
        {detailLoading ? <div className="evidence-detail-loading">正在读取证据详情…</div> : detailError ? <div className="notice error">{detailError}</div> : detail && <div className="evidence-detail-content">
          <div className="evidence-detail-left">
            <section className="evidence-detail-card"><h3>基本信息与来源</h3><div className="evidence-detail-grid">
              {field("目标号码",detail.targetPhone || "—")}{field("提交来源",detail.captureMode)}
              {field("截图方式",detail.captureMode)}{field("证据来源",detail.source)}
              {field("风险评估状态",detail.trustLevel)}
            </div></section>
            <section className="evidence-detail-card"><h3>审核结论</h3><div className="evidence-detail-grid">
              {field("审核结论",<span className="evidence-pill warning">{detail.reviewStatus}</span>)}{field("最终审核决策",detail.reviewDecision === "APPROVE" ? "已通过" : detail.reviewDecision === "REJECT" ? "已拒绝" : "尚无最终决策")}
              {field("AI 图像识别置信度",detail.aiConfidence == null ? "未提供" : (detail.aiConfidence * 100).toFixed(1) + "%")}
            </div>
            <div className="evidence-detail-note-grid"><div><strong>AI 原始说明</strong><p>{detail.aiReason || "未提供"}</p></div><div><strong>系统判定原因</strong><p>{detail.reviewReason || "本次审核尚未生成独立判定说明。"}</p></div></div>
            {detail.extractedText && <div className="evidence-detail-message"><strong>OCR 识别文字</strong><p>{detail.extractedText}</p></div>}
            </section>
            <section className="evidence-detail-card"><h3>文件规格与时间</h3><div className="evidence-detail-grid">
              {field("图片尺寸",detail.imageDimensions || "尚未提取")}{field("提交备注", detail.note || "无")}
              {field("文件类型",detail.mimeType || "未知")}{field("文件大小",bytes(detail.sizeBytes))}
              {field("提交时间",fmt(detail.submittedAt))}
              {field("图片访问方式","后台授权接口实时读取")}
            </div></section>
            <section className="evidence-detail-card"><h3>存储与生命周期</h3><div className="evidence-detail-grid">
              {field("存储生命周期",<span className={"evidence-pill " + (detail.retentionStatus === "DELETE_FAILED" ? "warning" : detail.retentionStatus === "DELETED" ? "info" : "normal")}>{retentionLabel(detail.retentionStatus)}</span>)}{field("删除尝试次数",detail.deletionAttempts)}
              {field("对象清理完成时间",fmt(detail.archivedAt))}{field("下次重试时间",fmt(detail.nextRetryAt))}
              {field("最近错误",detail.lastStorageError || "—")}
              {field("保留截止时间",fmt(detail.retentionUntil))}
            </div></section>
          </div>
          <div className="evidence-detail-right"><div className="evidence-viewer">
            <div className="evidence-viewer-toolbar"><strong>截图查看器</strong><div>
              <button title="缩小" onClick={() => setZoom(v => Math.max(.25, +(v - .25).toFixed(2)))}><ZoomOut size={17}/></button>
              <button title="放大" onClick={() => setZoom(v => Math.min(3, +(v + .25).toFixed(2)))}><ZoomIn size={17}/></button>
              <button title="旋转" onClick={() => setRotation(v => (v + 90) % 360)}><RotateCw size={17}/></button>
              <button title="全屏" disabled={detail.retentionStatus === "DELETED"} onClick={() => document.querySelector(".evidence-viewer-image")?.requestFullscreen?.()}><Maximize2 size={17}/></button>
              <button title="新窗口打开" disabled={detail.retentionStatus === "DELETED"} onClick={() => window.open(imageUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={17}/></button>
            </div></div>
            <div className="evidence-viewer-image">{detail.retentionStatus === "DELETED"
              ? <div className="evidence-empty">截图已按保留策略清理，原始证据记录仍保留。</div>
              : <img src={imageUrl} alt="任务提交证据截图" style={{transform:`scale(${zoom}) rotate(${rotation}deg)`}}/>}</div>
            <div className="evidence-viewer-meta"><div><span>截图 hash</span><strong>{detail.contentHash || "未记录"}</strong></div><div><span>上传时间</span><strong>{fmt(detail.submittedAt)}</strong></div></div>
          </div></div>
        </div>}
      </section>
    </div>}
  </div>;
}
