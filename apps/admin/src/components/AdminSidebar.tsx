"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BarChart3, ChevronDown, ClipboardCheck, ClipboardList, FileClock, HandCoins, LayoutDashboard, MessageSquare, Phone, Settings, Shield, Users, WalletCards, Image, ShieldAlert, Sprout } from "lucide-react";

const primary = [
  { href: "/", label: "控制台", Icon: LayoutDashboard },
  { href: "/users", label: "用户管理", Icon: Users },
  { href: "/tasks", label: "任务管理", Icon: Phone },
  { href: "/executions", label: "执行记录", Icon: ClipboardList },
];
const reviewItems = [
  { href: "/ai-reviews", label: "人工审核", Icon: ClipboardCheck },
  { href: "/ai-reviews?view=evidence", label: "截图证据", Icon: Image },
  { href: "/ai-reviews?view=risk", label: "风控记录", Icon: ShieldAlert },
  { href: "/ai-reviews?view=random", label: "抽检风控", Icon: Sprout },
  { href: "/ai-settings", label: "AI 审核设置", Icon: Settings },
];
const settingItems = [
  { href: "/task-settings", label: "任务列表", Icon: ClipboardList },
  { href: "/task-settings/messages", label: "任务配置", Icon: Settings },
];

function AdminSidebarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reviewView = searchParams.get("view") ?? "manual";
  const [reviewOpen, setReviewOpen] = useState(true);
  const [taskOpen, setTaskOpen] = useState(true);

  return <aside className="dashboard-sidebar">
    <div className="sidebar-brand"><div className="sidebar-brand-mark">⚡</div><div><strong>EasyEarn</strong><span>后台管理</span></div></div>
    <nav className="sidebar-nav">
      {primary.map(({href,label,Icon}) => <Link key={href} className={"sidebar-link " + (pathname === href ? "active" : "")} href={href}><Icon size={16}/>{label}</Link>)}
      <button type="button" className="sidebar-link" onClick={() => setReviewOpen(v => !v)}><ClipboardCheck size={16}/>审核中心<ChevronDown size={14} style={{marginLeft:"auto",transform:reviewOpen?"rotate(180deg)":"none"}}/></button>
      {reviewOpen && <div className="sidebar-submenu">{reviewItems.map(({href,label,Icon}) => <Link key={href} className={(pathname === "/ai-reviews" && ((href === "/ai-reviews" && reviewView === "manual") || (href.includes("view=evidence") && reviewView === "evidence") || (href.includes("view=risk") && reviewView === "risk") || (href.includes("view=random") && reviewView === "random") || href === "/ai-settings" && pathname === "/ai-settings")) ? "active" : ""} href={href}><Icon size={15}/>{label}</Link>)}</div>}
      <button type="button" className="sidebar-link" onClick={() => setTaskOpen(v => !v)}><ClipboardList size={16}/>任务设置<ChevronDown size={14} style={{marginLeft:"auto",transform:taskOpen?"rotate(180deg)":"none"}}/></button>
      {taskOpen && <div className="sidebar-submenu">{settingItems.map(({href,label,Icon}) => <Link key={href} className={(pathname === href || (href === "/task-settings/messages" && pathname.startsWith("/task-settings/messages"))) ? "active" : ""} href={href}><Icon size={15}/>{label}</Link>)}</div>}
      <Link className="sidebar-link" href="/wallet-holds"><HandCoins size={16}/>邀请与分佣</Link>
      <button type="button" className="sidebar-link" disabled><MessageSquare size={16}/>通知管理</button>
      <Link className="sidebar-link" href="/wallet-holds"><WalletCards size={16}/>财务管理</Link>
      <button type="button" className="sidebar-link" disabled><BarChart3 size={16}/>数据报表</button>
      <button type="button" className="sidebar-link" disabled><Shield size={16}/>权限管理</button>
      <button type="button" className="sidebar-link" disabled><Settings size={16}/>系统设置</button>
    </nav>
    <div className="sidebar-version">EasyEarn v1.0.0</div>
  </aside>;
}


export default function AdminSidebar() {
  return <Suspense fallback={<aside className="dashboard-sidebar" aria-label="后台导航" />}><AdminSidebarContent /></Suspense>;
}
