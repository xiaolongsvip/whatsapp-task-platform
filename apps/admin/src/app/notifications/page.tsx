"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Send, FileText, Plus, Search, RefreshCw, Pencil, Eye, X, ChevronLeft, ChevronRight, Power, Radio } from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";

type Tab = "notices" | "records" | "templates";
type NoticeStatus = "DRAFT" | "PUBLISHED" | "DISABLED";
type Notice = {
  id: string; title: string; content: string; target: "ALL" | "ACTIVE";
  status: NoticeStatus; recipientCount: number; createdAt: string; updatedAt: string;
  publishedAt: string | null; disabledAt: string | null;
};
type Template = { id: string; name: string; title: string; content: string; enabled: boolean; createdAt: string; updatedAt: string };
type NoticeResponse = {
  items: Notice[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  stats: { total: number; draft: number; published: number; disabled: number; publishedAudience: number };
  deliveryMode: "IN_APP";
};

const input: React.CSSProperties = { height:36, border:"1px solid #dce4ef", borderRadius:6, padding:"0 10px", color:"#26364d", fontSize:12, background:"#fff", minWidth:0 };
const button: React.CSSProperties = { height:34, padding:"0 12px", border:"1px solid #dce4ef", borderRadius:6, background:"#fff", color:"#53647c", fontSize:12, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 };
const primary: React.CSSProperties = { ...button, background:"#2868ee", borderColor:"#2868ee", color:"#fff" };
const card: React.CSSProperties = { background:"#fff", border:"1px solid #e4eaf2", borderRadius:8 };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "请求失败，请检查 API 服务。");
  return data as T;
}

function dateText(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
}

export default function NotificationsPage() {
  const [tab,setTab] = useState<Tab>("notices");
  const [notices,setNotices] = useState<Notice[]>([]);
  const [records,setRecords] = useState<Notice[]>([]);
  const [templates,setTemplates] = useState<Template[]>([]);
  const [stats,setStats] = useState<NoticeResponse["stats"]>({total:0,draft:0,published:0,disabled:0,publishedAudience:0});
  const [page,setPage] = useState(1);
  const [pageSize,setPageSize] = useState(20);
  const [total,setTotal] = useState(0);
  const [totalPages,setTotalPages] = useState(1);
  const [keyword,setKeyword] = useState("");
  const [status,setStatus] = useState("ALL");
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [editorOpen,setEditorOpen] = useState(false);
  const [editingNotice,setEditingNotice] = useState<Notice|null>(null);
  const [title,setTitle] = useState("");
  const [content,setContent] = useState("");
  const [target,setTarget] = useState<"ALL"|"ACTIVE">("ALL");
  const [templateEditorOpen,setTemplateEditorOpen] = useState(false);
  const [editingTemplate,setEditingTemplate] = useState<Template|null>(null);
  const [templateName,setTemplateName] = useState("");
  const [templateTitle,setTemplateTitle] = useState("");
  const [templateContent,setTemplateContent] = useState("");

  const loadNotices = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({page:String(page),pageSize:String(pageSize),keyword:keyword.trim(),status});
      const result = await api<NoticeResponse>("/api/v1/admin/notifications?"+params.toString());
      setNotices(result.items); setStats(result.stats); setTotal(result.pagination.total); setTotalPages(result.pagination.totalPages);
    } catch (e) { setError(e instanceof Error ? e.message : "通知列表加载失败。"); }
    finally { setLoading(false); }
  },[page,pageSize,keyword,status]);

  const loadRecords = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({page:String(page),pageSize:String(pageSize),keyword:keyword.trim()});
      const result = await api<NoticeResponse>("/api/v1/admin/notifications/records?"+params.toString());
      setRecords(result.items); setTotal(result.pagination.total); setTotalPages(result.pagination.totalPages);
    } catch (e) { setError(e instanceof Error ? e.message : "通知发布记录加载失败。"); }
    finally { setLoading(false); }
  },[page,pageSize,keyword]);

  const loadTemplates = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({keyword:keyword.trim()});
      const result = await api<{items:Template[]}>("/api/v1/admin/notifications/templates?"+params.toString());
      setTemplates(result.items);
    } catch (e) { setError(e instanceof Error ? e.message : "通知模板加载失败。"); }
    finally { setLoading(false); }
  },[keyword]);

  useEffect(() => {
    if (tab==="notices") void loadNotices();
    else if (tab==="records") void loadRecords();
    else void loadTemplates();
  },[tab,loadNotices,loadRecords,loadTemplates]);

  function openCreateNotice() {
    void loadTemplates();
    setEditingNotice(null); setTitle(""); setContent(""); setTarget("ALL"); setEditorOpen(true);
  }

  function openEditNotice(item: Notice) {
    void loadTemplates();
    setEditingNotice(item); setTitle(item.title); setContent(item.content); setTarget(item.target); setEditorOpen(true);
  }

  async function saveNotice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const body = JSON.stringify({title,content,target});
      if (editingNotice) await api("/api/v1/admin/notifications/"+editingNotice.id,{method:"PATCH",body});
      else await api("/api/v1/admin/notifications",{method:"POST",body});
      setEditorOpen(false); setMessage("通知草稿已保存。"); await loadNotices();
    } catch (e) { setError(e instanceof Error ? e.message : "保存通知失败。"); }
    finally { setBusy(false); }
  }

  async function publishNotice(item: Notice) {
    if (!window.confirm("确认发布“"+item.title+"”吗？发布后会出现在符合范围的 APP 用户首页公告栏；这不是手机系统推送。")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{item:{recipientCount:number}}>("/api/v1/admin/notifications/"+item.id+"/publish",{method:"POST",body:"{}"});
      setMessage("站内公告已发布。发布时目标账户数："+result.item.recipientCount+"。");
      await loadNotices();
    } catch (e) { setError(e instanceof Error ? e.message : "发布通知失败。"); }
    finally { setBusy(false); }
  }

  async function disableNotice(item: Notice) {
    if (!window.confirm("确定停用这条通知吗？停用后它将不再出现在 APP 首页公告栏，历史发布记录会保留。")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/v1/admin/notifications/"+item.id+"/disable",{method:"POST",body:"{}"});
      setMessage("通知已停用，历史记录仍然保留。"); await loadNotices();
    } catch (e) { setError(e instanceof Error ? e.message : "停用通知失败。"); }
    finally { setBusy(false); }
  }

  function openTemplate(item?: Template) {
    setEditingTemplate(item ?? null);
    setTemplateName(item?.name ?? "");
    setTemplateTitle(item?.title ?? "");
    setTemplateContent(item?.content ?? "");
    setTemplateEditorOpen(true);
  }

  async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const body = JSON.stringify({name:templateName,title:templateTitle,content:templateContent});
      if (editingTemplate) await api("/api/v1/admin/notifications/templates/"+editingTemplate.id,{method:"PATCH",body});
      else await api("/api/v1/admin/notifications/templates",{method:"POST",body});
      setTemplateEditorOpen(false); setMessage("通知模板已保存。"); await loadTemplates();
    } catch (e) { setError(e instanceof Error ? e.message : "保存模板失败。"); }
    finally { setBusy(false); }
  }

  async function toggleTemplate(item: Template) {
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/v1/admin/notifications/templates/"+item.id+"/toggle",{method:"POST",body:JSON.stringify({enabled:!item.enabled})});
      setMessage(item.enabled?"通知模板已停用。":"通知模板已启用。"); await loadTemplates();
    } catch (e) { setError(e instanceof Error ? e.message : "更新模板状态失败。"); }
    finally { setBusy(false); }
  }

  const activeTitle = tab==="notices"?"通知列表":tab==="records"?"站内发布记录":"通知模板";
  const pages = Math.max(1,totalPages);

  return <div className="dashboard-app">
    <AdminSidebar />
    <main className="dashboard-main" style={{minWidth:0,background:"#f7f9fc"}}>
      <AdminTopbar />
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px 0",background:"#fff",gap:12,flexWrap:"wrap"}}>
        <div><b style={{fontSize:14,color:"#23354d"}}>通知管理</b><div style={{fontSize:11,color:"#8492a6",marginTop:4}}>发布到 APP 首页公告栏，维护站内发布记录与通知模板</div></div>
        {tab==="notices"&&<button style={primary} onClick={openCreateNotice}><Plus size={14}/>创建通知</button>}
        {tab==="templates"&&<button style={primary} onClick={()=>openTemplate()}><Plus size={14}/>新增模板</button>}
      </div>
      <div style={{padding:18}}>
        <nav style={{display:"flex",gap:4,borderBottom:"1px solid #e1e8f0",marginBottom:14,overflowX:"auto"}}>
          {([{key:"notices",label:"通知列表",icon:Bell},{key:"records",label:"发送记录",icon:Send},{key:"templates",label:"通知模板",icon:FileText}] as const).map(({key,label,icon:Icon})=><button key={key} onClick={()=>{setTab(key);setStatus("ALL");setKeyword("");setPage(1);setError("");}} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"12px 16px",border:0,borderBottom:tab===key?"2px solid #2868ee":"2px solid transparent",background:tab===key?"#edf4ff":"transparent",color:tab===key?"#2868ee":"#53647c",fontSize:12,whiteSpace:"nowrap",cursor:"pointer"}}><Icon size={15}/>{label}</button>)}
        </nav>

        {tab==="notices"&&<section style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,marginBottom:12}}>
          {([["通知总数",stats.total],["已发布",stats.published],["草稿",stats.draft],["已停用",stats.disabled]] as Array<[string,number]>).map(([label,value])=><div key={label} style={{...card,padding:"13px 14px"}}><div style={{fontSize:11,color:"#718096"}}>{label}</div><b style={{fontSize:22,color:"#20334d",display:"block",marginTop:7}}>{value.toLocaleString()}</b></div>)}
        </section>}

        <section style={{...card,overflow:"hidden"}}>
          <header style={{padding:"13px 14px",borderBottom:"1px solid #edf1f6",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
            <b style={{fontSize:13,color:"#26364d"}}>{activeTitle}</b>
            <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{position:"relative"}}><Search size={14} style={{position:"absolute",left:9,top:11,color:"#8492a6"}}/><input style={{...input,paddingLeft:29,width:250}} value={keyword} onChange={e=>setKeyword(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){setPage(1);if(tab==="notices")void loadNotices();else if(tab==="records")void loadRecords();else void loadTemplates();}}} placeholder={tab==="templates"?"搜索模板名称或内容":"搜索通知标题 / 内容"}/></div>
              {tab==="notices"&&<select style={input} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="ALL">全部状态</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="DISABLED">已停用</option></select>}
              <button style={button} disabled={loading} onClick={()=>{if(tab==="notices")void loadNotices();else if(tab==="records")void loadRecords();else void loadTemplates();}}><RefreshCw size={13}/>刷新</button>
              <button style={button} onClick={()=>{setKeyword("");setStatus("ALL");setPage(1);}}><X size={13}/>重置筛选</button>
            </div>
          </header>
          {error&&<div style={{padding:"10px 14px",background:"#fff1f0",color:"#b42318",fontSize:12}}>{error}</div>}
          {message&&<div style={{padding:"10px 14px",background:"#ecfdf3",color:"#067647",fontSize:12}}>{message}</div>}

          {tab==="notices"&&<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:950}}>
              <thead><tr style={{background:"#f8fafc",color:"#64748b"}}>{["标题与内容","范围","状态","发布时目标账户数","创建时间","发布时间","操作"].map(x=><th key={x} style={{textAlign:"left",padding:10,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{x}</th>)}</tr></thead>
              <tbody>
                {loading?<tr><td colSpan={7} style={{padding:40,textAlign:"center",color:"#8492a6"}}>正在加载通知…</td></tr>:
                  notices.map(item=><tr key={item.id} style={{borderTop:"1px solid #edf1f6"}}>
                    <td style={{padding:10,maxWidth:360}}><strong style={{display:"block",fontSize:12,color:"#26364d"}}>{item.title}</strong><span style={{display:"block",fontSize:11,color:"#718096",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{item.content}</span></td>
                    <td style={{padding:10,fontSize:11}}>{item.target==="ACTIVE"?"正常用户":"全部用户"}</td>
                    <td style={{padding:10,fontSize:11}}><span style={{borderRadius:5,padding:"4px 7px",background:item.status==="PUBLISHED"?"#ecfdf3":item.status==="DISABLED"?"#f1f5f9":"#fff7ed",color:item.status==="PUBLISHED"?"#027a48":item.status==="DISABLED"?"#64748b":"#c2410c"}}>{item.status==="PUBLISHED"?"已发布":item.status==="DISABLED"?"已停用":"草稿"}</span></td>
                    <td style={{padding:10,fontSize:12}}>{item.status==="DRAFT"?"发布时统计":item.recipientCount.toLocaleString()}</td>
                    <td style={{padding:10,fontSize:11,whiteSpace:"nowrap"}}>{dateText(item.createdAt)}</td>
                    <td style={{padding:10,fontSize:11,whiteSpace:"nowrap"}}>{dateText(item.publishedAt)}</td>
                    <td style={{padding:10,whiteSpace:"nowrap"}}>
                      {item.status==="DRAFT"&&<><button style={button} disabled={busy} onClick={()=>{setMessage("");openEditNotice(item);}}><Pencil size={12}/>编辑</button> <button style={primary} disabled={busy} onClick={()=>void publishNotice(item)}><Radio size={12}/>发布</button></>}
                      {item.status==="PUBLISHED"&&<button style={button} disabled={busy} onClick={()=>void disableNotice(item)}><Power size={12}/>停用</button>}
                      {item.status==="DISABLED"&&<span style={{fontSize:11,color:"#98a2b3"}}>历史保留</span>}
                    </td>
                  </tr>)}
                {!loading&&notices.length===0&&<tr><td colSpan={7} style={{padding:42,textAlign:"center",color:"#8492a6"}}>暂无通知记录，请创建第一条通知。</td></tr>}
              </tbody>
            </table>
          </div>}

          {tab==="records"&&<div style={{overflowX:"auto"}}>
            <div style={{padding:"10px 14px",fontSize:11,color:"#718096"}}>这里只统计站内公告的发布批次和发布时的目标账户数；不会报告手机系统推送送达率。</div>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:780}}>
              <thead><tr style={{background:"#f8fafc",color:"#64748b"}}>{["通知标题","范围","发布结果","目标账户数（发布时）","发布时间","记录状态"].map(x=><th key={x} style={{textAlign:"left",padding:10,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{x}</th>)}</tr></thead>
              <tbody>
                {loading?<tr><td colSpan={6} style={{padding:40,textAlign:"center",color:"#8492a6"}}>正在加载发布记录…</td></tr>:
                  records.filter(item=>item.publishedAt).map(item=><tr key={item.id} style={{borderTop:"1px solid #edf1f6"}}>
                    <td style={{padding:10,fontSize:12}}>{item.title}</td><td style={{padding:10,fontSize:11}}>{item.target==="ACTIVE"?"正常用户":"全部用户"}</td>
                    <td style={{padding:10,fontSize:11,color:"#027a48"}}>站内发布成功</td><td style={{padding:10,fontSize:12}}>{item.recipientCount.toLocaleString()}</td>
                    <td style={{padding:10,fontSize:11,whiteSpace:"nowrap"}}>{dateText(item.publishedAt)}</td><td style={{padding:10,fontSize:11}}>{item.status==="DISABLED"?"已停用":"展示中"}</td>
                  </tr>)}
                {!loading&&records.filter(item=>item.publishedAt).length===0&&<tr><td colSpan={6} style={{padding:42,textAlign:"center",color:"#8492a6"}}>暂无站内发布记录。</td></tr>}
              </tbody>
            </table>
          </div>}

          {tab==="templates"&&<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:780}}>
              <thead><tr style={{background:"#f8fafc",color:"#64748b"}}>{["模板名称","标题","内容","状态","最近更新","操作"].map(x=><th key={x} style={{textAlign:"left",padding:10,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{x}</th>)}</tr></thead>
              <tbody>
                {loading?<tr><td colSpan={6} style={{padding:40,textAlign:"center",color:"#8492a6"}}>正在加载模板…</td></tr>:
                  templates.map(item=><tr key={item.id} style={{borderTop:"1px solid #edf1f6"}}>
                    <td style={{padding:10,fontSize:12}}>{item.name}</td><td style={{padding:10,fontSize:12}}>{item.title}</td>
                    <td style={{padding:10,fontSize:11,color:"#718096",maxWidth:300}}>{item.content}</td>
                    <td style={{padding:10,fontSize:11}}>{item.enabled?"已启用":"已停用"}</td><td style={{padding:10,fontSize:11,whiteSpace:"nowrap"}}>{dateText(item.updatedAt)}</td>
                    <td style={{padding:10,whiteSpace:"nowrap"}}><button style={button} disabled={busy} onClick={()=>openTemplate(item)}><Pencil size={12}/>编辑</button> <button style={button} disabled={busy} onClick={()=>void toggleTemplate(item)}><Power size={12}/>{item.enabled?"停用":"启用"}</button></td>
                  </tr>)}
                {!loading&&templates.length===0&&<tr><td colSpan={6} style={{padding:42,textAlign:"center",color:"#8492a6"}}>暂无模板，可新增常用通知内容。</td></tr>}
              </tbody>
            </table>
          </div>}

          {tab!=="templates"&&<footer style={{padding:"11px 14px",borderTop:"1px solid #edf1f6",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:11,color:"#8492a6",gap:12}}>
            <span>共 {total.toLocaleString()} 条</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <button style={button} disabled={page<=1||loading} onClick={()=>setPage(v=>Math.max(1,v-1))}><ChevronLeft size={13}/></button>
              <span>第 {page} / {pages} 页</span>
              <button style={button} disabled={page>=pages||loading} onClick={()=>setPage(v=>Math.min(pages,v+1))}><ChevronRight size={13}/></button>
              <select style={input} value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select>
            </div>
          </footer>}
        </section>
        <p style={{fontSize:11,color:"#8492a6",marginTop:10}}>通知发布后会显示在 APP 首页公告栏。当前支持站内公告，不包含 FCM、短信或手机系统级推送。</p>
      </div>

      {editorOpen&&<div style={{position:"fixed",inset:0,zIndex:90,background:"#14223866",display:"grid",placeItems:"center",padding:18}}>
        <section style={{...card,width:"min(620px,100%)",maxHeight:"90vh",overflow:"auto",padding:18}}>
          <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><b style={{fontSize:14,color:"#26364d"}}>{editingNotice?"编辑通知草稿":"创建通知草稿"}</b><button style={button} onClick={()=>setEditorOpen(false)}><X size={14}/>关闭</button></header>
          <form onSubmit={saveNotice} style={{display:"grid",gap:12}}>
            <label style={{display:"grid",gap:6,fontSize:11,color:"#53647c"}}>通知标题<input style={input} required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="请输入通知标题"/></label>
            <label style={{display:"grid",gap:6,fontSize:11,color:"#53647c"}}>发送范围<select style={input} value={target} onChange={e=>setTarget(e.target.value as "ALL"|"ACTIVE")}><option value="ALL">全部用户</option><option value="ACTIVE">正常用户</option></select></label>
            <label style={{display:"grid",gap:6,fontSize:11,color:"#53647c"}}>从模板填充<select style={input} defaultValue="" onChange={e=>{const item=templates.find(x=>x.id===e.target.value);if(item){setTitle(item.title);setContent(item.content);}}}><option value="">选择模板（可选）</option>{templates.filter(x=>x.enabled).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label style={{display:"grid",gap:6,fontSize:11,color:"#53647c"}}>通知内容<textarea required maxLength={5000} style={{...input,height:150,padding:10,resize:"vertical"}} value={content} onChange={e=>setContent(e.target.value)} placeholder="请输入通知内容，发布后会显示在 APP 首页公告栏"/></label>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" style={button} onClick={()=>setEditorOpen(false)}>取消</button><button style={primary} disabled={busy}>{busy?"保存中…":"保存草稿"}</button></div>
          </form>
        </section>
      </div>}

      {templateEditorOpen&&<div style={{position:"fixed",inset:0,zIndex:90,background:"#14223866",display:"grid",placeItems:"center",padding:18}}>
        <section style={{...card,width:"min(620px,100%)",maxHeight:"90vh",overflow:"auto",padding:18}}>
          <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><b style={{fontSize:14,color:"#26364d"}}>{editingTemplate?"编辑通知模板":"新增通知模板"}</b><button style={button} onClick={()=>setTemplateEditorOpen(false)}><X size={14}/>关闭</button></header>
          <form onSubmit={saveTemplate} style={{display:"grid",gap:12}}>
            <label style={{display:"grid",gap:6,fontSize:11,color:"#53647c"}}>模板名称<input style={input} required maxLength={160} value={templateName} onChange={e=>setTemplateName(e.target.value)}/></label>
            <label style={{display:"grid",gap:6,fontSize:11,color:"#53647c"}}>通知标题<input style={input} required maxLength={180} value={templateTitle} onChange={e=>setTemplateTitle(e.target.value)}/></label>
            <label style={{display:"grid",gap:6,fontSize:11,color:"#53647c"}}>通知内容<textarea style={{...input,height:130,padding:10,resize:"vertical"}} required maxLength={5000} value={templateContent} onChange={e=>setTemplateContent(e.target.value)}/></label>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" style={button} onClick={()=>setTemplateEditorOpen(false)}>取消</button><button style={primary} disabled={busy}>{busy?"保存中…":"保存模板"}</button></div>
          </form>
        </section>
      </div>}
    </main>
  </div>;
}
