"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck, UserRound, Save, LoaderCircle } from "lucide-react";

type CurrentUser = {
  id: string;
  phone: string;
  referralCode: string;
  status: string;
  createdAt: string;
  profile?: { displayName?: string | null; locale?: string; timezone?: string } | null;
};

export function Workspace() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [locale, setLocale] = useState("zh-CN");
  const [timezone, setTimezone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/users/me", { credentials: "include" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return null;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "无法读取账户资料。");
        return data as CurrentUser;
      })
      .then((data) => {
        if (!active || !data) return;
        setUser(data);
        setDisplayName(data.profile?.displayName ?? "");
        setLocale(data.profile?.locale ?? "zh-CN");
        setTimezone(data.profile?.timezone ?? "UTC");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "网络连接失败。");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/users/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim(), locale, timezone }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "保存失败。");
      setUser(data as CurrentUser);
      setMessage("资料已保存。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "网络连接失败。");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  if (loading) return <main className="workspace-shell"><div className="workspace-card workspace-loading"><LoaderCircle className="workspace-spin" />正在加载你的工作台…</div></main>;

  return (
    <main className="workspace-shell">
      <header className="workspace-topbar">
        <div className="workspace-brand"><span className="workspace-mark">W</span><span>WHATSAPP TASK PLATFORM</span></div>
        <button className="workspace-logout" type="button" onClick={logout}><LogOut size={16} />退出登录</button>
      </header>
      <section className="workspace-hero">
        <span className="workspace-kicker">YOUR PERSONAL WORKSPACE</span>
        <h1>欢迎进入你的工作台</h1>
        <p>账户已经创建成功。你可以先完善个人资料，其他工作台功能会逐步开放。</p>
      </section>
      <div className="workspace-grid">
        <section className="workspace-card workspace-summary">
          <div className="workspace-avatar"><UserRound size={30} /></div>
          <h2>{user?.profile?.displayName || "新用户"}</h2>
          <p>{user?.phone ? "+" + user.phone : ""}</p>
          <div className="workspace-meta"><span>账户状态</span><strong>{user?.status === "ACTIVE" ? "正常" : user?.status || "—"}</strong></div>
          <div className="workspace-meta"><span>我的邀请码</span><strong>{user?.referralCode || "—"}</strong></div>
          <div className="workspace-meta"><span>注册时间</span><strong>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</strong></div>
          <div className="workspace-safe"><ShieldCheck size={17} />账户信息受安全保护</div>
        </section>
        <section className="workspace-card workspace-profile">
          <span className="workspace-kicker">PROFILE SETTINGS</span>
          <h2>个人资料</h2>
          <p className="workspace-muted">这些内容可以在注册后随时修改。</p>
          <form onSubmit={saveProfile}>
            <label htmlFor="profile-phone">注册手机号码</label>
            <input id="profile-phone" value={user?.phone ? "+" + user.phone : ""} readOnly />
            <label htmlFor="profile-name">昵称</label>
            <input id="profile-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="请输入你的昵称" minLength={2} maxLength={80} />
            <label htmlFor="profile-locale">界面语言</label>
            <select id="profile-locale" value={locale} onChange={(event) => setLocale(event.target.value)}>
              <option value="zh-CN">简体中文</option><option value="en">English</option><option value="ja">日本語</option>
            </select>
            <label htmlFor="profile-timezone">时区</label>
            <select id="profile-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              <option value="UTC">UTC</option><option value="Africa/Nairobi">Africa/Nairobi</option><option value="Asia/Taipei">Asia/Taipei</option><option value="Asia/Tokyo">Asia/Tokyo</option><option value="America/New_York">America/New_York</option>
            </select>
            {error && <div className="workspace-alert">{error}</div>}
            {message && <div className="workspace-success">{message}</div>}
            <button className="workspace-save" type="submit" disabled={saving}><Save size={17} />{saving ? "正在保存…" : "保存修改"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
