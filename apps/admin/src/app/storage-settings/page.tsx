"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Config = {
  configured: boolean; enabled: boolean; endpoint: string; bucket: string;
  region: string; accessKeyMasked: string; secretKeyMasked: string; updatedAt?: string;
};
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "请求失败。");
  return data as T;
}
export default function StorageSettingsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    api<Config>("/api/v1/admin/storage-config").then(setConfig)
      .catch(e => setError(e instanceof Error ? e.message : "读取配置失败。"))
      .finally(() => setLoading(false));
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!config) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const saved = await api<Config>("/api/v1/admin/storage-config", {
        method: "PUT", body: JSON.stringify({
          endpoint: config.endpoint, bucket: config.bucket, region: config.region,
          enabled: config.enabled,
          ...(accessKey.trim() ? { accessKey: accessKey.trim() } : {}),
          ...(secretKey.trim() ? { secretKey: secretKey.trim() } : {}),
        }),
      });
      setConfig(saved); setAccessKey(""); setSecretKey("");
      setMessage("对象存储配置已加密保存。密钥不会再次显示。");
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败。"); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="admin-shell"><section className="panel">正在读取配置…</section></main>;
  if (!config) return <main className="admin-shell"><section className="panel"><h2>无法读取存储配置</h2><div className="notice error">{error}</div><Link href="/">返回管理后台</Link></section></main>;
  return <main className="admin-shell">
    <header className="admin-header"><div><div className="admin-brand">WTP 管理后台</div><div className="admin-subtitle">系统设置 · 图片与截图对象存储</div></div>
      <div className="action-row" style={{ marginTop: 0 }}><Link className="secondary-btn" href="/">号码池管理</Link><Link className="secondary-btn" href="/tasks">任务管理</Link><Link className="secondary-btn" href="/ai-settings">AI 设置</Link></div>
    </header>
    {error && <div className="notice error">{error}</div>}{message && <div className="notice">{message}</div>}
    <form onSubmit={save}>
      <section className="panel"><h2>R2 / S3 兼容存储配置</h2>
        <p className="muted">当前阶段只保存配置，不会连接存储服务或上传文件。等部署服务器时再填写正式凭据。</p>
        <div className="form-grid">
          <div className="field"><label>Endpoint</label><input value={config.endpoint} onChange={e => setConfig({...config, endpoint:e.target.value})} placeholder="https://账户标识.r2.cloudflarestorage.com" required /></div>
          <div className="field"><label>Bucket</label><input value={config.bucket} onChange={e => setConfig({...config, bucket:e.target.value})} placeholder="wtp-evidence" required /></div>
          <div className="field"><label>Region</label><input value={config.region} onChange={e => setConfig({...config, region:e.target.value})} placeholder="auto" required /></div>
          <div className="field"><label>Access Key ID {config.configured ? "（留空保持原值）" : ""}</label><input type="password" autoComplete="new-password" value={accessKey} onChange={e => setAccessKey(e.target.value)} placeholder={config.configured ? config.accessKeyMasked : "部署时填写"} /></div>
          <div className="field"><label>Secret Access Key {config.configured ? "（留空保持原值）" : ""}</label><input type="password" autoComplete="new-password" value={secretKey} onChange={e => setSecretKey(e.target.value)} placeholder={config.configured ? config.secretKeyMasked : "部署时填写"} /></div>
        </div>
        <div className="action-row"><label><input type="checkbox" checked={config.enabled} onChange={e => setConfig({...config, enabled:e.target.checked})} /> 启用对象存储配置</label></div>
        <div className="action-row"><button className="primary-btn" disabled={busy}>{busy ? "正在保存…" : "保存配置"}</button><span className="muted">密钥使用 AES-256-GCM 加密后存入数据库。</span></div>
      </section>
    </form>
  </main>;
}
