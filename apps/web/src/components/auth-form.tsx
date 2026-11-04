"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type AuthMode = "register" | "login";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedPhone = phone.replace(/[\s()+-]/g, "");
    if (!/^\d{8,15}$/.test(normalizedPhone)) {
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
      router.push(isRegister ? "/login?registered=1" : "/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "网络连接失败，请检查 API 服务。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">WHATSAPP TASK PLATFORM</div>
        <h1 id="auth-title">{isRegister ? "创建账户" : "欢迎回来"}</h1>
        <p className="auth-subtitle">{isRegister ? "使用手机号码注册平台账户" : "使用手机号码和密码登录"}</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="phone">电话号码</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="例如 25412345678"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              maxLength={20}
            />
            <span className="auth-hint">请填写包含国家区号的号码，仅输入数字也可以。</span>
          </div>
          <div className="auth-field">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              placeholder="请输入密码（至少 6 位）"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              maxLength={128}
            />
          </div>
          {isRegister && (
            <>
              <div className="auth-field">
                <label htmlFor="confirmPassword">确认密码</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="请再次输入密码"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={6}
                  maxLength={128}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="inviteCode">邀请码（选填）</label>
                <input
                  id="inviteCode"
                  name="inviteCode"
                  type="text"
                  autoComplete="off"
                  placeholder="请输入邀请码"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  maxLength={32}
                />
              </div>
            </>
          )}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-button" type="submit" disabled={busy}>
            {busy ? "请稍候…" : isRegister ? "注册账户" : "登录"}
          </button>
        </form>
        <div className="auth-footer">
          {isRegister ? <>已有账户？ <Link href="/login">登录</Link></> : <>还没有账户？ <Link href="/register">立即注册</Link></>}
        </div>
      </section>
    </main>
  );
}
