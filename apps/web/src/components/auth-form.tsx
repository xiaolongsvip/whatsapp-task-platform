"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, LockKeyhole, Phone, ShieldCheck, UserRoundPlus } from "lucide-react";

type AuthMode = "register" | "login";
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
            window.localStorage.setItem("wtp.remembered-phone", normalizedPhone);
            window.localStorage.setItem("wtp.remembered-country-code", countryCode);
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
          <div className="aurora-eyebrow">{isRegister ? "CREATE YOUR ACCOUNT" : "WELCOME BACK"}</div>
          <h1>{isRegister ? "创建你的账户" : "欢迎回来"}</h1>
          {!isRegister && <h2>登录账户</h2>}
          <p>{isRegister ? "填写以下信息，开启你的平台体验。" : "使用手机号码和密码登录，继续你的任务体验。"}</p>
        </header>

        <form className="aurora-form" onSubmit={handleSubmit}>
          <div className="aurora-field">
            <label htmlFor="auth-phone"><Phone size={17} /> 电话号码</label>
            <div className="aurora-phone-control aurora-phone-split">
              <input className="aurora-country-code-input" id="auth-country-code" type="tel" inputMode="tel" autoComplete="tel-country-code" aria-label="国家区号" placeholder="+254" value={countryCode} onChange={(event) => setCountryCode(event.target.value.replace(/[^0-9+]/g, "").replace(/(?!^)\\+/g, "").slice(0, 6))} required maxLength={6} />
              <span className="aurora-phone-divider" aria-hidden="true" />
              <input className="aurora-phone-number-input" id="auth-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="输入手机号码" value={phone} onChange={(event) => handlePhoneChange(event.target.value)} required maxLength={16} />
            </div>
            {isRegister && <span className="aurora-auth-hint">左侧填写国家区号，右侧填写手机号码。</span>}
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
