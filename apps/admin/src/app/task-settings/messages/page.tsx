"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminSidebar from "../../../components/AdminSidebar";
import AdminTopbar from "../../../components/AdminTopbar";
import {
  Layers, Coins, MessageSquare, Clock3, Plus, RefreshCw, Search, Save,
  Pencil, Power, Smartphone, Server, Eye, Settings2,
  ChevronRight, Check, X, ListChecks, Package, CircleDot, Filter, RotateCcw, Trash2,
} from "lucide-react";

type Row = Record<string, unknown>;
type Platform = {
  id: string; code: string; name: string; targetApp: string; description?: string;
  capabilities?: { appSupport?: boolean; nodeSupport?: boolean; visualReview?: boolean; backendSupport?: boolean };
  enabled: boolean; archived?: boolean; actions?: PlatformAction[];
};
type PlatformAction = {
  id: string; code: string; name: string; evidenceType?: string;
  requiresTargetPhone?: boolean; requiresDeliveryStatus?: boolean;
  requiresMessageTemplate?: boolean; enabled: boolean;
};
type Template = { id:string; name:string; platform:string; platformCode?:string|null; action:string; content:string; language?:string|null; keywords?:string|null; enabled:boolean; updatedAt:string };
type Tab = "platforms" | "rewards" | "messages" | "claim-limits";
type Field = { key:string; label:string; placeholder?:string; type?:"text"|"number"|"textarea"|"select"; options?:string[]; required?:boolean };
type Config = { key:Tab; label:string; icon:typeof Layers; title:string; fields:Field[]; columns:string[] };

const tabs:Config[] = [
 {key:"platforms",label:"平台配置",icon:Layers,title:"平台列表",fields:[],columns:[]},
 {key:"messages",label:"话术模板",icon:MessageSquare,title:"话术模板列表",fields:[{key:"name",label:"模板名称",required:true},{key:"platform",label:"任务类型",type:"select",options:["WhatsApp 私信任务","WhatsApp 群组任务","Telegram 任务","通用"]},{key:"content",label:"话术内容",type:"textarea",required:true}],columns:["name","platform","content","enabled"]},
 {key:"rewards",label:"奖励预设",icon:Coins,title:"奖励预设列表",fields:[{key:"name",label:"规则名称",required:true},{key:"platform",label:"任务平台",type:"select",options:["WhatsApp","Telegram","Facebook","通用"]},{key:"action",label:"任务动作",type:"select",options:["向目标号码发送私信","创建群组","加入群组","其他"]},{key:"countries",label:"适用国家/地区",placeholder:"留空表示全部国家"},{key:"amount",label:"用户奖励",type:"number",required:true},{key:"currency",label:"奖励币种",placeholder:"USD"},{key:"enabled",label:"状态",type:"select",options:["启用","停用"]}],columns:["name","platform","action","countries","amount","currency","enabled"]},
 {key:"claim-limits",label:"领取限制",icon:Clock3,title:"领取与完成限制",fields:[{key:"dailyLimit",label:"每日任务上限",type:"number",required:true},{key:"minimumIntervalSeconds",label:"最小领取间隔（秒）",type:"number",required:true},{key:"taskTimeLimitMinutes",label:"任务完成时限（分钟）",type:"number",required:true}],columns:[]},
];
const defaults:Record<string,Row[]>={rewards:[]};
async function api<T>(url:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(url,{...init,credentials:"include",headers:{"Content-Type":"application/json",...init.headers}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(typeof data.message==="string"?data.message:"请求失败");
 return data as T;
}
const capabilityLabels=[
 {key:"appSupport",label:"APP 支持",icon:Smartphone},
 {key:"nodeSupport",label:"节点支持",icon:Server},
 {key:"visualReview",label:"视觉审核",icon:Eye},
 {key:"backendSupport",label:"后台支持",icon:Settings2},
] as const;
const blankPlatform={name:"",code:"",targetApp:"",description:"",appSupport:true,nodeSupport:false,visualReview:false,backendSupport:false};
const blankAction={name:"",code:"",evidenceType:"SCREENSHOT",requiresTargetPhone:true,requiresDeliveryStatus:true,requiresMessageTemplate:true};

export default function TaskConfigurationPage(){
 const [tab,setTab]=useState<Tab>("platforms");
 const [platforms,setPlatforms]=useState<Platform[]>([]);
 const [rows,setRows]=useState<Record<string,Row[]>>({});
 const [templates,setTemplates]=useState<Template[]>([]);
 const [templatePlatforms,setTemplatePlatforms]=useState<Platform[]>([]);
 const [templateCategory,setTemplateCategory]=useState("全部模板");
 const [templateStatus,setTemplateStatus]=useState("all");
 const [templatePreview,setTemplatePreview]=useState<Template|null>(null);
 const [bulkModal,setBulkModal]=useState(false);
 const [bulkForm,setBulkForm]=useState({messageTemplate:"",keyword:"",groupName:"",countryRegion:""});
 const [limits,setLimits]=useState<Row>({dailyLimit:"20",minimumIntervalSeconds:"60",taskTimeLimitMinutes:"3"});
 const [selectedId,setSelectedId]=useState("");
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [search,setSearch]=useState("");
 const [platformModal,setPlatformModal]=useState(false);
 const [platformEditing,setPlatformEditing]=useState<string|null>(null);
 const [platformForm,setPlatformForm]=useState<Row>({...blankPlatform});
 const [actionModal,setActionModal]=useState(false);
 const [actionEditing,setActionEditing]=useState<string|null>(null);
 const [actionForm,setActionForm]=useState<Row>({...blankAction});
 const [formOpen,setFormOpen]=useState(false);
 const [editing,setEditing]=useState<number|null>(null);
 const [form,setForm]=useState<Row>({});
 const active=useMemo(()=>tabs.find(t=>t.key===tab)!,[tab]);
 const selected=platforms.find(p=>p.id===selectedId)??platforms[0]??null;
 const visiblePlatforms=platforms.filter(p=>!p.archived&&(!search||[p.name,p.code,p.targetApp].join(" ").toLowerCase().includes(search.toLowerCase())));

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   if(tab==="platforms"){
    const result=await api<{items:Platform[]}>("/api/v1/admin/tasks/configuration/platforms");
    const items=Array.isArray(result.items)?result.items:[];
    setPlatforms(items);
    setSelectedId(current=>items.some(p=>p.id===current)?current:(items[0]?.id??""));
   }else if(tab==="messages"){
    const [templateItems,platformResult]=await Promise.all([api<Template[]>("/api/v1/admin/tasks/message-templates"),api<{items:Platform[]}>("/api/v1/admin/tasks/configuration/platforms")]);
    setTemplates(templateItems);
    setTemplatePlatforms(Array.isArray(platformResult.items)?platformResult.items:[]);
   }else if(tab==="claim-limits"){
    const v=await api<Row>("/api/v1/admin/tasks/configuration/claim-limits");
    setLimits({dailyLimit:String(v.dailyLimit??20),minimumIntervalSeconds:String(v.minimumIntervalSeconds??60),taskTimeLimitMinutes:String(v.taskTimeLimitMinutes??3)});
   }else{
    const value=await api<unknown>("/api/v1/admin/tasks/configuration/"+tab);
    setRows(prev=>({...prev,[tab]:Array.isArray(value)?value as Row[]:(defaults[tab]??[])}));
   }
  }catch(e){setError(e instanceof Error?e.message:"配置加载失败");}
  finally{setLoading(false);}
 },[tab]);
 useEffect(()=>{void load();},[load]);

 function openPlatformCreate(){
  setPlatformEditing(null);setPlatformForm({...blankPlatform});setPlatformModal(true);setError("");setNotice("");
 }
 function openPlatformEdit(p:Platform){
  setPlatformEditing(p.id);
  setPlatformForm({name:p.name,code:p.code,targetApp:p.targetApp,description:p.description??"",appSupport:!!p.capabilities?.appSupport,nodeSupport:!!p.capabilities?.nodeSupport,visualReview:!!p.capabilities?.visualReview,backendSupport:!!p.capabilities?.backendSupport});
  setPlatformModal(true);setError("");setNotice("");
 }
 async function savePlatform(){
  setBusy(true);setError("");setNotice("");
  try{
   const payload={name:String(platformForm.name??"").trim(),targetApp:String(platformForm.targetApp??"").trim(),description:String(platformForm.description??""),capabilities:{appSupport:!!platformForm.appSupport,nodeSupport:!!platformForm.nodeSupport,visualReview:!!platformForm.visualReview,backendSupport:!!platformForm.backendSupport}};
   if(platformEditing){
    await api("/api/v1/admin/tasks/configuration/platforms/"+platformEditing,{method:"PATCH",body:JSON.stringify(payload)});
   }else{
    await api("/api/v1/admin/tasks/configuration/platforms",{method:"POST",body:JSON.stringify({...payload,code:String(platformForm.code??"").trim().toUpperCase()})});
   }
   setPlatformModal(false);setNotice(platformEditing?"平台信息已更新。":"平台已创建。");await load();
  }catch(e){setError(e instanceof Error?e.message:"平台保存失败");}
  finally{setBusy(false);}
 }
 async function togglePlatform(p:Platform){
  setBusy(true);setError("");setNotice("");
  try{
   await api("/api/v1/admin/tasks/configuration/platforms/"+p.id,{method:"PATCH",body:JSON.stringify({enabled:!p.enabled})});
   setNotice(!p.enabled?"平台已启用。":"平台已停用。");await load();
  }catch(e){setError(e instanceof Error?e.message:"状态更新失败");}
  finally{setBusy(false);}
 }
 function openActionCreate(){
  if(!selected)return;
  setActionEditing(null);setActionForm({...blankAction});setActionModal(true);setError("");
 }
 function openActionEdit(a:PlatformAction){
  setActionEditing(a.id);setActionForm({name:a.name,code:a.code,evidenceType:a.evidenceType??"SCREENSHOT",requiresTargetPhone:!!a.requiresTargetPhone,requiresDeliveryStatus:!!a.requiresDeliveryStatus,requiresMessageTemplate:!!a.requiresMessageTemplate});setActionModal(true);setError("");
 }
 async function saveAction(){
  if(!selected)return;
  setBusy(true);setError("");
  try{
   const common={name:String(actionForm.name??"").trim(),evidenceType:String(actionForm.evidenceType??"SCREENSHOT"),requiresTargetPhone:!!actionForm.requiresTargetPhone,requiresDeliveryStatus:!!actionForm.requiresDeliveryStatus,requiresMessageTemplate:!!actionForm.requiresMessageTemplate};
   if(actionEditing){
    await api("/api/v1/admin/tasks/configuration/platforms/"+selected.id+"/actions/"+actionEditing,{method:"PATCH",body:JSON.stringify(common)});
   }else{
    await api("/api/v1/admin/tasks/configuration/platforms/"+selected.id+"/actions",{method:"POST",body:JSON.stringify({...common,code:String(actionForm.code??"").trim().toUpperCase()})});
   }
   setActionModal(false);setNotice(actionEditing?"任务动作已更新。":"任务动作已添加。");await load();
  }catch(e){setError(e instanceof Error?e.message:"动作保存失败");}
  finally{setBusy(false);}
 }
 async function toggleAction(a:PlatformAction){
  if(!selected)return;
  setBusy(true);setError("");
  try{
   await api("/api/v1/admin/tasks/configuration/platforms/"+selected.id+"/actions/"+a.id,{method:"PATCH",body:JSON.stringify({enabled:!a.enabled})});
   await load();
  }catch(e){setError(e instanceof Error?e.message:"动作状态更新失败");}
  finally{setBusy(false);}
 }
 function startCreate(){
  setEditing(null);setForm(tab==="messages"?{name:"",platform:"WhatsApp 私信任务",platformCode:templatePlatforms[0]?.code??"",action:templatePlatforms[0]?.actions?.[0]?.code??"MESSAGE",language:"",content:"",keywords:"",enabled:true}:{enabled:"启用"});
  setFormOpen(true);setError("");setNotice("");
 }
 function startEdit(row:Row,index:number){const actualIndex=tab==="messages"?templates.findIndex(t=>t.id===row.id):index;setEditing(actualIndex);setForm({...row});setFormOpen(true);setError("");}
 async function saveRow(){
  setBusy(true);setError("");setNotice("");
  try{
   if(tab==="messages"){
    const payload={name:String(form.name??"").trim(),platform:String(form.platform??"通用"),platformCode:String(form.platformCode??""),action:String(form.action??"MESSAGE"),language:String(form.language??""),keywords:String(form.keywords??""),content:String(form.content??""),enabled:true};
    if(editing!==null)await api("/api/v1/admin/tasks/message-templates/"+templates[editing].id,{method:"PATCH",body:JSON.stringify(payload)});
    else await api("/api/v1/admin/tasks/message-templates",{method:"POST",body:JSON.stringify(payload)});
   }else{
    const list=[...(rows[tab]??[])];const normalized={...form,enabled:form.enabled==="停用"?false:form.enabled==="启用"?true:form.enabled};
    if(editing!==null)list[editing]=normalized;else list.push(normalized);
    await api("/api/v1/admin/tasks/configuration/"+tab,{method:"PATCH",body:JSON.stringify({value:list})});
    setRows(prev=>({...prev,[tab]:list}));
   }
   setFormOpen(false);setNotice("配置已保存。");await load();
  }catch(e){setError(e instanceof Error?e.message:"保存失败");}
  finally{setBusy(false);}
 }
 async function runBulkTemplateUpdate(){
  setBusy(true);setError("");setNotice("");
  try{
   const result=await api<{matchedTasks:number;updatedTasks:number;message:string}>("/api/v1/admin/tasks/records/bulk-message",{method:"POST",body:JSON.stringify(bulkForm)});
   setBulkModal(false);setNotice(result.message||("已更新 "+result.updatedTasks+" 个任务。"));
  }catch(e){setError(e instanceof Error?e.message:"批量更换话术失败");}
  finally{setBusy(false);}
 }
 async function deleteTemplate(t:Template){
  if(!window.confirm("确定删除这个话术模板吗？删除后将停用该模板。"))return;
  setBusy(true);setError("");setNotice("");
  try{await api("/api/v1/admin/tasks/message-templates/"+t.id,{method:"DELETE"});setNotice("模板已删除（已停用）。");await load();}
  catch(e){setError(e instanceof Error?e.message:"删除失败");}
  finally{setBusy(false);}
 }
 async function toggleGeneric(index:number){
  setBusy(true);setError("");
  try{
   if(tab==="messages"){const t=templates[index];await api("/api/v1/admin/tasks/message-templates/"+t.id,{method:"PATCH",body:JSON.stringify({enabled:!t.enabled})});}
   else{const list=[...(rows[tab]??[])];list[index]={...list[index],enabled:!Boolean(list[index].enabled)};await api("/api/v1/admin/tasks/configuration/"+tab,{method:"PATCH",body:JSON.stringify({value:list})});}
   await load();
  }catch(e){setError(e instanceof Error?e.message:"状态更新失败");}
  finally{setBusy(false);}
 }
 async function saveLimits(){
  setBusy(true);setError("");setNotice("");
  try{
   const value={dailyLimit:Number(limits.dailyLimit),minimumIntervalSeconds:Number(limits.minimumIntervalSeconds),taskTimeLimitMinutes:Number(limits.taskTimeLimitMinutes)};
   await api("/api/v1/admin/tasks/configuration/claim-limits",{method:"PATCH",body:JSON.stringify({value})});setNotice("领取限制已保存。");
  }catch(e){setError(e instanceof Error?e.message:"保存失败");}
  finally{setBusy(false);}
 }
 const dataRows=tab==="messages"?templates as unknown as Row[]:(rows[tab]??[]);
 const filtered=dataRows.filter(row=>!search||JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));

 return <div className="dashboard-app"><AdminSidebar/><main className="dashboard-main" style={{minWidth:0}}><AdminTopbar/>
  <div className="dashboard-content" style={{padding:"12px 16px 20px",display:"grid",gap:14}}>
   <section style={panel}>
    <header style={pageHeader}><div><div style={eyebrow}>TASK CENTER / CONFIGURATION</div><h1 style={pageTitle}>任务配置</h1><p style={muted}>统一管理任务平台、目标应用、执行动作与奖励规则。</p></div><button onClick={()=>void load()} disabled={loading||busy} style={secondary}><RefreshCw size={14}/>刷新数据</button></header>
    <nav style={tabsBar}>{tabs.map(item=>{const Icon=item.icon;return <button key={item.key} onClick={()=>{setTab(item.key);setFormOpen(false);setSearch("");setNotice("");setError("");}} style={{...tabButton,...(tab===item.key?tabActive:{})}}><Icon size={15}/>{item.label}</button>;})}</nav>
    {error&&<div role="alert" style={alert}><CircleDot size={15}/>{error}</div>}
    {notice&&<div role="status" style={success}><Check size={15}/>{notice}</div>}
    {tab==="platforms"?<>
     <div style={statsGrid}>
      <div style={statCard}><span style={{...statIcon,background:"#eaf1ff",color:"#3478f6"}}><Layers size={17}/></span><div><small style={statLabel}>平台列表</small><strong style={statValue}>{platforms.filter(p=>!p.archived).length}</strong></div></div>
      <div style={statCard}><span style={{...statIcon,background:"#e7f8ef",color:"#10a66a"}}><Check size={17}/></span><div><small style={statLabel}>启用</small><strong style={statValue}>{platforms.filter(p=>!p.archived&&p.enabled).length}</strong></div></div>
      <div style={statCard}><span style={{...statIcon,background:"#fff1e7",color:"#f97316"}}><Power size={17}/></span><div><small style={statLabel}>停用</small><strong style={statValue}>{platforms.filter(p=>!p.archived&&!p.enabled).length}</strong></div></div>
      <div style={statCard}><span style={{...statIcon,background:"#eef2f7",color:"#64748b"}}><ListChecks size={17}/></span><div><small style={statLabel}>任务动作</small><strong style={statValue}>{platforms.reduce((n,p)=>n+(p.actions?.length??0),0)}</strong></div></div>
     </div>
     <div style={platformToolbar}><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><button onClick={openPlatformCreate} style={primary}><Plus size={14}/>新建平台</button><button onClick={()=>void load()} disabled={loading||busy} style={secondary} aria-label="刷新平台"><RefreshCw size={14}/></button></div><div style={searchWrap}><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索平台、APP、代码…" style={searchInput}/></div></div>
     {loading?<div style={empty}>正在加载平台配置…</div>:<>
      <div style={tableWrap}><table style={{...table,minWidth:760}}><thead><tr>{["平台","能力","任务动作","状态","操作"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>
       {visiblePlatforms.length===0?<tr><td colSpan={5} style={{...td,textAlign:"center",padding:32,color:"#98a2b3"}}>暂无平台，点击“新建平台”添加。</td></tr>:visiblePlatforms.map(p=><tr key={`platform-${p.id||p.code||p.name}`} onClick={()=>setSelectedId(p.id)} style={{background:selected?.id===p.id?"#f8fbff":"#fff",cursor:"pointer"}}>
        <td style={td}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={appIcon}><Package size={16}/></span><span><strong style={itemName}>{p.name}</strong><small style={itemMeta}>{p.targetApp}</small></span></div></td>
        <td style={td}><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{capabilityLabels.filter(x=>p.capabilities?.[x.key]).map(x=><span key={x.key} style={capabilityTag}>{x.label}</span>)}</div></td>
        <td style={td}>{p.actions?.filter(a=>a.enabled).map(a=>a.name).join("、")||"—"}</td>
        <td style={td}><span style={statusPill(p.enabled)}>{p.enabled?"正常":"已停用"}</span></td>
        <td style={td}><button onClick={e=>{e.stopPropagation();setSelectedId(p.id);}} style={secondary}><Settings2 size={13}/>配置</button></td>
       </tr>)}
      </tbody></table><div style={paginationBar}><span>共 {visiblePlatforms.length} 个平台</span><span style={pageNumber}>1</span><span>20 条/页</span></div></div>
      {!selected?<div style={empty}>选择一个平台查看详细配置。</div>:<section style={expandedPanel}>
       <div style={expandedHeader}><div><h3 style={expandedTitle}>{selected.name}</h3><p style={muted}>维护平台能力和可用任务动作。</p></div><button onClick={()=>setSelectedId("")} style={secondary}>关闭</button></div>
       <div style={expandedActions}>
        <button onClick={()=>openPlatformEdit(selected)} style={secondary}><Pencil size={13}/>修改平台</button>
        <button onClick={()=>void togglePlatform(selected)} disabled={busy} style={selected.enabled?primary:secondary}><Power size={13}/>{selected.enabled?"停用平台":"启用平台"}</button>
        {capabilityLabels.map(cap=><button key={cap.key} onClick={()=>{setPlatformEditing(selected.id);setPlatformForm({name:selected.name,code:selected.code,targetApp:selected.targetApp,description:selected.description??"",appSupport:!!selected.capabilities?.appSupport,nodeSupport:!!selected.capabilities?.nodeSupport,visualReview:!!selected.capabilities?.visualReview,backendSupport:!!selected.capabilities?.backendSupport,[cap.key]:!selected.capabilities?.[cap.key]});setPlatformModal(true);}} style={secondary}>{cap.label}</button>)}
        <span style={{...statusPill(selected.enabled),marginLeft:"auto"}}>{selected.enabled?"允许发布":"暂停发布"}</span>
       </div>
       <section style={subPanel}><div style={sectionHeader}><div><h3 style={subTitle}>任务动作</h3><p style={muted}>配置此平台下可发布的任务动作、凭证类型和执行要求。</p></div><button onClick={openActionCreate} disabled={!selected.enabled} style={primary}><Plus size={13}/>新增动作</button></div>
        <div style={tableWrap}><table style={{...table,minWidth:700}}><thead><tr>{["任务动作","证据类型","能力","状态","操作"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>
         {!selected.actions?.length?<tr><td colSpan={5} style={{...td,textAlign:"center",padding:24,color:"#98a2b3"}}>暂无任务动作</td></tr>:selected.actions.map(a=><tr key={`action-${a.id||a.code||a.name}`}><td style={td}><strong>{a.name}</strong><small style={itemMeta}>{a.code}</small></td><td style={td}>{a.evidenceType==="SCREENSHOT"?"截图":a.evidenceType??"截图"}</td><td style={td}>{[a.requiresTargetPhone?"目标号码":"",a.requiresDeliveryStatus?"送达校验":"",a.requiresMessageTemplate?"话术模板":""].filter(Boolean).join(" · ")||"—"}</td><td style={td}><span style={statusPill(a.enabled)}>{a.enabled?"启用":"停用"}</span></td><td style={td}><div style={{display:"flex",gap:10}}><button onClick={()=>openActionEdit(a)} style={linkButton}><Pencil size={13}/>编辑</button><button onClick={()=>void toggleAction(a)} disabled={busy} style={linkButton}><Power size={13}/>{a.enabled?"停用":"启用"}</button></div></td></tr>)}
        </tbody></table><div style={paginationBar}><span>共 {selected.actions?.length??0} 个动作</span><span style={pageNumber}>1</span><span>20 条/页</span></div></div>
       </section>
       <section style={subPanel}><div style={sectionHeader}><div><h3 style={subTitle}>应用目录</h3></div><button onClick={()=>openPlatformEdit(selected)} style={secondary}><Plus size={13}/>新建应用</button></div>
        <div style={tableWrap}><table style={{...table,minWidth:600}}><thead><tr>{["应用名称","应用标识","关联平台","操作"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody><tr><td style={td}>{selected.targetApp}</td><td style={td}>{selected.code}</td><td style={td}>{selected.name}</td><td style={td}><button onClick={()=>openPlatformEdit(selected)} style={linkButton}><Pencil size={13}/>编辑</button></td></tr></tbody></table></div>
       </section>
      </section>}
     </>}
    </>:tab==="messages"?<>
     <div style={templateToolbar}>
      <div style={templateSearch}><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="请输入模板名称" style={searchInput}/></div>
      <div style={filterGroup}>{[["all","全部"],["enabled","使用中"],["disabled","未使用"]].map(([v,label])=><button key={v} onClick={()=>setTemplateStatus(v)} style={{...filterButton,...(templateStatus===v?filterButtonActive:{})}}>{label}</button>)}</div>
      <button onClick={()=>{setSearch("");setTemplateStatus("all");setTemplateCategory("全部模板");}} style={secondary}><RotateCcw size={13}/>重置</button>
      <button onClick={()=>setNotice("可通过模板名称、任务类型和状态进行筛选。")} style={secondary}><Filter size={13}/>更多筛选⌄</button>
      <span style={{flex:1}}/>
      <button onClick={()=>{setBulkForm(v=>({...v,messageTemplate:templates[0]?.content??""}));setBulkModal(true);}} style={secondary}>批量更换话术</button>
      <button onClick={startCreate} style={primary}><Plus size={14}/>新增模板</button>
     </div>
     <div style={templateLayout}>
      <aside style={categoryPanel}>
       <strong style={categoryTitle}>模板分类</strong>
       <button onClick={()=>setTemplateCategory("全部模板")} style={{...categoryItem,...(templateCategory==="全部模板"?categoryActive:{})}}>全部模板 <span>{templates.length}</span></button>
       {Array.from(new Set(templates.map(t=>t.platform))).map(name=><button key={name} onClick={()=>setTemplateCategory(name)} style={{...categoryItem,...(templateCategory===name?categoryActive:{})}}>{name}<span>{templates.filter(t=>t.platform===name).length}</span></button>)}
       <button onClick={()=>setNotice("自定义分组尚未接入后端数据结构，当前按任务类型自动分类。")} style={categoryAdd}>自定义分组 ＋</button>
      </aside>
      <div style={templateTablePanel}>
       <table style={{...table,minWidth:980}}><thead><tr><th style={th}><input type="checkbox" aria-label="选择全部模板"/></th>{["模板名称","任务类型","语言","状态","使用状态","操作"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>
        {loading?<tr><td colSpan={7} style={{...td,textAlign:"center",padding:32}}>正在加载模板…</td></tr>:templates.filter(t=>(!search||[t.name,t.platform,t.platformCode,t.action,t.content,t.language,t.keywords].join(" ").toLowerCase().includes(search.toLowerCase()))&&(templateCategory==="全部模板"||t.platform===templateCategory)&&(templateStatus==="all"||(templateStatus==="enabled"?t.enabled:!t.enabled))).length===0?<tr><td colSpan={7} style={{...td,textAlign:"center",padding:42,color:"#98a2b3"}}>暂无话术模板</td></tr>:templates.filter(t=>(!search||[t.name,t.platform,t.platformCode,t.action,t.content,t.language,t.keywords].join(" ").toLowerCase().includes(search.toLowerCase()))&&(templateCategory==="全部模板"||t.platform===templateCategory)&&(templateStatus==="all"||(templateStatus==="enabled"?t.enabled:!t.enabled))).map(t=><tr key={t.id}><td style={td}><input type="checkbox" aria-label={"选择"+t.name}/></td><td style={td}><strong>{t.name}</strong></td><td style={td}><span style={templateTypePill}>{t.platform}</span></td><td style={td}>{t.language||"—"}</td><td style={td}><span style={statusPill(t.enabled)}>{t.enabled?"正常":"已停用"}</span></td><td style={td}><span style={{color:"#64748b"}}>未统计</span></td><td style={td}><div style={{display:"flex",gap:10}}><button style={linkButton} onClick={()=>setTemplatePreview(t)}><Eye size={13}/>预览</button><button style={linkButton} onClick={()=>startEdit(t,templates.findIndex(x=>x.id===t.id))}><Pencil size={13}/>编辑模板</button><button style={{...linkButton,color:"#dc5555"}} disabled={busy} onClick={()=>void deleteTemplate(t)}><Trash2 size={13}/>删除</button></div></td></tr>)}
       </tbody></table>
       <div style={paginationBar}><span>共 {templates.filter(t=>(!search||[t.name,t.platform,t.platformCode,t.action,t.content,t.language,t.keywords].join(" ").toLowerCase().includes(search.toLowerCase()))&&(templateCategory==="全部模板"||t.platform===templateCategory)&&(templateStatus==="all"||(templateStatus==="enabled"?t.enabled:!t.enabled))).length} 条</span><span style={pageNumber}>1</span><span>20 条/页</span></div>
      </div>
     </div>
     {formOpen&&<div style={overlay} role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setFormOpen(false);}}><section style={{...modal,width:"min(520px,100%)"}} role="dialog" aria-modal="true" aria-labelledby="template-modal-title">
      <div style={modalHeader}><div><h2 id="template-modal-title" style={modalTitle}>{editing===null?"新增话术模板":"编辑话术模板"}</h2><p style={muted}>可直接编辑模板，后续领取使用保存后的话术。</p></div><button onClick={()=>setFormOpen(false)} style={closeButton}><X size={17}/></button></div>
      <div style={templateFormGrid}>
       <label style={label}>模板名称 <b style={requiredMark}>*</b><input value={String(form.name??"")} onChange={e=>setForm(v=>({...v,name:e.target.value}))} style={input}/></label>
       <label style={label}>任务类型 <b style={requiredMark}>*</b><select value={String(form.platform??"")} onChange={e=>setForm(v=>({...v,platform:e.target.value}))} style={input}><option value="">请选择</option>{Array.from(new Set(["WhatsApp 私信任务",...templates.map(t=>t.platform)])).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
       <label style={label}>平台代码 <b style={requiredMark}>*</b><select value={String(form.platformCode??"")} onChange={e=>{const p=templatePlatforms.find(x=>x.code===e.target.value);setForm(v=>({...v,platformCode:e.target.value,action:p?.actions?.[0]?.code??"MESSAGE"}));}} style={input}><option value="">请选择</option>{templatePlatforms.map(p=><option key={p.id} value={p.code}>{p.name}（{p.code}）</option>)}</select></label>
       <label style={label}>任务动作代码 <b style={requiredMark}>*</b><select value={String(form.action??"")} onChange={e=>setForm(v=>({...v,action:e.target.value}))} style={input}><option value="">请选择</option>{(templatePlatforms.find(p=>p.code===String(form.platformCode??""))?.actions??[]).map(a=><option key={a.id} value={a.code}>{a.name}（{a.code}）</option>)}</select></label>
       <label style={label}>语言<input value={String(form.language??"")} onChange={e=>setForm(v=>({...v,language:e.target.value}))} style={input}/></label>
       <label style={{...label,gridColumn:"1 / -1"}}>模板正文 <b style={requiredMark}>*</b><textarea rows={6} value={String(form.content??"")} onChange={e=>setForm(v=>({...v,content:e.target.value}))} style={{...input,resize:"vertical"}}/></label>
       <label style={{...label,gridColumn:"1 / -1"}}>关键词<input value={String(form.keywords??"")} onChange={e=>setForm(v=>({...v,keywords:e.target.value}))} placeholder="多个关键词使用英文逗号分隔" style={input}/></label>
      </div>
      <div style={modalFooter}><button onClick={()=>setFormOpen(false)} style={secondary}>取消</button><button onClick={()=>void saveRow()} disabled={busy||String(form.name??"").trim().length<2||!String(form.platform??"")||!String(form.platformCode??"")||!String(form.action??"")||!String(form.content??"").trim()} style={primary}><Save size={14}/>{busy?"保存中…":editing===null?"新增模板":"保存修改"}</button></div>
     </section></div>}
     {bulkModal&&<div style={overlay} role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setBulkModal(false);}}><section style={{...modal,width:"min(560px,100%)"}} role="dialog" aria-modal="true"><div style={modalHeader}><div><h2 style={modalTitle}>批量更换话术</h2><p style={muted}>仅更新尚未领取、且所属任务为草稿或暂停状态的任务。</p></div><button onClick={()=>setBulkModal(false)} style={closeButton}><X size={17}/></button></div><div style={templateFormGrid}><label style={label}>新的话术内容 *<textarea rows={5} value={bulkForm.messageTemplate} onChange={e=>setBulkForm(v=>({...v,messageTemplate:e.target.value}))} style={{...input,resize:"vertical"}}/></label><label style={label}>关键词筛选<input value={bulkForm.keyword} onChange={e=>setBulkForm(v=>({...v,keyword:e.target.value}))} placeholder="可选：任务名称、分类或号码关键词" style={input}/></label><label style={label}>任务分组<input value={bulkForm.groupName} onChange={e=>setBulkForm(v=>({...v,groupName:e.target.value}))} placeholder="留空表示全部分组" style={input}/></label><label style={label}>国家/地区<input value={bulkForm.countryRegion} onChange={e=>setBulkForm(v=>({...v,countryRegion:e.target.value}))} placeholder="例如 KE" style={input}/></label></div><div style={modalFooter}><button onClick={()=>setBulkModal(false)} style={secondary}>取消</button><button onClick={()=>void runBulkTemplateUpdate()} disabled={busy||!bulkForm.messageTemplate.trim()} style={primary}><Save size={14}/>执行批量更换</button></div></section></div>}
     {templatePreview&&<div style={overlay} role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setTemplatePreview(null);}}><section style={{...modal,width:"min(520px,100%)"}} role="dialog" aria-modal="true"><div style={modalHeader}><h2 style={modalTitle}>话术预览</h2><button onClick={()=>setTemplatePreview(null)} style={closeButton}><X size={17}/></button></div><strong>{templatePreview.name}</strong><p style={muted}>{templatePreview.platform} · {templatePreview.language||"未设置语言"}</p><div style={previewContent}>{templatePreview.content}</div>{templatePreview.keywords&&<p style={muted}>关键词：{templatePreview.keywords}</p>}</section></div>}
    </>:tab==="claim-limits"?<div style={{padding:"22px 8px",maxWidth:760}}><h2 style={sectionTitle}>任务领取限制</h2><p style={muted}>设置全局默认的每日领取上限、领取间隔和任务完成时限。</p><div style={formGrid}>{active.fields.map(f=><label key={f.key} style={label}>{f.label}<input type="number" min="1" value={String(limits[f.key]??"")} onChange={e=>setLimits(v=>({...v,[f.key]:e.target.value}))} style={input}/></label>)}</div><p style={muted}>保存后将参与用户领取任务、领取间隔和超时回收校验。</p><button onClick={()=>void saveLimits()} disabled={busy} style={primary}><Save size={14}/>保存限制</button></div>:<>
     <div style={toolbar}><div><h2 style={sectionTitle}>{active.title}</h2><p style={muted}>管理任务运营配置。</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><div style={searchWrap}><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索配置…" style={searchInput}/></div><button onClick={startCreate} style={primary}><Plus size={14}/>新增</button></div></div>
     {formOpen&&<section style={formCard}><h3 style={subTitle}>{editing===null?"新增":"编辑"}{active.title}</h3><div style={formGrid}>{active.fields.map(f=><label key={f.key} style={label}>{f.label}{f.type==="textarea"?<textarea rows={4} value={String(form[f.key]??"")} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))} style={{...input,resize:"vertical"}}/>:f.type==="select"?<select value={String(form[f.key]??f.options?.[0]??"")} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))} style={input}>{f.options?.map(o=><option key={o}>{o}</option>)}</select>:<input required={f.required} type={f.type==="number"?"number":"text"} value={String(form[f.key]??"")} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))} placeholder={f.placeholder} style={input}/>}</label>)}</div><div style={modalFooter}><button onClick={()=>setFormOpen(false)} style={secondary}>取消</button><button onClick={()=>void saveRow()} disabled={busy} style={primary}><Save size={14}/>保存</button></div></section>}
     <div style={tableWrap}>{loading?<div style={empty}>正在加载…</div>:filtered.length===0?<div style={empty}>暂无数据。</div>:<table style={table}><thead><tr>{[...active.columns,"操作"].map(c=><th key={c} style={th}>{fieldName(c)}</th>)}</tr></thead><tbody>{filtered.map((row,index)=><tr key={String(row.id??index)}>{active.columns.map(c=><td key={c} style={td}>{c==="enabled"?<span style={statusPill(Boolean(row.enabled))}>{row.enabled?"已启用":"已停用"}</span>:c==="content"?<span title={String(row[c]??"")} style={truncate}>{String(row[c]??"—")}</span>:String(row[c]??"—")}</td>)}<td style={td}><div style={{display:"flex",gap:12}}><button style={linkButton} onClick={()=>startEdit(row,index)}><Pencil size={13}/>编辑</button>{row.enabled!==undefined&&<button style={linkButton} disabled={busy} onClick={()=>void toggleGeneric(index)}><Power size={13}/>{row.enabled?"停用":"启用"}</button>}</div></td></tr>)}</tbody></table>}</div>
    </>}
   </section>
  </div>
  {platformModal&&<div style={overlay} role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setPlatformModal(false);}}><section style={modal} role="dialog" aria-modal="true" aria-labelledby="platform-modal-title"><div style={modalHeader}><div><div style={eyebrow}>PLATFORM MANAGEMENT</div><h2 id="platform-modal-title" style={modalTitle}>{platformEditing?"编辑平台":"创建平台"}</h2></div><button onClick={()=>setPlatformModal(false)} style={closeButton}><X size={18}/></button></div><div style={formGrid}><label style={label}>平台名称 *<input value={String(platformForm.name??"")} onChange={e=>setPlatformForm(v=>({...v,name:e.target.value}))} placeholder="例如 WhatsApp" style={input}/></label><label style={label}>平台包名 / 唯一代码 *<input disabled={!!platformEditing} value={String(platformForm.code??"")} onChange={e=>setPlatformForm(v=>({...v,code:e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"_")}))} placeholder="例如 WHATSAPP" style={{...input,background:platformEditing?"#f5f6f8":"#fff"}}/><small style={helper}>创建后作为唯一标识，不可修改。</small></label><label style={label}>目标 APP 名称 *<input value={String(platformForm.targetApp??"")} onChange={e=>setPlatformForm(v=>({...v,targetApp:e.target.value}))} placeholder="例如 WhatsApp Messenger" style={input}/></label><label style={{...label,gridColumn:"1 / -1"}}>平台说明<textarea rows={3} value={String(platformForm.description??"")} onChange={e=>setPlatformForm(v=>({...v,description:e.target.value}))} placeholder="填写平台用途或备注" style={{...input,resize:"vertical"}}/></label></div><div style={fieldSection}><strong style={fieldSectionTitle}>平台能力</strong><div style={checkGrid}>{capabilityLabels.map(c=>{const Icon=c.icon;return <label key={c.key} style={checkOption}><input type="checkbox" checked={!!platformForm[c.key]} onChange={e=>setPlatformForm(v=>({...v,[c.key]:e.target.checked}))}/><Icon size={16}/>{c.label}</label>;})}</div></div><div style={modalFooter}><button onClick={()=>setPlatformModal(false)} style={secondary}>取消</button><button onClick={()=>void savePlatform()} disabled={busy||String(platformForm.name??"").trim().length<2||!String(platformForm.targetApp??"").trim()||(!platformEditing&&!/^[A-Z][A-Z0-9_]{1,39}$/.test(String(platformForm.code??"")))} style={primary}><Save size={14}/>{busy?"保存中…":"确认保存"}</button></div></section></div>}
  {actionModal&&<div style={overlay} role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setActionModal(false);}}><section style={modal} role="dialog" aria-modal="true" aria-labelledby="action-modal-title"><div style={modalHeader}><div><div style={eyebrow}>TASK ACTION</div><h2 id="action-modal-title" style={modalTitle}>{actionEditing?"编辑任务动作":"添加任务动作"}</h2></div><button onClick={()=>setActionModal(false)} style={closeButton}><X size={18}/></button></div><div style={formGrid}><label style={label}>动作名称 *<input value={String(actionForm.name??"")} onChange={e=>setActionForm(v=>({...v,name:e.target.value}))} placeholder="例如发送私信" style={input}/></label><label style={label}>动作代码 *<input disabled={!!actionEditing} value={String(actionForm.code??"")} onChange={e=>setActionForm(v=>({...v,code:e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"_")}))} placeholder="例如 SEND_MESSAGE" style={{...input,background:actionEditing?"#f5f6f8":"#fff"}}/></label><label style={label}>凭证类型<select value={String(actionForm.evidenceType??"SCREENSHOT")} onChange={e=>setActionForm(v=>({...v,evidenceType:e.target.value}))} style={input}><option value="SCREENSHOT">截图</option><option value="TEXT">文本</option><option value="URL">链接</option></select></label></div><div style={fieldSection}><strong style={fieldSectionTitle}>执行要求</strong><div style={checkGrid}>{[{key:"requiresTargetPhone",label:"需要目标号码"},{key:"requiresDeliveryStatus",label:"校验送达状态"},{key:"requiresMessageTemplate",label:"关联话术模板"}].map(c=><label key={c.key} style={checkOption}><input type="checkbox" checked={!!actionForm[c.key]} onChange={e=>setActionForm(v=>({...v,[c.key]:e.target.checked}))}/>{c.label}</label>)}</div></div><div style={modalFooter}><button onClick={()=>setActionModal(false)} style={secondary}>取消</button><button onClick={()=>void saveAction()} disabled={busy||String(actionForm.name??"").trim().length<2||(!actionEditing&&!/^[A-Z][A-Z0-9_]{1,39}$/.test(String(actionForm.code??"")))} style={primary}><Save size={14}/>保存动作</button></div></section></div>}
 </main></div>;
}
function fieldName(key:string){return ({name:"名称",platform:"平台 / 类型",action:"任务动作",enabled:"状态",countries:"适用国家/地区",amount:"用户奖励",currency:"奖励币种",content:"话术内容"} as Record<string,string>)[key]??key;}
const panel={background:"#fff",border:"1px solid #e7ebf2",borderRadius:9,padding:14,minHeight:"calc(100vh - 112px)"} as const;
const pageHeader={display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,padding:"4px 2px 18px",flexWrap:"wrap" as const};
const eyebrow={fontSize:10,fontWeight:700,letterSpacing:1.2,color:"#94a3b8",marginBottom:6};
const pageTitle={fontSize:22,fontWeight:700,color:"#182230",margin:0};
const sectionTitle={fontSize:17,fontWeight:700,color:"#182230",margin:"0 0 5px"};
const subTitle={display:"flex",alignItems:"center",gap:8,fontSize:15,fontWeight:700,color:"#263445",margin:0};
const modalTitle={fontSize:19,fontWeight:700,color:"#172033",margin:0};
const muted={fontSize:12,color:"#8792a2",lineHeight:1.6,margin:"4px 0 0"};
const tabsBar={display:"flex",gap:7,borderBottom:"1px solid #edf0f5",paddingBottom:13,marginBottom:18,flexWrap:"wrap" as const};
const tabButton={display:"inline-flex",alignItems:"center",gap:7,border:"1px solid #e8edf4",borderRadius:7,padding:"9px 13px",background:"#fff",color:"#64748b",fontSize:12,fontWeight:600,cursor:"pointer"};
const tabActive={background:"#eef4ff",border:"1px solid #c9dcff",color:"#2563eb"};
const toolbar={display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,flexWrap:"wrap" as const,marginBottom:16};
const searchWrap={display:"flex",alignItems:"center",gap:8,border:"1px solid #e1e7ef",borderRadius:7,padding:"0 10px",height:36,color:"#98a2b3",background:"#fff",minWidth:220};
const searchInput={border:0,outline:"none",fontSize:12,color:"#344054",width:"100%",background:"transparent"};
const templateToolbar={display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" as const,padding:10,border:"1px solid #e7ebf0",borderRadius:8,margin:"8px 0 10px"};
const templateSearch={display:"flex",alignItems:"center",gap:8,width:180,height:34,padding:"0 9px",border:"1px solid #e1e7ef",borderRadius:6,color:"#98a2b3"};
const filterGroup={display:"flex",alignItems:"center",gap:3,padding:3,background:"#f2f5fa",borderRadius:7};
const filterButton={border:0,borderRadius:5,padding:"7px 11px",background:"transparent",color:"#64748b",fontSize:11,cursor:"pointer"};
const filterButtonActive={background:"#3478f6",color:"#fff"};
const templateLayout={display:"grid",gridTemplateColumns:"164px minmax(0,1fr)",gap:10,minHeight:"calc(100vh - 290px)"};
const categoryPanel={border:"1px solid #e7ebf0",borderRadius:7,padding:10,alignSelf:"start",background:"#fff"};
const categoryTitle={display:"block",fontSize:11,color:"#344054",margin:"2px 0 10px"};
const categoryItem={display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",border:0,borderRadius:5,padding:"8px 7px",background:"#fff",color:"#475467",fontSize:11,textAlign:"left" as const,cursor:"pointer"};
const categoryActive={background:"#eef4ff",color:"#2563eb"};
const categoryAdd={border:0,background:"transparent",color:"#64748b",fontSize:11,padding:"9px 6px",cursor:"pointer"};
const templateTablePanel={border:"1px solid #e7ebf0",borderRadius:7,overflow:"auto",background:"#fff",minWidth:0};
const templateTypePill={display:"inline-block",borderRadius:12,padding:"3px 8px",background:"#eff4ff",color:"#3478f6",fontSize:10,whiteSpace:"nowrap" as const};
const templateFormGrid={display:"grid",gridTemplateColumns:"1fr",gap:12,margin:"4px 0"};
const requiredMark={color:"#e5484d",fontWeight:600};
const previewContent={whiteSpace:"pre-wrap" as const,background:"#f8fafc",border:"1px solid #e7ebf0",borderRadius:7,padding:14,marginTop:14,fontSize:13,lineHeight:1.7,color:"#344054",maxHeight:360,overflowY:"auto" as const};
const statsGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,margin:"8px 0 14px"};
const statCard={display:"flex",alignItems:"center",gap:10,border:"1px solid #e7ebf2",borderRadius:7,padding:"10px 12px",minHeight:44};
const statIcon={width:32,height:32,display:"grid",placeItems:"center",borderRadius:7,flexShrink:0};
const statLabel={display:"block",fontSize:10,color:"#8a95a5"};
const statValue={display:"block",fontSize:18,fontWeight:700,color:"#172033",lineHeight:1.25};
const platformToolbar={display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,margin:"12px 0"};
const capabilityTag={fontSize:10,fontWeight:600,color:"#475467",background:"#f1f4f8",borderRadius:5,padding:"4px 7px",whiteSpace:"nowrap" as const};
const paginationBar={display:"flex",alignItems:"center",justifyContent:"flex-end",gap:12,padding:"9px 12px",fontSize:11,color:"#8a95a5",borderTop:"1px solid #edf0f5"};
const pageNumber={display:"inline-grid",placeItems:"center",width:24,height:24,borderRadius:5,background:"#3478f6",color:"#fff",fontWeight:700};
const expandedPanel={border:"1px solid #e7ebf2",borderRadius:8,marginTop:12,overflow:"hidden",background:"#fff"};
const expandedHeader={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"12px 14px",borderBottom:"1px solid #edf0f5"};
const expandedTitle={fontSize:14,fontWeight:700,color:"#172033",margin:0};
const expandedActions={display:"flex",alignItems:"center",gap:7,flexWrap:"wrap" as const,padding:"11px 13px",borderBottom:"1px solid #edf0f5"};
const subPanel={padding:"12px",borderTop:"1px solid #edf0f5"};
const platformLayout={display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:14,alignItems:"start"};
const platformList={border:"1px solid #e8edf3",borderRadius:10,overflow:"hidden",background:"#fff"};
const listHeader={display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 14px",fontSize:13,fontWeight:700,color:"#344054",background:"#f8fafc",borderBottom:"1px solid #edf0f5"};
const count={fontSize:11,color:"#64748b",background:"#f1f5f9",padding:"3px 8px",borderRadius:20};
const platformItem={width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 11px",border:0,borderBottom:"1px solid #f0f2f6",background:"#fff",cursor:"pointer",textAlign:"left" as const};
const platformItemActive={background:"#f2f6ff",boxShadow:"inset 3px 0 #3478f6"};
const appIcon={width:36,height:36,display:"grid",placeItems:"center",borderRadius:9,background:"#eff4ff",color:"#3478f6",flexShrink:0};
const heroIcon={width:46,height:46,display:"grid",placeItems:"center",borderRadius:12,background:"#edf4ff",color:"#3478f6",flexShrink:0};
const itemName={display:"block",fontSize:13,fontWeight:650,color:"#263445",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const};
const itemMeta={display:"block",fontSize:11,color:"#8a95a5",marginTop:4,overflowWrap:"anywhere" as const};
const statusDot={width:7,height:7,borderRadius:20,flexShrink:0};
const detailColumn={display:"grid",gap:13,minWidth:0};
const detailCard={border:"1px solid #e8edf3",borderRadius:10,padding:16,background:"#fff",minWidth:0};
const detailTop={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap" as const};
const detailTitle={fontSize:18,fontWeight:700,color:"#182230",margin:0};
const description={fontSize:12,color:"#64748b",lineHeight:1.7,margin:"12px 0 0"};
const capabilityGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:9,marginTop:16};
const capabilityCard={display:"flex",alignItems:"center",gap:8,border:"1px solid #edf0f5",borderRadius:8,padding:"9px 10px"};
const capIcon={width:30,height:30,display:"grid",placeItems:"center",borderRadius:7};
const tinyPill=(on:boolean)=>({fontSize:10,fontWeight:600,padding:"3px 7px",borderRadius:20,color:on?"#15803d":"#64748b",background:on?"#effaf2":"#f1f5f9",whiteSpace:"nowrap" as const});
const detailActions={display:"flex",justifyContent:"flex-end",gap:8,marginTop:16,paddingTop:13,borderTop:"1px solid #f0f2f6"};
const sectionHeader={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap" as const,marginBottom:13};
const directoryRow={display:"flex",alignItems:"center",gap:12,border:"1px solid #edf0f5",borderRadius:8,padding:12};
const directoryIcon={width:38,height:38,display:"grid",placeItems:"center",borderRadius:8,background:"#f0f7ff",color:"#3478f6"};
const actionRow={display:"flex",alignItems:"center",gap:10,border:"1px solid #edf0f5",borderRadius:8,padding:"11px 10px"};
const actionGlyph={width:34,height:34,display:"grid",placeItems:"center",borderRadius:8,background:"#f5f7fb",color:"#64748b",flexShrink:0};
const codeTag={fontSize:10,color:"#64748b",background:"#f5f7fa",border:"1px solid #e7ebf0",padding:"3px 6px",borderRadius:5};
const statusPill=(on:boolean)=>({display:"inline-flex",alignItems:"center",fontSize:11,fontWeight:600,color:on?"#15803d":"#64748b",background:on?"#effaf2":"#f1f5f9",border:"1px solid "+(on?"#c9efd2":"#e2e8f0"),borderRadius:20,padding:"4px 9px",whiteSpace:"nowrap" as const});
const empty={padding:42,textAlign:"center" as const,color:"#98a2b3",fontSize:12,border:"1px dashed #e2e8f0",borderRadius:9};
const emptySmall={padding:20,textAlign:"center" as const,color:"#98a2b3",fontSize:12};
const primary={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,border:0,borderRadius:7,padding:"9px 13px",background:"#3478f6",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap" as const};
const secondary={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,border:"1px solid #dce3ec",borderRadius:7,padding:"8px 12px",background:"#fff",color:"#475467",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap" as const};
const warningButton={...secondary,color:"#b45309",borderColor:"#f4d6a6",background:"#fffaf2"};
const linkButton={display:"inline-flex",alignItems:"center",gap:5,border:0,background:"transparent",color:"#3478f6",fontSize:12,cursor:"pointer",whiteSpace:"nowrap" as const};
const iconButton={width:30,height:30,display:"grid",placeItems:"center",border:"1px solid #e7ebf0",borderRadius:6,background:"#fff",color:"#64748b",cursor:"pointer",flexShrink:0};
const alert={display:"flex",alignItems:"center",gap:8,padding:"10px 12px",marginBottom:12,borderRadius:7,background:"#fff1f2",color:"#be123c",fontSize:12};
const success={display:"flex",alignItems:"center",gap:8,padding:"10px 12px",marginBottom:12,borderRadius:7,background:"#f0fdf4",color:"#15803d",fontSize:12};
const formCard={border:"1px solid #e5eaf2",borderRadius:9,padding:16,marginBottom:14,background:"#fbfcfe"};
const formGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,margin:"16px 0"};
const label={display:"flex",flexDirection:"column" as const,gap:7,fontSize:12,color:"#475467",fontWeight:600};
const input={width:"100%",boxSizing:"border-box" as const,border:"1px solid #d9e1ec",borderRadius:7,padding:"9px 10px",background:"#fff",color:"#344054",fontSize:12,minHeight:36};
const helper={fontSize:10,color:"#98a2b3",fontWeight:400};
const fieldSection={borderTop:"1px solid #edf0f5",paddingTop:14,marginTop:10};
const fieldSectionTitle={fontSize:12,color:"#344054"};
const checkGrid={display:"flex",gap:10,flexWrap:"wrap" as const,marginTop:12};
const checkOption={display:"inline-flex",alignItems:"center",gap:7,padding:"9px 11px",border:"1px solid #e7ebf0",borderRadius:7,fontSize:12,color:"#475467",background:"#fff",cursor:"pointer"};
const modalFooter={display:"flex",justifyContent:"flex-end",gap:8,paddingTop:15,borderTop:"1px solid #edf0f5",marginTop:16};
const overlay={position:"fixed" as const,inset:0,zIndex:1000,display:"grid",placeItems:"center",padding:18,background:"rgba(15,23,42,.42)"};
const modal={width:"min(680px,100%)",maxHeight:"min(90vh,820px)",overflowY:"auto" as const,background:"#fff",borderRadius:12,padding:22,boxShadow:"0 20px 60px rgba(15,23,42,.2)"};
const modalHeader={display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18};
const closeButton={width:32,height:32,display:"grid",placeItems:"center",border:0,borderRadius:7,background:"#f5f7fa",color:"#64748b",cursor:"pointer"};
const tableWrap={border:"1px solid #e7ebf0",borderRadius:9,overflowX:"auto" as const};
const table={width:"100%",borderCollapse:"collapse" as const,minWidth:760};
const th={textAlign:"left" as const,padding:"11px 12px",fontSize:11,color:"#667085",background:"#f8fafc",borderBottom:"1px solid #e5eaf2",whiteSpace:"nowrap" as const};
const td={padding:"11px 12px",fontSize:12,color:"#344054",borderBottom:"1px solid #edf0f5",maxWidth:300};
const truncate={display:"block",maxWidth:320,overflow:"hidden",whiteSpace:"nowrap" as const,textOverflow:"ellipsis"};
