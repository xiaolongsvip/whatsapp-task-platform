import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-card">
        <div className="auth-brand">WHATSAPP TASK PLATFORM</div>
        <h1>欢迎来到任务平台</h1>
        <p className="auth-subtitle">通过手机号码登录，或创建一个新账户。</p>
        <div className="home-actions">
          <Link href="/login">登录账户</Link>
          <Link className="secondary" href="/register">创建账户</Link>
        </div>
      </section>
    </main>
  );
}
