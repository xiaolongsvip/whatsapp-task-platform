"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import AdminSidebar from "../../components/AdminSidebar";

type AiConfig = {
  baseUrl: string;
  model: string;
  enabled: boolean;
  workerEnabled: boolean;
  approveThreshold: number;
  rejectThreshold: number;
  systemPrompt: string | null;
  hasApiKey: boolean;
  apiKeyMasked: string;
  updatedAt: string;
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.message === "string" ? data.message : "请求失败，请检查 API 服务。");
  }
  return data as T;
}

export default function AiSettingsPage() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const [admin, current] = await Promise.all([
      api<{ id: string; email: string }>("/api/v1/admin-auth/me"),
      api<AiConfig>("/api/v1/admin/ai-config"),
    ]);
    setAdminEmail(admin.email);
    setConfig(current);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "读取 AI 配置失败。"))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof AiConfig>(key: K, value: AiConfig[K]) {
    setConfig((current) => current ? { ...current, [key]: value } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload: Record<string, unknown> = {
        baseUrl: config.baseUrl,
        model: config.model,
        enabled: config.enabled,
        approveThreshold: Number(config.approveThreshold),
        rejectThreshold: Number(config.rejectThreshold),
        systemPrompt: config.systemPrompt,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(clearApiKey ? { clearApiKey: true } : {}),
      };
      const updated = await api<AiConfig>("/api/v1/admin/ai-config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setConfig(updated);
      setApiKey("");
      setClearApiKey(false);
      setMessage("AI 配置已安全保存。API Key 不会在页面中再次显示。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ success: boolean; model: string; message: string }>(
        "/api/v1/admin/ai-config/test",
        { method: "POST", body: "{}" },
      );
      setMessage(result.message + " 当前模型：" + result.model);
    } catch (err) {
      setError(err instanceof Error ? err.message : "连接测试失败。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/v1/admin-auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    window.location.href = "/";
  }

  if (loading) return <main className="admin-shell"><div className="panel">正在读取 AI 配置…</div></main>;
  if (!config) return (
    <main className="admin-shell">
      <section className="panel">
        <h2>无法读取 AI 配置</h2>
        {error && <div className="notice error">{error}</div>}
        <Link href="/" className="secondary-btn">返回管理员首页</Link>
      </section>
    </main>
  );

  return (
    <div className="dashboard-app"><AdminSidebar /><main className="dashboard-main">
      <header className="admin-header">
        <div>
          <div className="admin-brand">WTP 管理后台</div>
          <div className="admin-subtitle">AI 审核配置 · OpenAI API · 安全设置</div>
        </div>
        <div className="action-row" style={{ marginTop: 0 }}>
          <span className="muted">{adminEmail}</span>
          <Link className="secondary-btn" href="/">号码池管理</Link>
          <Link className="secondary-btn" href="/tasks">任务管理</Link>
          <Link className="secondary-btn" href="/ai-reviews">AI 审核记录</Link>
          <Link className="secondary-btn" href="/storage-settings">图片存储设置</Link>
          <button className="secondary-btn" onClick={logout}>退出登录</button>
        </div>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <form onSubmit={save}>
        <section className="panel">
          <h2>OpenAI 服务连接</h2>
          <p className="muted">API Key 只在服务端加密保存，读取配置时不会返回明文。</p>
          <div className="form-grid">
            <div className="field">
              <label>API Base URL</label>
              <input value={config.baseUrl} onChange={(e) => update("baseUrl", e.target.value)} required placeholder="https://api.openai.com/v1" />
            </div>
            <div className="field">
              <label>模型名称</label>
              <input value={config.model} onChange={(e) => update("model", e.target.value)} required placeholder="gpt-4.1" />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>OpenAI API Key {config.hasApiKey ? "（已配置，输入新值可替换）" : "（尚未配置）"}</label>
              <input type="password" autoComplete="new-password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setClearApiKey(false); }} placeholder={config.hasApiKey ? "留空表示保持当前密钥" : "sk-..."} />
              {config.hasApiKey && <span className="muted">当前密钥：{config.apiKeyMasked}</span>}
            </div>
          </div>
          {config.hasApiKey && (
            <div className="action-row">
              <label className="muted"><input type="checkbox" checked={clearApiKey} onChange={(e) => { setClearApiKey(e.target.checked); if (e.target.checked) setApiKey(""); }} /> 清除已保存的 API Key</label>
            </div>
          )}
          <div className="action-row">
            <button className="secondary-btn" type="button" disabled={busy} onClick={testConnection}>测试 API 连接</button>
            <span className="muted">连接测试会调用当前模型的 Responses API。</span>
          </div>
        </section>

        <section className="panel">
          <h2>自动审核策略</h2>
          <div className="action-row" style={{ marginTop: 0, marginBottom: 16 }}>
            <label><input type="checkbox" checked={config.enabled} disabled={!config.workerEnabled && !config.enabled} onChange={(e) => update("enabled", e.target.checked)} /> 启用 AI 自动审核</label>
            <span className="muted">{config.workerEnabled ? "后台 AI 工作器已启动。启用后，新提交会进入审核队列。" : "后台 AI 工作器尚未启动。请先在本地 .env 将 AI_REVIEW_WORKER_ENABLED 设置为 true 并重启 API；否则只会进入队列，不会自动审核。"} 数据库迁移和 Prisma Client 生成也必须完成。</span>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>自动通过置信度阈值（0–1）</label>
              <input type="number" min="0" max="1" step="0.01" value={config.approveThreshold} onChange={(e) => update("approveThreshold", Number(e.target.value))} required />
            </div>
            <div className="field">
              <label>自动拒绝置信度阈值（0–1）</label>
              <input type="number" min="0" max="1" step="0.01" value={config.rejectThreshold} onChange={(e) => update("rejectThreshold", Number(e.target.value))} required />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>审核系统提示词（可选）</label>
              <textarea value={config.systemPrompt ?? ""} onChange={(e) => update("systemPrompt", e.target.value)} placeholder="后续 OCR 审核流程会使用此提示词；留空使用系统默认规则。" />
            </div>
          </div>
          <div className="action-row">
            <button className="primary-btn" type="submit" disabled={busy}>{busy ? "正在处理…" : "保存 AI 配置"}</button>
            <span className="muted">最后更新：{new Date(config.updatedAt).toLocaleString()}</span>
          </div>
        </section>
      </form>
    </main></div>
  );
}
