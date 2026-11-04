"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Eye, EyeOff, LockKeyhole, Phone, ShieldCheck, UserRoundPlus } from "lucide-react";

type AuthMode = "register" | "login";
const COUNTRY_CODES = [
  { name: "Kenya", flag: "🇰🇪", code: "+254" },
  { name: "United States", flag: "🇺🇸", code: "+1" },
  { name: "United Kingdom", flag: "🇬🇧", code: "+44" },
  { name: "Japan", flag: "🇯🇵", code: "+81" },
  { name: "Taiwan", flag: "🇹🇼", code: "+886" },
];

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [countryCode, setCountryCode] = useState("+254");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

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
      setError("请输入正确的国际手机号码，包含国家区号。");
      return;
    }
    if (password.length < 6 || password.length > 128) {
      setError("密码长度需要为 6 至 128 个字符。");
      return;
    }
    if (isRegister && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/api/v1/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: fullPhone,
          password,
          ...(isRegister && inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.message === "string" ? result.message : "请求失败，请稍后重试。");
      }
      if (!isRegister) {
        try {
          if (remember) {
            window.localStorage.setItem("wtp.remembered-phone", fullPhone);
            window.localStorage.setItem("wtp.remembered-country-code", effectiveCountryCode);
          } else {
            window.localStorage.removeItem("wtp.remembered-phone");
            window.localStorage.removeItem("wtp.remembered-country-code");
          }
        } catch {
          // Do not block login when browser storage is disabled.
        }
      }
      if (isRegister) {
        router.push("/login?registered=1");
        router.refresh();
      } else {
        setNotice("登录验证成功。");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "网络连接失败，请检查 API 服务。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={isRegister ? "aurora-login aurora-register-page" : "aurora-login"}>
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
          <div className="aurora-eyebrow">{isRegister ? "CREATE YOUR ACCOUNT" : "WELCOME BACK"}</div>
          <h1>{isRegister ? "创建你的账户" : "欢迎回来"}</h1>
          {!isRegister && <h2>登录账户</h2>}
          <p>{isRegister ? "填写以下信息，开启你的平台体验。" : "使用手机号码和密码登录，继续你的任务体验。"}</p>
        </header>

        <form className="aurora-form" onSubmit={handleSubmit}>
          <div className="aurora-field">
            <label htmlFor="auth-phone"><Phone size={17} /> 电话号码</label>
            <div className="aurora-phone-control">
              <label className="aurora-country" htmlFor="auth-country-code" aria-label="国家区号">
                <span>{COUNTRY_CODES.find((country) => country.code === countryCode)?.flag ?? "🌐"}</span>
                <select id="auth-country-code" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} aria-label="选择国家区号">
                  {COUNTRY_CODES.map((country) => <option key={country.code} value={country.code}>{country.name} {country.code}</option>)}
                </select>
                <span className="aurora-country-code">{countryCode}</span>
                <ChevronDown size={13} />
              </label>
              <input id="auth-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="区号 + 手机号码" value={phone} onChange={(event) => handlePhoneChange(event.target.value)} required maxLength={22} />
            </div>
            {isRegister && <span className="aurora-auth-hint">支持输入国家区号和手机号码。</span>}
          </div>

          <div className="aurora-field">
            <label htmlFor="auth-password"><LockKeyhole size={17} /> 登录密码</label>
            <div className="aurora-password-wrap">
              <input id="auth-password" name="password" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} placeholder={isRegister ? "请输入密码（至少 6 位）" : "请输入登录密码"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} maxLength={128} />
              <button className="aurora-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {isRegister && (
            <>
              <div className="aurora-field">
                <label htmlFor="auth-confirm-password"><LockKeyhole size={17} /> 确认密码</label>
                <div className="aurora-password-wrap">
                  <input id="auth-confirm-password" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" placeholder="请再次输入密码" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={6} maxLength={128} />
                  <button className="aurora-password-toggle" type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "隐藏确认密码" : "显示确认密码"}>
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="aurora-field">
                <label htmlFor="auth-invite-code">邀请码 <span className="aurora-optional">（选填）</span></label>
                <input id="auth-invite-code" name="inviteCode" type="text" autoComplete="off" placeholder="请输入邀请码" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} maxLength={32} />
              </div>
            </>
          )}

          {!isRegister && (
            <div className="aurora-options">
              <label className="aurora-remember">
                <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                <span className="aurora-check"><Check size={14} /></span>
                <span>记住账号密码</span>
              </label>
              <span className="aurora-password-note">使用浏览器密码管理器保存密码</span>
            </div>
          )}

          {error && <div className="aurora-feedback aurora-error" role="alert">{error}</div>}
          {notice && <div className="aurora-feedback aurora-success" role="status">{notice}</div>}

          <button className="aurora-submit" type="submit" disabled={busy}>
            <span>{busy ? "请稍候…" : isRegister ? "创建账户" : "登录平台"}</span>
            <span className="aurora-submit-arrow">→</span>
          </button>
        </form>

        <Link href={isRegister ? "/login" : "/register"} className="aurora-register">
          <UserRoundPlus size={17} />
          <span>{isRegister ? "已经拥有账户？ 立即登录" : "还没有账户？ 创建新账户"}</span>
          <span className="aurora-register-arrow">↗</span>
        </Link>

        <div className="aurora-security"><ShieldCheck size={17} /> 安全加密连接，保护你的账户信息。</div>
      </section>
    </main>
  );
}
