"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Bell, CircleHelp, Search, Users, RefreshCw, Plus, Upload, X, ChevronDown, Trash2 } from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";

type NumberRow={id:string;phoneMasked:string;countryCode:string|null;countryName:string|null;status:string;passedCount:number;failedCount:number;totalCount:number;updatedAt:string};
type ResultRow={id:string;claimId:string;taskId:string;taskTitle:string;phone:string;userPhone:string;assignedAt:string;taskStatus:string;actualResult:string;handlingStatus:string;updatedAt:string};
type ImportRow={id:string;fileName:string;status:string;importedCount:number;duplicateCount:number;invalidCount:number;totalRows:number;updatedAt:string;operator:string};
const countries=[["阿根廷","AR","+54"],["澳大利亚","AU","+61"],["孟加拉国","BD","+880"],["巴西","BR","+55"],["加拿大","CA","+1"],["智利","CL","+56"],["哥伦比亚","CO","+57"],["埃及","EG","+20"],["法国","FR","+33"],["德国","DE","+49"],["加纳","GH","+233"],["香港","HK","+852"],["印度","IN","+91"],["印度尼西亚","ID","+62"],["意大利","IT","+39"],["日本","JP","+81"],["肯尼亚","KE","+254"],["马来西亚","MY","+60"],["墨西哥","MX","+52"],["摩洛哥","MA","+212"],["荷兰","NL","+31"],["尼日利亚","NG","+234"],["巴基斯坦","PK","+92"],["菲律宾","PH","+63"],["波兰","PL","+48"],["沙特阿拉伯","SA","+966"],["南非","ZA","+27"],["韩国","KR","+82"],["西班牙","ES","+34"],["台湾","TW","+886"],["坦桑尼亚","TZ","+255"],["泰国","TH","+66"],["土耳其","TR","+90"],["乌干达","UG","+256"],["阿拉伯联合酋长国","AE","+971"],["英国","GB","+44"],["美国","US","+1"],["越南","VN","+84"]];
const countryLabel=(code:string|null,name:string|null)=>name&&code?name+"（"+code+" / "+(countries.find(c=>c[1]===code)?.[2]||"") +"）":name||code||"—";
const field:CSSProperties={width:"100%",height:38,border:"1px solid #dbe3ee",borderRadius:6,padding:"0 11px",fontSize:13,color:"#334155",background:"#fff"};
const btn:CSSProperties={height:36,padding:"0 13px",border:"1px solid #dbe3ee",borderRadius:6,background:"#fff",color:"#40536d",fontSize:13,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6};
const th:CSSProperties={textAlign:"left",padding:"12px 10px",fontSize:12,color:"#64748b",fontWeight:500,whiteSpace:"nowrap",background:"#f8fafc",borderBottom:"1px solid #e5ebf3"};
const td:CSSProperties={padding:"12px 10px",fontSize:13,color:"#29415f",borderBottom:"1px solid #edf1f6",whiteSpace:"nowrap"};
const statusText=(s:string)=>({AVAILABLE:"可用",ASSIGNED:"已分配",USED:"已使用",BLOCKED:"已封禁",SUCCESS:"成功",FAILED:"失败",PENDING:"待处理",COMPLETED:"已完成",REVIEW:"待复核"} as Record<string,string>)[s]||s;
export default function RandomRisk(){
 const [tab,setTab]=useState<"numbers"|"results"|"imports">("numbers");
 const [numbers,setNumbers]=useState<NumberRow[]>([]),[results,setResults]=useState<ResultRow[]>([]),[imports,setImports]=useState<ImportRow[]>([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState(""),[search,setSearch]=useState(""),[countryFilter,setCountryFilter]=useState(""),[status,setStatus]=useState("");
 const [selectedIds,setSelectedIds]=useState<string[]>([]),[deleting,setDeleting]=useState(false);
 const [modal,setModal]=useState<"single"|"result"|null>(null),[saving,setSaving]=useState(false),[importPage,setImportPage]=useState(false),[importFile,setImportFile]=useState<File|null>(null),[dragging,setDragging]=useState(false);
 const [phone,setPhone]=useState(""),[country,setCountry]=useState(""),[countrySearch,setCountrySearch]=useState(""),[countryOpen,setCountryOpen]=useState(false),[consent,setConsent]=useState(false);
 const [resultRow,setResultRow]=useState<ResultRow|null>(null),[actualResult,setActualResult]=useState(""),[handlingStatus,setHandlingStatus]=useState("PENDING");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   if(tab==="numbers"){
    const q=new URLSearchParams({limit:"200"});if(search)q.set("search",search);
    const r=await fetch("/api/v1/admin/contact-numbers/sampling-numbers?"+q,{credentials:"include"});const b=await r.json();if(!r.ok)throw new Error(b.message||"读取抽检号码失败");setNumbers((b.numbers||[]).filter((x:NumberRow)=>!countryFilter||x.countryCode===countryFilter).filter((x:NumberRow)=>!status||x.status===status));
   }else if(tab==="results"){
    const q=new URLSearchParams({page:"1",pageSize:"100"});if(status)q.set("status",status);
    const r=await fetch("/api/v1/admin/contact-numbers/sampling-results?"+q,{credentials:"include"});const b=await r.json();if(!r.ok)throw new Error(b.message||"读取结果记录失败");setResults(b.records||[]);
   }else{
    const q=new URLSearchParams({page:"1",pageSize:"100"});if(status)q.set("status",status);
    const r=await fetch("/api/v1/admin/contact-numbers/import-history?"+q,{credentials:"include"});const b=await r.json();if(!r.ok)throw new Error(b.message||"读取导入记录失败");setImports(b.records||[]);
   }
  }catch(e){setError(e instanceof Error?e.message:"读取数据失败");}finally{setLoading(false);}
 },[tab,search,countryFilter,status]);
 useEffect(()=>{void load()},[load]);
 const chosenCountry=countries.find(c=>c[1]===country);
 const masked=(v:string)=>v.length>7?v.slice(0,4)+"••••"+v.slice(-3):v;
 async function addSingle(e:FormEvent){e.preventDefault();if(!chosenCountry||saving)return;setSaving(true);setError("");try{const r=await fetch("/api/v1/admin/contact-numbers/single",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone,countryCode:chosenCountry[1],countryName:chosenCountry[0],consentConfirmed:consent})});const b=await r.json();if(!r.ok)throw new Error(b.message||"新增失败");setModal(null);setPhone("");setCountry("");setConsent(false);await load();}catch(e){setError(e instanceof Error?e.message:"新增失败");}finally{setSaving(false);}}

 const visibleIds=numbers.map(x=>x.id);
 const allVisibleSelected=visibleIds.length>0&&visibleIds.every(id=>selectedIds.includes(id));
 function toggleSelected(id:string,checked:boolean){setSelectedIds(current=>checked?[...new Set([...current,id])]:current.filter(x=>x!==id));}
 async function removeNumbers(ids:string[],clearAll=false){
  if(deleting)return;
  const message=clearAll
   ?"确定清空整个抽检号码库吗？此操作会删除全部抽检号码及其号码关联记录，任务审核、钱包和任务主记录会保留。"
   ?`确定删除选中的 ${ids.length} 条抽检号码吗？`
   :"";
  if(!window.confirm(message))return;
  setDeleting(true);setError("");
  try{
   const response=await fetch(clearAll?"/api/v1/admin/contact-numbers/sampling-numbers/all":"/api/v1/admin/contact-numbers/sampling-numbers"+(ids.length===1?"/"+encodeURIComponent(ids[0]):""),{
    method:"DELETE",credentials:"include",
    headers:clearAll||ids.length===1?{}:{"Content-Type":"application/json"},
    body:clearAll||ids.length===1?undefined:JSON.stringify({ids}),
   });
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body.message||"删除失败，请稍后重试。");
   setSelectedIds([]);
   setError("");
   await load();
   window.alert(`删除成功，共删除 ${body.deletedCount??ids.length} 条号码。`);
  }catch(e){setError(e instanceof Error?e.message:"删除失败");}
  finally{setDeleting(false);}
 }
 async function readImportFile(file:File){
  if(file.size>64*1024*1024){setError("文件不能超过 64 MB。");return;}
  const ext=file.name.toLowerCase().split(".").pop();
  if(ext!=="csv"&&ext!=="txt"){setError("当前版本支持 CSV、TXT 文件，请先将 XLSX 文件另存为 CSV 后导入。");return;}
  setImportFile(file);setError("");
 }
 async function importBatch(){
  if(!importFile||!chosenCountry||saving)return;
  setSaving(true);setError("");
  try{
   const text=await importFile.text();
   const nums=text.split(/[\\n,;\\t\\r]+/).map(x=>x.trim().replace(/^["']|["']$/g,"")).filter(Boolean).map(phone=>({phone}));
   if(!nums.length)throw new Error("文件中没有读取到号码，请检查文件内容。");
   const r=await fetch("/api/v1/admin/contact-numbers/import",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileName:importFile.name,numbers:nums,countryCode:chosenCountry[1],countryName:chosenCountry[0],consentSource:"管理员确认已取得号码持有人授权",consentedAt:new Date().toISOString()})});
   const b=await r.json();if(!r.ok)throw new Error(b.message||"批量导入失败");
   setImportPage(false);setImportFile(null);setCountry("");await load();
  }catch(e){setError(e instanceof Error?e.message:"批量导入失败");}finally{setSaving(false);}
 }
 async function saveResult(e:FormEvent){e.preventDefault();if(!resultRow||saving)return;setSaving(true);setError("");try{const r=await fetch("/api/v1/admin/contact-numbers/sampling-results",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({claimId:resultRow.claimId,actualResult,handlingStatus})});const b=await r.json();if(!r.ok)throw new Error(b.message||"保存结果失败");setModal(null);setResultRow(null);await load();}catch(e){setError(e instanceof Error?e.message:"保存结果失败");}finally{setSaving(false);}}
 const filteredCountries=useMemo(()=>countries.filter(c=>(c[0]+c[1]+c[2]).toLowerCase().includes(countrySearch.toLowerCase())),[countrySearch]);
 return <div className="dashboard-app"><AdminSidebar/><section className="dashboard-main">
 <header className="dashboard-topbar"><div className="topbar-search"><Search size={16}/><input placeholder="搜索任务、用户、手机号码..." readOnly/></div><div className="topbar-actions"><span className="topbar-language">文</span><button className="topbar-icon"><CircleHelp size={19}/></button><button className="topbar-icon"><Bell size={19}/><i/></button><div className="admin-profile"><span className="profile-avatar"><Users size={18}/></span><span><strong>Administrator</strong><small>超级管理员</small></span></div></div></header>

 {importPage?<div className="dashboard-content" style={{maxWidth:"none",padding:"14px 18px 24px"}}>
  <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden"}}>
   <div style={{padding:"14px 18px",borderBottom:"1px solid #e5ebf3"}}>
    <button onClick={()=>{setImportPage(false);setError("");}} style={{...btn,border:0,padding:0,height:24,marginBottom:8}}><span style={{fontSize:18}}>‹</span>返回抽检号码</button>
    <div style={{fontSize:14,fontWeight:650,color:"#1e293b"}}>批量导入</div>
    <div style={{fontSize:12,color:"#71839b",marginTop:5}}>选择文件后提交至服务端校验和导入，导入结果以真实处理记录为准。</div>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 204px",gap:14,padding:14,alignItems:"start"}}>
    <div><div style={{fontSize:12,color:"#52647d",marginBottom:8}}>号码文件</div>
     <label onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);const file=e.dataTransfer.files?.[0];if(file)void readImportFile(file);}} style={{height:104,border:"1px dashed "+(dragging?"#3478f6":"#dbe5f1"),borderRadius:7,background:dragging?"#eff6ff":"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#64748b"}}>
      <Upload size={23} style={{marginBottom:8,color:"#8093ad"}}/><span style={{fontSize:13,color:"#334155"}}>{importFile?importFile.name:"选择或拖拽文件"}</span><span style={{fontSize:11,marginTop:5}}>支持格式：.csv, .txt，最大 64MB</span>
      <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={e=>{const file=e.target.files?.[0];if(file)void readImportFile(file);}} style={{display:"none"}}/>
     </label>
     <div style={{fontSize:11,color:"#8492a6",marginTop:9}}>支持 CSV、TXT，文件不超过 64 MB。每行一个号码，也支持逗号、分号分隔。</div>
     {importFile&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,fontSize:12,color:"#52647d"}}><span>{importFile.name}（{(importFile.size/1024/1024).toFixed(2)} MB）</span><button onClick={()=>setImportFile(null)} style={{...btn,height:25,padding:"0 8px"}}>移除</button></div>}
    </div>
    <div><div style={{fontSize:12,color:"#52647d",marginBottom:8}}>所属国家</div><select value={country} onChange={e=>setCountry(e.target.value)} style={field}><option value="">请选择国家</option>{countries.map(x=><option key={x[1]} value={x[1]}>{x[0]}（{x[1]} / {x[2]}）</option>)}</select></div>
   </div>
   {error&&<div style={{margin:"0 14px 12px",padding:10,color:"#b91c1c",background:"#fef2f2",borderRadius:6,fontSize:13}}>{error}</div>}
   <div style={{display:"flex",justifyContent:"flex-end",padding:"0 14px 14px"}}><button disabled={!importFile||!country||saving} onClick={()=>void importBatch()} style={{...btn,background:"#3478f6",borderColor:"#3478f6",color:"#fff",opacity:!importFile||!country||saving ? 0.55 : 1}}><Upload size={14}/>{saving?"正在上传导入…":"上传并导入"}</button></div>
  </section>
 </div>:<>
 <div className="dashboard-content" style={{maxWidth:"none",padding:"14px 18px 24px"}}>
 <div style={{display:"flex",gap:4,borderBottom:"1px solid #dfe7f0",marginBottom:16}}>{([{id:"numbers",name:"抽检号码"},{id:"results",name:"结果录入"},{id:"imports",name:"导入记录"}] as const).map(x=><button key={x.id} onClick={()=>{setTab(x.id);setStatus("");setSearch("");}} style={{padding:"12px 16px",border:0,borderBottom:tab===x.id?"2px solid #2563eb":"2px solid transparent",background:tab===x.id?"#eff6ff":"transparent",color:tab===x.id?"#2563eb":"#52647d",fontSize:14,cursor:"pointer"}}>{x.name}</button>)}</div>
 <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:12}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"2px 4px 14px"}}><div><strong style={{fontSize:14,color:"#1e293b"}}>{tab==="numbers"?"抽检号码":tab==="results"?"结果录入":"导入记录"}</strong><div style={{fontSize:12,color:"#8492a6",marginTop:4}}>{tab==="numbers"?"展示平台控制的抽检号码及抽检统计，手机号按权限脱敏。":tab==="results"?"录入抽检号码的实际收件结果，供审核和风控判断。":"查看处理进度、成功/失败/重复计数和脱敏错误明细。"}</div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{tab==="numbers"&&<><button disabled={deleting||selectedIds.length===0} onClick={()=>void removeNumbers(selectedIds)} style={{...btn,color:"#dc2626",borderColor:"#fecaca",opacity:selectedIds.length===0?0.5:1}}><Trash2 size={15}/>{deleting?"删除中…":`批量删除（${selectedIds.length}）`}</button><button disabled={deleting||numbers.length===0} onClick={()=>void removeNumbers([],true)} style={{...btn,color:"#dc2626",borderColor:"#fecaca"}}><Trash2 size={15}/>一键清空</button><button onClick={()=>{setCountry("");setImportFile(null);setError("");setImportPage(true);}} style={btn}><Upload size={15}/>批量导入</button><button onClick={()=>{setCountry("");setPhone("");setConsent(false);setModal("single");}} style={{...btn,background:"#3478f6",borderColor:"#3478f6",color:"#fff"}}><Plus size={15}/>新增抽检号码</button></> }<button onClick={()=>void load()} style={btn} title="刷新"><RefreshCw size={15}/></button></div></div>
 {tab==="numbers"&&<div style={{display:"flex",gap:9,marginBottom:12,flexWrap:"wrap"}}><select value={countryFilter} onChange={e=>setCountryFilter(e.target.value)} style={{...field,width:150}}><option value="">全部国家和地区</option>{countries.map(c=><option key={c[1]} value={c[1]}>{c[0]}（{c[1]} / {c[2]}）</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)} style={{...field,width:130}}><option value="">全部状态</option>{["AVAILABLE","ASSIGNED","USED","BLOCKED"].map(s=><option key={s} value={s}>{statusText(s)}</option>)}</select><span style={{flex:1}}/><button onClick={()=>void load()} style={{...btn,background:"#2563eb",borderColor:"#2563eb",color:"#fff"}}><Search size={14}/>搜索</button><button onClick={()=>{setCountryFilter("");setStatus("");setSearch("");}} style={btn}>重置</button></div>}
 {tab!=="numbers"&&<div style={{display:"flex",gap:9,marginBottom:12}}><select value={status} onChange={e=>setStatus(e.target.value)} style={{...field,width:160}}><option value="">全部状态</option>{(tab==="results"?["PENDING","COMPLETED","FAILED","REVIEW"]:["SUCCESS","FAILED"]).map(s=><option key={s} value={s}>{statusText(s)}</option>)}</select></div>}
 {error&&<div style={{padding:10,marginBottom:10,color:"#b91c1c",background:"#fef2f2",borderRadius:6,fontSize:13}}>{error}</div>}
 <div style={{overflowX:"auto",minHeight:tab==="numbers"?460:420}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:tab==="numbers"?850:950}}><thead><tr>{(tab==="numbers"?["选择","脱敏号码","国家","状态","通过次数","失败次数","总抽检次数","更新时间","操作"]:tab==="results"?["任务编号","脱敏号码","执行用户","分配时间","任务状态","实际收件结果","处理状态","更新时间","操作"]:["文件","状态","成功/失败/重复/总数","更新时间","操作"]).map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{tab==="numbers"&&<tr><td style={{...td,background:"#f8fafc"}}><input type="checkbox" aria-label="全选当前列表" checked={allVisibleSelected} onChange={e=>setSelectedIds(e.target.checked?[...new Set([...selectedIds,...visibleIds])]:selectedIds.filter(id=>!visibleIds.includes(id)))}/></td><td colSpan={8} style={{...td,background:"#f8fafc",color:"#64748b"}}>全选当前加载列表（{visibleIds.length} 条）</td></tr>
 {loading?<tr><td colSpan={9} style={{...td,textAlign:"center",padding:50}}>正在加载…</td></tr>:tab==="numbers"?numbers.length===0?<tr><td colSpan={8} style={{...td,textAlign:"center",padding:50,color:"#94a3b8"}}>暂无抽检号码<br/><span style={{fontSize:12}}>新增抽检号码后，系统会显示脱敏号码和抽检统计。</span></td></tr>:numbers.map(x=><tr key={x.id}><td style={td}><input aria-label={"选择 "+x.phoneMasked} type="checkbox" checked={selectedIds.includes(x.id)} onChange={e=>toggleSelected(x.id,e.target.checked)}/></td><td style={td}>{x.phoneMasked}</td><td style={td}>{countryLabel(x.countryCode,x.countryName)}</td><td style={td}>{statusText(x.status)}</td><td style={td}>{x.passedCount}</td><td style={td}>{x.failedCount}</td><td style={td}>{x.totalCount}</td><td style={td}>{new Date(x.updatedAt).toLocaleString("zh-CN",{hour12:false})}</td><td style={td}><button disabled={deleting} onClick={()=>void removeNumbers([x.id])} style={{...btn,height:28,padding:"0 8px",color:"#dc2626",borderColor:"#fecaca"}}><Trash2 size={13}/>删除</button></td></tr>):tab==="results"?results.length===0?<tr><td colSpan={9} style={{...td,textAlign:"center",padding:50,color:"#94a3b8"}}>暂无抽检记录<br/><span style={{fontSize:12}}>抽检号码混入任务后，会在此生成实际收件结果记录。</span></td></tr>:results.map(x=><tr key={x.id}><td style={td}>{x.taskId.slice(0,8)}</td><td style={td}>{masked(x.phone)}</td><td style={td}>{x.userPhone}</td><td style={td}>{new Date(x.assignedAt).toLocaleString("zh-CN",{hour12:false})}</td><td style={td}>{statusText(x.taskStatus)}</td><td style={td}>{x.actualResult||"待录入"}</td><td style={td}>{statusText(x.handlingStatus)}</td><td style={td}>{new Date(x.updatedAt).toLocaleString("zh-CN",{hour12:false})}</td><td style={td}><button onClick={()=>{setResultRow(x);setActualResult(x.actualResult);setHandlingStatus(x.handlingStatus);setModal("result");}} style={{border:0,background:"transparent",color:"#2563eb",cursor:"pointer"}}>录入结果</button></td></tr>):imports.length===0?<tr><td colSpan={5} style={{...td,textAlign:"center",padding:50,color:"#94a3b8"}}>暂无导入记录<br/><span style={{fontSize:12}}>提交批量导入后，处理进度会显示在这里。</span></td></tr>:imports.map(x=><tr key={x.id}><td style={td}>{x.fileName}</td><td style={td}>{statusText(x.status)}</td><td style={td}>{x.importedCount} / {x.invalidCount} / {x.duplicateCount} / {x.totalRows}</td><td style={td}>{new Date(x.updatedAt).toLocaleString("zh-CN",{hour12:false})}</td><td style={td}>—</td></tr>)}
 </tbody></table></div>
 <div style={{display:"flex",justifyContent:"flex-end",paddingTop:12,color:"#8492a6",fontSize:12}}>当前显示 {tab==="numbers"?numbers.length:tab==="results"?results.length:imports.length} 条 <span style={{marginLeft:18}}>20 条/页</span></div>
 </section></div>
 {modal&&<div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.38)",zIndex:100,display:"grid",placeItems:"center",padding:16}}><form onSubmit={modal==="single"?addSingle:saveResult} style={{width:"min(650px,96vw)",maxHeight:"92vh",overflowY:"auto",background:"#fff",borderRadius:7,padding:18,boxShadow:"0 16px 45px #0002"}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><strong style={{fontSize:17}}>{modal==="single"?"新增抽检号码":"录入实际收件结果"}</strong><button type="button" onClick={()=>setModal(null)} style={{border:0,background:"transparent",cursor:"pointer"}}><X size={19}/></button></div>
 {modal==="single"&&<><p style={{fontSize:12,color:"#71839b",margin:"0 0 16px"}}>完整号码仅在服务端加密保存，后台只显示脱敏值。</p><label style={{display:"block",fontSize:13,marginBottom:14}}>单个号码 *<input required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="请输入包含国家区号的号码，例如 +254..." style={{...field,display:"block",marginTop:7}}/></label><label style={{display:"block",fontSize:13,marginBottom:6}}>所属国家 *<button type="button" onClick={()=>setCountryOpen(v=>!v)} style={{...field,display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:7,textAlign:"left"}}>{chosenCountry?chosenCountry[0]+"（"+chosenCountry[1]+" / "+chosenCountry[2]+"）":"请选择国家"}<ChevronDown size={15}/></button></label>{countryOpen&&<div style={{border:"1px solid #dbe3ee",borderRadius:6,marginBottom:12,padding:7,maxHeight:220,overflow:"auto"}}><input value={countrySearch} onChange={e=>setCountrySearch(e.target.value)} placeholder="搜索名称、代码或区号" style={{...field,marginBottom:6}}/>{filteredCountries.map(c=><button type="button" key={c[1]} onClick={()=>{setCountry(c[1]);setCountryOpen(false);setCountrySearch("");}} style={{display:"block",width:"100%",textAlign:"left",padding:"8px 7px",border:0,background:country===c[1]?"#eff6ff":"#fff",cursor:"pointer",fontSize:13}}>{c[0]}（{c[1]} / {c[2]}）</button>)}</div>}<label style={{display:"flex",gap:8,alignItems:"center",fontSize:12,color:"#475569",marginTop:14}}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我确认已获得号码持有人的有效授权，允许将该号码用于平台任务联系。</label></>}

 {modal==="result"&&resultRow&&<><p style={{fontSize:12,color:"#71839b"}}>任务：{resultRow.taskTitle}　号码：{masked(resultRow.phone)}</p><label style={{display:"block",fontSize:13,marginBottom:14}}>实际收件结果 *<textarea required rows={4} value={actualResult} onChange={e=>setActualResult(e.target.value)} placeholder="请填写实际收件情况、联系结果或异常说明" style={{...field,height:"auto",padding:10,marginTop:7}}/></label><label style={{display:"block",fontSize:13}}>处理状态<select value={handlingStatus} onChange={e=>setHandlingStatus(e.target.value)} style={{...field,display:"block",marginTop:7}}><option value="PENDING">待处理</option><option value="COMPLETED">已完成</option><option value="FAILED">失败</option><option value="REVIEW">待复核</option></select></label></>}
 <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20}}><button type="button" onClick={()=>setModal(null)} style={btn}>取消</button><button disabled={saving||(modal==="single"&&(!consent||!country))} type="submit" style={{...btn,background:"#3478f6",borderColor:"#3478f6",color:"#fff"}}>{saving?"提交中…":modal==="single"?"新增抽检号码":"保存结果"}</button></div>
 </form></div>}
 </> }</section></div>;
}
