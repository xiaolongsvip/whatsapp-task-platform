"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Bell, CircleHelp, Eye, Plus, RefreshCw, Search, ShieldAlert, Users, AlertTriangle, X, Pencil } from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";

type RiskEvent = { id:string; type:string; level:string; score:number; status:string; userId:string; phone:string; createdAt:string; description:string };
type RiskRule = { id:string; name:string; category:string; impactScore:number; executionOrder:number; startsAt:string|null; endsAt:string|null; status:string; description:string|null };
type RiskUser = { id:string; phone:string; device:string; reason:string|null; reputationScore:number; status:string; lastSeenAt:string };
const categoryLabels:Record<string,string> = {
  RISK_LEVEL_THRESHOLD:"风险等级阈值", NETWORK_SIGNAL:"网络信号异常", CREDIT_SCORE:"用户信誉分",
  CREDIT_LEVEL_POLICY:"信誉等级策略", DEVICE_ASSOCIATION:"设备关联", NETWORK_ASSOCIATION:"网络关联",
  PAYMENT_ASSOCIATION:"支付关联", TASK_BEHAVIOR_ANOMALY:"任务行为异常"
};
const label=(v:string)=>categoryLabels[v]||v;
const levels:Record<string,string>={LOW:"低风险",MEDIUM:"中风险",HIGH:"高风险",CRITICAL:"严重风险"};
const statusLabel=(v:string)=>({OPEN:"待处理",PROCESSING:"处理中",RESOLVED:"已处理",DISMISSED:"已忽略",ACTIVE:"已启用",DRAFT:"草稿",DISABLED:"已停用"} as Record<string,string>)[v]||v;
const categories=Object.keys(categoryLabels);
const field:CSSProperties={width:"100%",height:38,border:"1px solid #dbe3ee",borderRadius:6,padding:"0 11px",fontSize:13,color:"#26364c",background:"#fff"};
const th:React.CSSProperties={textAlign:"left",padding:"12px 10px",fontSize:12,color:"#64748b",fontWeight:500,whiteSpace:"nowrap",background:"#f8fafc",borderBottom:"1px solid #e5ebf3"};
const td:React.CSSProperties={padding:"12px 10px",fontSize:13,color:"#29415f",borderBottom:"1px solid #edf1f6",whiteSpace:"nowrap"};
const btn:React.CSSProperties={height:36,padding:"0 14px",border:"1px solid #dbe3ee",borderRadius:6,background:"#fff",color:"#40536d",fontSize:13,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6};

export default function RiskRecords(){
 const [tab,setTab]=useState<"events"|"users"|"rules">("events");
 const [events,setEvents]=useState<RiskEvent[]>([]),[users,setUsers]=useState<RiskUser[]>([]),[rules,setRules]=useState<RiskRule[]>([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState(""),[keyword,setKeyword]=useState(""),[level,setLevel]=useState(""),[status,setStatus]=useState("");
 const [modal,setModal]=useState(false),[editing,setEditing]=useState<RiskRule|null>(null),[saving,setSaving]=useState(false);
 const [form,setForm]=useState({name:"",category:"",impactScore:"0",executionOrder:"100",startsAt:"",endsAt:"",status:"DRAFT",description:""});
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   if(tab==="rules"){
    const r=await fetch("/api/v1/admin/ai-reviews/risk/rules",{credentials:"include"});const b=await r.json();if(!r.ok)throw new Error(b.message||"读取规则失败");setRules(b);
   }else if(tab==="users"){
    const q=new URLSearchParams({page:"1",pageSize:"100"});if(keyword)q.set("keyword",keyword);
    const r=await fetch("/api/v1/admin/ai-reviews/risk/users?"+q,{credentials:"include"});const b=await r.json();if(!r.ok)throw new Error(b.message||"读取风险用户失败");setUsers(b.users||[]);
   }else{
    const q=new URLSearchParams({page:"1",pageSize:"100"});if(keyword)q.set("keyword",keyword);if(level)q.set("level",level);if(status)q.set("status",status);
    const r=await fetch("/api/v1/admin/ai-reviews/risk/events?"+q,{credentials:"include"});const b=await r.json();if(!r.ok)throw new Error(b.message||"读取风险事件失败");setEvents(b.events||[]);
   }
  }catch(e){setError(e instanceof Error?e.message:"读取风控数据失败");}finally{setLoading(false);}
 },[tab,keyword,level,status]);
 useEffect(()=>{void load()},[load]);
 function openRule(rule?:RiskRule){setEditing(rule||null);setForm(rule?{name:rule.name,category:rule.category,impactScore:String(rule.impactScore),executionOrder:String(rule.executionOrder),startsAt:rule.startsAt?rule.startsAt.slice(0,16):"",endsAt:rule.endsAt?rule.endsAt.slice(0,16):"",status:rule.status,description:rule.description||""}:{name:"",category:"",impactScore:"0",executionOrder:"100",startsAt:"",endsAt:"",status:"DRAFT",description:""});setModal(true);}
 async function saveRule(e:FormEvent){e.preventDefault();if(saving)return;setSaving(true);setError("");try{
  const body={...form,impactScore:Number(form.impactScore),executionOrder:Number(form.executionOrder),startsAt:form.startsAt?new Date(form.startsAt).toISOString():null,endsAt:form.endsAt?new Date(form.endsAt).toISOString():null};
  const r=await fetch("/api/v1/admin/ai-reviews/risk/rules"+(editing?"/"+editing.id:""),{method:editing?"POST":"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const b=await r.json();if(!r.ok)throw new Error(b.message||"保存规则失败");setModal(false);await load();
 }catch(e){setError(e instanceof Error?e.message:"保存规则失败");}finally{setSaving(false);}}
 async function toggleRule(rule:RiskRule){const next=rule.status==="ACTIVE"?"DISABLED":"ACTIVE";try{const r=await fetch("/api/v1/admin/ai-reviews/risk/rules/"+rule.id,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});const b=await r.json();if(!r.ok)throw new Error(b.message||"更新状态失败");await load();}catch(e){setError(e instanceof Error?e.message:"更新状态失败");}}
 const cards=tab==="events"?[{title:"开放风险",value:events.filter(x=>x.status==="OPEN").length,sub:"待处理事件",color:"#f97316",Icon:ShieldAlert},{title:"高危风险",value:events.filter(x=>x.level==="HIGH").length,sub:"HIGH 风险事件",color:"#f43f5e",Icon:AlertTriangle},{title:"严重风险",value:events.filter(x=>x.level==="CRITICAL").length,sub:"CRITICAL 风险事件",color:"#f43f5e",Icon:AlertTriangle},{title:"受影响用户",value:new Set(events.map(x=>x.userId).filter(Boolean)).size,sub:"关联用户去重数",color:"#2563eb",Icon:Users}]:[];
 return <div className="dashboard-app"><AdminSidebar/><section className="dashboard-main">
 <header className="dashboard-topbar"><div className="topbar-search"><Search size={16}/><input placeholder="搜索任务、用户、手机号码..." readOnly/></div><div className="topbar-actions"><span className="topbar-language">文</span><button className="topbar-icon"><CircleHelp size={19}/></button><button className="topbar-icon"><Bell size={19}/><i/></button><div className="admin-profile"><span className="profile-avatar"><Users size={18}/></span><span><strong>Administrator</strong><small>超级管理员</small></span></div></div></header>
 <div className="dashboard-content" style={{maxWidth:"none",padding:"14px 18px 24px"}}>
 <div style={{display:"flex",gap:4,borderBottom:"1px solid #dfe7f0",marginBottom:16}}>
 {([{id:"events",name:"风险事件"},{id:"users",name:"风险用户"},{id:"rules",name:"风控规则"}] as const).map(x=><button key={x.id} onClick={()=>{setTab(x.id);setKeyword("");setLevel("");setStatus("");}} style={{padding:"12px 16px",border:0,borderBottom:tab===x.id?"2px solid #2563eb":"2px solid transparent",background:tab===x.id?"#eff6ff":"transparent",color:tab===x.id?"#2563eb":"#52647d",fontSize:14,cursor:"pointer"}}>{x.name}</button>)}
 </div>
 {tab==="events"&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,marginBottom:14}}>{cards.map(c=><div key={c.title} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:7,padding:"15px 18px",display:"flex",alignItems:"center",gap:13}}><span style={{width:40,height:40,borderRadius:"50%",background:c.color,color:"#fff",display:"grid",placeItems:"center"}}><c.Icon size={20}/></span><div><div style={{fontSize:12,color:"#64748b"}}>{c.title}</div><strong style={{display:"block",fontSize:25,color:"#0f172a"}}>{c.value}</strong><small style={{fontSize:11,color:"#8492a6"}}>{c.sub}</small></div></div>)}</div>}
 <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:12}}>
 {tab==="rules"&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 4px 16px"}}><div><strong style={{fontSize:14,color:"#1e293b"}}>可配置风控规则</strong><div style={{fontSize:12,color:"#8492a6",marginTop:4}}>用于调整风险等级、设备网络异常和用户信誉的判断标准；所有变更都会记录审计。</div></div><button onClick={()=>openRule()} style={{...btn,background:"#3478f6",color:"#fff",borderColor:"#3478f6"}}><Plus size={15}/>新建规则</button></div>}
 {tab!=="rules"&&<div style={{display:"flex",gap:9,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}><input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder={tab==="events"?"风险类型 / 用户 / 事件标识":"输入名称或标识搜索"} style={{...field,width:205}}/>{tab==="events"&&<><select value={level} onChange={e=>setLevel(e.target.value)} style={{...field,width:120}}><option value="">全部风险等级</option>{Object.entries(levels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)} style={{...field,width:120}}><option value="">全部处理状态</option><option value="OPEN">待处理</option><option value="PROCESSING">处理中</option><option value="RESOLVED">已处理</option></select></>}<span style={{flex:1}}/><button onClick={()=>void load()} style={{...btn,background:"#2563eb",color:"#fff",borderColor:"#2563eb"}}><Search size={14}/>搜索</button><button onClick={()=>{setKeyword("");setLevel("");setStatus("");}} style={btn}>重置</button></div>}
 {error&&<div style={{padding:10,marginBottom:10,color:"#b91c1c",background:"#fef2f2",borderRadius:6,fontSize:13}}>{error}</div>}
 <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:tab==="rules"?950:850}}><thead><tr>{(tab==="events"?["事件类型","风险等级","风险分","处理状态","创建时间","操作"]:tab==="users"?["用户","设备标识","风险原因","信誉分","设备状态","最近活动"]:["规则用途","判断说明","规则分类","影响分值","执行顺序","状态","操作"]).map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>
 {loading?<tr><td colSpan={7} style={{...td,textAlign:"center",padding:50}}>正在加载…</td></tr>:tab==="events"?events.length===0?<tr><td colSpan={6} style={{...td,textAlign:"center",padding:50,color:"#94a3b8"}}>暂无风控事件记录</td></tr>:events.map(x=><tr key={x.id}><td style={td}>{x.type}</td><td style={td}>{levels[x.level]||x.level}</td><td style={td}>{x.score}</td><td style={td}>{statusLabel(x.status)}</td><td style={td}>{new Date(x.createdAt).toLocaleString("zh-CN",{hour12:false})}</td><td style={td}><button style={{border:0,background:"transparent",color:"#2563eb",cursor:"pointer"}} title={x.description||x.id}><Eye size={15}/> 详情</button></td></tr>):tab==="users"?users.length===0?<tr><td colSpan={6} style={{...td,textAlign:"center",padding:50,color:"#94a3b8"}}>暂无已标记风险用户</td></tr>:users.map(x=><tr key={x.id}><td style={td}>{x.phone}</td><td style={td}>{x.device}</td><td style={td}>{x.reason||"设备异常标记"}</td><td style={td}>{x.reputationScore}</td><td style={td}>{x.status==="ACTIVE"?"正常":"已阻止"}</td><td style={td}>{new Date(x.lastSeenAt).toLocaleString("zh-CN")}</td></tr>):rules.length===0?<tr><td colSpan={7} style={{...td,textAlign:"center",padding:50,color:"#94a3b8"}}>暂无风控规则，点击右上角新建规则</td></tr>:rules.map(x=><tr key={x.id}><td style={td}>{x.name}</td><td style={{...td,maxWidth:360,whiteSpace:"normal"}}>{x.description||"—"}</td><td style={td}>{label(x.category)}</td><td style={td}>{x.impactScore}</td><td style={td}>{x.executionOrder}</td><td style={td}><span style={{color:x.status==="ACTIVE"?"#059669":"#64748b"}}>{statusLabel(x.status)}</span></td><td style={td}><button onClick={()=>openRule(x)} style={{border:0,background:"transparent",color:"#2563eb",cursor:"pointer",marginRight:12}}><Pencil size={15}/></button><button onClick={()=>void toggleRule(x)} style={{border:0,background:"transparent",color:x.status==="ACTIVE"?"#dc2626":"#059669",cursor:"pointer"}}>{x.status==="ACTIVE"?"停用":"启用"}</button></td></tr>)}
 </tbody></table></div>
 {tab!=="rules"&&<div style={{display:"flex",justifyContent:"flex-end",paddingTop:12,color:"#8492a6",fontSize:12}}>当前显示 {tab==="events"?events.length:users.length} 条</div>}
 </section></div>
 {modal&&<div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.35)",zIndex:100,display:"flex",justifyContent:"flex-end"}}><form onSubmit={saveRule} style={{width:"min(520px,96vw)",height:"100%",overflowY:"auto",background:"#fff",padding:22,boxShadow:"-8px 0 28px #0002"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><strong style={{fontSize:18}}>{editing?"编辑风控规则":"新建风控规则"}</strong><button type="button" onClick={()=>setModal(false)} style={{border:0,background:"transparent",cursor:"pointer"}}><X/></button></div>
 {[{key:"name",title:"规则名称",type:"text",required:true},{key:"impactScore",title:"影响分值",type:"number",required:true},{key:"executionOrder",title:"执行顺序",type:"number",required:true},{key:"startsAt",title:"开始生效时间",type:"datetime-local"},{key:"endsAt",title:"结束生效时间",type:"datetime-local"}].map(f=><label key={f.key} style={{display:"block",fontSize:13,color:"#334155",marginBottom:14}}>{f.title}{f.required?" *":""}<input required={f.required} type={f.type} value={form[f.key as keyof typeof form]} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))} style={{...field,display:"block",marginTop:7}}/></label>)}
 <label style={{display:"block",fontSize:13,color:"#334155",marginBottom:14}}>规则分类 *<select required value={form.category} onChange={e=>setForm(v=>({...v,category:e.target.value}))} style={{...field,display:"block",marginTop:7}}><option value="">请选择</option>{categories.map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label>
 <label style={{display:"block",fontSize:13,color:"#334155",marginBottom:14}}>状态 *<select value={form.status} onChange={e=>setForm(v=>({...v,status:e.target.value}))} style={{...field,display:"block",marginTop:7}}><option value="DRAFT">草稿</option><option value="ACTIVE">已启用</option><option value="DISABLED">已停用</option></select></label>
 <label style={{display:"block",fontSize:13,color:"#334155",marginBottom:14}}>判断说明<textarea value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))} rows={4} style={{...field,height:"auto",padding:10,marginTop:7}}/></label>
 <div style={{display:"flex",justifyContent:"flex-end",gap:9,marginTop:24}}><button type="button" onClick={()=>setModal(false)} style={btn}>取消</button><button disabled={saving} type="submit" style={{...btn,background:"#3478f6",borderColor:"#3478f6",color:"#fff"}}>{saving?"提交中…":"提交"}</button></div>
 </form></div>}
 </section></div>;
}
