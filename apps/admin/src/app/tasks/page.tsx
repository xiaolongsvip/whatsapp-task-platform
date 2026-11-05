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
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <div className="admin-brand">WTP 管理后台</div>
          <div className="admin-subtitle">任务管理 · 创建 · 发布 · 暂停</div>
        </div>
        <div className="action-row" style={{ marginTop: 0 }}>
          <span className="muted">{adminEmail}</span>
          <Link className="secondary-btn" href="/" style={{ textDecoration: "none" }}>号码池管理</Link>
          <button className="secondary-btn" onClick={logout}>退出登录</button>
        </div>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <section className="panel">
        <div className="admin-header" style={{ marginBottom: 8 }}>
          <div>
            <h2 style={{ marginBottom: 5 }}>任务列表</h2>
            <p className="muted" style={{ margin: 0 }}>草稿不会显示在用户任务大厅；只有发布状态且在有效时间内的任务才会开放领取。</p>
          </div>
          <button className="primary-btn" onClick={startCreate}>＋ 创建任务</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>任务名称</th><th>分类</th><th>奖励</th><th>领取次数</th><th>号码库存（总数 / 可领取 / 已分配 / 已使用）</th><th>状态</th><th>开始时间</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.category}</td>
                  <td>{task.currency} {task.rewardAmount}</td>
                  <td>{task.claimedCount}</td>
                  <td>{task.inventory ? `${task.inventory.total} / ${task.inventory.available} / ${task.inventory.assigned} / ${task.inventory.used}` : "尚未绑定号码"}</td>
                  <td><span className={`pill ${task.status === "PUBLISHED" ? "available" : task.status === "PAUSED" ? "assigned" : task.status === "CLOSED" ? "blocked" : ""}`}>{statusLabel(task.status)}</span></td>
                  <td>{task.startsAt ? new Date(task.startsAt).toLocaleString() : "立即"}</td>
                  <td>
                    <div className="action-row" style={{ margin: 0, flexWrap: "nowrap" }}>
                      {(task.status === "DRAFT" || task.status === "PAUSED") && (
                        <button className="secondary-btn" disabled={busy || task.claimedCount > 0} onClick={() => startEdit(task)}>编辑</button>
                      )}
                      {(task.status === "DRAFT" || task.status === "PAUSED") && (
                        <button className="primary-btn" disabled={busy} onClick={() => void taskAction(task.id, "publish")}>发布</button>
                      )}
                      {task.status === "PUBLISHED" && (
                        <button className="secondary-btn" disabled={busy} onClick={() => void taskAction(task.id, "pause")}>暂停</button>
                      )}
                      {task.status !== "CLOSED" && (
                        <button className="danger-btn" disabled={busy} onClick={() => void taskAction(task.id, "close")}>结束</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && <tr><td colSpan={8} className="muted">目前还没有任务，请先创建任务草稿。</td></tr>}
            </tbody>
          </table>
        </div>
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
