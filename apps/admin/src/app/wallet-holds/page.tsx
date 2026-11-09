"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminSidebar from "../../components/AdminSidebar";

type HoldEvent = { id: string; type: string; amountMinor: string; reason: string; adminId: string; createdAt: string };
type Hold = {
  id: string; walletId: string; userId: string; phone: string; amountMinor: string; currency: string;
  status: "ACTIVE" | "RELEASED" | "CAPTURED"; reason: string; referenceType: string | null;
  referenceId: string | null; createdAt: string; resolvedAt: string | null; events: HoldEvent[];
};
type HoldList = { total: number; items: Hold[] };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "请求失败，请检查 API 服务。");
  return data as T;
}
function currencyDigits(currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw new Error("钱包币种代码无效，无法确定金额精度。");
  }
}
function toMinor(amount: string, currency: string) {
  const digits = currencyDigits(currency);
  const pattern = digits === 0 ? /^\d+$/ : new RegExp("^\\d+(?:\\.\\d{1," + digits + "})?$");
  if (!pattern.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new Error("请输入大于 0 的金额，" + currency + " 最多保留 " + digits + " 位小数。");
  }
  const [whole, fraction = ""] = amount.split(".");
  return (BigInt(whole) * (10n ** BigInt(digits)) + BigInt((fraction + "0".repeat(digits)).slice(0, digits) || "0")).toString();
}
function money(minor: string, currency: string) {
  try {
    const digits = currencyDigits(currency);
    const value = Number(minor) / (10 ** digits);
    return Number.isFinite(value) ? currency + " " + value.toFixed(digits) : currency + " —";
  } catch {
    return currency + " —";
  }
}
function key() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}
export default function WalletHoldsPage() {
  const [email, setEmail] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Hold[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [status, setStatus] = useState("ACTIVE");
  const [walletId, setWalletId] = useState("");
  const [walletCurrency, setWalletCurrency] = useState("");
  const [walletLookupBusy, setWalletLookupBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [referenceType, setReferenceType] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resolveReason, setResolveReason] = useState<Record<string, string>>({});
  const refresh = useCallback(async () => {
    const result = await api<HoldList>("/api/v1/admin/wallet-holds?status=" + status + "&page=" + page + "&pageSize=" + pageSize);
    setItems(result.items);
    setTotal(result.total);
  }, [status, page]);
  useEffect(() => {
    api<{ id: string; email: string }>("/api/v1/admin-auth/me").then(async (admin) => {
      setEmail(admin.email); setAuthenticated(true); await refresh();
    }).catch(() => setAuthenticated(false)).finally(() => setLoading(false));
  }, [refresh]);
  async function lookupWallet() {
    const id = walletId.trim();
    setWalletCurrency("");
    if (!id) return;
    setWalletLookupBusy(true);
    try {
      const result = await api<{ items: Array<{ id: string; currency: string }> }>(
        "/api/v1/admin/finance/wallets?search=" + encodeURIComponent(id) + "&page=1&pageSize=1",
      );
      const wallet = result.items.find((item) => item.id === id);
      if (!wallet) throw new Error("没有找到该钱包，请检查钱包 ID。");
      currencyDigits(wallet.currency);
      setWalletCurrency(wallet.currency);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "查询钱包币种失败。");
    } finally {
      setWalletLookupBusy(false);
    }
  }
  async function freeze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (!walletCurrency) throw new Error("请先输入钱包 ID 并查询确认钱包币种。");
      const minor = toMinor(amount, walletCurrency);
      await api("/api/v1/admin/wallet-holds", { method: "POST", body: JSON.stringify({
        walletId: walletId.trim(), amountMinor: minor, reason: reason.trim(), idempotencyKey: key(),
        referenceType: referenceType.trim() || undefined, referenceId: referenceId.trim() || undefined,
      }) });
      setMessage("冻结成功，冻结金额已从可提现余额中扣除。");
      setAmount(""); setReason(""); setReferenceType(""); setReferenceId("");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "冻结失败。"); }
    finally { setBusy(false); }
  }
  async function resolve(item: Hold, action: "release" | "capture") {
    const why = resolveReason[item.id]?.trim();
    if (!why) { setError("请先填写本次操作原因。"); return; }
    const label = action === "release" ? "解冻" : "扣除冻结款";
    if (!window.confirm(`确认${label} ${money(item.amountMinor, item.currency)}？此操作会写入审计记录。`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api(`/api/v1/admin/wallet-holds/${item.id}/${action}`, { method: "POST", body: JSON.stringify({ reason: why, idempotencyKey: key() }) });
      setMessage(label + "操作成功。"); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : label + "失败。"); }
    finally { setBusy(false); }
  }
  async function logout() {
    await api("/api/v1/admin-auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    setAuthenticated(false); setItems([]);
  }
  if (loading) return <div className="dashboard-app"><AdminSidebar /><main className="dashboard-main"><div className="panel">正在检查管理员登录状态…</div></main></div>;
  if (!authenticated) return <div className="dashboard-app"><AdminSidebar /><main className="dashboard-main"><section className="panel"><h2>尚未登录管理后台</h2><p className="muted">冻结资金管理需要管理员会话。</p><Link href="/" className="primary-btn" style={{ display: "inline-block", textDecoration: "none" }}>前往管理员登录</Link></section></main></div>;
  const activeTotal = items.filter((x) => x.status === "ACTIVE").length;
  return <div className="dashboard-app"><AdminSidebar /><main className="dashboard-main">
    <header className="admin-header"><div><div className="admin-brand">WTP 管理后台</div><div className="admin-subtitle">钱包管理 · 冻结资金 · 操作审计</div></div>
      <div className="action-row" style={{ marginTop: 0 }}><span className="muted">{email}</span><Link className="secondary-btn" href="/">号码池管理</Link><Link className="secondary-btn" href="/tasks">任务管理</Link><Link className="secondary-btn" href="/ai-settings">AI 审核设置</Link><button className="secondary-btn" onClick={logout}>退出登录</button></div>
    </header>
    {error && <div className="notice error">{error}</div>}{message && <div className="notice">{message}</div>}
    <section className="panel"><h2>冻结资金记录</h2><div className="stats-grid" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}><div className="stat"><span>当前筛选记录</span><strong>{total}</strong></div><div className="stat"><span>当前页有效冻结</span><strong>{activeTotal}</strong></div></div>
      <div className="action-row"><label className="muted">记录状态</label><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ border: "1px solid #d5dfeb", borderRadius: 9, padding: "9px 11px" }}><option value="ACTIVE">冻结中</option><option value="RELEASED">已解冻</option><option value="CAPTURED">已扣除</option><option value="">全部状态</option></select><button className="secondary-btn" disabled={busy} onClick={() => void refresh()}>刷新列表</button></div>
      <div className="table-wrap" style={{ marginTop: 14 }}><table><thead><tr><th>用户手机号</th><th>钱包 ID</th><th>冻结金额</th><th>状态</th><th>冻结原因</th><th>业务关联</th><th>创建时间</th><th>处理操作</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id}><td>{item.phone}</td><td title={item.walletId}>{item.walletId.slice(0, 8)}…</td><td>{money(item.amountMinor, item.currency)}</td><td><span className={`pill ${item.status === "ACTIVE" ? "assigned" : item.status === "RELEASED" ? "available" : "blocked"}`}>{item.status === "ACTIVE" ? "冻结中" : item.status === "RELEASED" ? "已解冻" : "已扣除"}</span></td><td style={{ whiteSpace: "normal", minWidth: 180 }}>{item.reason}</td><td>{item.referenceType || "—"}{item.referenceId ? " / " + item.referenceId : ""}</td><td>{new Date(item.createdAt).toLocaleString()}</td><td style={{ minWidth: 240, whiteSpace: "normal" }}>
          {item.status === "ACTIVE" ? <><input placeholder="填写本次操作原因" value={resolveReason[item.id] || ""} onChange={(e) => setResolveReason((v) => ({ ...v, [item.id]: e.target.value }))} style={{ width: "100%", border: "1px solid #d5dfeb", borderRadius: 8, padding: 8, marginBottom: 7 }} /><div className="action-row" style={{ margin: 0 }}><button className="secondary-btn" disabled={busy} onClick={() => void resolve(item, "release")}>解冻</button><button className="danger-btn" disabled={busy} onClick={() => void resolve(item, "capture")}>扣除冻结款</button></div></> : <span className="muted">已处理</span>}
          <details style={{ marginTop: 8 }}><summary className="muted" style={{ cursor: "pointer" }}>操作历史（{item.events.length}）</summary>{item.events.map((ev) => <div key={ev.id} className="muted" style={{ whiteSpace: "normal", marginTop: 6 }}>{ev.type} · {money(ev.amountMinor, item.currency)} · {ev.reason} · {new Date(ev.createdAt).toLocaleString()}</div>)}</details>
        </td></tr>)}
        {items.length === 0 && <tr><td colSpan={8} className="muted">没有符合条件的冻结记录。</td></tr>}
      </tbody></table></div>
      <div className="action-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <span className="muted">共 {total} 条 · 第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页</span>
        <button className="secondary-btn" disabled={busy || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
        <button className="secondary-btn" disabled={busy || page >= Math.ceil(total / pageSize)} onClick={() => setPage((value) => value + 1)}>下一页</button>
      </div>
    </section>
    <section className="panel"><h2>新增冻结</h2><p className="muted">使用钱包 ID 定位账户。冻结金额必须小于或等于扣除提现预留和现有冻结后的可用余额。</p>
      <form onSubmit={freeze}><div className="form-grid">
        <div className="field"><label>钱包 ID</label><input value={walletId} onChange={(e) => { setWalletId(e.target.value); setWalletCurrency(""); }} onBlur={() => void lookupWallet()} placeholder="粘贴用户钱包 UUID" required /><span className="muted">{walletLookupBusy ? "正在查询钱包…" : walletCurrency ? "钱包币种：" + walletCurrency : "输入钱包 ID 后离开输入框，系统会查询币种"}</span></div>
        <div className="field"><label>冻结金额{walletCurrency ? "（" + walletCurrency + "，最多 " + currencyDigits(walletCurrency) + " 位小数）" : ""}</label><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={walletCurrency ? (currencyDigits(walletCurrency) === 0 ? "输入整数金额" : "例如 25." + "0".repeat(currencyDigits(walletCurrency))) : "请先查询钱包币种"} disabled={!walletCurrency || walletLookupBusy} required /></div>
        <div className="field"><label>业务类型（可选）</label><input value={referenceType} onChange={(e) => setReferenceType(e.target.value)} maxLength={80} placeholder="例如：RISK_REVIEW" /></div>
        <div className="field"><label>业务单号（可选）</label><input value={referenceId} onChange={(e) => setReferenceId(e.target.value)} maxLength={160} /></div>
      </div><div className="field" style={{ marginTop: 14 }}><label>冻结原因</label><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required /></div>
      <div className="action-row"><button className="primary-btn" disabled={busy}>{busy ? "处理中…" : "确认冻结资金"}</button></div></form>
    </section>
  </main></div>;
}
