"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";

type Summary = {
  total: number;
  available: number;
  assigned: number;
  used: number;
  blocked: number;
  batches: number;
};

type ContactNumber = {
  id: string;
  phoneE164: string;
  status: "AVAILABLE" | "ASSIGNED" | "USED" | "BLOCKED";
  consentStatus: "UNKNOWN" | "GRANTED" | "REVOKED";
  consentSource: string | null;
  consentedAt: string | null;
  importOrder: string;
  importedAt: string;
};

type ContactList = { numbers: ContactNumber[] };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.message === "string" ? data.message : "请求失败，请稍后重试。");
  }
  return data as T;
}

function localDateTimeValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function parsePhoneCsv(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const values: string[] = [];
  for (const line of lines) {
    const first = (line.split(/[;,\t]/, 1)[0] ?? "").trim().replace(/^["']|["']$/g, "");
    if (!first) continue;
    if (/^(phone|phone\s*number|号码|手机号|whatsapp)$/i.test(first)) continue;
    values.push(first);
  }
  return values;
}

function statusLabel(status: ContactNumber["status"]) {
  return {
    AVAILABLE: "待分配",
    ASSIGNED: "已分配",
    USED: "已完成使用",
    BLOCKED: "已禁用",
  }[status];
}

export default function AdminHomePage() {
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [numbers, setNumbers] = useState<ContactNumber[]>([]);
  const [fileName, setFileName] = useState("");
  const [phoneText, setPhoneText] = useState("");
  const [consentSource, setConsentSource] = useState("");
  const [consentedAt, setConsentedAt] = useState(localDateTimeValue);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    const [nextSummary, nextNumbers] = await Promise.all([
      api<Summary>("/api/v1/admin/contact-numbers/summary"),
      api<ContactList>("/api/v1/admin/contact-numbers?limit=100"),
    ]);
    setSummary(nextSummary);
    setNumbers(nextNumbers.numbers);
  }, []);

  useEffect(() => {
    api<{ id: string; email: string }>("/api/v1/admin-auth/me")
      .then(async (admin) => {
        setAdminEmail(admin.email);
        setIsAdmin(true);
        await refresh();
      })
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = mode === "bootstrap"
        ? { email: adminEmail, password, bootstrapToken }
        : { email: adminEmail, password };
      await api("/api/v1/admin-auth/" + mode, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setPassword("");
      setBootstrapToken("");
      setIsAdmin(true);
      setMessage(mode === "bootstrap" ? "管理员初始化成功。" : "登录成功。");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败。");
    } finally {
      setBusy(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".csv") && !file.name.toLowerCase().endsWith(".txt")) {
      setError("当前版本先支持 CSV/TXT 导入。Excel 请先另存为 CSV 文件。");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => setPhoneText(String(reader.result ?? ""));
    reader.onerror = () => setError("读取文件失败，请重新选择文件。");
    reader.readAsText(file, "UTF-8");
  }

  async function importNumbers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const parsed = parsePhoneCsv(phoneText);
      if (parsed.length === 0) throw new Error("文件中没有识别到号码。");
      if (!consentSource.trim()) throw new Error("请填写号码接收同意的来源。");
      if (!consentedAt) throw new Error("请填写授权记录时间。");
      const result = await api<{
        importedCount: number;
        duplicateCount: number;
        invalidCount: number;
      }>("/api/v1/admin/contact-numbers/import", {
        method: "POST",
        body: JSON.stringify({
          numbers: parsed.map((phone) => ({ phone })),
          consentSource,
          consentedAt: new Date(consentedAt).toISOString(),
          fileName: fileName || undefined,
        }),
      });
      setMessage(`导入完成：成功 ${result.importedCount} 个，重复 ${result.duplicateCount} 个，无效 ${result.invalidCount} 个。`);
      setPhoneText("");
      setFileName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "号码导入失败。");
    } finally {
      setBusy(false);
    }
  }

  async function blockNumber(id: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/v1/admin/contact-numbers/${id}/block`, { method: "POST" });
      setMessage("号码已禁用并标记为撤回授权。");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "禁用号码失败。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/v1/admin-auth/logout", { method: "POST" }).catch(() => undefined);
    setIsAdmin(false);
    setSummary(null);
    setNumbers([]);
  }

  const visibleNumbers = numbers.filter((number) => number.phoneE164.includes(search.replace(/\D/g, "")));

  if (loading) return <main className="admin-shell"><div className="panel">正在检查管理员登录状态…</div></main>;

  if (!isAdmin) {
    return (
      <main className="admin-shell">
        <header className="admin-header">
          <div>
            <div className="admin-brand">WTP 管理后台</div>
            <div className="admin-subtitle">号码池管理 · FIFO 自动分配 · 授权记录</div>
          </div>
        </header>
        <section className="panel" style={{ maxWidth: 520, margin: "40px auto" }}>
          <h2>{mode === "bootstrap" ? "首次初始化管理员" : "管理员登录"}</h2>
          <p className="muted">
            {mode === "bootstrap"
              ? "只有尚未创建任何管理员时，才能使用一次性初始化密钥开通第一个管理员。"
              : "请使用管理员邮箱和密码登录。普通用户账号不能访问号码管理接口。"}
          </p>
          <form onSubmit={submitAuth}>
            <div className="field">
              <label>管理员邮箱</label>
              <input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} required autoComplete="username" />
            </div>
            <div className="field" style={{ marginTop: 13 }}>
              <label>密码（至少 10 位）</label>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === "bootstrap" ? 10 : 1} maxLength={128} required autoComplete={mode === "bootstrap" ? "new-password" : "current-password"} />
            </div>
            {mode === "bootstrap" && (
              <div className="field" style={{ marginTop: 13 }}>
                <label>首次初始化密钥</label>
                <input type="password" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)} minLength={16} required autoComplete="off" />
              </div>
            )}
            <div className="action-row">
              <button className="primary-btn" disabled={busy}>{busy ? "处理中…" : mode === "bootstrap" ? "初始化管理员" : "登录后台"}</button>
              <button type="button" className="secondary-btn" onClick={() => setMode(mode === "login" ? "bootstrap" : "login")}>
                {mode === "login" ? "首次初始化" : "返回登录"}
              </button>
            </div>
          </form>
          {error && <div className="notice error">{error}</div>}
          {message && <div className="notice">{message}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <div className="admin-brand">WTP 管理后台</div>
          <div className="admin-subtitle">号码池管理 · FIFO 自动分配 · 授权记录</div>
        </div>
        <div className="action-row" style={{ marginTop: 0 }}>
          <span className="muted">{adminEmail}</span>
          <button className="secondary-btn" onClick={logout}>退出登录</button>
        </div>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <section className="panel">
        <h2>号码池统计</h2>
        <div className="stats-grid">
          {[
            ["号码总数", summary?.total ?? 0],
            ["待分配", summary?.available ?? 0],
            ["已分配", summary?.assigned ?? 0],
            ["已使用", summary?.used ?? 0],
            ["已禁用", summary?.blocked ?? 0],
            ["导入批次", summary?.batches ?? 0],
          ].map(([label, value]) => (
            <div className="stat" key={label}>
              <span>{label}</span><strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>批量导入号码</h2>
        <p className="muted">每行一个国际号码，必须包含国家区号。仅导入已经明确同意接收消息的号码；同意来源和时间会随批次保存。</p>
        <form onSubmit={importNumbers}>
          <div className="form-grid">
            <div className="field">
              <label>选择 CSV/TXT 文件</label>
              <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFileChange} />
              {fileName && <span className="muted">当前文件：{fileName}</span>}
            </div>
            <div className="field">
              <label>同意接收来源/证明说明</label>
              <input value={consentSource} onChange={(event) => setConsentSource(event.target.value)} placeholder="例如：客户主动提交的订阅表单，批次 2026-11-05" required />
            </div>
            <div className="field">
              <label>同意接收记录时间</label>
              <input type="datetime-local" value={consentedAt} onChange={(event) => setConsentedAt(event.target.value)} required />
            </div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>号码内容（可直接粘贴，也可读取 CSV）</label>
            <textarea value={phoneText} onChange={(event) => setPhoneText(event.target.value)} placeholder={"+254700000001\n+254700000002\n+254700000003"} required />
          </div>
          <div className="action-row">
            <button className="primary-btn" disabled={busy || !phoneText.trim()}>{busy ? "正在导入…" : "导入号码池"}</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="admin-header" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>号码列表（按导入顺序）</h2>
          <input aria-label="搜索号码" placeholder="搜索号码" value={search} onChange={(event) => setSearch(event.target.value)} style={{ border: "1px solid #d5dfeb", borderRadius: 9, padding: "9px 11px", maxWidth: 220 }} />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>导入顺序</th><th>WhatsApp 号码</th><th>状态</th><th>授权状态</th><th>授权来源</th><th>操作</th></tr></thead>
            <tbody>
              {visibleNumbers.map((number) => (
                <tr key={number.id}>
                  <td>{number.importOrder}</td>
                  <td>{number.phoneE164}</td>
                  <td><span className={`pill ${number.status.toLowerCase()}`}>{statusLabel(number.status)}</span></td>
                  <td>{number.consentStatus === "GRANTED" ? "已同意" : number.consentStatus === "REVOKED" ? "已撤回" : "未知"}</td>
                  <td>{number.consentSource || "—"}</td>
                  <td>{number.status !== "BLOCKED" && <button className="danger-btn" disabled={busy} onClick={() => void blockNumber(number.id)}>禁用</button>}</td>
                </tr>
              ))}
              {visibleNumbers.length === 0 && <tr><td colSpan={6} className="muted">暂无号码记录</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
