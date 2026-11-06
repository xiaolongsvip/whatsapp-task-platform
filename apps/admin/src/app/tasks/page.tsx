"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Bell, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, Download, FileClock, Filter, HandCoins, LayoutDashboard, LogOut, Menu, MessageSquare, Phone, Search, Settings, Shield, Trash2, Users, UserRound, WalletCards, Zap } from "lucide-react";

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
type RecordStatus = "AVAILABLE" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CLOSED" | "FROZEN";
type TaskRecord = { id: string; taskId: string; taskName: string; phoneNumber: string; groupName: string; rewardAmount: string; currency: string; messageTemplate: string; countryRegion: string; status: RecordStatus; createdAt: string; claimId: string | null; claimedAt: string | null; claimedUserId: string | null };
type TaskRecordsResponse = { items: TaskRecord[]; pagination: { page: number; pageSize: number; total: number; totalPages: number }; stats: { total: number; available: number; inProgress: number; review: number; completed: number; closed: number; frozen: number } };

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
  const [statusFilter, setStatusFilter] = useState<"ALL" | RecordStatus>("ALL");
  const [records, setRecords] = useState<TaskRecord[]>([]);
  const [recordStats, setRecordStats] = useState<TaskRecordsResponse["stats"]>({total:0,available:0,inProgress:0,review:0,completed:0,closed:0,frozen:0});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [groupFilterOpen, setGroupFilterOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState("ALL");
  const [selectedRecord, setSelectedRecord] = useState<TaskRecord | null>(null);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);

  const refresh = useCallback(async () => {
    const result = await api<TaskList>("/api/v1/admin/tasks");
    setTasks(result.tasks);
  }, []);

  const loadRecords = useCallback(async () => {
    const params = new URLSearchParams({page:String(page),pageSize:String(pageSize),keyword:appliedSearch,status:statusFilter});
    const result = await api<TaskRecordsResponse>("/api/v1/admin/tasks/records?" + params.toString());
    setRecords(result.items);
    setRecordStats(result.stats);
    setTotalPages(result.pagination.totalPages);
    setTotalRecords(result.pagination.total);
    setSelectedIds([]);
  }, [page,pageSize,appliedSearch,statusFilter]);

  useEffect(() => {
    if (authenticated) void loadRecords().catch((err)=>setError(err instanceof Error?err.message:"任务号码记录加载失败。"));
  }, [authenticated,loadRecords]);

  const groupNames = Array.from(new Set(records.map((record) => record.groupName).filter(Boolean)));
  const visibleRecords = records.filter((record) => groupFilter === "ALL" || record.groupName === groupFilter);
  const pageStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, index) => pageStart + index);

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
      await loadRecords();
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
      await loadRecords();
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
    <main className="dashboard-app">
      <aside className={"dashboard-sidebar " + (sidebarOpen ? "sidebar-open" : "")}>
        <div className="sidebar-brand"><div className="sidebar-brand-mark"><Zap size={19} fill="currentColor" /></div><div><strong>EasyEarn</strong><span>后台管理</span></div></div>
        <nav className="sidebar-nav">
          <Link className="sidebar-link" href="/"><LayoutDashboard size={16}/>控制台</Link>
          <Link className="sidebar-link" href="/users"><Users size={16}/>用户管理</Link>
          <Link className="sidebar-link active" href="/tasks"><Phone size={16}/>任务管理</Link>
          <button type="button" className="sidebar-link" disabled><FileClock size={16}/>执行记录</button>
          <button type="button" className="sidebar-link" disabled><ClipboardCheck size={16}/>审核中心<ChevronDown size={14}/></button>
          <button type="button" className="sidebar-link" disabled><ClipboardCheck size={16}/>任务设置<ChevronDown size={14}/></button>
          <button type="button" className="sidebar-link" disabled><HandCoins size={16}/>邀请与分佣</button>
          <button type="button" className="sidebar-link" disabled><MessageSquare size={16}/>通知管理</button>
          <button type="button" className="sidebar-link" disabled><WalletCards size={16}/>财务管理</button>
          <button type="button" className="sidebar-link" disabled><BarChart3 size={16}/>数据报表</button>
          <button type="button" className="sidebar-link" disabled><Shield size={16}/>权限管理</button>
          <button type="button" className="sidebar-link" disabled><Settings size={16}/>系统设置</button>
        </nav>
        <div className="sidebar-version">EasyEarn v1.0.0</div>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="打开菜单"><Menu size={20}/></button>
          <div className="topbar-search"><Search size={16}/><input value={adminSearch} onChange={(event)=>setAdminSearch(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"){setSearchTerm(adminSearch);setAppliedSearch(adminSearch);setPage(1);}}} placeholder="搜索任务、用户、手机号码..."/></div>
          <div className="topbar-actions"><span className="topbar-language">文</span><button className="topbar-icon" title="帮助"><CircleHelp size={19}/></button><button className="topbar-icon" title="通知"><Bell size={19}/><i/></button><div className="admin-profile"><span className="profile-avatar"><UserRound size={18}/></span><span><strong>{adminEmail || "Administrator"}</strong><small>超级管理员</small></span></div><button className="topbar-icon" title="退出登录" onClick={()=>void logout()}><LogOut size={16}/></button></div>
        </header>
        <div className="dashboard-content tasks-dashboard-content">
      <header className="tasks-page-heading">
        <div><h1>任务管理</h1><p>添加和管理可领取任务，并可按任务整理和筛选。</p></div>
        <div className="tasks-heading-actions">
          <button className="tasks-outline-btn" type="button" onClick={()=>setGroupFilterOpen((open)=>!open)}>任务组</button>
          <button className="tasks-outline-btn" type="button" onClick={()=>{
            if(!selectedIds.length){window.alert("请先勾选需要更换话术的任务号码。");return;}
            const text=window.prompt("请输入新的 WhatsApp 话术模板：");if(text===null)return;
            const chosen=records.filter((item)=>selectedIds.includes(item.id));
            const ids=Array.from(new Set(chosen.map((item)=>item.taskId)));
            const editable=tasks.filter((task)=>ids.includes(task.id)&&task.status!=="PUBLISHED"&&task.claimedCount===0);
            if(!editable.length){window.alert("选中的任务已发布或有领取记录，暂时不能批量修改话术。");return;}
            void Promise.all(editable.map((task)=>api("/api/v1/admin/tasks/"+task.id,{method:"PATCH",body:JSON.stringify({messageTemplate:text})}))).then(async()=>{setMessage("批量更换话术完成。");await refresh();await loadRecords();}).catch((err)=>setError(err instanceof Error?err.message:"批量更新失败。"));
          }}>批量更换话术</button>
          <button className="tasks-primary-btn" type="button" onClick={startCreate}>＋ 添加任务</button>
        </div>
      </header>
      {groupFilterOpen && <div className="tasks-group-filter"><span>任务组：</span><select value={groupFilter} onChange={(event)=>setGroupFilter(event.target.value)}><option value="ALL">全部任务组</option>{groupNames.map((name)=><option key={name} value={name}>{name}</option>)}</select><button type="button" onClick={()=>{setGroupFilter("ALL");setGroupFilterOpen(false);}}>重置 / 收起</button></div>}
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}
      <section className="tasks-management-card">
        <div className="tasks-toolbar">
          <div className="tasks-search"><Search size={15}/><input value={searchTerm} onChange={(event)=>setSearchTerm(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"){setPage(1);setAppliedSearch(searchTerm);}}} placeholder="任务名称、任务/执行编号或完整号码" aria-label="搜索任务"/></div>
          <div className="tasks-status-tabs" role="group" aria-label="任务状态筛选">
            {([["ALL","全部"],["AVAILABLE","可领取"],["IN_PROGRESS","进行中"],["REVIEW","审核中"],["COMPLETED","已完成"],["CLOSED","已关闭"],["FROZEN","已冻结"]] as const).map(([value,label])=><button key={value} type="button" className={statusFilter===value?"active":""} onClick={()=>{setStatusFilter(value);setPage(1);}}>{label}</button>)}
          </div>
          <button className="tasks-primary-btn tasks-search-btn" type="button" onClick={()=>{setPage(1);setAppliedSearch(searchTerm);}}>搜索</button>
          <button className="tasks-outline-btn" type="button" onClick={()=>{setSearchTerm("");setAppliedSearch("");setStatusFilter("ALL");setGroupFilter("ALL");setPage(1);}}>重置</button>
          <button className="tasks-outline-btn" type="button" onClick={()=>setGroupFilterOpen((open)=>!open)}><Filter size={13}/> 更多筛选</button>
          <button className="tasks-outline-btn" type="button" onClick={()=>{setStatusFilter("CLOSED");setPage(1);}}><Trash2 size={13}/> 回收站</button>
          <button className="tasks-outline-btn" type="button" onClick={()=>{
            const headers=["任务名称","任务号码","任务组","奖励","话术","国家/地区","任务状态","创建时间"];
            const labels={AVAILABLE:"可领取",IN_PROGRESS:"进行中",REVIEW:"审核中",COMPLETED:"已完成",CLOSED:"已关闭",FROZEN:"已冻结"};
            const rows=visibleRecords.map((item)=>[item.taskName,item.phoneNumber,item.groupName,item.rewardAmount+" "+item.currency,item.messageTemplate,item.countryRegion,labels[item.status],new Date(item.createdAt).toLocaleString("zh-CN")]);
            const csv=[headers,...rows].map((row)=>row.map((value)=>'"'+String(value).replace(/"/g,'""')+'"').join(",")).join("\r\n");
            const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="任务管理.csv";link.click();URL.revokeObjectURL(url);
          }}><Download size={13}/> 导出</button>
        </div>
        <div className="tasks-stat-grid">
          <article className="tasks-stat-card"><span className="tasks-stat-icon blue"><Phone size={18}/></span><div><small>总任务</small><strong>{recordStats.total.toLocaleString()}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon green"><UserRound size={18}/></span><div><small>可领取</small><strong>{recordStats.available.toLocaleString()}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon orange"><Users size={18}/></span><div><small>已领取任务</small><strong>{(recordStats.inProgress+recordStats.review+recordStats.completed).toLocaleString()}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon red"><UserRound size={18}/></span><div><small>已作废</small><strong>{(recordStats.closed+recordStats.frozen).toLocaleString()}</strong></div></article>
        </div>
        <div className="tasks-table-scroll">
          <table className="tasks-management-table">
            <thead><tr>
              <th><input type="checkbox" aria-label="全选当前页" checked={visibleRecords.length>0&&visibleRecords.every((item)=>selectedIds.includes(item.id))} onChange={(event)=>setSelectedIds(event.target.checked?[...new Set([...selectedIds,...visibleRecords.map((item)=>item.id)])]:selectedIds.filter((id)=>!visibleRecords.some((item)=>item.id===id)))}/></th>
              <th>任务名称</th><th>任务号码</th><th>任务组</th><th>奖励</th><th>话术</th><th>国家/地区</th><th>任务状态</th><th>创建时间</th><th>操作</th>
            </tr></thead>
            <tbody>
              {visibleRecords.map((record)=><tr key={record.id}>
                <td><input type="checkbox" aria-label={"选择 "+record.phoneNumber} checked={selectedIds.includes(record.id)} onChange={(event)=>setSelectedIds((current)=>event.target.checked?[...current,record.id]:current.filter((id)=>id!==record.id))}/></td>
                <td className="tasks-title-cell" title={record.taskName}>{record.taskName}</td>
                <td>{record.phoneNumber}</td><td>{record.groupName}</td><td>{record.rewardAmount} {record.currency}</td>
                <td className="tasks-template-cell" title={record.messageTemplate}>{record.messageTemplate||"—"}</td><td>{record.countryRegion}</td>
                <td><span className={"tasks-status-pill "+record.status.toLowerCase()}>{({AVAILABLE:"可领取",IN_PROGRESS:"进行中",REVIEW:"审核中",COMPLETED:"已完成",CLOSED:"已关闭",FROZEN:"已冻结"} as Record<RecordStatus,string>)[record.status]}</span></td>
                <td>{new Date(record.createdAt).toLocaleString("zh-CN",{hour12:false})}</td>
                <td><div className="tasks-row-actions"><button type="button" onClick={()=>{setSelectedRecord(record);setSelectedGroup(record.groupName);}}>查看</button><button type="button" className="danger" disabled title="单条删除接口尚未实现">删除</button></div></td>
              </tr>)}
              {visibleRecords.length===0&&<tr><td colSpan={10} className="tasks-empty-row">当前任务组没有任务号码记录</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="tasks-table-footer">
          <span>共 {totalRecords.toLocaleString()} 条</span>
          <div className="tasks-pagination">
            <button className="tasks-outline-btn" disabled={page<=1} onClick={()=>setPage((value)=>Math.max(1,value-1))}><ChevronLeft size={14}/></button>
            {pageNumbers.map((number)=><button key={number} className={"tasks-outline-btn "+(page===number?"active":"")} onClick={()=>setPage(number)}>{number}</button>)}
            <button className="tasks-outline-btn" disabled={page>=totalPages} onClick={()=>setPage((value)=>Math.min(totalPages,value+1))}><ChevronRight size={14}/></button>
            <select value={pageSize} onChange={(event)=>{setPageSize(Number(event.target.value));setPage(1);}}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select>
          </div>
        </footer>
      </section>
      {selectedRecord && (
        <div className="tasks-detail-backdrop" onClick={() => setSelectedRecord(null)}>
          <aside className="tasks-detail-drawer" role="dialog" aria-modal="true" aria-label="任务详情" onClick={(event) => event.stopPropagation()}>
            <header className="tasks-detail-header">
              <div>
                <div className="tasks-detail-title">任务详情 <span className={"tasks-status-pill " + selectedRecord.status.toLowerCase()}>{({AVAILABLE:"可领取",IN_PROGRESS:"进行中",REVIEW:"审核中",COMPLETED:"已结算",CLOSED:"已关闭",FROZEN:"已冻结"} as Record<RecordStatus,string>)[selectedRecord.status]}</span></div>
                <p>{selectedRecord.phoneNumber}</p>
              </div>
              <button type="button" aria-label="关闭详情" onClick={() => setSelectedRecord(null)}>×</button>
            </header>
            <div className="tasks-detail-body">
              <section className="tasks-detail-section">
                <h3>基本信息</h3>
                <dl className="tasks-detail-list">
                  <div><dt>任务 ID</dt><dd title={selectedRecord.taskId}>{selectedRecord.taskId}</dd></div>
                  <div><dt>任务名称</dt><dd>{selectedRecord.taskName}</dd></div>
                  <div><dt>任务号码</dt><dd>{selectedRecord.phoneNumber}</dd></div>
                  <div><dt>国家/地区</dt><dd>{selectedRecord.countryRegion || "—"}</dd></div>
                  <div><dt>任务奖励</dt><dd>{selectedRecord.rewardAmount} {selectedRecord.currency}</dd></div>
                  <div><dt>任务组</dt><dd>{selectedRecord.groupName}</dd></div>
                  <div><dt>创建时间</dt><dd>{new Date(selectedRecord.createdAt).toLocaleString("zh-CN",{hour12:false})}</dd></div>
                </dl>
                <div className="tasks-detail-message">
                  <strong>完整话术</strong>
                  <p>{selectedRecord.messageTemplate || "当前任务未设置话术。"}</p>
                </div>
              </section>
              <section className="tasks-detail-section">
                <h3>当前状态</h3>
                <dl className="tasks-detail-list">
                  <div><dt>任务状态</dt><dd><span className={"tasks-status-pill " + selectedRecord.status.toLowerCase()}>{({AVAILABLE:"可领取",IN_PROGRESS:"进行中",REVIEW:"审核中",COMPLETED:"已结算",CLOSED:"已关闭",FROZEN:"已冻结"} as Record<RecordStatus,string>)[selectedRecord.status]}</span></dd></div>
                  <div><dt>领取用户</dt><dd>{selectedRecord.claimedUserId || "—"}</dd></div>
                  <div><dt>执行记录</dt><dd>{selectedRecord.claimId || "—"}</dd></div>
                  {selectedRecord.claimedAt && <div><dt>领取时间</dt><dd>{new Date(selectedRecord.claimedAt).toLocaleString("zh-CN",{hour12:false})}</dd></div>}
                </dl>
              </section>
              <section className="tasks-detail-section tasks-organize-section">
                <h3>整理任务</h3>
                <p>这里只修改任务组，不会修改奖励、话术、审核或结算规则。</p>
                <div className="tasks-organize-row">
                  <select value={selectedGroup} onChange={(event)=>setSelectedGroup(event.target.value)}>
                    {Array.from(new Set([...tasks.map((task)=>task.category),selectedRecord.groupName])).filter(Boolean).map((group)=><option key={group} value={group}>{group}</option>)}
                  </select>
                  <button type="button" disabled={groupSaving || !selectedGroup.trim() || selectedGroup===selectedRecord.groupName} onClick={async()=>{
                    setGroupSaving(true);
                    try{
                      await api("/api/v1/admin/tasks/"+selectedRecord.taskId+"/group",{method:"PATCH",body:JSON.stringify({groupName:selectedGroup})});
                      setMessage("任务组已更新。");
                      setSelectedRecord({...selectedRecord,groupName:selectedGroup});
                      await refresh();
                      await loadRecords();
                    }catch(err){setError(err instanceof Error?err.message:"保存任务组失败。");}
                    finally{setGroupSaving(false);}
                  }}>{groupSaving?"保存中…":"保存"}</button>
                </div>
              </section>
            </div>
            <footer className="tasks-detail-footer">
              <button type="button" className="tasks-detail-delete" disabled title="任务号码删除接口尚未实现，不会直接删除数据库记录。"><Trash2 size={13}/> 删除</button>
              <button type="button" className="tasks-detail-void" disabled={selectedRecord.status==="CLOSED" || selectedRecord.status==="COMPLETED"} onClick={()=>{
                setSelectedRecord(null);
                void taskAction(selectedRecord.taskId,"close");
              }}>⊗ 作废任务</button>
            </footer>
          </aside>
        </div>
      )}
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
        </div>
      </section>
    </main>
  );
}
