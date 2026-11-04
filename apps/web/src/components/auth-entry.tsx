"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Eye, EyeOff, LockKeyhole, Phone, ShieldCheck, UserRoundPlus } from "lucide-react";

const COUNTRY_CODES = [
  { name: "Kenya", flag: "🇰🇪", code: "+254" },
  { name: "United States", flag: "🇺🇸", code: "+1" },
  { name: "United Kingdom", flag: "🇬🇧", code: "+44" },
  { name: "Japan", flag: "🇯🇵", code: "+81" },
  { name: "Taiwan", flag: "🇹🇼", code: "+886" },
];

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
      if (savedPhone) {
        const savedDigits = savedPhone.replace(/\\D/g, "");
        const match = COUNTRY_CODES.find((country) => savedDigits.startsWith(country.code.replace("+", "")));
        if (match) {
          setCountryCode(match.code);
          setPhone(savedDigits.slice(match.code.length - 1));
        } else {
          setPhone(savedDigits);
        }
      }
      if (savedCode && COUNTRY_CODES.some((country) => country.code === savedCode)) setCountryCode(savedCode);
    } catch {
      // Login remains available when browser storage is disabled.
    }
  }, []);

  function handlePhoneChange(value: string) {
    setPhone(value.replace(/[^0-9+\s()-]/g, ""));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const typedDigits = phone.replace(/\D/g, "");
    const typedInternational = phone.trim().startsWith("+") || COUNTRY_CODES.some((country) => {
      const prefix = country.code.replace("+", "");
      return typedDigits.startsWith(prefix) && typedDigits.length > prefix.length + 6;
    });
    const matchedCountry = typedInternational
      ? COUNTRY_CODES.find((country) => typedDigits.startsWith(country.code.replace("+", "")))
      : undefined;
    const fullPhone = typedInternational ? typedDigits : `${countryCode}${typedDigits}`.replace(/\D/g, "");
    const effectiveCountryCode = matchedCountry?.code ?? countryCode;
    if (!/^\d{8,15}$/.test(fullPhone)) {
      setError("请输入正确的手机号码。");
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
          window.localStorage.setItem("wtp.remembered-phone", fullPhone);
          window.localStorage.setItem("wtp.remembered-country-code", effectiveCountryCode);
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
      <div className="aurora-ribbon aurora-ribbon-top" aria-hidden="true">
        <svg viewBox="0 0 400 150" preserveAspectRatio="none">
          <defs>
            <linearGradient id="aurora-top-gradient" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#243cff" stopOpacity=".1" />
              <stop offset=".38" stopColor="#5c63ff" />
              <stop offset=".52" stopColor="#a5efff" />
              <stop offset=".68" stopColor="#437cff" />
              <stop offset="1" stopColor="#6045ff" stopOpacity=".08" />
            </linearGradient>
          </defs>
          <path d="M-24 122 C42 103 54 55 104 20 C151 -14 205 -10 252 -28 C315 -52 354 -43 430 -76" fill="none" stroke="#534cff" strokeWidth="38" opacity=".38" />
          <path d="M-24 122 C42 103 54 55 104 20 C151 -14 205 -10 252 -28 C315 -52 354 -43 430 -76" fill="none" stroke="url(#aurora-top-gradient)" strokeWidth="24" />
          <path d="M-24 122 C42 103 54 55 104 20 C151 -14 205 -10 252 -28 C315 -52 354 -43 430 -76" fill="none" stroke="#a8edff" strokeWidth="4" opacity=".78" />
        </svg>
      </div>
      <div className="aurora-ribbon aurora-ribbon-bottom" aria-hidden="true">
        <svg viewBox="0 0 400 150" preserveAspectRatio="none">
          <defs>
            <linearGradient id="aurora-bottom-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3d57ff" stopOpacity=".08" />
              <stop offset=".34" stopColor="#5d54ff" />
              <stop offset=".5" stopColor="#a2edff" />
              <stop offset=".66" stopColor="#3977ff" />
              <stop offset="1" stopColor="#6948ff" stopOpacity=".12" />
            </linearGradient>
          </defs>
          <path d="M-28 18 C43 10 80 52 142 86 C210 123 281 119 329 72 C369 33 391 8 430 -8" fill="none" stroke="#514aff" strokeWidth="38" opacity=".4" />
          <path d="M-28 18 C43 10 80 52 142 86 C210 123 281 119 329 72 C369 33 391 8 430 -8" fill="none" stroke="url(#aurora-bottom-gradient)" strokeWidth="24" />
          <path d="M-28 18 C43 10 80 52 142 86 C210 123 281 119 329 72 C369 33 391 8 430 -8" fill="none" stroke="#a7edff" strokeWidth="4" opacity=".78" />
        </svg>
      </div>
      <div className="aurora-orb aurora-orb-one" aria-hidden="true" />
      <div className="aurora-orb aurora-orb-two" aria-hidden="true" />

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
            <div className="aurora-phone-control">
              <label className="aurora-country" htmlFor="country-code" aria-label="国家区号">
                <span>{COUNTRY_CODES.find((country) => country.code === countryCode)?.flag ?? "🌐"}</span>
                <select id="country-code" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} aria-label="选择国家区号">
                  {COUNTRY_CODES.map((country) => <option key={country.code} value={country.code}>{country.name} {country.code}</option>)}
                </select>
                <span className="aurora-country-code">{countryCode}</span>
                <ChevronDown size={13} />
              </label>
              <input id="home-phone" name="username" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="区号 + 手机号码" value={phone} onChange={(event) => setPhone(event.target.value.replace(/[^0-9\s-]/g, ""))} required maxLength={16} />
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
