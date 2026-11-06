"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Bell, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Download, Filter, LayoutDashboard, Menu, MessageSquare, MoreHorizontal, Phone, Search, Settings, Shield, SlidersHorizontal, Users, WalletCards, X } from "lucide-react";

type UserRow = {
  id: string; phone: string; displayName: string | null; referralCode: string; status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  createdAt: string; taskCount: number; approvedCount: number; rejectedCount: number; approvalRate: number | null;
  riskLabel: string; balances: { currency: string; amountMinor: string }[];
};
type Summary = { total: number; todayNew: number; last7DaysNew: number; activeToday: number; suspended: number };
type ListResult = { users: UserRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
type StatusFilter = "ALL" | "ACTIVE" | "SUSPENDED";

const columns = [
  ["phone", "账号/手机号"], ["createdAt", "创建时间"], ["status", "用户状态"], ["score", "信誉分"], ["risk", "风险"],
  ["balance", "可提现金额"], ["taskCount", "任务总数"], ["approvedCount", "已通过"], ["rejectedCount", "已拒绝"],
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
  async function changeStatus(user: UserRow) {
    const next = user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    const action = next === "SUSPENDED" ? "冻结" : "解冻";
    if (!window.confirm(`确定要${action}用户 ${user.phone} 吗？${next === "SUSPENDED" ? "冻结后该用户现有登录会话将失效。" : ""}`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await api(`/api/v1/admin/users/${user.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) }); setNotice(`用户已${action}。`); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : `${action}失败。`); } finally { setBusy(false); }
  }
  function openEdit(user: UserRow) { setEditing(user); setDisplayName(user.displayName ?? ""); }
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
      <header className="dashboard-topbar"><button className="topbar-icon" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={17}/></button><div className="topbar-actions"><div className="topbar-search"><Search size={14}/><input placeholder="搜索任务、用户、手机号..." value={searchInput} onChange={e=>setSearchInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){setPage(1);setSearch(searchInput.trim())}}}/></div><button className="topbar-icon"><CircleHelp size={17}/></button><button className="topbar-icon"><Bell size={17}/></button><span className="topbar-admin">Administrator</span></div></header>
      <section className="users-page">
        <div className="users-toolbar">
          <form className="users-search" onSubmit={submitSearch}><Search size={15}/><input placeholder="用户 ID、手机号、邮箱或昵称" value={searchInput} onChange={e=>setSearchInput(e.target.value)}/><button type="submit">搜索</button></form>
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
                :key==="score"?(user.approvalRate===null?"暂无":`${user.approvalRate}分`)
                :key==="risk"?<span className={`users-risk ${user.riskLabel==="低风险"?"low":user.riskLabel==="中风险"?"medium":"high"}`}>● {user.riskLabel}</span>
                :key==="balance"?money(user.balances)
                :key==="taskCount"?user.taskCount
                :key==="approvedCount"?user.approvedCount
                :key==="rejectedCount"?user.rejectedCount:"—"}</td>)}
              <td>—</td><td><div className="users-row-actions"><button onClick={()=>openEdit(user)}>编辑</button><button onClick={()=>void doResetPassword(user)}>重置密码</button><button className={user.status==="SUSPENDED"?"unfreeze":""} onClick={()=>void changeStatus(user)}>{user.status==="SUSPENDED"?"解冻":"冻结"}</button></div></td>
            </tr>)}
            {!users.length&&<tr><td colSpan={shownColumns.length+2} className="users-empty">{busy?"正在加载用户…":"没有找到符合条件的用户"}</td></tr>}</tbody></table></div>
          <div className="users-pagination"><span>共 {total} 条</span><div><select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select><button disabled={page<=1||busy} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={15}/></button><b>{page}</b><span>/ {totalPages}</span><button disabled={page>=totalPages||busy} onClick={()=>setPage(p=>p+1)}><ChevronRight size={15}/></button></div></div>
        </div>
      </section>
    </main>
    {editing&&<div className="users-modal-backdrop"><div className="users-modal"><button className="users-modal-close" onClick={()=>setEditing(null)}><X size={17}/></button><h2>编辑用户资料</h2><p>{editing.phone}</p><label>用户昵称<input value={displayName} maxLength={80} onChange={e=>setDisplayName(e.target.value)}/></label><div><button className="users-tool-button" onClick={()=>setEditing(null)}>取消</button><button className="users-save-button" disabled={busy} onClick={()=>void saveEdit()}>保存修改</button></div></div></div>}
    {resetPassword&&<div className="users-modal-backdrop"><div className="users-modal"><button className="users-modal-close" onClick={()=>setResetPassword("")}><X size={17}/></button><h2>密码已重置</h2><p>请安全地将临时密码交给用户。用户下次登录时建议立即修改。</p><code>{resetPassword}</code><div><button className="users-save-button" onClick={()=>{void navigator.clipboard?.writeText(resetPassword);setNotice("临时密码已复制。");setResetPassword("")}}>复制临时密码</button><button className="users-tool-button" onClick={()=>setResetPassword("")}>关闭</button></div></div></div>}
  </div>;
}

function BarChart3Icon() { return <BarChart3 size={16}/>; }
