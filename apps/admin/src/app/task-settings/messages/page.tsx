"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminSidebar from "../../../components/AdminSidebar";
import { Layers, Globe2, FileText, Coins, MessageSquare, Clock3, ShieldCheck, Plus, RefreshCw, Search, Save, Pencil, Power } from "lucide-react";

type Row = Record<string, unknown>;
type Template = { id:string; name:string; platform:string; action:string; content:string; enabled:boolean; updatedAt:string };
type Tab = "platforms" | "countries" | "sources" | "rewards" | "messages" | "claim-limits" | "reviews";
type Field = { key:string; label:string; placeholder?:string; type?:"text"|"number"|"textarea"|"select"; options?:string[]; required?:boolean };
type Config = { key:Tab; label:string; icon:typeof Layers; title:string; fields:Field[]; columns:string[] };

const tabs:Config[] = [
 {key:"platforms",label:"1. 平台与目标 APP",icon:Layers,title:"平台列表",fields:[{key:"name",label:"平台名称",required:true},{key:"code",label:"平台代码（唯一）",required:true,placeholder:"WHATSAPP"},{key:"targetApp",label:"目标 Android APP",required:true,placeholder:"WhatsApp"},{key:"capabilities",label:"能力（逗号分隔）",placeholder:"APP, 节点支持, 视觉审核"},{key:"action",label:"任务动作",placeholder:"向目标号码发送私信"},{key:"actionCode",label:"动作代码",placeholder:"SEND_MESSAGE"}],columns:["name","targetApp","capabilities","action","enabled"]},
 {key:"countries",label:"2. 国家配置",icon:Globe2,title:"国家列表",fields:[{key:"name",label:"国家名称",required:true},{key:"code",label:"国家代码",required:true},{key:"dialCode",label:"国际区号",required:true},{key:"currency",label:"默认货币",required:true},{key:"enabled",label:"状态",type:"select",options:["启用","停用"]}],columns:["name","code","dialCode","currency","enabled"]},
 {key:"sources",label:"3. 任务来源",icon:FileText,title:"业务来源列表",fields:[{key:"name",label:"业务来源名称",required:true},{key:"category",label:"业务分类",type:"select",options:["全部分类","推广活动","社群运营","私信任务","其他"]},{key:"note",label:"内部备注",type:"textarea"},{key:"task",label:"关联任务"},{key:"enabled",label:"状态",type:"select",options:["启用","停用"]}],columns:["name","category","note","task","enabled"]},
 {key:"rewards",label:"4. 奖励规则",icon:Coins,title:"奖励规则列表",fields:[{key:"name",label:"规则名称",required:true},{key:"platform",label:"任务平台",type:"select",options:["WhatsApp","Telegram","Facebook","通用"]},{key:"action",label:"任务动作",type:"select",options:["向目标号码发送私信","创建群组","加入群组","其他"]},{key:"countries",label:"适用国家/地区",placeholder:"留空表示全部国家"},{key:"amount",label:"用户奖励",type:"number",required:true},{key:"currency",label:"奖励币种",placeholder:"USD"},{key:"enabled",label:"状态",type:"select",options:["启用","停用"]}],columns:["name","platform","action","countries","amount","currency","enabled"]},
 {key:"messages",label:"5. 话术模板",icon:MessageSquare,title:"话术模板列表",fields:[{key:"name",label:"模板名称",required:true},{key:"platform",label:"任务类型",type:"select",options:["WhatsApp 私信任务","WhatsApp 群组任务","Telegram 任务","通用"]},{key:"language",label:"语言",placeholder:"中文 / English"},{key:"content",label:"话术内容",type:"textarea",required:true}],columns:["name","platform","language","content","enabled"]},
 {key:"claim-limits",label:"6. 领取限制",icon:Clock3,title:"任务领取限制",fields:[{key:"dailyLimit",label:"每日任务上限",type:"number",required:true},{key:"minimumIntervalSeconds",label:"最小领取间隔（秒）",type:"number",required:true},{key:"taskTimeLimitMinutes",label:"任务时限（分钟）",type:"number",required:true}],columns:[]},
 {key:"reviews",label:"7. 审核配置",icon:ShieldCheck,title:"审核配置列表",fields:[{key:"name",label:"配置名称",required:true},{key:"platform",label:"平台",type:"select",options:["WhatsApp","Telegram","Facebook","通用"]},{key:"referenceImage",label:"成功参考图 URL"},{key:"enabled",label:"状态",type:"select",options:["启用","停用"]}],columns:["name","platform","referenceImage","enabled"]},
];

const defaults:Record<string,Row[]> = {
 platforms:[{name:"WhatsApp",appName:"WhatsApp",capabilities:"APP, 节点支持, 视频审核",action:"加载详情",enabled:true}],
 countries:[{name:"巴基斯坦",code:"PK",dialCode:"+92",currency:"USD",enabled:true}],
 sources:[], rewards:[], reviews:[]
};

async function api<T>(url:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(url,{...init,credentials:"include",headers:{"Content-Type":"application/json",...init.headers}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(typeof data.message==="string"?data.message:"请求失败");
 return data as T;
}

export default function TaskConfigurationPage(){
 const [tab,setTab]=useState<Tab>("platforms");
 const [rows,setRows]=useState<Record<string,Row[]>>({});
 const [templates,setTemplates]=useState<Template[]>([]);
 const [limits,setLimits]=useState<Row>({dailyLimit:"20",minimumIntervalSeconds:"60",taskTimeLimitMinutes:"3"});
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [search,setSearch]=useState("");
 const [formOpen,setFormOpen]=useState(false);
 const [editing,setEditing]=useState<number|null>(null);
 const [form,setForm]=useState<Row>({});
 const active=useMemo(()=>tabs.find(t=>t.key===tab)!,[tab]);

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   if(tab==="messages"){
    const data=await api<Template[]>("/api/v1/admin/tasks/message-templates");
    setTemplates(data);return;
   }
   if(tab==="platforms"){
    const result=await api<{items:Array<Record<string,unknown>>}>("/api/v1/admin/tasks/configuration/platforms");
    setRows(prev=>({...prev,platforms:result.items.map(item=>{const caps=item.capabilities&&typeof item.capabilities==="object"?Object.entries(item.capabilities as Record<string,unknown>).filter(([,v])=>v===true).map(([k])=>({appSupport:"APP",nodeSupport:"节点支持",visualReview:"视觉审核",backendSupport:"后台支持"}[k]??k)):[];const actions=Array.isArray(item.actions)?item.actions as Array<Record<string,unknown>>:[];return {...item,targetApp:item.targetApp,capabilities:caps.join(", "),action:String(actions[0]?.name??""),actionCode:String(actions[0]?.code??"")};})}));
    return;
   }
   const value=await api<unknown>("/api/v1/admin/tasks/configuration/"+tab);
   if(tab==="claim-limits"){
    const v=(value&&typeof value==="object"?value:{}) as Record<string,unknown>;
    setLimits({dailyLimit:String(v.dailyLimit??20),minimumIntervalSeconds:String(v.minimumIntervalSeconds??60),taskTimeLimitMinutes:String(v.taskTimeLimitMinutes??3)});
   }else{
    const list=Array.isArray(value)?value as Row[]:(defaults[tab]??[]);
    setRows(prev=>({...prev,[tab]:list.length?list:(defaults[tab]??[])}));
   }
  }catch(e){setError(e instanceof Error?e.message:"配置加载失败");}
  finally{setLoading(false);}
 },[tab]);

 useEffect(()=>{void load();},[load]);

 function startCreate(){
  setEditing(null);setForm(tab==="messages"?{name:"",platform:"WhatsApp 私信任务",language:"中文",content:"",enabled:true}:tab==="platforms"?{name:"",code:"",targetApp:"",capabilities:"APP, 节点支持, 视觉审核",action:"",actionCode:"SEND_MESSAGE"}:{enabled:"启用"});
  setFormOpen(true);setError("");setNotice("");
 }
 function startEdit(row:Row,index:number){
  setEditing(index);setForm({...row});setFormOpen(true);setError("");setNotice("");
 }
 async function saveRow(){
  setBusy(true);setError("");setNotice("");
  try{
   if(tab==="messages"){
    const payload={name:String(form.name??""),platform:String(form.platform??"WhatsApp"),action:"MESSAGE",content:String(form.content??""),enabled:true};
    if(editing!==null){const item=templates[editing];await api("/api/v1/admin/tasks/message-templates/"+item.id,{method:"PATCH",body:JSON.stringify(payload)});}
    else await api("/api/v1/admin/tasks/message-templates",{method:"POST",body:JSON.stringify(payload)});
   }else if(tab==="platforms"){
    const capabilitiesText=String(form.capabilities??"");
    const capabilities={appSupport:/APP/i.test(capabilitiesText),nodeSupport:/节点|node/i.test(capabilitiesText),visualReview:/视觉|视频|审核|review/i.test(capabilitiesText),backendSupport:/后台|backend/i.test(capabilitiesText)};
    const payload={name:String(form.name??""),targetApp:String(form.targetApp??""),description:"",capabilities};
    let platformId="";
    if(editing!==null){
     const old=rows.platforms[editing];platformId=String(old.id);
     await api("/api/v1/admin/tasks/configuration/platforms/"+platformId,{method:"PATCH",body:JSON.stringify(payload)});
     const oldActions=Array.isArray(old.actions)?old.actions as Array<Record<string,unknown>>:[];
     const actionName=String(form.action??"").trim();
     if(actionName){const actionPayload={name:actionName,evidenceType:"SCREENSHOT",requiresTargetPhone:true,requiresDeliveryStatus:true,requiresMessageTemplate:true};
      if(oldActions[0]?.id)await api("/api/v1/admin/tasks/configuration/platforms/"+platformId+"/actions/"+String(oldActions[0].id),{method:"PATCH",body:JSON.stringify(actionPayload)});
      else await api("/api/v1/admin/tasks/configuration/platforms/"+platformId+"/actions",{method:"POST",body:JSON.stringify({...actionPayload,code:String(form.actionCode??"SEND_MESSAGE")})});
     }
    }else{
     const created=await api<{id:string}>("/api/v1/admin/tasks/configuration/platforms",{method:"POST",body:JSON.stringify({...payload,code:String(form.code??"" )})});
     platformId=created.id;
     const actionName=String(form.action??"").trim();
     if(actionName)await api("/api/v1/admin/tasks/configuration/platforms/"+platformId+"/actions",{method:"POST",body:JSON.stringify({name:actionName,code:String(form.actionCode??"SEND_MESSAGE"),evidenceType:"SCREENSHOT",requiresTargetPhone:true,requiresDeliveryStatus:true,requiresMessageTemplate:true})});
    }
   }else{
    const list=[...(rows[tab]??defaults[tab]??[])];
    const normalized={...form,enabled:form.enabled==="停用"?false:form.enabled==="启用"?true:form.enabled};
    if(editing!==null)list[editing]=normalized;else list.push(normalized);
    await api("/api/v1/admin/tasks/configuration/"+tab,{method:"PATCH",body:JSON.stringify({value:list})});
    setRows(prev=>({...prev,[tab]:list}));
   }
   setFormOpen(false);setNotice(editing===null?"已新增并保存。":"修改已保存。");await load();
  }catch(e){setError(e instanceof Error?e.message:"保存失败");}
  finally{setBusy(false);}
 }
 async function toggleRow(index:number){
  setBusy(true);setError("");
  try{
   if(tab==="messages"){
    const item=templates[index];await api("/api/v1/admin/tasks/message-templates/"+item.id,{method:"PATCH",body:JSON.stringify({enabled:!item.enabled})});
   }else if(tab==="platforms"){
    const item=rows.platforms[index];await api("/api/v1/admin/tasks/configuration/platforms/"+String(item.id),{method:"PATCH",body:JSON.stringify({enabled:!Boolean(item.enabled)})});
   }else{
    const list=[...(rows[tab]??[])];list[index]={...list[index],enabled:!Boolean(list[index].enabled)};
    await api("/api/v1/admin/tasks/configuration/"+tab,{method:"PATCH",body:JSON.stringify({value:list})});setRows(prev=>({...prev,[tab]:list}));
   }
   await load();
  }catch(e){setError(e instanceof Error?e.message:"状态更新失败");}
  finally{setBusy(false);}
 }
 async function saveLimits(){
  setBusy(true);setError("");setNotice("");
  try{
   const value={dailyLimit:Number(limits.dailyLimit),minimumIntervalSeconds:Number(limits.minimumIntervalSeconds),taskTimeLimitMinutes:Number(limits.taskTimeLimitMinutes)};
   await api("/api/v1/admin/tasks/configuration/claim-limits",{method:"PATCH",body:JSON.stringify({value})});
   setNotice("领取限制已保存。");
  }catch(e){setError(e instanceof Error?e.message:"保存失败");}
  finally{setBusy(false);}
 }
 const dataRows=tab==="messages"?templates.map(t=>({...t,language:"—"} as unknown as Row)):(rows[tab]??defaults[tab]??[]);
 const filtered=dataRows.filter(row=>!search||JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));

 return <div className="dashboard-app"><AdminSidebar/><main className="dashboard-main" style={{minWidth:0}}>
  <div style={{padding:"12px 16px 22px",display:"grid",gap:14}}>
   <section style={panel}>
    <nav style={{display:"flex",gap:6,flexWrap:"wrap",borderBottom:"1px solid #e8edf5",paddingBottom:10}}>
     {tabs.map(item=>{const Icon=item.icon;return <button key={item.key} onClick={()=>{setTab(item.key);setFormOpen(false);setSearch("");setNotice("");setError("");}} style={{...tabButton,...(tab===item.key?tabActive:{})}}><Icon size={13}/>{item.label}<span style={{color:"#94a3b8"}}>ⓘ</span></button>;})}
    </nav>
    {error&&<div role="alert" style={alert}>{error}</div>}
    {notice&&<div role="status" style={success}>{notice}</div>}
    {tab==="claim-limits"?<div style={{padding:"18px 10px",maxWidth:620}}>
      <h2 style={heading}>任务领取限制</h2><p style={muted}>设置系统默认的每日领取上限、最小领取间隔和任务时限；用户等级限制仍按现有规则执行。</p>
      <div style={formGrid}>{active.fields.map(field=><label key={field.key} style={label}>{field.label}<input type="number" min="1" value={String(limits[field.key]??"")} onChange={e=>setLimits(v=>({...v,[field.key]:e.target.value}))} style={input}/></label>)}</div>
      <p style={muted}>以上限制保存后作为系统配置项使用。具体任务仍可受任务自身有效期约束。</p>
      <button onClick={()=>void saveLimits()} disabled={busy} style={primary}><Save size={14}/>保存限制</button>
    </div>:<>
     <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",paddingTop:12}}>
      <div style={{display:"flex",gap:8,flex:1,minWidth:240}}><div style={{position:"relative",flex:1,maxWidth:600}}><Search size={14} style={{position:"absolute",left:10,top:10,color:"#98a2b3"}}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={"搜索"+active.title+"…"} style={{...input,paddingLeft:32}}/></div></div>
      <div style={{display:"flex",gap:8}}><button onClick={()=>void load()} disabled={loading||busy} style={secondary}><RefreshCw size={14}/>刷新</button><button onClick={startCreate} style={primary}><Plus size={14}/>{tab==="messages"?"新增模板":tab==="reviews"?"新建 AI 视觉审核配置":tab==="countries"?"选择国家":tab==="sources"?"新增业务来源":tab==="rewards"?"新建奖励规则":"新建平台"}</button></div>
     </div>
     {formOpen&&<section style={{...subPanel,marginTop:12}}>
      <h3 style={{margin:"0 0 14px",fontSize:15}}>{editing===null?"新增":"编辑"}{active.title}</h3>
      <div style={formGrid}>{active.fields.map(field=><label key={field.key} style={label}>{field.label}{field.type==="textarea"?<textarea rows={4} required={field.required} value={String(form[field.key]??"")} onChange={e=>setForm(v=>({...v,[field.key]:e.target.value}))} placeholder={field.placeholder} style={{...input,resize:"vertical"}}/>:field.type==="select"?<select value={String(form[field.key]??field.options?.[0]??"")} onChange={e=>setForm(v=>({...v,[field.key]:e.target.value}))} style={input}>{field.options?.map(o=><option key={o}>{o}</option>)}</select>:<input required={field.required} type={field.type==="number"?"number":"text"} value={String(form[field.key]??"")} onChange={e=>setForm(v=>({...v,[field.key]:e.target.value}))} placeholder={field.placeholder} style={input}/>}</label>)}</div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:14}}><button onClick={()=>setFormOpen(false)} style={secondary}>取消</button><button onClick={()=>void saveRow()} disabled={busy} style={primary}><Save size={14}/>保存</button></div>
     </section>}
     <div style={{border:"1px solid #e5eaf2",borderRadius:8,overflow:"hidden",marginTop:12}}>
      <div style={{padding:"11px 14px",background:"#f8fafc",borderBottom:"1px solid #e5eaf2",fontSize:13,fontWeight:600}}>{active.title}<span style={{float:"right",fontWeight:400,color:"#718096"}}>共 {filtered.length} 条</span></div>
      {loading?<div style={{padding:30,textAlign:"center",color:"#718096"}}>正在加载…</div>:filtered.length===0?<div style={{padding:52,textAlign:"center",color:"#718096"}}>暂无数据，请点击右上角新增。</div>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:850}}><thead><tr>{[...active.columns,"操作"].map(col=><th key={col} style={th}>{fieldName(active,col)}</th>)}</tr></thead><tbody>{filtered.map((row,index)=><tr key={String(row.id??index)}>{active.columns.map(col=><td key={col} style={td}>{col==="enabled"?<span style={badge(Boolean(row.enabled))}>{row.enabled?"已启用":"已停用"}</span>:col==="content"?<span title={String(row[col]??"")} style={{display:"block",maxWidth:320,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{String(row[col]??"—")}</span>:String(row[col]??"—")}</td>)}<td style={td}><div style={{display:"flex",gap:10,whiteSpace:"nowrap"}}><button style={linkBtn} onClick={()=>startEdit(row,index)}><Pencil size={13}/>编辑</button>{row.enabled!==undefined&&<button style={linkBtn} disabled={busy} onClick={()=>void toggleRow(index)}><Power size={13}/>{row.enabled?"停用":"启用"}</button>}{tab==="messages"&&<button style={linkBtn} onClick={()=>{const t=templates[index];setForm({name:t.name+" - 新版本",platform:t.platform,content:t.content,language:"中文"});setEditing(null);setFormOpen(true);}}>新建版本</button>}{tab==="messages"&&<button style={linkBtn} onClick={()=>window.alert(String(row.content??"暂无内容"))}>预览</button>}</div></td></tr>)}</tbody></table></div>}
      <div style={{padding:"12px 14px",borderTop:"1px solid #edf0f5",fontSize:12,color:"#718096"}}>共 {filtered.length} 条记录</div>
     </div>
    </>}
   </section>
  </div>
 </main></div>;
}

function fieldName(config:Config,key:string){return config.fields.find(f=>f.key===key)?.label??({name:"名称",appName:"目标 APP",targetApp:"目标 APP",code:"平台代码",actionCode:"动作代码",capabilities:"能力",action:"任务动作",enabled:"状态",code:"国家代码",dialCode:"国际区号",currency:"默认货币",category:"业务分类",note:"内部备注",task:"关联任务",platform:"平台 / 类型",countries:"适用国家/地区",amount:"用户奖励",language:"语言",content:"话术内容",referenceImage:"成功参考图"} as Record<string,string>)[key]??key;}
function badge(enabled:boolean){return {display:"inline-block",padding:"3px 8px",borderRadius:5,fontSize:11,color:enabled?"#059669":"#64748b",background:enabled?"#ecfdf5":"#f1f5f9",border:"1px solid "+(enabled?"#a7f3d0":"#cbd5e1")};}
const panel={background:"#fff",border:"1px solid #e5eaf2",borderRadius:9,padding:10,minHeight:"calc(100vh - 110px)"} as const;
const subPanel={background:"#fbfcfe",border:"1px solid #e5eaf2",borderRadius:8,padding:16} as const;
const tabButton={display:"inline-flex",alignItems:"center",gap:6,border:"1px solid transparent",borderRadius:7,padding:"8px 10px",background:"#f8fafc",color:"#64748b",fontSize:12,cursor:"pointer",whiteSpace:"nowrap"} as const;
const tabActive={background:"#eff6ff",border:"1px solid #bfdbfe",color:"#2563eb",fontWeight:600} as const;
const input={width:"100%",boxSizing:"border-box" as const,border:"1px solid #d9e1ec",borderRadius:6,padding:"8px 10px",background:"#fff",color:"#344054",fontSize:12,minHeight:34} as const;
const label={display:"flex",flexDirection:"column" as const,gap:7,fontSize:12,color:"#475467",fontWeight:600} as const;
const formGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:16} as const;
const heading={fontSize:17,margin:"0 0 8px",color:"#172033"} as const;
const muted={fontSize:12,color:"#718096",lineHeight:1.7} as const;
const primary={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,border:0,borderRadius:6,padding:"8px 13px",background:"#3478f6",color:"#fff",fontSize:12,cursor:"pointer"} as const;
const secondary={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,border:"1px solid #d9e1ec",borderRadius:6,padding:"8px 12px",background:"#fff",color:"#344054",fontSize:12,cursor:"pointer"} as const;
const th={textAlign:"left" as const,padding:"11px 12px",fontSize:11,color:"#667085",background:"#f8fafc",borderBottom:"1px solid #e5eaf2",whiteSpace:"nowrap"};
const td={padding:"11px 12px",fontSize:12,color:"#344054",borderBottom:"1px solid #edf0f5",maxWidth:300};
const linkBtn={display:"inline-flex",alignItems:"center",gap:4,border:0,background:"transparent",color:"#2864ed",fontSize:12,cursor:"pointer",padding:0};
const alert={marginTop:12,padding:10,borderRadius:6,color:"#b42318",background:"#fff1f0",fontSize:12};
const success={marginTop:12,padding:10,borderRadius:6,color:"#16794b",background:"#eaf8f0",fontSize:12};
