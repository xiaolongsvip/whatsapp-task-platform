"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff, LockKeyhole, Phone, ShieldCheck } from "lucide-react";

export function AuthEntry() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const savedPhone = window.localStorage.getItem("wtp.remembered-phone");
      if (savedPhone) setPhone(savedPhone);
    } catch {
      // Login remains available when browser storage is disabled.
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const normalizedPhone = phone.replace(/[\s()+-]/g, "");
    if (!/^\d{8,15}$/.test(normalizedPhone)) {
      setError("请输入正确的国际手机号码，例如 25412345678。");
      return;
    }
    if (password.length < 6 || password.length > 128) {
      setError("密码长度需要为 6 至 128 个字符。");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/api/v1/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.message === "string" ? result.message : "登录失败，请检查账号和密码。");
      }
      try {
        if (remember) window.localStorage.setItem("wtp.remembered-phone", normalizedPhone);
        else window.localStorage.removeItem("wtp.remembered-phone");
      } catch {
        // Do not block login if browser storage is disabled.
      }
      setNotice("登录验证成功。用户工作台页面正在开发中，请稍后继续。");
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "网络连接失败，请检查 API 服务。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="aurora-login">
      <div className="aurora-ribbon aurora-ribbon-top" aria-hidden="true" />
      <div className="aurora-ribbon aurora-ribbon-bottom" aria-hidden="true" />
      <div className="aurora-orb aurora-orb-one" aria-hidden="true" />
      <div className="aurora-orb aurora-orb-two" aria-hidden="true" />

      <section className="aurora-card">
        <div className="aurora-brand">
          <span className="aurora-brand-mark">W</span>
          <span>WHATSAPP TASK PLATFORM</span>
        </div>

        <header className="aurora-heading">
          <div className="aurora-eyebrow">WELCOME BACK</div>
          <h1>欢迎回来</h1>
          <h2>登录账户</h2>
          <p>使用手机号码和密码登录，继续你的任务体验。</p>
        </header>

        <form className="aurora-form" onSubmit={handleSubmit}>
          <div className="aurora-field">
            <label htmlFor="home-phone"><Phone size={20} /> 电话号码</label>
            <input id="home-phone" name="username" type="tel" inputMode="numeric" autoComplete="username" placeholder="例如 25412345678" value={phone} onChange={(event) => setPhone(event.target.value)} required maxLength={20} />
          </div>

          <div className="aurora-field">
            <label htmlFor="home-password"><LockKeyhole size={20} /> 登录密码</label>
            <div className="aurora-password-wrap">
              <input id="home-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="请输入登录密码" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} maxLength={128} />
              <button className="aurora-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                {showPassword ? <EyeOff size={21} /> : <Eye size={21} />}
              </button>
            </div>
          </div>

          <div className="aurora-options">
            <label className="aurora-remember">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span className="aurora-check"><Check size={16} /></span>
              <span>记住账号密码</span>
            </label>
            <span className="aurora-password-note">浏览器可安全保存密码</span>
          </div>

          {error && <div className="aurora-feedback aurora-error" role="alert">{error}</div>}
          {notice && <div className="aurora-feedback aurora-success" role="status">{notice}</div>}

          <button className="aurora-submit" type="submit" disabled={busy}>
            <span>{busy ? "正在登录…" : "登录平台"}</span>
            <span className="aurora-submit-arrow">→</span>
          </button>
        </form>

        <Link href="/register" className="aurora-register">
          <span className="aurora-register-icon">＋</span>
          <span>还没有账户？ 创建新账户</span>
          <span className="aurora-register-arrow">↗</span>
        </Link>

        <div className="aurora-security"><ShieldCheck size={19} /> 安全加密连接，保护你的账户信息。</div>
      </section>

    </main>
  );
}
