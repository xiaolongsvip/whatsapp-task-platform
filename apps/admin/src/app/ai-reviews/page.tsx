"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type ReviewJob = {
  id: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string | null;
  decision: string | null;
  confidence: number | null;
  reason: string | null;
  extractedText: string | null;
  createdAt: string;
  submission: {
    id: string;
    status: string;
    originalName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    submittedAt: string;
    note: string | null;
  };
  task: { id: string; title: string; rewardMinor: string; currency: string };
  user: { id: string; phone: string };
};

type PendingSubmission = {
  id: string;
  status: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  submittedAt: string;
  note: string | null;
  aiReview: { id: string; status: string; decision: string | null; confidence: number | null; reason: string | null } | null;
  task: { id: string; title: string; rewardMinor: string; currency: string };
  user: { id: string; phone: string };
};

const statusNames: Record<string, string> = {
  PENDING: "等待处理",
  PROCESSING: "处理中",
  RETRY: "等待重试",
  COMPLETED: "已处理",
  NEEDS_REVIEW: "需要关注",
};

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "读取审核记录失败。");
  return data as T;
}

export default function AiReviewsPage() {
  const [jobs, setJobs] = useState<ReviewJob[]>([]);
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ReviewJob | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [pendingSubmissions, setPendingSubmissions] = useState<PendingSubmission[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingStatus, setPendingStatus] = useState("ALL");
  const [selectedSubmission, setSelectedSubmission] = useState<PendingSubmission | null>(null);


  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status !== "ALL") query.set("status", status);
    request<{ jobs: ReviewJob[]; total: number }>(`/api/v1/admin/ai-reviews?${query.toString()}`)
      .then((data) => {
        if (!active) return;
        setJobs(data.jobs);
        setTotal(data.total);
        setError("");
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "读取失败。"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [status, page]);

  useEffect(() => {
    let active = true;
    setPendingLoading(true);
    const query = new URLSearchParams({ page: String(pendingPage), pageSize: "20" });
    if (pendingStatus !== "ALL") query.set("status", pendingStatus);
    request<{ submissions: PendingSubmission[]; total: number }>(
      `/api/v1/admin/task-submissions?${query.toString()}`,
    )
      .then((data) => {
        if (!active) return;
        setPendingSubmissions(data.submissions);
        setPendingTotal(data.total);
        setPendingError("");
      })
      .catch((err) => active && setPendingError(err instanceof Error ? err.message : "读取待人工审核记录失败。"))
      .finally(() => active && setPendingLoading(false));
    return () => { active = false; };
  }, [pendingPage, pendingStatus]);

  const pendingPages = Math.max(1, Math.ceil(pendingTotal / 20));

  async function reviewPendingSubmission(decision: "APPROVE" | "REJECT") {
    if (!selectedSubmission || reviewing) return;
    const reason = window.prompt(decision === "APPROVE" ? "请输入通过审核的理由：" : "请输入驳回原因：");
    if (reason === null) return;
    if (reason.trim().length < 2) {
      setReviewError("审核理由至少需要 2 个字符。");
      return;
    }
    setReviewing(true);
    setReviewError("");
    try {
      const response = await fetch(`/api/v1/admin/task-submissions/${selectedSubmission.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "人工审核失败。");
      setSelectedSubmission(null);
      window.location.reload();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "人工审核失败。");
    } finally {
      setReviewing(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / 20));

  async function submitManualDecision(decision: "APPROVE" | "REJECT") {
    if (!selected || selected.status !== "NEEDS_REVIEW" || reviewing) return;
    const reason = window.prompt(decision === "APPROVE" ? "请输入通过审核的理由：" : "请输入驳回原因：");
    if (reason === null) return;
    if (reason.trim().length < 2) {
      setReviewError("审核理由至少需要 2 个字符。");
      return;
    }
    setReviewing(true);
    setReviewError("");
    try {
      const response = await fetch(`/api/v1/admin/task-submissions/${selected.submission.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "人工审核失败。");
      setSelected(null);
      window.location.reload();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "人工审核失败。");
    } finally {
      setReviewing(false);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <div className="admin-brand">WTP 管理后台</div>
          <div className="admin-subtitle">AI 审核记录 · OCR 结果 · 任务处理状态</div>
        </div>
        <div className="action-row" style={{ marginTop: 0 }}>
          <Link className="secondary-btn" href="/ai-settings">AI 审核设置</Link>
          <Link className="secondary-btn" href="/tasks">任务管理</Link>
          <Link className="secondary-btn" href="/">号码池管理</Link>
        </div>
      </header>

      <section className="panel">
        <div className="action-row" style={{ justifyContent: "space-between", marginTop: 0 }}>
          <div>
            <h2>待人工审核提交</h2>
            <p className="muted">共 {pendingTotal} 条待处理提交，包含未启用 AI 审核的记录及 AI 转人工的记录。</p>
          </div>
          <select value={pendingStatus} onChange={(event) => { setPendingPage(1); setPendingStatus(event.target.value); }}>
            <option value="ALL">全部待审核</option>
            <option value="SUBMITTED">已提交</option>
            <option value="UNDER_REVIEW">审核中</option>
          </select>
        </div>
        {pendingError && <div className="notice error">{pendingError}</div>}
        {pendingLoading ? <p className="muted">正在加载待审核提交…</p> : pendingSubmissions.length === 0 ? (
          <p className="muted">当前没有待人工审核的提交。</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr>
                {["提交时间", "任务", "用户", "提交状态", "AI 状态", "AI 判断", "操作"].map((label) => (
                  <th key={label} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>{label}</th>
                ))}
              </tr></thead>
              <tbody>
                {pendingSubmissions.map((submission) => (
                  <tr key={submission.id}>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{new Date(submission.submittedAt).toLocaleString()}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{submission.task.title}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{submission.user.phone}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{submission.status}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{submission.aiReview?.status || "未启用 AI"}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{submission.aiReview?.decision || "—"}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                      <button className="secondary-btn" onClick={() => { setReviewError(""); setSelectedSubmission(submission); }}>审核</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="action-row" style={{ justifyContent: "space-between" }}>
          <span className="muted">第 {pendingPage} / {pendingPages} 页</span>
          <div className="action-row" style={{ marginTop: 0 }}>
            <button className="secondary-btn" disabled={pendingPage <= 1 || pendingLoading} onClick={() => setPendingPage((value) => value - 1)}>上一页</button>
            <button className="secondary-btn" disabled={pendingPage >= pendingPages || pendingLoading} onClick={() => setPendingPage((value) => value + 1)}>下一页</button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="action-row" style={{ justifyContent: "space-between", marginTop: 0 }}>
          <div>
            <h2>审核任务记录</h2>
            <p className="muted">共 {total} 条记录。这里展示 AI 处理结果，不提供直接修改用户余额的操作。</p>
          </div>
          <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
            <option value="ALL">全部状态</option>
            {Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {error && <div className="notice error">{error}</div>}
        {loading ? <p className="muted">正在加载审核记录…</p> : jobs.length === 0 ? <p className="muted">暂无审核记录。</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
              <thead>
                <tr>
                  {["提交时间", "任务", "用户", "状态", "AI 判断", "置信度", "尝试次数", "详情"].map((label) => (
                    <th key={label} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{new Date(job.submission.submittedAt).toLocaleString()}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{job.task.title}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{job.user.phone}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{statusNames[job.status] || job.status}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{job.decision || "—"}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{job.confidence === null ? "—" : (job.confidence * 100).toFixed(1) + "%"}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{job.attemptCount}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}><button className="secondary-btn" onClick={() => setSelected(job)}>查看</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="action-row" style={{ justifyContent: "space-between" }}>
          <span className="muted">第 {page} / {pages} 页</span>
          <div className="action-row" style={{ marginTop: 0 }}>
            <button className="secondary-btn" disabled={page <= 1 || loading} onClick={() => setPage((v) => v - 1)}>上一页</button>
            <button className="secondary-btn" disabled={page >= pages || loading} onClick={() => setPage((v) => v + 1)}>下一页</button>
          </div>
        </div>
      </section>

      {selectedSubmission && (
        <section className="panel">
          <div className="action-row" style={{ justifyContent: "space-between", marginTop: 0 }}>
            <h2>待人工审核详情</h2>
            <button className="secondary-btn" onClick={() => setSelectedSubmission(null)}>关闭</button>
          </div>
          <div className="form-grid">
            <div><strong>任务</strong><p>{selectedSubmission.task.title}</p></div>
            <div><strong>用户</strong><p>{selectedSubmission.user.phone}</p></div>
            <div><strong>提交状态</strong><p>{selectedSubmission.status}</p></div>
            <div><strong>AI 状态</strong><p>{selectedSubmission.aiReview?.status || "未启用 AI"}</p></div>
            <div><strong>AI 判断</strong><p>{selectedSubmission.aiReview?.decision || "暂无"}</p></div>
            <div><strong>AI 理由</strong><p>{selectedSubmission.aiReview?.reason || "—"}</p></div>
            <div><strong>文件</strong><p>{selectedSubmission.originalName || "未命名"} · {selectedSubmission.sizeBytes ?? 0} bytes</p></div>
            <div><strong>提交说明</strong><p>{selectedSubmission.note || "—"}</p></div>
            <div style={{ gridColumn: "1 / -1" }}>
              <strong>原始提交截图</strong>
              <div style={{ marginTop: 10 }}>
                <Image
                  src={`/api/v1/admin/task-submissions/${selectedSubmission.id}/evidence`}
                  alt="任务提交证据"
                  width={1200}
                  height={900}
                  unoptimized
                  style={{ display: "block", width: "auto", maxWidth: "100%", height: "auto", maxHeight: 560, objectFit: "contain", border: "1px solid #ddd", borderRadius: 8 }}
                />
              </div>
            </div>
            {reviewError && <div className="notice error" style={{ gridColumn: "1 / -1" }}>{reviewError}</div>}
            <div className="action-row" style={{ gridColumn: "1 / -1" }}>
              <button className="primary-btn" disabled={reviewing} onClick={() => void reviewPendingSubmission("APPROVE")}>
                {reviewing ? "正在提交…" : "人工通过"}
              </button>
              <button className="secondary-btn" disabled={reviewing} onClick={() => void reviewPendingSubmission("REJECT")}>人工驳回</button>
            </div>
          </div>
        </section>
      )}

      {selected && (
        <section className="panel">
          <div className="action-row" style={{ justifyContent: "space-between", marginTop: 0 }}>
            <h2>审核详情</h2>
            <button className="secondary-btn" onClick={() => setSelected(null)}>关闭</button>
          </div>
          <div className="form-grid">
            <div><strong>任务</strong><p>{selected.task.title}</p></div>
            <div><strong>用户</strong><p>{selected.user.phone}</p></div>
            <div><strong>审核状态</strong><p>{statusNames[selected.status] || selected.status}</p></div>
            <div><strong>提交状态</strong><p>{selected.submission.status}</p></div>
            <div><strong>AI 判断</strong><p>{selected.decision || "尚无判断"}</p></div>
            <div><strong>置信度</strong><p>{selected.confidence === null ? "—" : (selected.confidence * 100).toFixed(1) + "%"}</p></div>
            <div><strong>尝试次数</strong><p>{selected.attemptCount}</p></div>
            <div><strong>文件</strong><p>{selected.submission.originalName || "未命名"} · {selected.submission.sizeBytes ?? 0} bytes</p></div>
            <div style={{ gridColumn: "1 / -1" }}><strong>AI 理由</strong><p style={{ whiteSpace: "pre-wrap" }}>{selected.reason || "—"}</p></div>
            <div style={{ gridColumn: "1 / -1" }}><strong>OCR 提取文字</strong><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selected.extractedText || "暂无识别文字"}</pre></div>
            <div style={{ gridColumn: "1 / -1" }}><strong>用户提交说明</strong><p>{selected.submission.note || "—"}</p></div>
            <div style={{ gridColumn: "1 / -1" }}>
              <strong>原始提交截图</strong>
              <div style={{ marginTop: 10 }}>
                <Image
                  src={`/api/v1/admin/task-submissions/${selected.submission.id}/evidence`}
                  alt="任务提交证据"
                  width={1200}
                  height={900}
                  unoptimized
                  style={{ display: "block", width: "auto", maxWidth: "100%", height: "auto", maxHeight: 560, objectFit: "contain", border: "1px solid #ddd", borderRadius: 8 }}
                />
              </div>
            </div>
            {reviewError && <div className="notice error" style={{ gridColumn: "1 / -1" }}>{reviewError}</div>}
            {selected.status === "NEEDS_REVIEW" && (
              <div className="action-row" style={{ gridColumn: "1 / -1" }}>
                <button className="primary-btn" disabled={reviewing} onClick={() => void submitManualDecision("APPROVE")}>
                  {reviewing ? "正在提交…" : "人工通过"}
                </button>
                <button className="secondary-btn" disabled={reviewing} onClick={() => void submitManualDecision("REJECT")}>
                  人工驳回
                </button>
              </div>
            )}
            {selected.lastError && <div style={{ gridColumn: "1 / -1" }}><strong>最近错误</strong><p style={{ whiteSpace: "pre-wrap" }}>{selected.lastError}</p></div>}
          </div>
        </section>
      )}
    </main>
  );
}
