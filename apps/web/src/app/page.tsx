import Link from "next/link";

function Brand() {
  return (
    <div className="brand-lockup portal-brand">
      <span className="brand-mark">W</span>
      <span>WHATSAPP TASK PLATFORM</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="new-portal">
      <header className="new-portal-header">
        <Brand />
        <div className="header-note"><span className="header-live" /> YOUR PERSONAL TASK SPACE</div>
      </header>

      <section className="new-hero">
        <div className="new-hero-copy">
          <div className="new-eyebrow"><span /> WORK WITH PURPOSE</div>
          <h1>让每一份努力，<br /><span>都有清晰的价值。</span></h1>
          <p>一个专注于任务与进度的工作空间。轻松管理每一步，让你的付出与成果一目了然。</p>
          <div className="new-hero-actions">
            <Link href="/login" className="new-primary">登录账户 <span>→</span></Link>
            <Link href="/register" className="new-secondary">创建新账户</Link>
          </div>
          <div className="new-proof">
            <span className="proof-icon">✓</span>
            <div><b>简单、安全、清晰</b><small>从你的个人账户开始</small></div>
          </div>
        </div>

        <div className="new-hero-art" aria-label="任务工作空间视觉展示">
          <div className="art-orb orb-a" />
          <div className="art-orb orb-b" />
          <div className="art-shine" />
          <div className="art-heading"><span>YOUR WORKSPACE</span><b>01 / 03</b></div>
          <div className="task-preview">
            <div className="preview-top"><div><small>MY OVERVIEW</small><h2>保持进度，<br />一步一步向前。</h2></div><div className="preview-symbol">W</div></div>
            <div className="preview-divider" />
            <div className="preview-row"><span className="preview-number">01</span><div><b>任务管理</b><small>查看并跟进当前任务</small></div><i>↗</i></div>
            <div className="preview-row"><span className="preview-number">02</span><div><b>进度记录</b><small>清楚掌握每一步进展</small></div><i>↗</i></div>
            <div className="preview-row"><span className="preview-number">03</span><div><b>账户中心</b><small>管理个人账户信息</small></div><i>↗</i></div>
            <div className="preview-bottom"><span><i /> PERSONAL WORKSPACE</span><b>MOVE FORWARD →</b></div>
          </div>
          <div className="floating-note"><span>✓</span><div><b>每一步，都有记录</b><small>Progress made visible</small></div></div>
          <div className="art-caption">FOCUS ON WHAT MATTERS.</div>
        </div>
      </section>

      <footer className="new-portal-footer">
        <span>© 2026 WHATSAPP TASK PLATFORM</span>
        <span>YOUR WORK. YOUR PROGRESS.</span>
      </footer>
    </main>
  );
}
