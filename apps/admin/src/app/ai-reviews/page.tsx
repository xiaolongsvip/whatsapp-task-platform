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

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (tab !== "NEEDS_RESUBMIT" && tab !== "FROZEN") query.set("status", tab);
      const response = await fetch(`/api/v1/admin/ai-reviews/center?${query}`, { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "读取审核中心失败");
      setData(body as CenterResponse);
    } catch (e) { setError(e instanceof Error ? e.message : "读取审核中心失败"); }
    finally { setLoading(false); }
  }, [page, tab]);

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

  const pages = Math.max(1, Math.ceil(data.total / 20));
  const stats = data.stats || emptyStats;
  const statCards = [
    ["审核中心", stats.manualReview + stats.smartReview + stats.approved + stats.rejected, "当前提交记录"],
    ["人工复核", stats.manualReview, "等待人工处理"],
    ["风险", stats.risk, "风险记录"],
  ];

  return <main className="admin-shell" style={{ maxWidth: "none", padding: 20 }}>
    <header className="admin-header">
      <div><div className="admin-brand">审核中心</div><div className="admin-subtitle">任务提交审核 · AI 识别 · 人工复核 · 证据追踪</div></div>
      <button className="secondary-btn" onClick={() => void load()} disabled={loading}>刷新</button>
    </header>

    <section style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginBottom: 16 }}>
      {statCards.map(([label, value, desc]) => <div className="panel" key={String(label)} style={{ margin: 0, padding: 18 }}>
        <div className="muted">{label}</div><div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div><div className="muted">{desc}</div>
      </div>)}
    </section>

    <section className="panel" style={{ padding: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, background: "#f8fafc" }}>
        {tabs.map((item) => <button key={item.key} className={tab === item.key ? "primary-btn" : "secondary-btn"} onClick={() => { setPage(1); setTab(item.key); }}>{item.label}</button>)}
      </div>
      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
      {(tab === "NEEDS_RESUBMIT" || tab === "FROZEN") ? <div style={{ padding: "70px 20px", textAlign: "center" }}>
        <strong>{tab === "FROZEN" ? "暂无冻结记录" : "暂无要求重新提交的记录"}</strong>
        <p className="muted">当前数据库还没有独立的冻结及补图状态，暂不使用其他状态冒充。</p>
      </div> : loading ? <p className="muted" style={{ padding: 24 }}>正在加载审核记录…</p> : data.records.length === 0 ? <p className="muted" style={{ padding: 50, textAlign: "center" }}>暂无审核记录</p> : <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead><tr>{["审核编号", "用户", "状态", "建议结论", "风险", "证据来源", "创建时间", "操作"].map(x => <th key={x} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{x}</th>)}</tr></thead>
          <tbody>{data.records.map(item => <tr key={item.id}>
            <td style={{ padding: 12, borderBottom: "1px solid #edf2f7" }}>{item.id}</td>
            <td style={{ padding: 12, borderBottom: "1px solid #edf2f7" }}>{item.user.phone}</td>
            <td style={{ padding: 12, borderBottom: "1px solid #edf2f7" }}>{item.submissionStatus}</td>
            <td style={{ padding: 12, borderBottom: "1px solid #edf2f7" }}>{item.latestReview?.decision || item.ai?.decision || "人工复核"}</td>
            <td style={{ padding: 12, borderBottom: "1px solid #edf2f7" }}>待风险规则接入</td>
            <td style={{ padding: 12, borderBottom: "1px solid #edf2f7" }}>任务提交截图</td>
            <td style={{ padding: 12, borderBottom: "1px solid #edf2f7", whiteSpace: "nowrap" }}>{new Date(item.submittedAt).toLocaleString()}</td>
            <td style={{ padding: 12, borderBottom: "1px solid #edf2f7" }}><button className="secondary-btn" onClick={() => { setActionError(""); setSelected(item); }}>打开</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <div className="action-row" style={{ justifyContent: "space-between" }}><span className="muted">共 {data.total} 条 · 第 {page} / {pages} 页</span><div className="action-row" style={{ marginTop: 0 }}>
        <button className="secondary-btn" disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)}>上一页</button>
        <button className="secondary-btn" disabled={page >= pages || loading} onClick={() => setPage(v => v + 1)}>下一页</button>
      </div></div>
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
        {selected.status === "MANUAL_REVIEW" && <div className="action-row" style={{ position: "sticky", bottom: -22, background: "white", padding: "14px 0", borderTop: "1px solid #e2e8f0" }}>
          <button className="primary-btn" disabled={busy} onClick={() => void decide("APPROVE")}>{busy ? "处理中…" : "通过"}</button>
          <button className="secondary-btn" disabled={busy} onClick={() => void decide("REJECT")}>拒绝</button>
        </div>}
      </aside>
    </div>}
  </main>;
}
