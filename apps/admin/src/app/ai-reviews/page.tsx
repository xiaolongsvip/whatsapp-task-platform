"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

type ReviewRecord = {
  id: string; status: string; submissionStatus: string; submittedAt: string;
  originalName: string | null; mimeType: string | null; sizeBytes: number | null; note: string | null;
  ai: null | { id: string; status: string; decision: string | null; confidence: number | null; reason: string | null; extractedText: string | null; attemptCount: number; lastError: string | null; updatedAt: string };
  latestReview: null | { decision: string; reason: string | null; reviewedAt: string };
  task: { id: string; title: string; rewardMinor: string; currency: string };
  claim: { id: string; status: string };
  user: { id: string; phone: string; reputationScore: number };
  targetPhone: string | null;
};
type CenterResponse = { records: ReviewRecord[]; total: number; page: number; pageSize: number; stats: { manualReview: number; smartReview: number; approved: number; rejected: number; risk: number } };

const tabs = [
  { key: "MANUAL_REVIEW", label: "人工复核" },
  { key: "SMART_REVIEW", label: "智能审核中" },
  { key: "APPROVED", label: "已通过" },
  { key: "REJECTED", label: "已拒绝" },
  { key: "NEEDS_RESUBMIT", label: "需重新提交" },
  { key: "FROZEN", label: "已冻结" },
];
const emptyStats = { manualReview: 0, smartReview: 0, approved: 0, rejected: 0, risk: 0 };

export default function AiReviewsPage() {
  const [tab, setTab] = useState("MANUAL_REVIEW");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CenterResponse>({ records: [], total: 0, page: 1, pageSize: 20, stats: emptyStats });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ReviewRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [showColumns, setShowColumns] = useState(false);

  const load = useCallback(async () => {
    if (tab === "NEEDS_RESUBMIT" || tab === "FROZEN") {
      setData({ records: [], total: 0, page, pageSize: 20, stats: emptyStats });
      setLoading(false); setError("");
      return;
    }
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (tab !== "NEEDS_RESUBMIT" && tab !== "FROZEN") query.set("status", tab);
      const response = await fetch(`/api/v1/admin/ai-reviews/center?${query}`, { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "读取审核中心失败");
      setData(body as CenterResponse);
    } catch (e) { setError(e instanceof Error ? e.message : "读取审核中心失败"); }
    finally { setLoading(false); }
  }, [page, pageSize, tab]);

  useEffect(() => { void load(); }, [load]);

  async function decide(decision: "APPROVE" | "REJECT") {
    if (!selected || busy) return;
    const reason = window.prompt(decision === "APPROVE" ? "请输入通过理由：" : "请输入拒绝原因：");
    if (reason === null) return;
    if (reason.trim().length < 2) { setActionError("审核理由至少需要 2 个字符。"); return; }
    setBusy(true); setActionError("");
    try {
      const response = await fetch(`/api/v1/admin/task-submissions/${selected.id}/review`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "审核操作失败");
      setSelected(null); await load();
    } catch (e) { setActionError(e instanceof Error ? e.message : "审核操作失败"); }
    finally { setBusy(false); }
  }

  async function retryAi() {
    if (!selected || busy) return;
    if (!window.confirm("确定重新触发这条提交的 AI 审核吗？")) return;
    setBusy(true); setActionError("");
    try {
      const response = await fetch(`/api/v1/admin/task-submissions/${selected.id}/retry-ai`, {
        method: "POST", credentials: "include",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "重新触发 AI 审核失败");
      setSelected(null); await load();
    } catch (e) { setActionError(e instanceof Error ? e.message : "重新触发 AI 审核失败"); }
    finally { setBusy(false); }
  }

  const pages = Math.max(1, Math.ceil(data.total / pageSize));
  const stats = data.stats || emptyStats;
  const statCards = [
    ["审核中心", stats.manualReview + stats.smartReview + stats.approved + stats.rejected, "审核状态", "#f97316"],
    ["人工复核", stats.manualReview, "全部", "#f97316"],
    ["风险", stats.risk, "风险", "#f43f5e"],
  ];
  const columns = ["审核编号", "用户", "状态", "建议结论", "风险", "证据来源", "创建时间", "操作"];

  return <main className="admin-shell" style={{ maxWidth: "none", padding: "14px 16px 18px", minHeight: "calc(100vh - 20px)", background: "#f8fafc" }}>
    <section style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginBottom: 13 }}>
      {statCards.map(([label, value, desc, color]) => <div key={String(label)} style={{ padding: "15px 18px", minHeight: 82, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, display: "flex", alignItems: "center", gap: 13 }}>
        <span style={{ width: 38, height: 38, borderRadius: "50%", background: String(color), color: "#fff", display: "grid", placeItems: "center", flexShrink: 0, fontSize: 18 }}>♢</span>
        <div><div style={{ color: "#64748b", fontSize: 12 }}>{label}</div><div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.25, color: "#0f172a" }}>{Number(value).toLocaleString()}</div><div style={{ color: "#64748b", fontSize: 11 }}>{desc}</div></div>
      </div>)}
    </section>
    <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: 12, minHeight: "calc(100vh - 175px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, minWidth: 0, overflowX: "auto", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: 4 }}>
          {tabs.map((item) => <button key={item.key} onClick={() => { setPage(1); setTab(item.key); }} style={{ flexShrink: 0, border: 0, borderRadius: 5, padding: "8px 12px", background: tab === item.key ? "#2563eb" : "transparent", color: tab === item.key ? "#fff" : "#475569", fontSize: 12, cursor: "pointer" }}>{item.label}</button>)}
        </div>
        <button onClick={() => setShowColumns(v => !v)} style={{ flexShrink: 0, border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 11px", background: "#fff", color: "#475569", cursor: "pointer", fontSize: 12 }}>▥ 显示列</button>
      </div>
      {showColumns && <div style={{ padding: 10, border: "1px solid #e2e8f0", borderRadius: 6, marginBottom: 10, color: "#64748b", fontSize: 12 }}>{columns.join("　·　")}</div>}
      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
      {(tab === "NEEDS_RESUBMIT" || tab === "FROZEN") && <div style={{ padding: "70px 20px", textAlign: "center" }}>
        <strong>{tab === "FROZEN" ? "暂无冻结记录" : "暂无要求重新提交的记录"}</strong>
        <p className="muted">当前数据库还没有独立的冻结及补图状态，暂不使用其他状态冒充。</p>
      </div>}
      {tab !== "NEEDS_RESUBMIT" && tab !== "FROZEN" && <div style={{ overflowX: "auto", marginTop: 12, minHeight: 520 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead><tr style={{ background: "#f8fafc", color: "#64748b" }}>{columns.map(x => <th key={x} style={{ textAlign: "left", padding: "11px 9px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", fontWeight: 500 }}>{x}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={columns.length} style={{ padding: "48px 12px", textAlign: "center", color: "#94a3b8" }}>正在加载审核记录…</td></tr>
              : error ? <tr><td colSpan={columns.length} style={{ padding: "48px 12px", textAlign: "center", color: "#dc2626" }}>审核记录加载失败</td></tr>
              : data.records.length === 0 ? <tr><td colSpan={columns.length} style={{ padding: "48px 12px", textAlign: "center", color: "#94a3b8" }}>暂无审核记录</td></tr>
              : data.records.map(item => <tr key={item.id} style={{ borderBottom: "1px solid #edf2f7" }}>
                <td style={{ padding: "11px 9px", color: "#31547d", whiteSpace: "nowrap" }}>{item.id}</td>
                <td style={{ padding: "11px 9px", color: "#31547d" }}>{item.user.phone}</td>
                <td style={{ padding: "11px 9px" }}><span style={{ display: "inline-block", border: "1px solid #fed7aa", color: "#ea580c", background: "#fff7ed", borderRadius: 5, padding: "3px 7px" }}>{item.status === "MANUAL_REVIEW" ? "人工复核" : item.status === "SMART_REVIEW" ? "智能审核中" : item.status === "APPROVED" ? "已通过" : "已拒绝"}</span></td>
                <td style={{ padding: "11px 9px", whiteSpace: "nowrap" }}>{item.latestReview?.decision || item.ai?.decision || "人工复核"}</td>
                <td style={{ padding: "11px 9px" }}><span style={{ color: "#64748b" }}>待接入风险规则</span></td>
                <td style={{ padding: "11px 9px", whiteSpace: "nowrap" }}>APP 任务截图</td>
                <td style={{ padding: "11px 9px", whiteSpace: "nowrap", color: "#31547d" }}>{new Date(item.submittedAt).toLocaleString("zh-CN", { hour12: false })}</td>
                <td style={{ padding: "11px 9px" }}><button onClick={() => { setActionError(""); setSelected(item); }} style={{ border: 0, background: "transparent", color: "#334155", cursor: "pointer" }}>◉ 打开</button></td>
              </tr>)}
          </tbody>
        </table>
      </div>}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 7, paddingTop: 13, fontSize: 12, color: "#64748b" }}>
        <button disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)} style={{ border: "1px solid #e2e8f0", borderRadius: 5, background: "#fff", padding: "6px 9px", cursor: "pointer" }}>‹</button>
        <span style={{ background: "#2563eb", color: "#fff", borderRadius: 5, padding: "6px 10px" }}>{page}</span>
        <button disabled={page >= pages || loading} onClick={() => setPage(v => v + 1)} style={{ border: "1px solid #e2e8f0", borderRadius: 5, background: "#fff", padding: "6px 9px", cursor: "pointer" }}>›</button>
        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ border: "1px solid #e2e8f0", borderRadius: 5, background: "#fff", padding: "6px 8px", color: "#334155" }}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select>
      </div>
    </section>

    {selected && <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.25)", zIndex: 50 }}>
      <aside onClick={e => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 0, height: "100%", width: "min(720px,96vw)", overflowY: "auto", background: "white", boxShadow: "-8px 0 28px #0002", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: -22, background: "white", padding: "8px 0 16px", zIndex: 2, borderBottom: "1px solid #e2e8f0" }}>
          <div><strong>{selected.user.phone}</strong><div className="muted">{selected.task.title}</div></div><button className="secondary-btn" onClick={() => setSelected(null)}>关闭</button>
        </div>
        <section className="panel" style={{ marginTop: 16 }}>
          <h3>审核结论与原因</h3>
          <div className="form-grid">
            <div><strong>当前状态</strong><p>{selected.submissionStatus}</p></div>
            <div><strong>AI 建议</strong><p>{selected.ai?.decision || "建议人工复核"}</p></div>
            <div><strong>AI 置信度</strong><p>{selected.ai?.confidence == null ? "—" : (selected.ai.confidence * 100).toFixed(1) + "%"}</p></div>
            <div><strong>用户信誉</strong><p>{selected.user.reputationScore}</p></div>
            <div style={{ gridColumn: "1 / -1" }}><strong>AI 原始说明</strong><p style={{ whiteSpace: "pre-wrap" }}>{selected.ai?.reason || "暂无 AI 说明"}</p></div>
            <div style={{ gridColumn: "1 / -1" }}><strong>系统判定 / 最近人工原因</strong><p style={{ whiteSpace: "pre-wrap" }}>{selected.latestReview?.reason || selected.ai?.reason || "暂无判定原因"}</p></div>
          </div>
        </section>
        <section className="panel">
          <h3>截图查看器</h3>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, textAlign: "center" }}>
            <Image src={`/api/v1/admin/task-submissions/${selected.id}/evidence`} alt="任务提交证据截图" width={900} height={1200} unoptimized style={{ maxWidth: "100%", width: "auto", height: "auto", maxHeight: 620, objectFit: "contain" }} />
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div><strong>文件名</strong><p>{selected.originalName || "未命名"}</p></div>
            <div><strong>文件大小</strong><p>{selected.sizeBytes ?? 0} bytes</p></div>
            <div><strong>上传时间</strong><p>{new Date(selected.submittedAt).toLocaleString()}</p></div>
            <div><strong>证据来源</strong><p>APP 任务提交</p></div>
          </div>
        </section>
        <section className="panel">
          <h3>任务与用户信息</h3>
          <div className="form-grid">
            <div><strong>任务会话 / Claim</strong><p>{selected.claim.id}</p></div>
            <div><strong>任务状态</strong><p>{selected.claim.status}</p></div>
            <div><strong>目标手机号</strong><p>{selected.targetPhone || "—"}</p></div>
            <div><strong>奖励</strong><p>{(Number(selected.task.rewardMinor) / 100).toFixed(2)} {selected.task.currency}</p></div>
            <div><strong>用户</strong><p>{selected.user.phone}</p></div>
            <div><strong>提交说明</strong><p>{selected.note || "—"}</p></div>
          </div>
        </section>
        <section className="panel">
          <h3>AI 识别结果</h3><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selected.ai?.extractedText || "暂无 OCR 识别文字"}</p>
          <div className="muted">AI 状态：{selected.ai?.status || "未启用"} · 尝试次数：{selected.ai?.attemptCount ?? 0}</div>
        </section>
        {actionError && <div className="notice error">{actionError}</div>}
        <div className="action-row" style={{ position: "sticky", bottom: -22, background: "white", padding: "14px 0", borderTop: "1px solid #e2e8f0" }}>
          {selected.status === "MANUAL_REVIEW" && <>
            <button className="primary-btn" disabled={busy} onClick={() => void decide("APPROVE")}>{busy ? "处理中…" : "通过"}</button>
            <button className="secondary-btn" disabled={busy} onClick={() => void decide("REJECT")}>拒绝</button>
          </>}
          {selected.ai && ["SUBMITTED", "UNDER_REVIEW"].includes(selected.submissionStatus) &&
            <button className="secondary-btn" disabled={busy || selected.ai.status === "PROCESSING"} onClick={() => void retryAi()}>
              {selected.ai.status === "PROCESSING" ? "AI 正在处理" : "重新 AI 审核"}
            </button>}
        </div>
      </aside>
    </div>}
  </main>;
}
