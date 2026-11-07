"use client";

import { useState } from "react";
import { Bell, Send, FileText, Plus, Search, RefreshCw, Eye, X, ChevronRight } from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";

type Tab = "notices" | "records" | "templates";
const card: React.CSSProperties = { background:"#fff", border:"1px solid #e4eaf2", borderRadius:8 };
const button: React.CSSProperties = { height:34, padding:"0 12px", border:"1px solid #dce4ef", borderRadius:6, background:"#fff", color:"#53647c", fontSize:12, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 };
const input: React.CSSProperties = { height:36, border:"1px solid #dce4ef", borderRadius:6, padding:"0 10px", color:"#26364d", fontSize:12, background:"#fff", minWidth:0 };
const tabs: Array<{key:Tab;label:string;icon:typeof Bell}> = [
  {key:"notices",label:"通知列表",icon:Bell},
  {key:"records",label:"发送记录",icon:Send},
  {key:"templates",label:"通知模板",icon:FileText},
];

export default function NotificationsPage() {
  const [tab,setTab] = useState<Tab>("notices");
  const [keyword,setKeyword] = useState("");
  const [status,setStatus] = useState("ALL");
  const [editorOpen,setEditorOpen] = useState(false);
  const [title,setTitle] = useState("");
  const [content,setContent] = useState("");
  const [target,setTarget] = useState("ALL");
  const [notice,setNotice] = useState("");

  const sectionTitle = tab==="notices" ? "通知列表" : tab==="records" ? "发送记录" : "通知模板";
  const emptyTitle = tab==="notices" ? "暂无通知" : tab==="records" ? "暂无发送记录" : "暂无通知模板";
  const emptyDescription = tab==="notices"
    ? "创建通知后，可在这里查看通知内容、发送范围和发布状态。"
    : tab==="records"
      ? "通知发送后，发送批次、目标人数和发送结果会显示在这里。"
      : "可在这里维护常用通知内容，后续创建通知时选择模板。";

  function openEditor() {
    setTitle(""); setContent(""); setTarget("ALL"); setNotice(""); setEditorOpen(true);
  }

  return <div className="dashboard-app">
    <AdminSidebar />
    <main className="dashboard-main" style={{minWidth:0,background:"#f7f9fc"}}>
      <AdminTopbar />
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px 0",background:"#fff"}}>
        <div><b style={{fontSize:14,color:"#23354d"}}>通知管理</b><div style={{fontSize:11,color:"#8492a6",marginTop:4}}>管理平台通知、发送批次与通知模板</div></div>
        <button style={{...button,background:"#2868ee",borderColor:"#2868ee",color:"#fff"}} onClick={openEditor}><Plus size={14}/>创建通知</button>
      </div>
      <div style={{padding:18}}>
        <nav style={{display:"flex",gap:4,borderBottom:"1px solid #e1e8f0",marginBottom:14,overflowX:"auto"}}>
          {tabs.map(({key,label,icon:Icon})=><button key={key} onClick={()=>{setTab(key);setStatus("ALL");setKeyword("");}} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"12px 16px",border:0,borderBottom:tab===key?"2px solid #2868ee":"2px solid transparent",background:tab===key?"#edf4ff":"transparent",color:tab===key?"#2868ee":"#53647c",fontSize:12,whiteSpace:"nowrap",cursor:"pointer"}}><Icon size={15}/>{label}</button>)}
        </nav>

        <section style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,marginBottom:12}}>
          {(tab==="notices"?[["通知总数","0"],["已发布","0"],["草稿","0"],["定时发送","0"]]:tab==="records"?[["发送批次","0"],["目标用户","0"],["发送成功","0"],["发送失败","0"]]:[["模板总数","0"],["启用模板","0"],["停用模板","0"],["最近更新","—"]]).map(([label,value])=><div key={label} style={{...card,padding:"13px 14px"}}><div style={{fontSize:11,color:"#718096"}}>{label}</div><b style={{fontSize:22,color:"#20334d",display:"block",marginTop:7}}>{value}</b></div>)}
        </section>

        <section style={{...card,overflow:"hidden"}}>
          <header style={{padding:"13px 14px",borderBottom:"1px solid #edf1f6",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
            <b style={{fontSize:13,color:"#26364d"}}>{sectionTitle}</b>
            <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{position:"relative"}}><Search size={14} style={{position:"absolute",left:9,top:11,color:"#8492a6"}}/><input style={{...input,paddingLeft:29,width:220}} value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder={tab==="templates"?"搜索模板名称":"搜索通知标题 / 内容"}/></div>
              <select style={input} value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">全部状态</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="DISABLED">已停用</option></select>
              <button style={button} onClick={()=>{setKeyword("");setStatus("ALL");}}><RefreshCw size={13}/>重置</button>
            </div>
          </header>
          <div style={{padding:"58px 20px",textAlign:"center"}}>
            <div style={{width:48,height:48,borderRadius:12,background:"#f1f5f9",color:"#8492a6",display:"grid",placeItems:"center",margin:"0 auto 12px"}}>{tab==="notices"?<Bell size={22}/>:tab==="records"?<Send size={22}/>:<FileText size={22}/>}</div>
            <b style={{fontSize:13,color:"#34445b"}}>{emptyTitle}</b>
            <p style={{fontSize:11,color:"#8492a6",margin:"7px 0 0"}}>{emptyDescription}</p>
            <p style={{fontSize:10,color:"#a0aaba",margin:"12px 0 0"}}>当前为页面框架，尚未连接通知业务数据接口；空数据属于正常状态。</p>
            {tab==="notices"&&<button style={{...button,marginTop:16,background:"#2868ee",borderColor:"#2868ee",color:"#fff"}} onClick={openEditor}><Plus size={13}/>创建第一条通知</button>}
          </div>
          <footer style={{padding:"11px 14px",borderTop:"1px solid #edf1f6",display:"flex",justifyContent:"space-between",fontSize:11,color:"#8492a6"}}><span>共 0 条记录</span><span>第 1 / 1 页 <ChevronRight size={13} style={{verticalAlign:"middle"}}/></span></footer>
        </section>
        <p style={{fontSize:11,color:"#8492a6",marginTop:10}}>本阶段先完成页面结构与基础交互。发送接口、模板持久化、定时任务、用户触达统计及权限校验后续统一接入，不展示虚构业务记录。</p>
      </div>
      {editorOpen&&<div style={{position:"fixed",inset:0,zIndex:90,background:"#14223866",display:"grid",placeItems:"center",padding:18}}>
        <section style={{...card,width:"min(620px,100%)",maxHeight:"90vh",overflow:"auto",padding:18}}>
          <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><b style={{fontSize:14,color:"#26364d"}}>创建通知</b><button style={button} onClick={()=>setEditorOpen(false)}><X size={14}/>关闭</button></header>
          <div style={{display:"grid",gap:12}}>
            <label style={{display:"grid",gap:6,fontSize:11,color:"#53647c"}}>通知标题<input style={input} value={title} onChange={e=>setTitle(e.target.value)} placeholder="请输入通知标题"/></label>
            <label style={{display:"grid",gap:6,fontSize:11,color:"#53647c"}}>发送范围<select style={input} value={target} onChange={e=>setTarget(e.target.value)}><option value="ALL">全部用户</option><option value="ACTIVE">正常用户</option><option value="SELECTED">指定用户（后续接入）</option></select></label>
            <label style={{display:"grid",gap:6,fontSize:11,color:"#53647c"}}>通知内容<textarea style={{...input,height:150,padding:10,resize:"vertical"}} value={content} onChange={e=>setContent(e.target.value)} placeholder="请输入通知内容"/></label>
            {notice&&<div style={{fontSize:11,color:"#b45309"}}>{notice}</div>}
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button style={button} onClick={()=>setEditorOpen(false)}>取消</button><button style={{...button,background:"#2868ee",borderColor:"#2868ee",color:"#fff"}} onClick={()=>setNotice("页面框架已就绪，通知保存与发送接口将在下一阶段接入；当前不会创建虚假记录。")}>保存草稿</button></div>
          </div>
        </section>
      </div>}
    </main>
  </div>;
}
