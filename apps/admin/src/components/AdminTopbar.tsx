"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CircleHelp, Languages, LogOut, Menu, Search, UserRound } from "lucide-react";

export default function AdminTopbar() {
  const router = useRouter();
  const [email, setEmail] = useState("Administrator");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/v1/admin-auth/me", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("未登录");
        const admin = await response.json();
        if (typeof admin.email === "string" && admin.email) setEmail(admin.email);
      })
      .catch(() => setEmail("Administrator"));
  }, []);

  async function logout() {
    await fetch("/api/v1/admin-auth/logout", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  return <header className="dashboard-topbar">
    <button className="mobile-menu-btn" aria-label="打开菜单"><Menu size={19}/></button>
    <div className="topbar-search"><Search size={16}/><input placeholder="搜索任务、用户、手机号码..." aria-label="全局搜索"/></div>
    <div className="topbar-actions">
      <button className="topbar-icon" title="语言"><Languages size={18}/></button>
      <button className="topbar-icon" title="帮助"><CircleHelp size={19}/></button>
      <button className="topbar-icon" title="通知"><Bell size={19}/><i/></button>
      <div className="admin-profile" style={{position:"relative",cursor:"pointer"}} onClick={()=>setMenuOpen(v=>!v)}>
        <span className="profile-avatar"><UserRound size={18}/></span>
        <span><strong>{email}</strong><small>超级管理员</small></span>
        {menuOpen && <div style={{position:"absolute",right:0,top:"calc(100% + 12px)",zIndex:60,minWidth:150,padding:6,border:"1px solid #e5eaf2",borderRadius:8,background:"#fff",boxShadow:"0 8px 24px rgba(15,23,42,.12)"}}>
          <button type="button" onClick={(event)=>{event.stopPropagation();void logout();}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 10px",border:0,borderRadius:6,background:"transparent",color:"#475467",fontSize:12,cursor:"pointer"}}><LogOut size={15}/>退出登录</button>
        </div>}
      </div>
    </div>
  </header>;
}
