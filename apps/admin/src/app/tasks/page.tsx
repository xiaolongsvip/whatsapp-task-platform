"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminSidebar from "../../components/AdminSidebar";
import { useRouter } from "next/navigation";
import { BarChart3, Bell, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, Download, FileClock, Filter, HandCoins, LayoutDashboard, LogOut, Menu, MessageSquare, Phone, Search, Settings, Shield, Trash2, Users, UserRound, WalletCards, Zap } from "lucide-react";

type TaskStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED";

type AdminTask = {
  id: string;
  title: string;
  description: string;
  category: string;
  groupName: string;
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
type MessageTemplateOption = { id: string; name: string; platform: string; action: string; content: string; enabled: boolean };
type TaskGroupOption = { id: string; name: string; description: string | null; taskCount: number };
type RecordStatus = "AVAILABLE" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CLOSED" | "FROZEN" | "VOIDED";
type TaskRecord = { id: string; taskId: string; taskStatus: TaskStatus; inventoryStatus: "AVAILABLE" | "ASSIGNED" | "USED" | "VOIDED"; taskName: string; phoneNumber: string; groupName: string; rewardAmount: string; currency: string; messageTemplate: string; countryRegion: string; status: RecordStatus; createdAt: string; claimId: string | null; claimedAt: string | null; claimedUserId: string | null };
type TaskRecordsResponse = { items: TaskRecord[]; pagination: { page: number; pageSize: number; total: number; totalPages: number }; stats: { total: number; available: number; inProgress: number; review: number; completed: number; closed: number; frozen: number; voided: number; todayCreated: number; todayCompleted: number; todayVoided: number; successRate: number } };
type ClaimHistoryRecord = {
  id: string; taskId: string; taskName: string; category: string; groupName: string;
  phoneNumber: string; countryRegion: string; userPhone: string; rewardAmount: string; currency: string;
  status: string; claimedAt: string; expiresAt: string | null; submissionId: string | null;
  submissionStatus: string | null; submittedAt: string | null; reviewDecision: string | null;
  reviewReason: string | null; aiReviewStatus: string | null; aiConfidence: number | null;
};
type ClaimHistoryResponse = { items: ClaimHistoryRecord[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };

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
  const router = useRouter();
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
  const [recordStats, setRecordStats] = useState<TaskRecordsResponse["stats"]>({total:0,available:0,inProgress:0,review:0,completed:0,closed:0,frozen:0,voided:0,todayCreated:0,todayCompleted:0,todayVoided:0,successRate:0});
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
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [useStageFilter, setUseStageFilter] = useState<"ALL" | "USED" | "UNUSED">("ALL");
  const [reviewResultFilter, setReviewResultFilter] = useState<"ALL" | "APPROVED" | "PENDING" | "REJECTED">("ALL");
  const [taskIdFilter, setTaskIdFilter] = useState("");
  const [claimHistory, setClaimHistory] = useState<ClaimHistoryRecord[]>([]);
  const [claimHistoryPage, setClaimHistoryPage] = useState(1);
  const [claimHistoryPageSize, setClaimHistoryPageSize] = useState(20);
  const [claimHistoryTotal, setClaimHistoryTotal] = useState(0);
  const [claimHistoryTotalPages, setClaimHistoryTotalPages] = useState(1);
  const [claimHistoryKeyword, setClaimHistoryKeyword] = useState("");
  const [claimHistoryTaskId, setClaimHistoryTaskId] = useState("");
  const [claimHistoryStatus, setClaimHistoryStatus] = useState("ALL");
  const [claimHistoryLoading, setClaimHistoryLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<TaskRecord | null>(null);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [taskGroups, setTaskGroups] = useState<TaskGroupOption[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const [bulkMessageTab, setBulkMessageTab] = useState<"manual" | "template">("manual");
  const [bulkMessageText, setBulkMessageText] = useState("");
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplateOption[]>([]);
  const [bulkPlatforms, setBulkPlatforms] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const result = await api<TaskList>("/api/v1/admin/tasks");
    setTasks(result.tasks);
  }, []);

  const loadRecords = useCallback(async () => {
    const params = new URLSearchParams({page:String(page),pageSize:String(pageSize),keyword:appliedSearch,status:statusFilter,groupName:groupFilter,countryRegion:countryFilter.trim()});
    if (useStageFilter !== "ALL") params.set("useStage", useStageFilter);
    if (reviewResultFilter !== "ALL") params.set("reviewResult", reviewResultFilter);
    if (taskIdFilter.trim()) params.set("taskId", taskIdFilter.trim());
    if (createdFrom) params.set("createdFrom", new Date(createdFrom + "T00:00:00").toISOString());
    if (createdTo) params.set("createdTo", new Date(createdTo + "T23:59:59.999").toISOString());
    const result = await api<TaskRecordsResponse>("/api/v1/admin/tasks/records?" + params.toString());
    setRecords(result.items);
    setRecordStats(result.stats);
    setTotalPages(result.pagination.totalPages);
    setTotalRecords(result.pagination.total);
    setSelectedIds([]);
  }, [page,pageSize,appliedSearch,statusFilter,groupFilter,createdFrom,createdTo,countryFilter,useStageFilter,reviewResultFilter,taskIdFilter]);

  useEffect(() => {
    if (authenticated) void loadRecords().catch((err)=>setError(err instanceof Error?err.message:"任务号码记录加载失败。"));
  }, [authenticated,loadRecords]);

  const loadClaimHistory = useCallback(async () => {
    setClaimHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(claimHistoryPage),
        pageSize: String(claimHistoryPageSize),
        keyword: claimHistoryKeyword.trim(),
        taskId: claimHistoryTaskId.trim(),
        status: claimHistoryStatus,
      });
      const result = await api<ClaimHistoryResponse>("/api/v1/admin/tasks/records/history?" + params.toString());
      setClaimHistory(result.items);
      setClaimHistoryTotal(result.pagination.total);
      setClaimHistoryTotalPages(result.pagination.totalPages);
    } finally {
      setClaimHistoryLoading(false);
    }
  }, [claimHistoryPage,claimHistoryPageSize,claimHistoryKeyword,claimHistoryTaskId,claimHistoryStatus]);

  useEffect(() => {
    if (authenticated) void loadClaimHistory().catch((err)=>setError(err instanceof Error?err.message:"领取历史加载失败。"));
  }, [authenticated,loadClaimHistory]);

  const groupNames = Array.from(new Set(taskGroups.map((group) => group.name).filter((name) => name && name !== "未分组")));
  const visibleRecords = records;
  const pageStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, index) => pageStart + index);

  useEffect(() => {
    api<{ id: string; email: string }>("/api/v1/admin-auth/me")
      .then(async (admin) => {
        setAdminEmail(admin.email);
        setAuthenticated(true);
        await refresh();
        const groups = await api<TaskGroupOption[]>("/api/v1/admin/tasks/groups");
        setTaskGroups(groups);
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
    router.push("/tasks/new");
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
      <AdminSidebar />
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
          <button className="tasks-outline-btn" type="button" onClick={async()=>{setGroupModalOpen(true);try{const result=await api<TaskGroupOption[]>("/api/v1/admin/tasks/groups");setTaskGroups(result);}catch(err){setError(err instanceof Error?err.message:"任务组加载失败。");}}}>任务组</button>
          <button className="tasks-outline-btn" type="button" disabled={!selectedIds.length || busy} onClick={async()=>{
            if(!selectedIds.length)return;
            const chosen=records.filter((item)=>selectedIds.includes(item.id));
            const taskIds=Array.from(new Set(chosen.map((item)=>item.taskId)));
            const warning="将修改所选记录涉及的 "+taskIds.length+" 个任务的任务组名称。\n注意：同一任务下未勾选的其他号码记录也会同步显示新任务组。\n确定继续吗？";
            if(!window.confirm(warning))return;
            const groupName=window.prompt("请输入新的任务组名称：");
            if(groupName===null)return;
            setBusy(true);setError("");setMessage("");
            try{
              const result=await api<{total:number;succeeded:number;failed:number;results:Array<{taskId:string;success:boolean;message:string}>}>("/api/v1/admin/tasks/records/bulk-group",{method:"PATCH",body:JSON.stringify({ids:selectedIds,groupName})});
              setMessage("批量更换任务组完成：成功 "+result.succeeded+" 个任务，失败 "+result.failed+" 个任务。");
              if(result.failed){setError(result.results.filter((item)=>!item.success).map((item)=>item.taskId+": "+item.message).join("；"));}
              await refresh();await loadRecords();
            }catch(err){setError(err instanceof Error?err.message:"批量更换任务组失败。");}
            finally{setBusy(false);}
          }}>批量更换任务组（{selectedIds.length}）</button>
          <button className="tasks-outline-btn" type="button" disabled={!selectedIds.length || busy} onClick={async()=>{
            if(!selectedIds.length)return;
            const chosen=records.filter((item)=>selectedIds.includes(item.id));
            const eligible=chosen.filter((item)=>item.taskStatus!=="PUBLISHED"&&item.inventoryStatus==="AVAILABLE"&&!item.claimId);
            const skipped=chosen.length-eligible.length;
            if(!eligible.length){window.alert("选中的记录没有符合删除条件的项目。只能删除已暂停/草稿任务下未领取的可用记录。");return;}
            if(!window.confirm("确定批量删除 "+eligible.length+" 条未领取记录吗？"+(skipped?"\n另有 "+skipped+" 条不符合条件，将保留不动。":"")+"\n删除后号码回到可分配号码池。"))return;
            setBusy(true);setError("");setMessage("");
            try{
              const result=await api<{total:number;succeeded:number;failed:number;results:Array<{id:string;success:boolean;message:string}>}>("/api/v1/admin/tasks/records/bulk-delete",{method:"POST",body:JSON.stringify({ids:eligible.map((item)=>item.id)})});
              setMessage("批量删除完成：成功 "+result.succeeded+" 条，失败 "+result.failed+" 条。"+(skipped?"跳过 "+skipped+" 条不符合条件的记录。":""));
              if(result.failed){setError(result.results.filter((item)=>!item.success).map((item)=>item.id+": "+item.message).join("；"));}
              await refresh();await loadRecords();
            }catch(err){setError(err instanceof Error?err.message:"批量删除失败。");}
            finally{setBusy(false);}
          }}>批量删除（{selectedIds.length}）</button>
          <button className="tasks-outline-btn" type="button" disabled={!selectedIds.length || busy} onClick={async()=>{
            if(!selectedIds.length)return;
            const chosen=records.filter((item)=>selectedIds.includes(item.id));
            const eligible=chosen.filter((item)=>!["COMPLETED","REVIEW","FROZEN"].includes(item.status));
            const skipped=chosen.length-eligible.length;
            if(!eligible.length){window.alert("选中的记录没有符合作废条件的项目。");return;}
            if(!window.confirm("确定回收并重新分配 "+eligible.length+" 条任务号码记录吗？"+(skipped?"\n另有 "+skipped+" 条已完成、审核中或冻结的记录将跳过。":"")+"\n不会关闭整批任务。"))return;
            setBusy(true);setError("");setMessage("");
            try{
              const result=await api<{total:number;succeeded:number;failed:number;results:Array<{id:string;success:boolean;message:string}>}>("/api/v1/admin/tasks/records/bulk-void",{method:"POST",body:JSON.stringify({ids:eligible.map((item)=>item.id)})});
              setMessage("批量回收完成：成功 "+result.succeeded+" 条，失败 "+result.failed+" 条。"+(skipped?"跳过 "+skipped+" 条不符合条件的记录。":""));
              if(result.failed){setError(result.results.filter((item)=>!item.success).map((item)=>item.id+": "+item.message).join("；"));}
              await refresh();await loadRecords();
            }catch(err){setError(err instanceof Error?err.message:"批量作废失败。");}
            finally{setBusy(false);}
          }}>回收并重新分配（{selectedIds.length}）</button>

          <button className="tasks-outline-btn" type="button" disabled={busy} onClick={async()=>{
            try{
              const eligible=tasks.filter((task)=>task.status!=="PUBLISHED"&&task.claimedCount===0&&(groupFilter==="ALL"||task.groupName===groupFilter));
              setBulkPlatforms(Array.from(new Set(eligible.map((task)=>task.category))));
              const templates=await api<MessageTemplateOption[]>("/api/v1/admin/tasks/message-templates?enabled=true");
              setMessageTemplates(templates.filter((item)=>item.enabled));
              setBulkMessageText("");
              setBulkTemplateId("");
              setBulkMessageTab("manual");
              setBulkMessageOpen(true);
            }catch(err){setError(err instanceof Error?err.message:"话术模板加载失败。");}
          }}>批量更换话术</button>
          <button className="tasks-primary-btn" type="button" onClick={startCreate}>＋ 添加任务</button>
        </div>
      </header>
      {groupFilterOpen && <div className="tasks-group-filter"><span>任务组：</span><select value={groupFilter} onChange={(event)=>{setGroupFilter(event.target.value);setPage(1);}}><option value="ALL">全部任务组</option>{groupNames.map((name)=><option key={name} value={name}>{name}</option>)}</select><label>创建开始</label><input aria-label="创建开始日期" type="date" value={createdFrom} onChange={(event)=>{setCreatedFrom(event.target.value);setPage(1);}}/><label>创建结束</label><input aria-label="创建结束日期" type="date" value={createdTo} onChange={(event)=>{setCreatedTo(event.target.value);setPage(1);}}/><label>国家/地区</label><input aria-label="国家/地区筛选" value={countryFilter} onChange={(event)=>{setCountryFilter(event.target.value);setPage(1);}} placeholder="国家代码或名称"/><label>使用阶段</label><select aria-label="使用阶段筛选" value={useStageFilter} onChange={(event)=>{setUseStageFilter(event.target.value as typeof useStageFilter);setPage(1);}}><option value="ALL">全部阶段</option><option value="USED">已使用</option><option value="UNUSED">未使用</option></select><label>审核结果</label><select aria-label="审核结果筛选" value={reviewResultFilter} onChange={(event)=>{setReviewResultFilter(event.target.value as typeof reviewResultFilter);setPage(1);}}><option value="ALL">全部结果</option><option value="APPROVED">已通过</option><option value="PENDING">待审核</option><option value="REJECTED">已拒绝</option></select><label>任务完整编号</label><input aria-label="任务完整编号筛选" value={taskIdFilter} onChange={(event)=>{setTaskIdFilter(event.target.value);setPage(1);}} placeholder="输入完整 UUID"/><button type="button" onClick={()=>{setGroupFilter("ALL");setCreatedFrom("");setCreatedTo("");setCountryFilter("");setUseStageFilter("ALL");setReviewResultFilter("ALL");setTaskIdFilter("");setPage(1);setGroupFilterOpen(false);}}>重置 / 收起</button></div>}
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}
      <section className="tasks-management-card" aria-label="任务配置管理" style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",padding:"16px 18px",borderBottom:"1px solid #e5eaf1"}}>
          <div><h2 style={{margin:0,fontSize:16}}>任务配置管理</h2><p style={{margin:"5px 0 0",fontSize:12,color:"#718096"}}>管理任务草稿、发布状态及任务规则；号码记录与库存状态请在下方查看。</p></div>
          <button type="button" className="tasks-primary-btn" onClick={startCreate}>＋ 添加任务</button>
        </div>
        {tasks.length===0 ? <div style={{padding:18,color:"#718096",fontSize:13}}>暂无任务配置。点击“添加任务”创建草稿。</div> :
          <div className="tasks-table-scroll"><table className="tasks-management-table">
            <thead><tr><th>任务名称</th><th>平台/分类</th><th>任务组</th><th>奖励</th><th>任务状态</th><th>领取数</th><th>号码库存</th><th>操作</th></tr></thead>
            <tbody>{tasks.map((task)=><tr key={task.id}>
              <td className="tasks-title-cell" title={task.title}>{task.title}</td><td>{task.category}</td><td>{task.groupName||"未分组"}</td><td>{task.rewardAmount} {task.currency}</td>
              <td><span className={"tasks-status-pill "+task.status.toLowerCase()}>{({DRAFT:"草稿",PUBLISHED:"已发布",PAUSED:"已暂停",CLOSED:"已结束"} as Record<TaskStatus,string>)[task.status]}</span></td>
              <td>{task.claimedCount.toLocaleString()}</td><td>{task.inventory ? `总 ${task.inventory.total} / 可用 ${task.inventory.available} / 已分配 ${task.inventory.assigned} / 已使用 ${task.inventory.used}` : "—"}</td>
              <td><div className="tasks-row-actions">
                <button type="button" disabled={busy||!["DRAFT","PAUSED"].includes(task.status)||task.claimedCount>0} title={task.claimedCount>0?"已有领取记录，不能修改任务规则。":!["DRAFT","PAUSED"].includes(task.status)?"请先暂停任务再编辑。":"编辑任务配置"} onClick={()=>startEdit(task)}>编辑</button>
                {(["DRAFT","PAUSED"].includes(task.status))&&<button type="button" disabled={busy} onClick={()=>void taskAction(task.id,"publish")}>发布</button>}
                {task.status==="PUBLISHED"&&<button type="button" disabled={busy} onClick={()=>void taskAction(task.id,"pause")}>暂停</button>}
                {task.status!=="CLOSED"&&<button type="button" className="danger" disabled={busy} onClick={()=>void taskAction(task.id,"close")}>结束</button>}
              </div></td>
            </tr>)}</tbody>
          </table></div>}
      </section>
      <section className="tasks-management-card">
        <div className="tasks-toolbar">
          <div className="tasks-search"><Search size={15}/><input value={searchTerm} onChange={(event)=>setSearchTerm(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"){setPage(1);setAppliedSearch(searchTerm);}}} placeholder="任务名称、任务/执行编号或完整号码" aria-label="搜索任务"/></div>
          <div className="tasks-status-tabs" role="group" aria-label="任务状态筛选">
            {([["ALL","全部"],["AVAILABLE","可领取"],["IN_PROGRESS","进行中"],["REVIEW","审核中"],["COMPLETED","已完成"],["CLOSED","已关闭"],["FROZEN","已冻结"],["VOIDED","已作废"]] as const).map(([value,label])=><button key={value} type="button" className={statusFilter===value?"active":""} onClick={()=>{setStatusFilter(value);setPage(1);}}>{label}</button>)}
          </div>
          <button className="tasks-primary-btn tasks-search-btn" type="button" onClick={()=>{setPage(1);setAppliedSearch(searchTerm);}}>搜索</button>
          <button className="tasks-outline-btn" type="button" onClick={()=>{setSearchTerm("");setAppliedSearch("");setStatusFilter("ALL");setGroupFilter("ALL");setCreatedFrom("");setCreatedTo("");setCountryFilter("");setUseStageFilter("ALL");setReviewResultFilter("ALL");setTaskIdFilter("");setPage(1);}}>重置</button>
          <button className="tasks-outline-btn" type="button" onClick={()=>setGroupFilterOpen((open)=>!open)}><Filter size={13}/> 更多筛选</button>
          <button className="tasks-outline-btn" type="button" onClick={()=>{setStatusFilter("CLOSED");setPage(1);}}><Trash2 size={13}/> 回收站</button>
          <button className="tasks-outline-btn" type="button" onClick={()=>{
            const headers=["任务名称","任务号码","任务组","奖励","话术","国家/地区","任务状态","创建时间"];
            const labels={AVAILABLE:"可领取",IN_PROGRESS:"进行中",REVIEW:"审核中",COMPLETED:"已结算",CLOSED:"已关闭",FROZEN:"已冻结",VOIDED:"已作废"};
            const rows=visibleRecords.map((item)=>[item.taskName,item.phoneNumber,item.groupName,item.rewardAmount+" "+item.currency,item.messageTemplate,item.countryRegion,labels[item.status],new Date(item.createdAt).toLocaleString("zh-CN")]);
            const csv=[headers,...rows].map((row)=>row.map((value)=>'"'+String(value).replace(/"/g,'""')+'"').join(",")).join("\r\n");
            const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="任务管理.csv";link.click();URL.revokeObjectURL(url);
          }}><Download size={13}/> 导出</button>
        </div>
        <div className="tasks-stat-grid">
          <article className="tasks-stat-card"><span className="tasks-stat-icon blue"><Phone size={18}/></span><div><small>总任务</small><strong>{recordStats.total.toLocaleString()}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon green"><UserRound size={18}/></span><div><small>可领取</small><strong>{recordStats.available.toLocaleString()}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon orange"><Users size={18}/></span><div><small>已领取任务</small><strong>{(recordStats.inProgress+recordStats.review+recordStats.completed).toLocaleString()}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon red"><UserRound size={18}/></span><div><small>已作废</small><strong>{recordStats.voided.toLocaleString()}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon blue"><BarChart3 size={18}/></span><div><small>今日新增</small><strong>{recordStats.todayCreated.toLocaleString()}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon green"><ClipboardCheck size={18}/></span><div><small>今日完成</small><strong>{recordStats.todayCompleted.toLocaleString()}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon orange"><Trash2 size={18}/></span><div><small>今日作废</small><strong>{recordStats.todayVoided.toLocaleString()}</strong></div></article>
          <article className="tasks-stat-card"><span className="tasks-stat-icon green"><BarChart3 size={18}/></span><div><small>执行成功率</small><strong>{recordStats.successRate.toFixed(2)}%</strong></div></article>
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
                <td><span className={"tasks-status-pill "+record.status.toLowerCase()}>{({AVAILABLE:"可领取",IN_PROGRESS:"进行中",REVIEW:"审核中",COMPLETED:"已结算",CLOSED:"已关闭",FROZEN:"已冻结",VOIDED:"已作废"} as Record<RecordStatus,string>)[record.status]}</span></td>
                <td>{new Date(record.createdAt).toLocaleString("zh-CN",{hour12:false})}</td>
                <td><div className="tasks-row-actions"><button type="button" onClick={()=>{setSelectedRecord(record);setSelectedGroup(record.groupName);}}>查看</button><button type="button" className="danger" disabled={record.taskStatus==="PUBLISHED" || record.inventoryStatus!=="AVAILABLE" || Boolean(record.claimId)} title={record.taskStatus==="PUBLISHED"?"请先暂停任务，再删除未领取记录。":record.inventoryStatus!=="AVAILABLE"?"仅底层库存状态为可用且未领取的记录允许删除。":"删除后号码回到可分配号码池。"} onClick={async()=>{
                  if(!window.confirm("确定删除这条未领取的任务号码记录吗？"))return;
                  try{
                    await api("/api/v1/admin/tasks/records/"+record.id,{method:"DELETE"});
                    setMessage("任务号码记录已删除。");
                    await refresh();await loadRecords();
                  }catch(err){setError(err instanceof Error?err.message:"删除任务号码记录失败。");}
                }}>删除</button></div></td>
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
      <section className="tasks-management-card" aria-label="任务领取历史" style={{marginTop:16}}>
        <div style={{padding:"16px 18px",borderBottom:"1px solid #e5eaf1"}}>
          <h2 style={{margin:0,fontSize:16}}>任务领取历史</h2>
          <p style={{margin:"5px 0 0",fontSize:12,color:"#718096"}}>独立读取历史领取与审核记录。即使失败号码已回收到库存或重新分配给其他任务，原任务、号码、用户和审核结果仍会保留在这里。</p>
        </div>
        <div className="tasks-toolbar">
          <div className="tasks-search"><Search size={15}/><input value={claimHistoryKeyword} onChange={(event)=>setClaimHistoryKeyword(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"){setClaimHistoryPage(1);void loadClaimHistory();}}} placeholder="任务名称、领取编号、用户手机号或任务号码" aria-label="搜索领取历史"/></div>
          <select aria-label="领取历史状态" value={claimHistoryStatus} onChange={(event)=>{setClaimHistoryStatus(event.target.value);setClaimHistoryPage(1);}}>
            <option value="ALL">全部领取状态</option><option value="REJECTED">已拒绝</option><option value="EXPIRED">已超时</option><option value="CANCELLED">已取消</option><option value="APPROVED">已通过</option><option value="UNDER_REVIEW">审核中</option><option value="SUBMITTED">已提交</option><option value="CLAIMED">已领取</option><option value="IN_PROGRESS">执行中</option>
          </select>
          <input aria-label="领取历史任务编号" value={claimHistoryTaskId} onChange={(event)=>setClaimHistoryTaskId(event.target.value)} placeholder="完整任务 UUID" style={{maxWidth:250}}/>
          <button className="tasks-primary-btn tasks-search-btn" type="button" disabled={claimHistoryLoading} onClick={()=>{setClaimHistoryPage(1);void loadClaimHistory();}}>查询历史</button>
        </div>
        <div style={{padding:"0 16px 10px",fontSize:12,color:"#718096"}}>共 {claimHistoryTotal.toLocaleString()} 条历史领取记录</div>
        <div className="tasks-table-scroll">
          <table className="tasks-management-table">
            <thead><tr><th>任务名称</th><th>号码</th><th>领取用户</th><th>领取编号</th><th>领取状态</th><th>审核结论</th><th>审核理由</th><th>领取时间</th><th>提交时间</th></tr></thead>
            <tbody>
              {claimHistoryLoading ? <tr><td colSpan={9} className="tasks-empty-row">正在加载领取历史…</td></tr> :
                claimHistory.map((item)=><tr key={item.id}>
                  <td className="tasks-title-cell" title={item.taskName}>{item.taskName}</td>
                  <td>{item.phoneNumber}</td><td>{item.userPhone}</td>
                  <td title={item.id}>{item.id.slice(0,8)}…</td>
                  <td><span className={"tasks-status-pill "+item.status.toLowerCase()}>{({CLAIMED:"已领取",IN_PROGRESS:"执行中",SUBMITTED:"已提交",UNDER_REVIEW:"审核中",APPROVED:"已通过",REJECTED:"已拒绝",EXPIRED:"已超时",CANCELLED:"已取消"} as Record<string,string>)[item.status] ?? item.status}</span></td>
                  <td>{item.reviewDecision === "APPROVE" ? "通过" : item.reviewDecision === "REJECT" ? "拒绝" : item.reviewDecision ?? "—"}</td>
                  <td className="tasks-template-cell" title={item.reviewReason ?? ""}>{item.reviewReason || "—"}</td>
                  <td>{new Date(item.claimedAt).toLocaleString("zh-CN",{hour12:false})}</td>
                  <td>{item.submittedAt ? new Date(item.submittedAt).toLocaleString("zh-CN",{hour12:false}) : "—"}</td>
                </tr>)}
              {!claimHistoryLoading && claimHistory.length===0 && <tr><td colSpan={9} className="tasks-empty-row">暂无符合条件的领取历史</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="tasks-table-footer">
          <span>共 {claimHistoryTotal.toLocaleString()} 条</span>
          <div className="tasks-pagination">
            <button className="tasks-outline-btn" disabled={claimHistoryPage<=1 || claimHistoryLoading} onClick={()=>setClaimHistoryPage((value)=>Math.max(1,value-1))}><ChevronLeft size={14}/></button>
            <span>{claimHistoryPage} / {claimHistoryTotalPages}</span>
            <button className="tasks-outline-btn" disabled={claimHistoryPage>=claimHistoryTotalPages || claimHistoryLoading} onClick={()=>setClaimHistoryPage((value)=>Math.min(claimHistoryTotalPages,value+1))}><ChevronRight size={14}/></button>
            <select value={claimHistoryPageSize} onChange={(event)=>{setClaimHistoryPageSize(Number(event.target.value));setClaimHistoryPage(1);}}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select>
          </div>
        </footer>
      </section>
      {selectedRecord && (
        <div className="tasks-detail-backdrop" onClick={() => setSelectedRecord(null)}>
          <aside className="tasks-detail-drawer" role="dialog" aria-modal="true" aria-label="任务详情" onClick={(event) => event.stopPropagation()}>
            <header className="tasks-detail-header">
              <div>
                <div className="tasks-detail-title">任务详情 <span className={"tasks-status-pill " + selectedRecord.status.toLowerCase()}>{({AVAILABLE:"可领取",IN_PROGRESS:"进行中",REVIEW:"审核中",COMPLETED:"已结算",CLOSED:"已关闭",FROZEN:"已冻结",VOIDED:"已作废"} as Record<RecordStatus,string>)[selectedRecord.status]}</span></div>
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
                  <div><dt>任务状态</dt><dd><span className={"tasks-status-pill " + selectedRecord.status.toLowerCase()}>{({AVAILABLE:"可领取",IN_PROGRESS:"进行中",REVIEW:"审核中",COMPLETED:"已结算",CLOSED:"已关闭",FROZEN:"已冻结",VOIDED:"已作废"} as Record<RecordStatus,string>)[selectedRecord.status]}</span></dd></div>
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
                    {Array.from(new Set([...groupNames,...taskGroups.map((group)=>group.name),selectedRecord.groupName])).filter(Boolean).map((group)=><option key={group} value={group}>{group}</option>)}
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
              <button type="button" className="tasks-detail-delete" disabled={selectedRecord.taskStatus==="PUBLISHED" || !["AVAILABLE","CLOSED"].includes(selectedRecord.status) || Boolean(selectedRecord.claimId)} title={selectedRecord.taskStatus==="PUBLISHED"?"请先暂停任务，再删除未领取的号码记录。":!["AVAILABLE","CLOSED"].includes(selectedRecord.status)?"仅可删除未领取的可用记录；其他记录请作废保留审计。":"删除后号码回到可分配号码池。"} onClick={async()=>{
                if(!window.confirm("确定删除这条未领取的任务号码记录吗？号码会回到可分配号码池。"))return;
                try{
                  await api("/api/v1/admin/tasks/records/"+selectedRecord.id,{method:"DELETE"});
                  setSelectedRecord(null);
                  setMessage("任务号码记录已删除。");
                  await refresh();await loadRecords();
                }catch(err){setError(err instanceof Error?err.message:"删除任务号码记录失败。");}
              }}><Trash2 size={13}/> 删除</button>
              <button type="button" className="tasks-detail-void" disabled={selectedRecord.status==="COMPLETED" || selectedRecord.status==="REVIEW" || selectedRecord.status==="FROZEN"} onClick={async()=>{
                if(!window.confirm("确定回收当前号码并重新分配吗？不会关闭整批任务；未完成号码将返回可分配库存。"))return;
                try{
                  await api("/api/v1/admin/tasks/records/"+selectedRecord.id+"/void",{method:"POST"});
                  setSelectedRecord(null);
                  setMessage("号码已回收到可分配库存，后续按 FIFO 规则重新分配。");
                  await refresh();await loadRecords();
                }catch(err){setError(err instanceof Error?err.message:"作废任务号码记录失败。");}
              }}>↻ 回收并重新分配</button>
            </footer>
          </aside>
        </div>
      )}
      {groupModalOpen && (
        <div className="tasks-detail-backdrop" onClick={()=>setGroupModalOpen(false)}>
          <section role="dialog" aria-modal="true" aria-label="任务组管理" onClick={(event)=>event.stopPropagation()} style={{width:"min(94vw,560px)",background:"#fff",borderRadius:10,padding:18,boxShadow:"0 18px 50px rgba(15,23,42,.2)"}}>
            <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><strong style={{fontSize:16}}>任务组</strong><button type="button" onClick={()=>setGroupModalOpen(false)} aria-label="关闭">×</button></header>
            <p style={{fontSize:13,color:"#536176",margin:"0 0 14px"}}>任务组仅用于整理任务；删除任务组不会删除任务及任务号码记录。</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1.4fr auto",gap:7,marginBottom:14}}>
              <input value={newGroupName} onChange={(event)=>setNewGroupName(event.target.value)} placeholder="任务组名称" style={{minWidth:0,padding:9,border:"1px solid #dbe2ec",borderRadius:6}}/>
              <input value={newGroupDescription} onChange={(event)=>setNewGroupDescription(event.target.value)} placeholder="任务组说明（可选）" style={{minWidth:0,padding:9,border:"1px solid #dbe2ec",borderRadius:6}}/>
              <button type="button" className="tasks-primary-btn" disabled={busy||newGroupName.trim().length<2} onClick={async()=>{setBusy(true);try{await api("/api/v1/admin/tasks/groups",{method:"POST",body:JSON.stringify({name:newGroupName,description:newGroupDescription})});setNewGroupName("");setNewGroupDescription("");setTaskGroups(await api<TaskGroupOption[]>("/api/v1/admin/tasks/groups"));setMessage("任务组创建成功。");}catch(err){setError(err instanceof Error?err.message:"创建任务组失败。");}finally{setBusy(false);}}}>＋ 新建</button>
            </div>
            <div style={{border:"1px solid #e5eaf1",borderRadius:8,overflow:"hidden",maxHeight:340,overflowY:"auto"}}>
              {taskGroups.length===0?<div style={{padding:18,color:"#718096",fontSize:13}}>暂无任务组</div>:taskGroups.map((group)=><div key={group.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"12px 13px",borderBottom:"1px solid #edf0f5"}}>
                <div style={{minWidth:0}}><strong style={{fontSize:13}}>{group.name}</strong><div style={{fontSize:12,color:"#718096",marginTop:4}}>{group.description||"未填写说明"} · {group.taskCount} 个任务</div></div>
                <div style={{display:"flex",gap:7,flexShrink:0}}><button type="button" className="tasks-outline-btn" onClick={()=>{setGroupFilter(group.name);setPage(1);setGroupModalOpen(false);}}>查看任务</button><button type="button" className="tasks-outline-btn" disabled={busy} onClick={async()=>{if(!window.confirm("确定删除任务组“"+group.name+"”吗？任务本身及其号码记录会保留，并转为未分组。"))return;setBusy(true);try{await api("/api/v1/admin/tasks/groups/"+group.id,{method:"DELETE"});setTaskGroups(await api<TaskGroupOption[]>("/api/v1/admin/tasks/groups"));await refresh();await loadRecords();setMessage("任务组已删除，任务和号码记录均已保留。");}catch(err){setError(err instanceof Error?err.message:"删除任务组失败。");}finally{setBusy(false);}}}>删除</button></div>
              </div>)}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:14}}><button type="button" className="tasks-outline-btn" onClick={()=>setGroupModalOpen(false)}>关闭</button></div>
          </section>
        </div>
      )}
      {bulkMessageOpen && (
        <div className="tasks-detail-backdrop" onClick={()=>setBulkMessageOpen(false)}>
          <section role="dialog" aria-modal="true" aria-label="批量更换话术" onClick={(event)=>event.stopPropagation()} style={{width:"min(94vw,520px)",background:"#fff",borderRadius:10,padding:18,boxShadow:"0 18px 50px rgba(15,23,42,.2)"}}>
            <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <strong style={{fontSize:16}}>批量更换话术</strong>
              <button type="button" onClick={()=>setBulkMessageOpen(false)} aria-label="关闭">×</button>
            </header>
            <p style={{fontSize:13,color:"#536176",lineHeight:1.6}}>更换当前已应用筛选条件下全部未领取、未占用且未进入回收站的普通任务话术，不受页码和勾选状态影响。</p>
            <div style={{padding:12,background:"#f7f9fc",border:"1px solid #e5eaf1",borderRadius:7,fontSize:12,color:"#52627a"}}>按当前筛选条件匹配任务；只修改未发布、未领取且未占用的任务。</div>
            <div style={{display:"flex",gap:18,borderBottom:"1px solid #e5eaf1",marginTop:14}}>
              <button type="button" className={bulkMessageTab==="manual"?"active":""} onClick={()=>setBulkMessageTab("manual")} style={{padding:"10px 12px",border:0,borderBottom:bulkMessageTab==="manual"?"2px solid #2864ed":"2px solid transparent",background:"transparent",color:bulkMessageTab==="manual"?"#2864ed":"#52627a"}}>手工输入</button>
              <button type="button" onClick={()=>setBulkMessageTab("template")} style={{padding:"10px 12px",border:0,borderBottom:bulkMessageTab==="template"?"2px solid #2864ed":"2px solid transparent",background:"transparent",color:bulkMessageTab==="template"?"#2864ed":"#52627a"}}>选择模板</button>
            </div>
            <div style={{paddingTop:14}}>
              {bulkMessageTab==="manual" ? <textarea rows={6} value={bulkMessageText} onChange={(event)=>setBulkMessageText(event.target.value)} placeholder="请输入需要批量更换的话术" style={{width:"100%",boxSizing:"border-box",padding:11,border:"1px solid #dbe2ec",borderRadius:7,resize:"vertical"}}/> :
                <div><label style={{display:"block",fontSize:13,marginBottom:7}}>话术模板</label><select value={bulkTemplateId} onChange={(event)=>setBulkTemplateId(event.target.value)} style={{width:"100%",padding:10,border:"1px solid #dbe2ec",borderRadius:7}}><option value="">请选择话术模板</option>{messageTemplates.filter((item)=>item.action==="MESSAGE"&&(item.platform==="通用"||(bulkPlatforms.length===1&&bulkPlatforms[0]===item.platform))).map((item)=><option key={item.id} value={item.id}>{item.name} · {item.platform} · {item.action}</option>)}</select><p style={{fontSize:12,color:"#718096"}}>只显示已启用且适用于当前任务平台的模板。模板内容将复制到任务中，之后编辑模板不会改变已创建任务。</p>{bulkTemplateId && <pre style={{whiteSpace:"pre-wrap",maxHeight:140,overflow:"auto",padding:10,background:"#f8fafc",borderRadius:6,fontSize:12}}>{messageTemplates.find((item)=>item.id===bulkTemplateId)?.content}</pre>}</div>}
            </div>
            <footer style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
              <button type="button" className="tasks-outline-btn" onClick={()=>setBulkMessageOpen(false)}>取消</button>
              <button type="button" className="tasks-primary-btn" disabled={busy || (bulkMessageTab==="manual"?!bulkMessageText.trim():!bulkTemplateId)} onClick={async()=>{
                const text=bulkMessageTab==="manual"?bulkMessageText.trim():(messageTemplates.find((item)=>item.id===bulkTemplateId)?.content??"");
                if(!text.trim())return;
                if(!window.confirm("将更换当前筛选条件下所有符合条件的未领取任务话术。已发布、已领取或已占用任务不会修改。确定继续吗？"))return;
                setBusy(true);setError("");setMessage("");
                try{
                  const result=await api<{matchedTasks:number;updatedTasks:number;message:string}>("/api/v1/admin/tasks/records/bulk-message",{method:"POST",body:JSON.stringify({
                    messageTemplate:text,
                    ...(bulkMessageTab==="template" ? { templatePlatform: messageTemplates.find((item)=>item.id===bulkTemplateId)?.platform } : {}),
                    keyword:appliedSearch,
                    groupName:groupFilter,
                    countryRegion:countryFilter.trim(),
                    createdFrom:createdFrom?new Date(createdFrom+"T00:00:00").toISOString():undefined,
                    createdTo:createdTo?new Date(createdTo+"T23:59:59.999").toISOString():undefined
                  })});
                  setBulkMessageOpen(false);
                  setMessage(result.message+" 匹配 "+result.matchedTasks+" 个任务，更新 "+result.updatedTasks+" 个任务。");
                  await refresh();await loadRecords();
                }catch(err){setError(err instanceof Error?err.message:"批量更新失败。");}
                finally{setBusy(false);}
              }}>{busy?"正在更换…":"确认更换"}</button>
            </footer>
          </section>
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
