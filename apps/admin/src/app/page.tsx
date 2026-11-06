"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, CircleHelp, ClipboardCheck, Database, Eye, EyeOff, Gift, LayoutDashboard, LockKeyhole, LogOut, Menu, Phone, RefreshCw, ScanEye, Search, Send, ShieldCheck, UserRound, Upload, Users, WalletCards, Zap } from "lucide-react";

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
type AdminDashboardSummary = { cards: { todayClaims: number; pendingReviews: number; todayApprovals: number; activeUsers: number; pendingWithdrawals: number; todayRewards: { currency: string; amountMinor: string }[] }; claimDistribution: { waiting: number; inProgress: number; pendingReview: number; completed: number; rejected: number }; taskTrend: { day: string; submitted: number; approved: number; rejected: number }[] };

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


function TrendChart({ data }: { data: { day: string; submitted: number; approved: number; rejected: number }[] }) {
  const width = 720, height = 250, left = 42, right = 18, top = 18, bottom = 38;
  const max = Math.max(1, ...data.flatMap((item) => [item.submitted, item.approved, item.rejected]));
  const x = (index: number) => left + (data.length <= 1 ? 0 : index * (width - left - right) / (data.length - 1));
  const y = (value: number) => top + (height - top - bottom) * (1 - value / max);
  const path = (key: "submitted" | "approved" | "rejected") => data.map((item, index) => (index === 0 ? "M" : "L") + " " + x(index) + " " + y(item[key])).join(" ");
  return <svg className="trend-chart" viewBox="0 0 720 250" role="img" aria-label="近7日任务趋势">
    {[0, Math.round(max / 3), Math.round(max * 2 / 3), max].map((tick, index) => <g key={index}><line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} stroke="#e6edf6" strokeDasharray="4 5"/><text x={left-9} y={y(tick)+4} textAnchor="end" fill="#8b9ab0" fontSize="10">{tick}</text></g>)}
    <path d={path("submitted")} fill="none" stroke="#16c56a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={path("approved")} fill="none" stroke="#4385ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={path("rejected")} fill="none" stroke="#ff791f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    {data.map((item,index)=><g key={item.day}><circle cx={x(index)} cy={y(item.submitted)} r="3.5" fill="#16c56a"/><circle cx={x(index)} cy={y(item.approved)} r="3.5" fill="#4385ff"/><circle cx={x(index)} cy={y(item.rejected)} r="3.5" fill="#ff791f"/><text x={x(index)} y={height-12} textAnchor="middle" fill="#8292aa" fontSize="10">{item.day.slice(5).replace("-","/")}</text></g>)}
  </svg>;
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
  const [dashboard, setDashboard] = useState<AdminDashboardSummary | null>(null);
  const [activeSection, setActiveSection] = useState<"dashboard" | "numbers">("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [numbers, setNumbers] = useState<ContactNumber[]>([]);
  const [fileName, setFileName] = useState("");
  const [phoneText, setPhoneText] = useState("");
  const [consentSource, setConsentSource] = useState("");
  const [consentedAt, setConsentedAt] = useState(localDateTimeValue);
  const [search, setSearch] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const refresh = useCallback(async () => {
    const [nextSummary, nextNumbers, nextDashboard] = await Promise.all([
      api<Summary>("/api/v1/admin/contact-numbers/summary"),
      api<ContactList>("/api/v1/admin/contact-numbers?limit=100"),
      api<AdminDashboardSummary>("/api/v1/admin/dashboard/summary"),
    ]);
    setSummary(nextSummary);
    setNumbers(nextNumbers.numbers);
    setDashboard(nextDashboard);
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
      <main className="login-layout">
        <section className="login-showcase">
          <div className="showcase-brand">
            <div className="showcase-logo"><Zap size={25} strokeWidth={2.8} /></div>
            <span>EasyEarn</span>
            <span className="brand-tag">后台管理</span>
          </div>

          <div className="showcase-content">
            <p className="showcase-eyebrow">TASK OPERATIONS PLATFORM</p>
            <h1>企业级运营管理控制台</h1>
            <p className="showcase-description">平台管理员后台，用于任务发布、审核、风控和财务结算流程管理。</p>

            <div className="showcase-features">
              <div className="showcase-feature">
                <div className="feature-icon feature-blue"><Send size={21} /></div>
                <div><strong>任务发布与智能调度</strong><span>任务库存管理与 WhatsApp 业务精准匹配分发</span></div>
              </div>
              <div className="showcase-feature">
                <div className="feature-icon feature-purple"><ScanEye size={21} /></div>
                <div><strong>AI 视觉与风险防护</strong><span>多维度 AI 视觉审核与防伪风险实时拦截引擎</span></div>
              </div>
              <div className="showcase-feature">
                <div className="feature-icon feature-green"><WalletCards size={21} /></div>
                <div><strong>财务结算与精细化风控</strong><span>全链路钱包对账、提现审核与代理佣金实时清算</span></div>
              </div>
            </div>
          </div>

          <footer className="showcase-footer">
            <span><ShieldCheck size={15} /> 256 位传输加密 · 多重安全管控</span>
            <span className="footer-note">© EasyEarn · 管理平台仅限授权运营、审核、风控及财务管理人员使用</span>
          </footer>
        </section>

        <section className="login-panel">
          <div className="login-language">简体中文</div>
          <div className="login-card">
            <div className="login-card-heading">
              <div className="login-card-mark"><LockKeyhole size={21} /></div>
              <h2>{mode === "bootstrap" ? "初始化管理员" : "欢迎回来"}</h2>
              <p>{mode === "bootstrap" ? "创建首位平台管理员账户" : "请输入您的凭据以登录管理控制台"}</p>
            </div>

            <form onSubmit={submitAuth} className="login-form">
              <div className="field login-field">
                <label htmlFor="admin-email">账号或邮箱</label>
                <div className="login-input-wrap">
                  <UserRound size={17} />
                  <input id="admin-email" type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="请输入账号或邮箱" required autoComplete="username" />
                </div>
              </div>

              <div className="field login-field">
                <label htmlFor="admin-password">密码</label>
                <div className="login-input-wrap">
                  <LockKeyhole size={17} />
                  <input id="admin-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" minLength={mode === "bootstrap" ? 10 : 1} maxLength={128} required autoComplete={mode === "bootstrap" ? "new-password" : "current-password"} />
                  <button type="button" className="password-toggle" aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {mode === "bootstrap" && (
                <div className="field login-field">
                  <label htmlFor="bootstrap-token">首次初始化密钥</label>
                  <div className="login-input-wrap">
                    <LockKeyhole size={17} />
                    <input id="bootstrap-token" type="password" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)} minLength={16} required autoComplete="off" placeholder="请输入一次性初始化密钥" />
                  </div>
                </div>
              )}

              <button className="login-submit" disabled={busy}>
                {busy ? "正在处理…" : mode === "bootstrap" ? "初始化管理员" : "登录"}
                {!busy && <ArrowRight size={17} />}
              </button>
            </form>

            {error && <div className="notice error login-notice">{error}</div>}
            {message && <div className="notice login-notice">{message}</div>}

            <button type="button" className="bootstrap-toggle" onClick={() => { setMode(mode === "login" ? "bootstrap" : "login"); setError(""); setMessage(""); }}>
              {mode === "login" ? "首次初始化管理员" : "返回管理员登录"}
            </button>
            <p className="login-security"><ShieldCheck size={14} /> 安全加密连接 · 未授权访问将被拒绝</p>
          </div>
        </section>
      </main>
    );
  }

  const claimDistribution = dashboard?.claimDistribution;
  const distributionTotal = Math.max(1, claimDistribution ? claimDistribution.waiting + claimDistribution.inProgress + claimDistribution.pendingReview + claimDistribution.completed + claimDistribution.rejected : 0);
  const distributionGradient = claimDistribution
    ? "conic-gradient(#4b83f5 0 " + (claimDistribution.waiting / distributionTotal * 100) + "%, #16c56a 0 " + ((claimDistribution.waiting + claimDistribution.inProgress) / distributionTotal * 100) + "%, #ffb21a 0 " + ((claimDistribution.waiting + claimDistribution.inProgress + claimDistribution.pendingReview) / distributionTotal * 100) + "%, #36baf2 0 " + ((claimDistribution.waiting + claimDistribution.inProgress + claimDistribution.pendingReview + claimDistribution.completed) / distributionTotal * 100) + "%, #ff7188 0 100%)"
    : "conic-gradient(#e8edf4 0 100%)";
  const rewardTotal = dashboard?.cards.todayRewards.length
    ? dashboard.cards.todayRewards.map((item: {currency:string;amountMinor:string}) => item.currency + " " + (Number(item.amountMinor)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})).join(" · ")
    : "0";

  return (
    <main className="dashboard-app">
      <aside className={"dashboard-sidebar " + (sidebarOpen ? "sidebar-open" : "")}>
        <div className="sidebar-brand"><div className="sidebar-brand-mark"><Zap size={19} fill="currentColor" /></div><div><strong>EasyEarn</strong><span>后台管理</span></div></div>
        <nav className="sidebar-nav">
          <button className={"sidebar-link " + (activeSection === "dashboard" ? "active" : "")} onClick={() => { setActiveSection("dashboard"); setSidebarOpen(false); }}><LayoutDashboard size={16}/>控制台</button>
          <button className={"sidebar-link " + (activeSection === "numbers" ? "active" : "")} onClick={() => { setActiveSection("numbers"); setSidebarOpen(false); }}><Phone size={16}/>号码管理</button>
          <Link className="sidebar-link" href="/tasks"><ClipboardCheck size={16}/>任务管理</Link>
          <div className="sidebar-group-label">审核与风控</div>
          <Link className="sidebar-link" href="/ai-reviews"><ScanEye size={16}/>AI 审核记录</Link>
          <Link className="sidebar-link" href="/ai-settings"><ShieldCheck size={16}/>AI 审核设置</Link>
          <div className="sidebar-group-label">系统管理</div>
          <Link className="sidebar-link" href="/storage-settings"><Database size={16}/>图片存储设置</Link>
          <Link className="sidebar-link" href="/wallet-holds"><WalletCards size={16}/>冻结资金管理</Link>
        </nav>
        <div className="sidebar-version">EasyEarn 管理平台</div>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="打开菜单"><Menu size={20}/></button>
          <div className="topbar-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务、用户、手机号码..."/></div>
          <div className="topbar-actions"><span className="topbar-language">文</span><button className="topbar-icon" title="帮助"><CircleHelp size={19}/></button><button className="topbar-icon" title="通知"><Bell size={19}/><i/></button><div className="admin-profile"><span className="profile-avatar"><UserRound size={18}/></span><span><strong>Administrator</strong><small>超级管理员</small></span></div><button className="topbar-icon" title="退出登录" onClick={() => void logout()}><LogOut size={17}/></button></div>
        </header>
        <div className="dashboard-content">
          {error && <div className="notice error">{error}</div>}{message && <div className="notice">{message}</div>}
          {activeSection === "dashboard" ? (
            <>
              <section className="reference-stat-grid">
                <div className="reference-stat-card"><div className="reference-stat-label">今日领取任务 <CircleHelp size={13}/></div><strong>{dashboard?.cards.todayClaims ?? "—"}</strong><small>今日累计领取</small><span className="reference-stat-icon blue"><ClipboardCheck size={19}/></span></div>
                <div className="reference-stat-card"><div className="reference-stat-label">待审核任务 <CircleHelp size={13}/></div><strong>{dashboard?.cards.pendingReviews ?? "—"}</strong><small>当前待办</small><span className="reference-stat-icon orange"><ClipboardCheck size={19}/></span></div>
                <div className="reference-stat-card"><div className="reference-stat-label">今日审核通过 <CircleHelp size={13}/></div><strong>{dashboard?.cards.todayApprovals ?? "—"}</strong><small>今日累计审核通过</small><span className="reference-stat-icon green"><ShieldCheck size={19}/></span></div>
                <div className="reference-stat-card"><div className="reference-stat-label">活跃用户 <CircleHelp size={13}/></div><strong>{dashboard?.cards.activeUsers ?? "—"}</strong><small>当前有效用户</small><span className="reference-stat-icon purple"><Users size={19}/></span></div>
                <div className="reference-stat-card"><div className="reference-stat-label">待处理提现 <CircleHelp size={13}/></div><strong>{dashboard?.cards.pendingWithdrawals ?? "—"}</strong><small>当前待办</small><span className="reference-stat-icon orange"><WalletCards size={19}/></span></div>
                <div className="reference-stat-card"><div className="reference-stat-label">今日奖励支出 <CircleHelp size={13}/></div><strong className="reward-stat-value">{rewardTotal}</strong><small>今日任务奖励入账</small><span className="reference-stat-icon blue"><Gift size={19}/></span></div>
              </section>
              <section className="reference-middle-grid">
                <div className="dashboard-card trend-card"><div className="dashboard-card-title"><h2>近7日任务趋势</h2></div><TrendChart data={dashboard?.taskTrend ?? []}/><div className="trend-legend"><span><i className="dot green-dot"/>已提交任务数</span><span><i className="dot blue-dot"/>审核通过数</span><span><i className="dot orange-dot"/>审核失败数</span></div></div>
                <div className="dashboard-card distribution-card"><div className="dashboard-card-title"><h2>任务状态分布</h2></div><div className="reference-distribution-layout">
                  <div className="reference-donut" style={{background:distributionGradient}}><div><small>总数</small><strong>{claimDistribution ? claimDistribution.waiting + claimDistribution.inProgress + claimDistribution.pendingReview + claimDistribution.completed + claimDistribution.rejected : "—"}</strong></div></div>
                  <div className="reference-distribution-legend">
                    <div><i className="dot blue-dot"/>待领取<b>{claimDistribution?.waiting ?? "—"}</b></div>
                    <div><i className="dot green-dot"/>进行中<b>{claimDistribution?.inProgress ?? "—"}</b></div>
                    <div><i className="dot yellow-dot"/>待审核<b>{claimDistribution?.pendingReview ?? "—"}</b></div>
                    <div><i className="dot cyan-dot"/>已完成<b>{claimDistribution?.completed ?? "—"}</b></div>
                    <div><i className="dot red-dot"/>已驳回<b>{claimDistribution?.rejected ?? "—"}</b></div>
                  </div>
                </div></div>
              </section>
              <section className="reference-bottom-grid">
                <div className="dashboard-card reference-pending-card"><div className="dashboard-card-title"><h2>待处理事项</h2></div>
                  <div className="reference-pending-row"><span className="pending-icon red"><WalletCards size={17}/></span><span>待处理提现</span><b>{dashboard?.cards.pendingWithdrawals ?? "—"}</b></div>
                  <button className="reference-pending-row" onClick={() => setActiveSection("numbers")}><span className="pending-icon red"><Phone size={17}/></span><span>号码库存预警</span><b>{summary?.available ?? "—"}</b><ArrowRight size={15}/></button>
                </div>
                <div className="dashboard-card reference-quick-card"><div className="dashboard-card-title"><h2>快捷操作</h2></div><div className="reference-quick-actions">
                  <button onClick={() => setActiveSection("numbers")}><span><Upload size={17}/></span>导入号码</button><button disabled title="提现管理页面尚未接入"><span><WalletCards size={17}/></span>查看提现</button>
                </div></div>
              </section>
            </>
          ) : (
            <>
              <div className="dashboard-heading-row"><div><h1>号码管理</h1><p>号码池导入、授权记录和库存状态管理。</p></div><button className="dashboard-refresh" onClick={() => void refresh()}><RefreshCw size={17}/></button></div>
              <section className="overview-grid numbers-overview-grid">
                {[["号码总数",summary?.total ?? 0],["待分配",summary?.available ?? 0],["已分配",summary?.assigned ?? 0],["已使用",summary?.used ?? 0],["已禁用",summary?.blocked ?? 0],["导入批次",summary?.batches ?? 0]].map(([label,value]) => <div className="overview-card compact-overview" key={label}><div className="overview-label">{label}</div><strong>{value}</strong></div>)}
              </section>
              <section className="dashboard-card numbers-import-card"><div className="dashboard-card-title"><div><h2>批量导入号码</h2><p>仅导入已经明确同意接收消息的号码。</p></div></div>
                <form onSubmit={importNumbers}><div className="form-grid">
                  <div className="field"><label>选择 CSV/TXT 文件</label><input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFileChange}/>{fileName && <span className="muted">当前文件：{fileName}</span>}</div>
                  <div className="field"><label>同意接收来源/证明说明</label><input value={consentSource} onChange={(event) => setConsentSource(event.target.value)} placeholder="例如：客户主动提交的订阅表单" required/></div>
                  <div className="field"><label>同意接收记录时间</label><input type="datetime-local" value={consentedAt} onChange={(event) => setConsentedAt(event.target.value)} required/></div>
                </div><div className="field" style={{marginTop:14}}><label>号码内容（每行一个国际号码）</label><textarea value={phoneText} onChange={(event) => setPhoneText(event.target.value)} placeholder={"+254700000001\n+254700000002"} required/></div>
                <div className="action-row"><button className="primary-btn" disabled={busy || !phoneText.trim()}>{busy ? "正在导入…" : "导入号码池"}</button></div></form>
              </section>
              <section className="dashboard-card numbers-table-card"><div className="dashboard-card-title"><h2>号码列表（按导入顺序）</h2><span className="muted">当前展示最近 100 条</span></div><div className="table-wrap"><table><thead><tr><th>导入顺序</th><th>WhatsApp 号码</th><th>状态</th><th>授权状态</th><th>授权来源</th><th>操作</th></tr></thead><tbody>
                {visibleNumbers.map((number) => <tr key={number.id}><td>{number.importOrder}</td><td>{number.phoneE164}</td><td><span className={"pill " + number.status.toLowerCase()}>{statusLabel(number.status)}</span></td><td>{number.consentStatus === "GRANTED" ? "已同意" : number.consentStatus === "REVOKED" ? "已撤回" : "未知"}</td><td>{number.consentSource || "—"}</td><td>{number.status !== "BLOCKED" && <button className="danger-btn" disabled={busy} onClick={() => void blockNumber(number.id)}>禁用</button>}</td></tr>)}
                {visibleNumbers.length === 0 && <tr><td colSpan={6} className="muted">暂无号码记录</td></tr>}
              </tbody></table></div></section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
