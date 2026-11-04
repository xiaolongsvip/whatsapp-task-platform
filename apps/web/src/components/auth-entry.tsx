"use client";

import { FormEvent, useState } from "react";

type Mode = "login" | "register";

function AuthPanel({ mode }: { mode: Mode }) {
  const isRegister = mode === "register";
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

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
          phone: normalizedPhone,
          password,
          ...(isRegister && inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.message === "string" ? result.message : "请求失败，请稍后重试。");
      }
      if (isRegister) {
        setNotice("账户创建成功。现在可以使用左侧表单登录。");
        setPhone(normalizedPhone);
        setPassword("");
        setConfirmPassword("");
        setInviteCode("");
      } else {
        setNotice("登录验证成功。用户工作台页面正在开发中，请稍后继续。");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "网络连接失败，请检查 API 服务。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`entry-panel ${isRegister ? "entry-register" : "entry-login"}`}>
      <div className="entry-panel-top">
        <span className="entry-step">{isRegister ? "02" : "01"} / ACCOUNT</span>
        <span className="entry-panel-symbol">{isRegister ? "+" : "↗"}</span>
      </div>
      <div className="entry-heading">
        <div className="entry-eyebrow">{isRegister ? "NEW HERE? START IN A MOMENT" : "WELCOME BACK TO YOUR SPACE"}</div>
        <h1>{isRegister ? "创建新账户" : "登录账户"}</h1>
        <p>{isRegister ? "填写资料，建立你的个人任务账户。" : "输入手机号码和密码，继续使用你的账户。"}</p>
      </div>
      <form className="entry-form" onSubmit={handleSubmit}>
        <div className="entry-field">
          <label htmlFor={`${mode}-phone`}>电话号码</label>
          <input id={`${mode}-phone`} name="phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="例如 25412345678" value={phone} onChange={(event) => setPhone(event.target.value)} required maxLength={20} />
        </div>
        <div className="entry-field">
          <label htmlFor={`${mode}-password`}>登录密码</label>
          <input id={`${mode}-password`} name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} placeholder="至少 6 位，支持字母和数字" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} maxLength={128} />
        </div>
        {isRegister && (
          <>
            <div className="entry-field">
              <label htmlFor="entry-confirm-password">确认密码</label>
              <input id="entry-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" placeholder="请再次输入密码" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={6} maxLength={128} />
            </div>
            <div className="entry-field">
              <label htmlFor="entry-invite-code">邀请码 <span>选填</span></label>
              <input id="entry-invite-code" name="inviteCode" type="text" autoComplete="off" placeholder="如有邀请码，请填写" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} maxLength={32} />
            </div>
          </>
        )}
        {error && <div className="entry-feedback entry-error" role="alert">{error}</div>}
        {notice && <div className="entry-feedback entry-success" role="status">{notice}</div>}
        <button className="entry-submit" type="submit" disabled={busy}>{busy ? "正在处理…" : isRegister ? "创建账户" : "登录平台"} <span>→</span></button>
      </form>
      <div className="entry-panel-foot">
        <span className="entry-secure-icon">✓</span>
        <span>{isRegister ? "注册即代表你同意遵守平台使用规则。" : "安全加密连接，保护账户信息。"}</span>
      </div>
    </section>
  );
}

export function AuthEntry() {
  return (
    <main className="entry-page">
      <header className="entry-header">
        <div className="entry-brand"><span className="entry-brand-mark">W</span><span>WHATSAPP TASK PLATFORM</span></div>
        <div className="entry-header-caption"><span /> PERSONAL ACCOUNT ACCESS</div>
      </header>
      <div className="entry-intro">
        <div className="entry-intro-line">YOUR ACCOUNT. YOUR NEXT STEP.</div>
        <h2>欢迎回来。<span>从这里开始。</span></h2>
        <p>登录已有账户，或创建一个新账户，开启你的任务管理体验。</p>
      </div>
      <div className="entry-panels">
        <AuthPanel mode="login" />
        <AuthPanel mode="register" />
      </div>
      <footer className="entry-footer"><span>© 2026 WHATSAPP TASK PLATFORM</span><span>SECURE · SIMPLE · CLEAR</span></footer>
    </main>
  );
}
