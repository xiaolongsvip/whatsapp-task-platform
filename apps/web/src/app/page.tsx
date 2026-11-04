import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-visual">
        <div className="brand-lockup">
          <span className="brand-mark">W</span>
          <span>WHATSAPP TASK PLATFORM</span>
        </div>
        <div>
          <div className="visual-eyebrow">YOUR WORK. YOUR PROGRESS.</div>
          <h1>让每一份努力，<br />都有清晰的回响。</h1>
          <p>一个简单、清晰、可靠的任务管理体验。从账户开始，逐步掌握你的每一步进展。</p>
        </div>
        <div className="visual-foot">© 2026 WHATSAPP TASK PLATFORM</div>
      </section>
      <section className="home-panel">
        <div className="home-card">
          <div className="auth-kicker">GET STARTED</div>
          <h2>欢迎来到任务平台</h2>
          <p>登录你的账户，继续查看任务与账户信息；如果你是新用户，也可以快速创建账户。</p>
          <div className="home-actions">
            <Link href="/login">登录账户</Link>
            <Link className="secondary" href="/register">创建新账户</Link>
          </div>
          <div className="auth-security"><span className="auth-security-mark">✓</span>安全加密连接 · 保护你的账户信息</div>
        </div>
      </section>
    </main>
  );
}
