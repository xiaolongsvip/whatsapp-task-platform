"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Bell, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Download, Filter, LayoutDashboard, LogOut, Menu, MessageSquare, Phone, Search, Settings, Shield, SlidersHorizontal, UserRound, Users, WalletCards, X } from "lucide-react";

type UserRow = {
  id: string; phone: string; displayName: string | null; referralCode: string; status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  createdAt: string; taskCount: number; approvedCount: number; rejectedCount: number; dailyTaskLimit: number; minClaimIntervalSeconds: number; approvalRate: number | null;
  riskLabel: string; reputationScore: number; balances: { currency: string; amountMinor: string }[];
};
type Summary = { total: number; todayNew: number; last7DaysNew: number; activeToday: number; suspended: number };
type ListResult = { users: UserRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
type StatusFilter = "ALL" | "ACTIVE" | "SUSPENDED";
type UserDetail = { basic: { id:string; phone:string; status:string; createdAt:string; displayName:string|null; email:string|null; referralCode:string; inviter:{id:string;phone:string}|null; lastLoginAt:string|null; reputationScore:number; balances:{currency:string;amountMinor:string}[]; todayClaimed:number; remainingToday:number; effectiveDailyLimit:number; effectiveMinClaimIntervalSeconds:number; dailyTaskLimit:number|null; minClaimIntervalSeconds:number|null; taskLimitSource:string; intervalSource:string }; devices:{supported:boolean;items:{id:string;deviceIdentifier:string;manufacturer:string|null;model:string;androidVersion:string|null;sdkInt:number|null;appVersion:string;firstSeenAt:string;lastSeenAt:string;status:"ACTIVE"|"BLOCKED";isFlagged:boolean;flagReason:string|null;linkedAccounts:{id:string;phone:string;status:string}[];events:{id:string;eventType:string;manufacturer:string|null;model:string;androidVersion:string|null;sdkInt:number|null;appVersion:string;actorId:string|null;reason:string|null;createdAt:string}[]}[];message?:string}; payoutAccounts:{id:string;accountHolder:string;maskedAccount:string;providerCode:string;methodCode:string;currency:string;status:string;isDefault:boolean}[]; tasks:{total:number;approved:number;rejected:number;approvalRate:number|null;items:{id:string;taskTitle:string;category:string;status:string;claimedAt:string;rewardMinor:string;currency:string}[]}; withdrawals:{total:number;pending:number;paid:number;items:{id:string;amountMinor:string;currency:string;status:string;createdAt:string;payoutAccount:{maskedAccount:string}|null}[]}; risk:{calculated:boolean;label:string;reviewedTasks:number;rejectedTasks:number;events:{id:string;type:string;createdAt:string;metadata:unknown}[]}; reputation:{score:number;events:{id:string;createdAt:string;metadata:unknown;actorId:string|null}[]} };

const columns = [
  ["phone", "账号/手机号"], ["createdAt", "创建时间"], ["status", "用户状态"], ["score", "信誉分"], ["risk", "风险"],
  ["balance", "可提现金额"], ["taskCount", "任务总数"], ["approvedCount", "已通过"], ["rejectedCount", "已拒绝"], ["dailyTaskLimit", "每日可领"],
] as const;
type ColumnKey = typeof columns[number][0];

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "请求失败，请稍后重试。");
  return data as T;
}
const money = (balances: UserRow["balances"]) => balances.length ? balances.map(x => `${x.currency} ${(Number(x.amountMinor) / 100).toFixed(2)}`).join(" / ") : "US$0.000";
const dateText = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(columns.map(c => c[0]));
  const [filterOpen, setFilterOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailTab, setDetailTab] = useState("basic");
  const [policyDaily, setPolicyDaily] = useState("");
  const [policyInterval, setPolicyInterval] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("1");
  const [adjustMode, setAdjustMode] = useState<"add" | "deduct">("add");
  const [adjustReason, setAdjustReason] = useState("");
  const [deviceHistoryLoaded, setDeviceHistoryLoaded] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ search, status, page: String(page), pageSize: String(pageSize) });
      const [list, stats] = await Promise.all([
        api<ListResult>(`/api/v1/admin/users?${params.toString()}`),
        api<Summary>("/api/v1/admin/users/summary"),
      ]);
      setUsers(list.users); setTotal(list.pagination.total); setTotalPages(list.pagination.totalPages); setSummary(stats);
    } catch (e) { setError(e instanceof Error ? e.message : "读取用户列表失败。"); }
    finally { setBusy(false); }
  }, [search, status, page, pageSize]);

  useEffect(() => { void refresh(); }, [refresh]);

  function submitSearch(event: React.FormEvent) { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }
  async function logout() { await api("/api/v1/admin-auth/logout", { method: "POST" }).catch(() => undefined); window.location.href = "/"; }
  async function changeStatus(user: UserRow) {
    const next = user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    const action = next === "SUSPENDED" ? "冻结" : "解冻";
    if (!window.confirm(`确定要${action}用户 ${user.phone} 吗？${next === "SUSPENDED" ? "冻结后该用户现有登录会话将失效。" : ""}`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await api(`/api/v1/admin/users/${user.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) }); setNotice(`用户已${action}。`); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : `${action}失败。`); } finally { setBusy(false); }
  }
  function openEdit(user: UserRow) { setEditing(user); setDisplayName(user.displayName ?? ""); }
  async function openDetail(user: UserRow) {
    setBusy(true); setError(""); setDetailTab("basic");
    try { const result = await api<UserDetail>("/api/v1/admin/users/" + user.id + "/detail"); setDetail(result); setPolicyDaily(result.basic.dailyTaskLimit == null ? "" : String(result.basic.dailyTaskLimit)); setPolicyInterval(result.basic.minClaimIntervalSeconds == null ? "" : String(result.basic.minClaimIntervalSeconds)); }
    catch (e) { setError(e instanceof Error ? e.message : "读取用户详情失败。"); } finally { setBusy(false); }
  }

  async function loadDeviceHistory(deviceId: string) {
    if (!detail) return;
    setBusy(true); setError("");
    try {
      const result = await api<{items: UserDetail["devices"]["items"][number]["events"]}>(`/api/v1/admin/users/${detail.basic.id}/devices/${deviceId}/history?page=1&pageSize=100`);
      setDetail(current => current ? { ...current, devices: { ...current.devices, items: current.devices.items.map(device => device.id === deviceId ? { ...device, events: result.items } : device) } } : current);
      setDeviceHistoryLoaded(current => [...new Set([...current, deviceId])]);
    } catch (e) { setError(e instanceof Error ? e.message : "读取设备历史失败。"); }
    finally { setBusy(false); }
  }
  async function manageDevice(deviceId: string, action: "block" | "unblock" | "flag" | "unflag") {
    if (!detail) return;
    const reason = window.prompt("请填写本次设备操作原因（必填）：")?.trim();
    if (!reason) return;
    const actionLabel = action === "block" ? "限制设备" : action === "unblock" ? "解除设备限制" : action === "flag" ? "标记风险" : "解除风险标记";
    if (!window.confirm(`确认${actionLabel}？该操作将写入设备历史和管理员审计记录。`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/api/v1/admin/users/${detail.basic.id}/devices/${deviceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(action === "block" ? { status: "BLOCKED" } : action === "unblock" ? { status: "ACTIVE" } : {}),
          ...(action === "flag" ? { isFlagged: true } : action === "unflag" ? { isFlagged: false } : {}),
          reason,
        }),
      });
      setNotice(`设备操作成功：${actionLabel}。`);
      await openDetail({ id: detail.basic.id } as UserRow);
      setDetailTab("devices");
    } catch (e) { setError(e instanceof Error ? e.message : "设备操作失败。"); }
    finally { setBusy(false); }
  }
  async function savePolicy() {
    if (!detail) return;
    const daily = policyDaily.trim() === "" ? null : Number(policyDaily);
    const interval = policyInterval.trim() === "" ? null : Number(policyInterval);
    if ((daily !== null && (!Number.isInteger(daily) || daily < 0)) || (interval !== null && (!Number.isInteger(interval) || interval < 0))) { setError("任务限制必须是非负整数，留空表示继承系统默认。"); return; }
    setBusy(true);
    try { await api("/api/v1/admin/users/" + detail.basic.id + "/policy", { method:"PATCH", body:JSON.stringify({dailyTaskLimit:daily,minClaimIntervalSeconds:interval}) }); setNotice("任务限制已保存。"); await openDetail({id:detail.basic.id} as UserRow); }
    catch(e) { setError(e instanceof Error ? e.message : "保存失败。"); } finally { setBusy(false); }
  }
  async function saveReputation() {
    if (!detail) return;
    const rawAmount = Number(adjustAmount);
    const amount = Math.abs(rawAmount) * (adjustMode === "add" ? 1 : -1);
    if (!Number.isInteger(rawAmount) || rawAmount <= 0 || !adjustReason.trim()) { setError("请填写非零整数分数及调整原因。"); return; }
    setBusy(true);
    try { await api("/api/v1/admin/users/" + detail.basic.id + "/reputation", {method:"POST",body:JSON.stringify({amount,reason:adjustReason})}); setNotice("信誉分调整成功。"); await openDetail({id:detail.basic.id} as UserRow); setDetailTab("reputation"); }
    catch(e) { setError(e instanceof Error ? e.message : "信誉调整失败。"); } finally { setBusy(false); }
  }
  async function saveEdit() {
    if (!editing) return; setBusy(true); setError(""); setNotice("");
    try { await api(`/api/v1/admin/users/${editing.id}/profile`, { method: "PATCH", body: JSON.stringify({ displayName }) }); setNotice("用户资料已保存。"); setEditing(null); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "保存失败。"); } finally { setBusy(false); }
  }
  async function doResetPassword(user: UserRow) {
    if (!window.confirm(`确定重置 ${user.phone} 的登录密码吗？原有登录会话将全部失效。`)) return;
    setBusy(true); setError(""); setNotice("");
    try { const result = await api<{ temporaryPassword: string }>(`/api/v1/admin/users/${user.id}/reset-password`, { method: "POST" }); setResetPassword(result.temporaryPassword); }
    catch (e) { setError(e instanceof Error ? e.message : "密码重置失败。"); } finally { setBusy(false); }
  }
  function exportCsv() {
    const headers = ["手机号", "用户ID", "注册时间", "状态", "任务总数", "已通过", "已拒绝", "通过率", "风险", "余额"];
    const rows = users.map(u => [u.phone, u.id, dateText(u.createdAt), u.status, u.taskCount, u.approvedCount, u.rejectedCount, u.approvalRate === null ? "" : `${u.approvalRate}%`, u.riskLabel, money(u.balances)]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `用户列表-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  const shownColumns = useMemo(() => columns.filter(c => visibleColumns.includes(c[0])), [visibleColumns]);

  return <div className="dashboard-app">
    <aside className={`dashboard-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><div className="sidebar-brand-mark">E</div><div><strong>EasyEarn</strong><span>后台管理</span></div></div>
      <nav className="sidebar-nav">
        <Link className="sidebar-link" href="/"><LayoutDashboard size={16}/>控制台</Link>
        <Link className="sidebar-link active" href="/users"><Users size={16}/>用户管理</Link>
        <Link className="sidebar-link" href="/tasks"><Phone size={16}/>任务管理</Link>
        <button className="sidebar-link" disabled><ClipboardList size={16}/>执行记录</button>
        <button className="sidebar-link" disabled><Shield size={16}/>审核中心<ChevronDown size={14}/></button>
        <button className="sidebar-link" disabled><ClipboardList size={16}/>任务设置<ChevronDown size={14}/></button>
        <button className="sidebar-link" disabled><Users size={16}/>邀请与分佣</button>
        <button className="sidebar-link" disabled><MessageSquare size={16}/>通知管理</button>
        <button className="sidebar-link" disabled><WalletCards size={16}/>财务管理</button>
        <button className="sidebar-link" disabled><BarChart3Icon/>数据报表</button>
        <button className="sidebar-link" disabled><Shield size={16}/>权限管理</button>
        <button className="sidebar-link" disabled><Settings size={16}/>系统设置</button>
      </nav><div className="sidebar-version">EasyEarn v1.0.0</div>
    </aside>
    <main className="dashboard-main">
      <header className="dashboard-topbar"><button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="打开菜单"><Menu size={20}/></button><div className="topbar-search"><Search size={16}/><input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder="搜索任务、用户、手机号码..." onKeyDown={e=>{if(e.key==="Enter"){setSearchInput(globalSearch);setPage(1);setSearch(globalSearch.trim())}}}/></div><div className="topbar-actions"><span className="topbar-language">文</span><button className="topbar-icon" title="帮助"><CircleHelp size={19}/></button><button className="topbar-icon" title="通知"><Bell size={19}/><i/></button><div className="admin-profile"><span className="profile-avatar"><UserRound size={18}/></span><span><strong>Administrator</strong><small>超级管理员</small></span></div><button className="topbar-icon" title="退出登录" onClick={() => void logout()}><LogOut size={17}/></button></div></header>
      <section className="users-page">
        <div className="users-toolbar">
          <form className="users-search" onSubmit={submitSearch}><Search size={15}/><input placeholder="用户 ID、手机号、昵称或邀请码" value={searchInput} onChange={e=>setSearchInput(e.target.value)}/><button type="submit">搜索</button></form>
          <select value={status} onChange={e=>{setStatus(e.target.value as StatusFilter);setPage(1)}}><option value="ALL">全部状态</option><option value="ACTIVE">正常</option><option value="SUSPENDED">冻结</option></select>
          <button className="users-tool-button" onClick={()=>{setSearchInput("");setSearch("");setStatus("ALL");setPage(1)}}>重置</button>
          <div className="users-tool-wrap"><button className="users-tool-button" onClick={()=>setFilterOpen(!filterOpen)}><Filter size={14}/>更多筛选</button>{filterOpen&&<div className="users-popover"><strong>用户状态</strong>{(["ALL","ACTIVE","SUSPENDED"] as StatusFilter[]).map(s=><label key={s}><input type="radio" checked={status===s} onChange={()=>{setStatus(s);setPage(1);setFilterOpen(false)}}/>{s==="ALL"?"全部":s==="ACTIVE"?"正常":"冻结"}</label>)}</div>}</div>
          <button className="users-tool-button" onClick={exportCsv}><Download size={14}/>导出</button>
          <div className="users-tool-wrap"><button className="users-tool-button" onClick={()=>setColumnsOpen(!columnsOpen)}><SlidersHorizontal size={14}/>显示列</button>{columnsOpen&&<div className="users-popover"><strong>显示字段</strong>{columns.map(([key,label])=><label key={key}><input type="checkbox" checked={visibleColumns.includes(key)} onChange={e=>setVisibleColumns(current=>e.target.checked?[...current,key]:current.filter(x=>x!==key))}/>{label}</label>)}</div>}</div>
        </div>
        {error&&<div className="notice error">{error}</div>}{notice&&<div className="notice">{notice}</div>}
        <div className="users-stat-grid">
          {[
            ["用户总数",summary?.total??"—","全部注册用户","blue"],
            ["今日新增",summary?.todayNew??"—","UTC 今日注册人数","green"],
            ["近7日新增",summary?.last7DaysNew??"—","UTC 含今日及此前 6 天","orange"],
            ["今日活跃",summary?.activeToday??"—","今日存在有效登录会话","green"],
            ["冻结用户",summary?.suspended??"—","当前被冻结的用户","red"],
          ].map(([label,value,desc,color])=><div className="users-stat" key={label}><span className={`users-stat-icon ${color}`}><Users size={17}/></span><div><small>{label}</small><strong>{value}</strong><em>{desc}</em></div></div>)}
        </div>
        <div className="users-table-card">
          <div className="users-table-head"><div><strong>用户列表</strong><span>共 {total} 条记录</span></div><button className="users-tool-button" onClick={()=>void refresh()} disabled={busy}>刷新数据</button></div>
          <div className="users-table-scroll"><table className="users-table"><thead><tr>{shownColumns.map(([key,label])=><th key={key}>{label}</th>)}<th>领取间隔</th><th>操作</th></tr></thead>
            <tbody>{users.map(user=><tr key={user.id}>
              {shownColumns.map(([key])=><td key={key}>{key==="phone"?<><strong>{user.phone}</strong><small>{user.displayName||user.referralCode}</small></>
                :key==="createdAt"?dateText(user.createdAt)
                :key==="status"?<span className={`users-status ${user.status.toLowerCase()}`}>{user.status==="ACTIVE"?"正常":user.status==="SUSPENDED"?"冻结":user.status==="PENDING"?"待激活":"已关闭"}</span>
                 :key==="score"?<span className="users-table-score"><span>{user.reputationScore}分</span><span className="users-stars" aria-label={`信誉星级 ${Math.round(user.reputationScore/20)} 星`}>{Array.from({length:5},(_,i)=><span key={i}>{i<Math.max(0,Math.min(5,Math.round(user.reputationScore/20)))?"★":"☆"}</span>)}</span></span>
                :key==="risk"?<span className={`users-risk ${user.riskLabel==="低风险"?"low":user.riskLabel==="中风险"?"medium":"high"}`}>● {user.riskLabel}</span>
                :key==="balance"?money(user.balances)
                :key==="taskCount"?user.taskCount
                :key==="approvedCount"?user.approvedCount
                :key==="rejectedCount"?user.rejectedCount
                :key==="dailyTaskLimit"?user.dailyTaskLimit:"—"}</td>)}
              <td>{user.minClaimIntervalSeconds===0?"不限制":user.minClaimIntervalSeconds%60===0?`${user.minClaimIntervalSeconds/60} 分钟`:`${user.minClaimIntervalSeconds} 秒`}</td><td><div className="users-row-actions"><button onClick={()=>void openDetail(user)}>编辑</button><button onClick={()=>void doResetPassword(user)}>重置密码</button><button className={user.status==="SUSPENDED"?"unfreeze":""} onClick={()=>void changeStatus(user)}>{user.status==="SUSPENDED"?"解冻":"冻结"}</button></div></td>
            </tr>)}
            {!users.length&&<tr><td colSpan={shownColumns.length+2} className="users-empty">{busy?"正在加载用户…":"没有找到符合条件的用户"}</td></tr>}</tbody></table></div>
          <div className="users-pagination"><span>共 {total} 条</span><div><select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select><button disabled={page<=1||busy} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={15}/></button><b>{page}</b><span>/ {totalPages}</span><button disabled={page>=totalPages||busy} onClick={()=>setPage(p=>p+1)}><ChevronRight size={15}/></button></div></div>
        </div>
      </section>
    </main>

    {detail&&<div className="users-modal-backdrop users-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null)}}><div className="users-detail-modal" role="dialog" aria-modal="true" aria-label="用户详情">
      <header className="users-detail-head"><div><strong>用户详情</strong><span>{detail.basic.status==="ACTIVE"?"正常":detail.basic.status}</span><p>{detail.basic.phone}</p></div><button onClick={()=>setDetail(null)}><X size={17}/></button></header>
      <nav className="users-detail-tabs">{[["basic","基本信息"],["devices","设备信息"],["payout","收款账户"],["tasks","任务记录"],["withdrawals","提现记录"],["risk","风险记录"],["reputation","信誉记录"]].map(([key,label])=><button key={key} className={detailTab===key?"active":""} onClick={()=>setDetailTab(key)}>{label}</button>)}</nav>
      <div className="users-detail-content">
      {detailTab==="basic"&&<div className="users-basic-reference">
        <section className="users-basic-identity">
          <div className="users-basic-avatar"><UserRound size={22}/></div>
          <div className="users-basic-name"><strong>{detail.basic.displayName||detail.basic.phone}</strong><span className={`users-status ${detail.basic.status.toLowerCase()}`}>{detail.basic.status==="ACTIVE"?"正常用户":detail.basic.status==="SUSPENDED"?"冻结用户":detail.basic.status}</span><small>昵称：{detail.basic.displayName||detail.basic.phone}</small></div>
        </section>
        <section className="users-basic-metrics">
          <div><small>信誉等级</small><strong>{detail.basic.reputationScore}分 <span className="users-stars" aria-label="信誉星级">{Array.from({length:5},(_,i)=><span key={i}>{i<Math.round(detail.basic.reputationScore/20)?"★":"☆"}</span>)}</span></strong></div>
          <div><small>风险等级</small><strong><i className={detail.risk.calculated?"risk-dot calculated":"risk-dot"}/>{detail.risk.calculated?detail.risk.label:"低风险 · 未计算"}</strong></div>
          <div><small>可提现余额</small><strong>{money(detail.basic.balances)}</strong></div>
          <div><small>通过任务</small><strong>{detail.tasks.approved}</strong></div>
        </section>
        <section className="users-basic-fields">
          <div><span>用户 ID</span><strong title={detail.basic.id}>{detail.basic.id}</strong></div>
          <div><span>手机号码</span><strong>{detail.basic.phone}</strong></div>
          <div><span>邮箱</span><strong>{detail.basic.email||"未绑定"}</strong></div>
          <div><span>邀请码</span><strong>{detail.basic.referralCode||"-"}</strong></div>
          <div><span>上级邀请人</span><strong>{detail.basic.inviter?.phone||"无"}</strong></div>
          <div><span>注册时间</span><strong>{dateText(detail.basic.createdAt)}</strong></div>
          <div><span>最近登录时间</span><strong>{detail.basic.lastLoginAt?dateText(detail.basic.lastLoginAt):"-"}</strong></div>
          <div><span>用户状态</span><strong><span className={`users-status ${detail.basic.status.toLowerCase()}`}>{detail.basic.status==="ACTIVE"?"正常":detail.basic.status==="SUSPENDED"?"冻结":detail.basic.status}</span></strong></div>
        </section>
        <section className="users-policy users-policy-reference">
          <h3>任务领取限制</h3><p>用户覆盖优先于代理和系统默认；两个字段分别继承。</p>
          <div className="users-policy-effective">
            <b>当前生效领取规则</b>
            <div><span>每日任务上限<strong>{detail.basic.effectiveDailyLimit} 次/日</strong></span><span>最小领取间隔（秒）<strong>{detail.basic.effectiveMinClaimIntervalSeconds>=60?Math.floor(detail.basic.effectiveMinClaimIntervalSeconds/60)+" 分钟":detail.basic.effectiveMinClaimIntervalSeconds+" 秒"}</strong></span><span>今日已领取<strong>{detail.basic.todayClaimed}</strong></span><span>今日剩余<strong>{detail.basic.remainingToday}</strong></span></div>
            <small>个人限制状态：额度与间隔允许　个人限制允许时间：个人限制当前允许</small>
          </div>
          <div className="users-policy-fields">
            <label>自定义每日上限<input type="number" min="0" value={policyDaily} onChange={e=>setPolicyDaily(e.target.value)} placeholder={`继承（${detail.basic.effectiveDailyLimit} 次/日）`}/><small>继承规则：系统默认 {detail.basic.effectiveDailyLimit} 次/日；0 表示禁止领取任务。</small><small>实际生效：{detail.basic.effectiveDailyLimit} 次/日</small></label>
            <label>自定义最小领取间隔（秒）<input type="number" min="0" value={policyInterval} onChange={e=>setPolicyInterval(e.target.value)} placeholder={`继承（${detail.basic.effectiveMinClaimIntervalSeconds} 秒）`}/><small>继承规则：系统默认 {detail.basic.effectiveMinClaimIntervalSeconds} 秒；0 表示不限制领取间隔。</small><small>实际生效：{detail.basic.effectiveMinClaimIntervalSeconds} 秒</small></label>
          </div>
          <button disabled={busy} onClick={()=>void savePolicy()}>保存</button>
          <div className="users-policy-footnote">受当前账号信誉/风险规则限制：{detail.basic.effectiveDailyLimit} 次/日</div>
        </section>
      </div>}
      {detailTab==="devices"&&<div className="users-device-panel">
        <div className="users-device-heading"><strong>设备数量</strong><b>{detail.devices.items.length}</b><span>同一设备标识用于关联本平台登录过的账号；仅用于安全审查</span></div>
        {detail.devices.items.length?detail.devices.items.map(d=><section className="users-device-card" key={d.id}>
          <div className="users-device-card-head"><strong>{d.manufacturer?d.manufacturer+" ":""}{d.model}</strong><span className={`users-status ${d.status==="BLOCKED"?"suspended":"active"}`}>{d.status==="BLOCKED"?"已限制":"正常"}{d.isFlagged?" · 风险标记":""}</span></div>
          <div className="users-device-grid">
            <div><small>设备标识</small><strong title={d.deviceIdentifier}>{d.deviceIdentifier}</strong></div>
            <div><small>APP 版本</small><strong>{d.appVersion}</strong></div>
            <div><small>Android 版本</small><strong>{d.androidVersion||"-"}{d.sdkInt? " (API "+d.sdkInt+")":""}</strong></div>
            <div><small>首次登记</small><strong>{dateText(d.firstSeenAt)}</strong></div>
            <div><small>最后在线时间</small><strong>{dateText(d.lastSeenAt)}</strong></div>
            <div><small>设备状态</small><strong>{d.status==="BLOCKED"?"已限制使用":"正常登记"}{d.isFlagged?" · 风险标记":""}</strong></div>
          </div>
          {d.flagReason&&<div className="users-device-warning">风险原因：{d.flagReason}</div>}
          <div className="users-device-linked"><strong>同设备关联账号（{d.linkedAccounts.length}）</strong>
            {d.linkedAccounts.length>1?d.linkedAccounts.map(account=><span key={account.id}>{account.phone} · {account.status}{account.id===detail.basic.id?"（当前用户）":""}</span>):<small>暂未发现其他账号使用相同设备标识</small>}
          </div>
          <div className="users-device-actions">
            <button disabled={busy} onClick={()=>void loadDeviceHistory(d.id)}>{deviceHistoryLoaded.includes(d.id)?"重新加载历史":"查看完整历史"}</button>
            <button disabled={busy} onClick={()=>void manageDevice(d.id,d.status==="BLOCKED"?"unblock":"block")}>{d.status==="BLOCKED"?"解除设备限制":"限制此设备"}</button>
            <button disabled={busy} onClick={()=>void manageDevice(d.id,d.isFlagged?"unflag":"flag")}>{d.isFlagged?"解除风险标记":"标记风险"}</button>
          </div>
          <div className="users-device-history"><strong>设备变更与管理记录（{d.events.length}）</strong>
            {d.events.length?d.events.map(e=><div key={e.id}><span>{({DEVICE_REGISTERED:"首次登记",DEVICE_CHANGED:"设备信息变更",DEVICE_BLOCKED:"管理员限制设备",DEVICE_UNBLOCKED:"管理员解除限制",DEVICE_FLAGGED:"管理员标记风险",DEVICE_UNFLAGGED:"管理员解除风险标记"} as Record<string,string>)[e.eventType]||e.eventType}</span><span>{e.manufacturer?e.manufacturer+" ":""}{e.model} · Android {e.androidVersion||"-"} · APP {e.appVersion} · {dateText(e.createdAt)}{e.reason?" · 原因："+e.reason:""}{e.actorId?" · 操作管理员："+e.actorId:""}</span></div>):<small>暂无设备变更记录</small>}
          </div>
        </section>):<div className="users-detail-empty">该用户尚未通过 Android APP 上报设备信息。用户下次登录或启动 APP 后将自动登记。</div>}
      </div>}
      {detailTab==="payout"&&<div className="users-reference-panel">
        <div className="users-reference-count">收款账户数量 <strong>{detail.payoutAccounts.length}</strong></div>
        {detail.payoutAccounts.length ? <div className="users-reference-list">{detail.payoutAccounts.map(a=><div className="users-reference-row" key={a.id}>
          <strong>{a.accountHolder||"未设置账户名"}</strong><span>{a.currency}</span><span>{a.providerCode}</span><span>{a.methodCode}</span><span>{a.maskedAccount}</span><span className={a.status==="ACTIVE"?"reference-state-active":"reference-state-muted"}>{a.status==="ACTIVE"?"正常":a.status}</span>{a.isDefault&&<em>默认</em>}
        </div>)}</div> : <div className="users-reference-empty">暂无收款账户</div>}
      </div>}
      {detailTab==="tasks"&&<div className="users-reference-panel">
        <div className="users-reference-summary"><div><small>任务总数</small><strong>{detail.tasks.total}</strong></div><div><small>通过任务</small><strong>{detail.tasks.approved}</strong></div><div><small>拒绝任务</small><strong>{detail.tasks.rejected}</strong></div><div><small>通过率</small><strong>{detail.tasks.approvalRate==null?"暂无":(detail.tasks.approvalRate*100).toFixed(2)+"%"}</strong></div></div>
        {detail.tasks.items.length ? <div className="users-reference-list">{detail.tasks.items.map(t=><div className="users-reference-row" key={t.id}><strong>{t.taskTitle}</strong><span>{t.category}</span><span>{t.status}</span><span>{dateText(t.claimedAt)}</span><span>{t.currency} {(Number(t.rewardMinor)/100).toFixed(2)}</span></div>)}</div> : <div className="users-reference-empty">暂无任务记录</div>}
      </div>}
      {detailTab==="withdrawals"&&<div className="users-reference-panel">
        <div className="users-reference-summary"><div><small>提现总数</small><strong>{detail.withdrawals.total}</strong></div><div><small>待处理提现</small><strong>{detail.withdrawals.pending}</strong></div><div><small>已支付提现</small><strong>{detail.withdrawals.paid}</strong></div></div>
        {detail.withdrawals.items.length ? <div className="users-reference-list">{detail.withdrawals.items.map(w=><div className="users-reference-row" key={w.id}><strong>{w.currency} {(Number(w.amountMinor)/100).toFixed(2)}</strong><span>{w.status}</span><span>{dateText(w.createdAt)}</span><span>{w.payoutAccount?.maskedAccount||"未关联账户"}</span></div>)}</div> : <div className="users-reference-empty">暂无提现记录</div>}
      </div>}
      {detailTab==="risk"&&<div className="users-reference-panel users-risk-reference">
        <div className="users-reference-summary"><div><small>生效风险</small><strong>{detail.risk.label}</strong></div><div><small>档案风险</small><strong>{detail.risk.label}</strong></div><div><small>汇总风险</small><strong>{detail.risk.calculated?"已计算":"未计算"}</strong></div><div><small>风险总分</small><strong>{detail.risk.calculated?detail.risk.reviewedTasks+" 项审核":"未计算"}</strong></div><div><small>设备风险</small><strong>{detail.devices.items.some(d=>d.isFlagged||d.status==="BLOCKED")?"需关注":"未发现异常"}</strong></div><div><small>网络风险</small><strong>未计算</strong></div><div><small>支付风险</small><strong>未计算</strong></div><div><small>证据风险</small><strong>未计算</strong></div><div><small>行为风险</small><strong>{detail.risk.reviewedTasks>=5&&detail.risk.rejectedTasks/detail.risk.reviewedTasks>=0.25?"需关注":"未发现异常"}</strong></div><div><small>近期拒绝率</small><strong>{detail.risk.reviewedTasks?(detail.risk.rejectedTasks/detail.risk.reviewedTasks*100).toFixed(2)+"%":"未计算"}</strong></div><div><small>计算时间</small><strong>{detail.risk.calculated?"读取时实时计算":"未计算"}</strong></div></div>
        <div className="users-reference-actions"><button className="users-tool-button" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{const result=await api<UserDetail>("/api/v1/admin/users/"+detail.basic.id+"/detail");setDetail(result);setDetailTab("risk");setNotice("风险数据已重新读取。");}catch(e){setError(e instanceof Error?e.message:"刷新风险数据失败。");}finally{setBusy(false);}}}>重新计算 / 刷新风险</button></div>
        <div className="users-reference-table-wrap"><table className="users-reference-table"><thead><tr><th>风险类型</th><th>风险等级</th><th>风险分</th><th>风险原因</th><th>处理状态</th><th>发生时间</th></tr></thead><tbody>
          {detail.risk.events.length ? detail.risk.events.map(e=><tr key={e.id}><td>{e.type}</td><td>{detail.risk.label}</td><td>—</td><td>{typeof e.metadata==="object"&&e.metadata!==null?JSON.stringify(e.metadata):String(e.metadata??"—")}</td><td>—</td><td>{dateText(e.createdAt)}</td></tr>) : <tr><td colSpan={6} className="users-reference-no-data">暂无风险事件</td></tr>}
        </tbody></table></div>
      </div>}
      {detailTab==="reputation"&&<div className="users-reference-panel users-reputation-reference">
        <section className="users-reputation-current"><small>当前信誉</small><strong>{detail.reputation.score}分 · {detail.reputation.score>=80?"优秀":detail.reputation.score>=60?"新手":"待改善"}</strong></section>
        <section className="users-reputation-editor">
          <div className="users-reputation-mode"><button className={adjustMode==="add"?"active":""} onClick={()=>setAdjustMode("add")}>加分</button><button className={adjustMode==="deduct"?"active":""} onClick={()=>setAdjustMode("deduct")}>扣分</button></div>
          <div className="users-reputation-fields">
            <label>调整数量<input type="number" min="1" step="1" value={adjustAmount} onChange={e=>setAdjustAmount(e.target.value)}/></label>
            <label>调整后预览<output>{detail.reputation.score} → {Math.max(0,Math.min(100,detail.reputation.score+(adjustMode==="add"?1:-1)*(Number(adjustAmount)||0)))}</output></label>
          </div>
          <label className="users-reputation-reason">调整原因<textarea value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} maxLength={500} placeholder="请填写调整原因"/></label>
          <button disabled={busy} onClick={()=>void saveReputation()}>保存信誉</button>
        </section>
        <div className="users-reference-table-wrap"><table className="users-reference-table"><thead><tr><th>实际变更</th><th>请求变更</th><th>变更前后</th><th>原因/备注</th><th>来源/操作人</th><th>关联业务</th></tr></thead><tbody>
          {detail.reputation.events.length ? detail.reputation.events.map(e=>{const m=typeof e.metadata==="object"&&e.metadata!==null?e.metadata as Record<string,unknown>:{};return <tr key={e.id}><td>{String(m.after??"—")}</td><td>{String(m.requestedAmount??"—")}</td><td>{String(m.before??"—")} → {String(m.after??"—")}</td><td>{String(m.reason??"—")}</td><td>{e.actorId||"管理员"} · {dateText(e.createdAt)}</td><td>信誉调整</td></tr>}) : <tr><td colSpan={6} className="users-reference-no-data">暂无信誉事件；审核结果或管理员调整后会生成信誉记录。</td></tr>}
        </tbody></table></div>
      </div>}
      </div><footer className="users-detail-footer"><button onClick={()=>void doResetPassword({id:detail.basic.id,phone:detail.basic.phone} as UserRow)}>重置密码</button><button onClick={()=>void changeStatus({id:detail.basic.id,phone:detail.basic.phone,status:detail.basic.status} as UserRow)}>{detail.basic.status==="SUSPENDED"?"解冻用户":"冻结用户"}</button></footer>
    </div></div>}
    {editing&&<div className="users-modal-backdrop"><div className="users-modal"><button className="users-modal-close" onClick={()=>setEditing(null)}><X size={17}/></button><h2>编辑用户资料</h2><p>{editing.phone}</p><label>用户昵称<input value={displayName} maxLength={80} onChange={e=>setDisplayName(e.target.value)}/></label><div><button className="users-tool-button" onClick={()=>setEditing(null)}>取消</button><button className="users-save-button" disabled={busy} onClick={()=>void saveEdit()}>保存修改</button></div></div></div>}
    {resetPassword&&<div className="users-modal-backdrop"><div className="users-modal"><button className="users-modal-close" onClick={()=>setResetPassword("")}><X size={17}/></button><h2>密码已重置</h2><p>请安全地将临时密码交给用户。用户下次登录时建议立即修改。</p><code>{resetPassword}</code><div><button className="users-save-button" onClick={()=>{void navigator.clipboard?.writeText(resetPassword);setNotice("临时密码已复制。");setResetPassword("")}}>复制临时密码</button><button className="users-tool-button" onClick={()=>setResetPassword("")}>关闭</button></div></div></div>}
  </div>;
}

function BarChart3Icon() { return <BarChart3 size={16}/>; }
