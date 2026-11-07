"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import AdminSidebar from "../../components/AdminSidebar";

type ReviewScheme = { name: string; platform: string; referenceImage: string; instructions: string; enabled: boolean };

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
  const [activeTab, setActiveTab] = useState<"engine" | "schemes">("engine");
  const [schemes, setSchemes] = useState<ReviewScheme[]>([]);
  const [schemeForm, setSchemeForm] = useState<ReviewScheme>({ name: "", platform: "WhatsApp", referenceImage: "", instructions: "", enabled: true });
  const [editingScheme, setEditingScheme] = useState<number | null>(null);
  const [schemeBusy, setSchemeBusy] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const [current, reviewSchemes] = await Promise.all([
      api<AiConfig>("/api/v1/admin/ai-config"),
      api<ReviewScheme[]>("/api/v1/admin/tasks/configuration/reviews"),
    ]);
    setConfig(current);
    setSchemes(Array.isArray(reviewSchemes) ? reviewSchemes : []);
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

  async function saveScheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSchemeBusy(true); setError(""); setMessage("");
    try {
      const next = [...schemes];
      if (editingScheme === null) next.push(schemeForm);
      else next[editingScheme] = schemeForm;
      await api("/api/v1/admin/tasks/configuration/reviews", { method: "PATCH", body: JSON.stringify({ value: next }) });
      setSchemes(next);
      setSchemeForm({ name: "", platform: "WhatsApp", referenceImage: "", instructions: "", enabled: true });
      setEditingScheme(null);
      setMessage("审核方案已保存。");
    } catch (err) { setError(err instanceof Error ? err.message : "审核方案保存失败。"); }
    finally { setSchemeBusy(false); }
  }

  async function toggleScheme(index: number) {
    const next = schemes.map((item, i) => i === index ? { ...item, enabled: !item.enabled } : item);
    setSchemeBusy(true); setError("");
    try {
      await api("/api/v1/admin/tasks/configuration/reviews", { method: "PATCH", body: JSON.stringify({ value: next }) });
      setSchemes(next);
    } catch (err) { setError(err instanceof Error ? err.message : "状态更新失败。"); }
    finally { setSchemeBusy(false); }
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
          <div className="admin-brand">AI 审核引擎设置</div>
          <div className="admin-subtitle">统一管理 OpenAI API、模型连接与自动审核策略</div>
        </div>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}
      <nav style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid #e5eaf2", paddingBottom: 12 }}>
        <button type="button" className={activeTab === "engine" ? "primary-btn" : "secondary-btn"} onClick={() => setActiveTab("engine")}>AI 引擎与自动审核</button>
        <button type="button" className={activeTab === "schemes" ? "primary-btn" : "secondary-btn"} onClick={() => setActiveTab("schemes")}>任务审核方案</button>
      </nav>
      {activeTab === "engine" ? <form onSubmit={save}>
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
      </form> : <section className="panel">
        <h2>任务审核方案管理</h2>
        <p className="muted">在这里统一维护不同平台和任务类型的审核参考资料。启用的方案可供审核流程选择；AI 引擎连接和自动审核策略在上一个标签中配置。</p>
        <form onSubmit={saveScheme}>
          <div className="form-grid">
            <div className="field"><label>方案名称</label><input required value={schemeForm.name} onChange={e => setSchemeForm(v => ({ ...v, name: e.target.value }))} placeholder="例如：WhatsApp 私信截图审核" /></div>
            <div className="field"><label>适用平台</label><select value={schemeForm.platform} onChange={e => setSchemeForm(v => ({ ...v, platform: e.target.value }))}><option>WhatsApp</option><option>Telegram</option><option>Facebook</option><option>通用</option></select></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label>成功参考图 URL</label><input value={schemeForm.referenceImage} onChange={e => setSchemeForm(v => ({ ...v, referenceImage: e.target.value }))} placeholder="https://..." /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label>审核要求 / 判断规则</label><textarea rows={4} value={schemeForm.instructions} onChange={e => setSchemeForm(v => ({ ...v, instructions: e.target.value }))} placeholder="描述必须识别的截图内容、成功条件和拒绝条件。" /></div>
            <div className="field"><label><input type="checkbox" checked={schemeForm.enabled} onChange={e => setSchemeForm(v => ({ ...v, enabled: e.target.checked }))} /> 启用此审核方案</label></div>
          </div>
          <div className="action-row"><button className="primary-btn" disabled={schemeBusy} type="submit">{schemeBusy ? "保存中…" : editingScheme === null ? "新增审核方案" : "保存修改"}</button><button className="secondary-btn" type="button" onClick={() => { setEditingScheme(null); setSchemeForm({ name: "", platform: "WhatsApp", referenceImage: "", instructions: "", enabled: true }); }}>重置表单</button></div>
        </form>
        <div style={{ overflowX: "auto", marginTop: 18 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["方案名称", "平台", "成功参考图", "审核要求", "状态", "操作"].map(x => <th key={x} style={{ textAlign: "left", padding: 10, background: "#f8fafc", fontSize: 12 }}>{x}</th>)}</tr></thead>
            <tbody>{schemes.map((item, index) => <tr key={index}><td style={{ padding: 10, borderTop: "1px solid #edf0f5" }}>{item.name}</td><td style={{ padding: 10, borderTop: "1px solid #edf0f5" }}>{item.platform}</td><td style={{ padding: 10, borderTop: "1px solid #edf0f5", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{item.referenceImage || "—"}</td><td style={{ padding: 10, borderTop: "1px solid #edf0f5", maxWidth: 300 }}>{item.instructions || "—"}</td><td style={{ padding: 10, borderTop: "1px solid #edf0f5" }}>{item.enabled ? "已启用" : "已停用"}</td><td style={{ padding: 10, borderTop: "1px solid #edf0f5", whiteSpace: "nowrap" }}><button type="button" className="secondary-btn" onClick={() => { setEditingScheme(index); setSchemeForm({ ...item }); }}>编辑</button> <button type="button" className="secondary-btn" disabled={schemeBusy} onClick={() => void toggleScheme(index)}>{item.enabled ? "停用" : "启用"}</button></td></tr>)}</tbody>
          </table>
          {schemes.length === 0 && <p className="muted">暂无审核方案，请在上方创建。</p>}
        </div>
      </section>}
    </main></div>
  );
}
