"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff, LockKeyhole, Phone, ShieldCheck, UserRoundPlus } from "lucide-react";

export function AuthEntry() {
  const [countryCode, setCountryCode] = useState("+254");
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
      const savedCode = window.localStorage.getItem("wtp.remembered-country-code");
      if (savedCode) setCountryCode(savedCode);
      if (savedPhone) setPhone(savedPhone);
    } catch {
      // Login remains available when browser storage is disabled.
    }
  }, []);

  function handlePhoneChange(value: string) {
    setPhone(value.replace(/\D/g, ""));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const normalizedCode = countryCode.replace(/\D/g, "");
    const normalizedPhone = phone.replace(/\D/g, "");
    const fullPhone = normalizedCode + normalizedPhone;
    if (!/^\d{8,15}$/.test(fullPhone)) {
      setError("请分别输入国家区号和手机号码。");
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
        body: JSON.stringify({ phone: fullPhone, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.message === "string" ? result.message : "登录失败，请检查账号和密码。");
      }
      try {
        if (remember) {
          window.localStorage.setItem("wtp.remembered-phone", normalizedPhone);
          window.localStorage.setItem("wtp.remembered-country-code", countryCode);
                  } else {
          window.localStorage.removeItem("wtp.remembered-phone");
          window.localStorage.removeItem("wtp.remembered-country-code");
                  }
      } catch {
        // Do not block login if browser storage is disabled.
      }
      setNotice("登录验证成功。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "网络连接失败，请检查 API 服务。");
    } finally {
      setBusy(false);
    }
  }

  function showPasswordHelp() {
    setError("");
    setNotice("忘记密码？请联系平台客服进行身份验证和密码重置。");
  }

  return (
    <main className="aurora-login">
            <div className="aurora-tech-beam aurora-tech-beam-one" aria-hidden="true" />
      <div className="aurora-tech-beam aurora-tech-beam-two" aria-hidden="true" />
      <div className="aurora-tech-globe" aria-hidden="true">
        <svg viewBox="0 0 360 300" role="presentation">
          <defs>
            <radialGradient id="tech-globe-fill"><stop offset="0" stopColor="#0b8cff" stopOpacity=".2"/><stop offset="1" stopColor="#061a48" stopOpacity="0"/></radialGradient>
            <pattern id="tech-globe-dots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" fill="#42cfff" opacity=".8"/></pattern>
            <clipPath id="tech-globe-clip"><circle cx="190" cy="145" r="118"/></clipPath>
          </defs>
          <circle cx="190" cy="145" r="124" fill="url(#tech-globe-fill)" stroke="#168cff" strokeOpacity=".45"/>
          <g clipPath="url(#tech-globe-clip)">
            <rect x="65" y="20" width="250" height="250" fill="url(#tech-globe-dots)"/>
            <ellipse cx="190" cy="145" rx="118" ry="48" fill="none" stroke="#25aaff" strokeOpacity=".5"/>
            <ellipse cx="190" cy="145" rx="72" ry="118" fill="none" stroke="#25aaff" strokeOpacity=".42"/>
            <path d="M72 145H308M91 90H289M91 200H289" stroke="#25aaff" strokeOpacity=".3" fill="none"/>
          </g>
          <g fill="#a8f0ff"><circle cx="105" cy="85" r="3"/><circle cx="268" cy="112" r="3"/><circle cx="224" cy="35" r="2.5"/></g>
          <g stroke="#21baff" strokeOpacity=".55" fill="none"><path d="M105 85L36 130L268 112L320 60M224 35L320 60"/></g>
        </svg>
      </div>
      <div className="aurora-tech-grid" aria-hidden="true" />

      <section className="aurora-card">
        <div className="aurora-brand">
          <span className="aurora-brand-mark">W</span>
          <span>WHATSAPP TASK PLATFORM</span>
        </div>

        <header className="aurora-heading">
          <h1>欢迎回来</h1>
          <h2>登录账户</h2>
          <p>使用手机号码和密码登录，继续你的任务体验。</p>
        </header>

        <form className="aurora-form" onSubmit={handleSubmit}>
          <div className="aurora-field">
            <label htmlFor="home-phone"><Phone size={17} /> 电话号码</label>
            <div className="aurora-phone-control aurora-phone-split">
              <input className="aurora-country-code-input" id="home-country-code" type="tel" inputMode="tel" autoComplete="tel-country-code" aria-label="国家区号" placeholder="+254" value={countryCode} onChange={(event) => setCountryCode(event.target.value.replace(/[^0-9+]/g, "").slice(0, 6))} required maxLength={6} />
              <span className="aurora-phone-divider" aria-hidden="true" />
              <input className="aurora-phone-number-input" id="home-phone" name="username" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="输入手机号码" value={phone} onChange={(event) => handlePhoneChange(event.target.value)} required maxLength={16} />
            </div>
          </div>

          <div className="aurora-field">
            <label htmlFor="home-password"><LockKeyhole size={17} /> 登录密码</label>
            <div className="aurora-password-wrap">
              <input id="home-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="请输入登录密码" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} maxLength={128} />
              <button className="aurora-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="aurora-options">
            <label className="aurora-remember">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span className="aurora-check"><Check size={14} /></span>
              <span>记住账号密码</span>
            </label>
            <button className="aurora-forgot" type="button" onClick={showPasswordHelp}>忘记密码?</button>
          </div>

          {error && <div className="aurora-feedback aurora-error" role="alert">{error}</div>}
          {notice && <div className="aurora-feedback aurora-success" role="status">{notice}</div>}

          <button className="aurora-submit" type="submit" disabled={busy}>
            <span>{busy ? "正在登录…" : "登录平台"}</span>
            <span className="aurora-submit-arrow">→</span>
          </button>
        </form>

        <Link href="/register" className="aurora-register">
          <UserRoundPlus size={17} />
          <span>还没有账户？ 创建新账户</span>
        </Link>

        <div className="aurora-security"><ShieldCheck size={17} /> 安全加密连接，保护你的账户信息。</div>
      </section>
    </main>
  );
}
