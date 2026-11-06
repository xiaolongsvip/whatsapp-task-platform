"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type TaskStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED";

type AdminTask = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: TaskStatus;
  rewardMinor: string;
  rewardAmount: string;
  currency: string;
  capacity: number | null;
  claimedCount: number;
  remainingCapacity: number | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  messageTemplate: string | null;
  linkUrl: string | null;
  previewTitle: string | null;
  previewDescription: string | null;
  previewImageUrl: string | null;
  claimCount: number;
  inventory?: { total: number; available: number; assigned: number; used: number };
};

type TaskList = { tasks: AdminTask[] };

type TaskForm = {
  title: string;
  description: string;
  category: string;
  rewardAmount: string;
  currency: string;
  capacity: string;
  startsAt: string;
  endsAt: string;
  messageTemplate: string;
  linkUrl: string;
  previewTitle: string;
  previewDescription: string;
  previewImageUrl: string;
};

const emptyForm: TaskForm = {
  title: "",
  description: "",
  category: "WhatsApp",
  rewardAmount: "1.00",
  currency: "USD",
  capacity: "",
  startsAt: "",
  endsAt: "",
  messageTemplate: "",
  linkUrl: "",
  previewTitle: "",
  previewDescription: "",
  previewImageUrl: "",
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.message === "string" ? data.message : "请求失败，请检查 API 服务。");
  }
  return data as T;
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function statusLabel(status: TaskStatus): string {
  return {
    DRAFT: "草稿",
    PUBLISHED: "已发布",
    PAUSED: "已暂停",
    CLOSED: "已结束",
  }[status];
}

export default function AdminTasksPage() {
  const [adminEmail, setAdminEmail] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TaskStatus>("ALL");

  const refresh = useCallback(async () => {
    const result = await api<TaskList>("/api/v1/admin/tasks");
    setTasks(result.tasks);
  }, []);

  useEffect(() => {
    api<{ id: string; email: string }>("/api/v1/admin-auth/me")
      .then(async (admin) => {
        setAdminEmail(admin.email);
        setAuthenticated(true);
        await refresh();
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setLoading(false));
  }, [refresh]);

  const filteredTasks = tasks.filter((task) => {
    const query = searchTerm.trim().toLowerCase();
    const matchesQuery = !query || [task.title, task.category, task.id].some((value) => value.toLowerCase().includes(query));
    return matchesQuery && (statusFilter === "ALL" || task.status === statusFilter);
  });
  const publishedCount = tasks.filter((task) => task.status === "PUBLISHED").length;
  const totalClaims = tasks.reduce((sum, task) => sum + task.claimedCount, 0);
  const closedCount = tasks.filter((task) => task.status === "CLOSED").length;

  function exportTasks() {
    const headers = ["任务名称", "任务编号", "任务分类", "奖励", "领取次数", "号码库存总数", "可领取号码", "已分配号码", "已使用号码", "任务状态", "创建时间"];
    const rows = filteredTasks.map((task) => [
      task.title, task.id, task.category, `${task.currency} ${task.rewardAmount}`, String(task.claimedCount),
      String(task.inventory?.total ?? 0), String(task.inventory?.available ?? 0),
      String(task.inventory?.assigned ?? 0), String(task.inventory?.used ?? 0), statusLabel(task.status),
      task.createdAt ? new Date(task.createdAt).toLocaleString("zh-CN", { hour12: false }) : "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "任务管理列表.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateField<K extends keyof TaskForm>(key: K, value: TaskForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
    setError("");
    setMessage("");
  }

  function startEdit(task: AdminTask) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description,
      category: task.category,
      rewardAmount: task.rewardAmount,
      currency: task.currency,
      capacity: task.capacity === null ? "" : String(task.capacity),
      startsAt: toDateTimeLocal(task.startsAt),
      endsAt: toDateTimeLocal(task.endsAt),
      messageTemplate: task.messageTemplate ?? "",
      linkUrl: task.linkUrl ?? "",
      previewTitle: task.previewTitle ?? "",
      previewDescription: task.previewDescription ?? "",
      previewImageUrl: task.previewImageUrl ?? "",
    });
    setFormOpen(true);
    setError("");
    setMessage("");
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        rewardAmount: form.rewardAmount.trim(),
        currency: form.currency.trim().toUpperCase(),
        capacity: null,
        startsAt: toIso(form.startsAt),
        endsAt: toIso(form.endsAt),
        messageTemplate: form.messageTemplate,
        linkUrl: form.linkUrl.trim() || null,
        previewTitle: form.previewTitle.trim() || null,
        previewDescription: form.previewDescription.trim() || null,
        previewImageUrl: form.previewImageUrl.trim() || null,
      };
      await api<AdminTask>(
        editingId ? `/api/v1/admin/tasks/${editingId}` : "/api/v1/admin/tasks",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(body),
        },
      );
      setMessage(editingId ? "任务配置已保存。" : "任务草稿已创建。请检查内容后发布。");
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务失败。");
    } finally {
      setBusy(false);
    }
  }

  async function taskAction(id: string, action: "publish" | "pause" | "close") {
    const confirmText = action === "close"
      ? "确定结束这个任务吗？已领取用户的任务记录不会被删除。"
      : action === "publish"
        ? "确认发布任务？发布后符合条件的用户就能在任务大厅领取。"
        : "确认暂停任务？暂停后不会再接受新的领取。";
    if (!window.confirm(confirmText)) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/api/v1/admin/tasks/${id}/${action}`, { method: "POST", body: "{}" });
      setMessage(action === "publish" ? "任务已发布，客户端任务大厅现在可以读取。" : action === "pause" ? "任务已暂停。" : "任务已结束。");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "任务状态更新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/v1/admin-auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    setAuthenticated(false);
    setTasks([]);
  }

  if (loading) return <main className="admin-shell"><div className="panel">正在检查管理员登录状态…</div></main>;

  if (!authenticated) {
    return (
      <main className="admin-shell">
        <section className="panel">
          <h2>尚未登录管理后台</h2>
          <p className="muted">任务管理需要管理员会话，请先登录。</p>
          <Link href="/" className="primary-btn" style={{ display: "inline-block", textDecoration: "none" }}>前往管理员登录</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell tasks-admin-page">
      <header className="tasks-page-heading">
        <div><h1>任务管理</h1><p>添加和管理可领取任务，并可按任务整理和筛选。</p></div>
        <div className="tasks-heading-actions">
          <button className="tasks-outline-btn" type="button" onClick={() => { setStatusFilter("ALL"); setSearchTerm(""); void refresh(); }}>刷新数据</button>
          <button className="tasks-primary-btn" type="button" onClick={startCreate}>＋ 添加任务</button>
        </div>
      </header>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}
      <section className="tasks-management-card">
        <div className="tasks-toolbar">
          <div className="tasks-search"><span aria-hidden="true">⌕</span><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="任务名称、任务编号或完整号码" aria-label="搜索任务" /></div>
          <div className="tasks-status-tabs" role="group" aria-label="任务状态筛选">
            {([["ALL","全部"],["PUBLISHED","可领取"],["DRAFT","草稿"],["PAUSED","已暂停"],["CLOSED","已结束"]] as const).map(([value,label]) =>
              <button key={value} type="button" className={statusFilter===value?"active":""} onClick={()=>setStatusFilter(value)}>{label}</button>
            )}
          </div>
          <button className="tasks-primary-btn tasks-search-btn" type="button">搜索</button>
          <button className="tasks-outline-btn" type="button" onClick={()=>{setSearchTerm("");setStatusFilter("ALL");}}>重置</button>
          <button className="tasks-outline-btn" type="button" onClick={exportTasks}>⇩ 导出</button>
        </div>
        <div className="tasks-stat-grid">
          <article className="tasks-stat-card"><span className="tasks-stat-icon blue">▣</span><div><small>任务总数（当前列表）</small><strong>{tasks.length}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon green">♙</span><div><small>可领取任务</small><strong>{publishedCount}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon orange">♧</span><div><small>累计领取次数</small><strong>{totalClaims}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon red">⊗</span><div><small>已结束任务</small><strong>{closedCount}</strong></div></article>
        </div>
        <div className="tasks-table-heading"><strong>任务列表</strong><span>共 {filteredTasks.length} 条记录</span><button type="button" className="tasks-outline-btn" onClick={()=>void refresh()} disabled={busy}>刷新数据</button></div>
        <div className="tasks-table-scroll">
          <table className="tasks-management-table">
            <thead><tr><th>任务名称</th><th>任务编号</th><th>任务分类</th><th>奖励</th><th>领取次数</th><th>号码库存（总数 / 可领取 / 已分配 / 已使用）</th><th>任务状态</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>
              {filteredTasks.map((task) => <tr key={task.id}>
                <td className="tasks-title-cell" title={task.title}>{task.title}</td><td className="tasks-id-cell" title={task.id}>{task.id.slice(0,12)}…</td>
                <td>{task.category || "未分组"}</td><td>{task.rewardAmount} {task.currency}</td><td>{task.claimedCount}</td>
                <td>{task.inventory ? `${task.inventory.total} / ${task.inventory.available} / ${task.inventory.assigned} / ${task.inventory.used}` : "尚未绑定号码"}</td>
                <td><span className={`tasks-status-pill ${task.status.toLowerCase()}`}>{statusLabel(task.status)}</span></td>
                <td>{task.createdAt ? new Date(task.createdAt).toLocaleString("zh-CN",{hour12:false}) : "—"}</td>
                <td><div className="tasks-row-actions">
                  {(task.status==="DRAFT"||task.status==="PAUSED")&&<button type="button" onClick={()=>startEdit(task)} disabled={busy||task.claimedCount>0}>编辑</button>}
                  {(task.status==="DRAFT"||task.status==="PAUSED")&&<button type="button" onClick={()=>void taskAction(task.id,"publish")} disabled={busy}>发布</button>}
                  {task.status==="PUBLISHED"&&<button type="button" onClick={()=>void taskAction(task.id,"pause")} disabled={busy}>暂停</button>}
                  {task.status!=="CLOSED"&&<button className="danger" type="button" onClick={()=>void taskAction(task.id,"close")} disabled={busy}>结束</button>}
                </div></td>
              </tr>)}
              {filteredTasks.length===0&&<tr><td colSpan={9} className="tasks-empty-row">{tasks.length===0?"目前还没有任务，请点击右上角添加任务。":"没有找到符合条件的任务"}</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="tasks-table-footer"><span>当前显示 {filteredTasks.length} 条 · 接口最多返回最近 200 条任务</span><button className="tasks-outline-btn" type="button" onClick={()=>void refresh()} disabled={busy}>刷新</button></footer>
      </section>
      {formOpen && (
        <section className="panel">
          <div className="admin-header">
            <h2 style={{ margin: 0 }}>{editingId ? "编辑任务草稿" : "创建任务草稿"}</h2>
            <button className="secondary-btn" type="button" onClick={() => setFormOpen(false)}>收起</button>
          </div>
          <form onSubmit={saveTask}>
            <div className="form-grid">
              <div className="field">
                <label>任务名称</label>
                <input value={form.title} onChange={(event) => updateField("title", event.target.value)} minLength={2} maxLength={120} required />
              </div>
              <div className="field">
                <label>任务分类</label>
                <input value={form.category} onChange={(event) => updateField("category", event.target.value)} maxLength={80} required />
              </div>
              <div className="field">
                <label>任务奖励金额</label>
                <input value={form.rewardAmount} onChange={(event) => updateField("rewardAmount", event.target.value)} inputMode="decimal" placeholder="例如 1.00" pattern="\d{1,8}(\.\d{1,2})?" required />
              </div>
              <div className="field">
                <label>奖励币种（ISO 三位代码）</label>
                <input value={form.currency} onChange={(event) => updateField("currency", event.target.value.toUpperCase())} maxLength={3} minLength={3} required />
              </div>
              <div className="field">
                <label>任务号码数量</label>
                <p className="muted" style={{ margin: 0 }}>发布时自动读取号码池中全部已授权、未分配号码；每个号码生成一条独立任务。</p>
              </div>
              <div className="field">
                <label>开始时间（留空表示立即开放）</label>
                <input type="datetime-local" value={form.startsAt} onChange={(event) => updateField("startsAt", event.target.value)} />
              </div>
              <div className="field">
                <label>结束时间（留空表示不自动到期）</label>
                <input type="datetime-local" value={form.endsAt} onChange={(event) => updateField("endsAt", event.target.value)} />
              </div>
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label>任务说明</label>
              <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} minLength={2} maxLength={5000} required />
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>WhatsApp 消息模板（发布必填）</label>
              <textarea value={form.messageTemplate} onChange={(event) => updateField("messageTemplate", event.target.value)} maxLength={5000} placeholder="填写经过批准的消息内容。用户领取任务后可在 APP 中查看并预填到 WhatsApp。" />
            </div>

            <h2 style={{ marginTop: 22 }}>消息链接与预览（可选）</h2>
            <div className="form-grid">
              <div className="field">
                <label>消息中的网页链接</label>
                <input type="url" value={form.linkUrl} onChange={(event) => updateField("linkUrl", event.target.value)} placeholder="https://example.com/page" />
              </div>
              <div className="field">
                <label>预览标题</label>
                <input value={form.previewTitle} onChange={(event) => updateField("previewTitle", event.target.value)} maxLength={180} />
              </div>
              <div className="field">
                <label>预览图片 URL</label>
                <input type="url" value={form.previewImageUrl} onChange={(event) => updateField("previewImageUrl", event.target.value)} placeholder="https://example.com/preview.jpg" />
              </div>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>预览描述</label>
              <textarea value={form.previewDescription} onChange={(event) => updateField("previewDescription", event.target.value)} maxLength={1000} />
            </div>
            <div className="notice">发布前请确认任务内容、消息模板和号码授权范围。链接预览由目标网页的 Open Graph 元信息和 WhatsApp 缓存决定，不能保证每次立即显示。</div>
            <div className="action-row">
              <button className="primary-btn" disabled={busy}>{busy ? "正在保存…" : "保存为草稿"}</button>
              <button className="secondary-btn" type="button" disabled={busy} onClick={() => { setFormOpen(false); setEditingId(null); }}>取消</button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
