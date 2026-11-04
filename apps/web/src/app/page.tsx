import Link from "next/link";

function Brand() {
  return (
    <div className="brand-lockup">
      <span className="brand-mark">W</span>
      <span>WHATSAPP TASK PLATFORM</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="portal-shell">
      <div className="portal-frame">
        <section className="portal-showcase">
          <div className="portal-topline">
            <Brand />
            <span className="portal-status"><i /> PLATFORM ACCESS</span>
          </div>

          <div className="portal-copy">
            <div className="portal-eyebrow">A CLEARER WAY FORWARD</div>
            <h1>把每一步努力，<br /><em>变成看得见的进展。</em></h1>
            <p>在一个简单、清晰、可靠的工作空间里，管理任务、跟进进度，掌握属于自己的每一步。</p>
          </div>

          <div className="portal-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-glow" />
            <div className="art-core"><span>W</span><small>WORKSPACE</small></div>
            <div className="art-card art-card-top"><span className="art-dot" /> TASK OVERVIEW <b>01</b></div>
            <div className="art-card art-card-bottom"><span className="art-check">✓</span><div><b>Progress, in focus</b><small>One step at a time</small></div></div>
            <div className="art-spark spark-one">✦</div>
            <div className="art-spark spark-two">✧</div>
          </div>

          <div className="portal-bottom">
            <span>© 2026 WHATSAPP TASK PLATFORM</span>
            <span>BUILT FOR CLARITY <b>·</b> DESIGNED FOR YOU</span>
          </div>
        </section>

        <section className="portal-access">
          <div className="access-top">
            <span className="access-label">YOUR WORKSPACE STARTS HERE</span>
            <span className="access-index">01 <i /> 02</span>
          </div>

          <div className="access-content">
            <div className="access-icon"><span>↗</span></div>
            <div className="access-kicker">WELCOME TO YOUR WORKSPACE</div>
            <h2>欢迎来到<br />任务管理平台。</h2>
            <p>登录账户，继续你的任务旅程。新用户也可以在这里快速创建账户。</p>
            <div className="access-actions">
              <Link className="access-primary" href="/login">登录账户 <span>→</span></Link>
              <Link className="access-secondary" href="/register">创建新账户 <span>↗</span></Link>
            </div>
            <div className="access-trust"><span>✓</span><div><b>账户安全保护</b><small>你的账户信息将受到安全保护</small></div></div>
          </div>

          <div className="access-footer">
            <span>需要帮助？</span>
            <span>SECURE ACCOUNT ACCESS</span>
          </div>
        </section>
      </div>
    </main>
  );
}
