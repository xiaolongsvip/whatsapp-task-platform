"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2, Coins, Eye, EyeOff, LockKeyhole, MessageCircle, ShieldCheck, Smartphone, Zap } from "lucide-react";

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
    const normalizedPhone = phone.replace(/[\\s()+-]/g, "");
    if (!/^\\d{8,15}$/.test(normalizedPhone)) {
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
    <main className="login-home">
      <div className="login-home-top">
        <Link href="/" className="login-brand" aria-label="WhatsApp Task Platform 首页">
          <span className="login-brand-mark">W</span>
          <span>WHATSAPP TASK PLATFORM</span>
        </Link>
        <div className="login-top-secure"><span /> SECURE ACCOUNT ACCESS</div>
      </div>

      <section className="login-card">
        <div className="login-form-side">
          <div className="login-form-brand">
            <span className="login-brand-mark">W</span>
            <span>WHATSAPP TASK PLATFORM</span>
          </div>
          <div className="login-title-block">
            <div className="login-overline">WELCOME BACK</div>
            <h1>登录账户</h1>
            <p>欢迎回来，登录后继续你的任务体验。</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-input-group">
              <label htmlFor="home-phone"><Smartphone size={18} strokeWidth={2.2} /> 电话号码</label>
              <input id="home-phone" name="username" type="tel" inputMode="numeric" autoComplete="username" placeholder="例如 25412345678" value={phone} onChange={(event) => setPhone(event.target.value)} required maxLength={20} />
            </div>
            <div className="login-input-group">
              <label htmlFor="home-password"><LockKeyhole size={18} strokeWidth={2.2} /> 登录密码</label>
              <div className="login-password-wrap">
                <input id="home-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="请输入登录密码" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} maxLength={128} />
                <button className="password-visibility" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            <div className="login-options">
              <label className="remember-option">
                <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                <span className="remember-box"><Check size={14} /></span>
                <span>记住账号密码</span>
              </label>
              <span className="password-manager-note">密码由浏览器密码管理器保存</span>
            </div>

            {error && <div className="login-feedback login-feedback-error" role="alert">{error}</div>}
            {notice && <div className="login-feedback login-feedback-success" role="status">{notice}</div>}

            <button className="login-submit" type="submit" disabled={busy}>
              <span>{busy ? "正在登录…" : "登录平台"}</span>
              <span className="login-submit-arrow">→</span>
            </button>
          </form>

          <div className="register-action">
            <div className="register-prompt"><span>还没有账户？</span><strong>创建新账户</strong></div>
            <Link href="/register" className="register-button">创建新账户 <span>↗</span></Link>
          </div>
          <div className="login-form-foot"><ShieldCheck size={18} /> 安全加密连接，保护你的账户信息。</div>
        </div>

        <aside className="login-showcase" aria-label="平台功能介绍">
          <div className="showcase-topline">
            <span>YOUR TASK JOURNEY</span>
            <span className="showcase-live"><i /> READY WHEN YOU ARE</span>
          </div>
          <div className="showcase-heading">
            <div className="showcase-kicker">A CLEARER WAY TO WORK</div>
            <h2>完成任务，<br /><span>看见每一步进展。</span></h2>
            <p>从任务领取到进度跟踪，让每一步都清晰、有序。</p>
          </div>

          <div className="showcase-illustration" aria-hidden="true">
            <div className="showcase-halo halo-one" />
            <div className="showcase-halo halo-two" />
            <div className="showcase-platform" />
            <div className="showcase-phone">
              <div className="phone-speaker" />
              <div className="phone-screen">
                <div className="phone-app-icon"><MessageCircle size={34} fill="currentColor" strokeWidth={1.5} /></div>
                <div className="phone-screen-label">MY TASKS</div>
                <div className="phone-task"><span><CheckCircle2 size={17} /></span><i /><b /></div>
                <div className="phone-task"><span><CheckCircle2 size={17} /></span><i /><b /></div>
                <div className="phone-task"><span><CheckCircle2 size={17} /></span><i /><b /></div>
                <div className="phone-progress"><span /></div>
                <small>YOUR PROGRESS</small>
              </div>
            </div>
            <div className="showcase-float-card float-task"><span><Zap size={19} fill="currentColor" /></span><div><b>任务清晰</b><small>简单易上手</small></div></div>
            <div className="showcase-float-card float-reward"><span><Coins size={20} /></span><div><b>进度可见</b><small>每一步都有记录</small></div></div>
            <div className="showcase-spark spark-a">✦</div>
            <div className="showcase-spark spark-b">✧</div>
          </div>

          <div className="showcase-features">
            <div className="showcase-feature"><span><Zap size={20} /></span><div><b>简单任务</b><small>任务清晰，易于上手</small></div></div>
            <div className="showcase-feature"><span><Coins size={20} /></span><div><b>进度追踪</b><small>随时掌握任务完成情况</small></div></div>
            <div className="showcase-feature"><span><ShieldCheck size={20} /></span><div><b>安全可靠</b><small>保护账户与个人信息</small></div></div>
          </div>
          <div className="showcase-bottom"><span>© 2026 WHATSAPP TASK PLATFORM</span><span>WORK SMARTER. MOVE FORWARD.</span></div>
        </aside>
      </section>
      <footer className="login-page-footer"><span>© 2026 WHATSAPP TASK PLATFORM</span><span>SECURE · SIMPLE · CLEAR</span></footer>
    </main>
  );
}
