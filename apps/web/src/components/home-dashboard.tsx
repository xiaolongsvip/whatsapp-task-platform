"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, Copy,
  Globe2, Headphones, Home, Image as ImageIcon, LoaderCircle, Users, Wallet, UserRound,
  ShieldCheck, CircleHelp, MonitorSmartphone,
} from "lucide-react";

type Locale = "zh-CN" | "en" | "ja";
type User = {
  id: string;
  phone: string;
  referralCode: string;
  status: string;
  profile?: { displayName?: string | null; locale?: string; timezone?: string } | null;
};
type DashboardData = {
  stats: { settledToday: number; pendingReview: number; claimedToday: number };
  balances: { currency: string; amountMinor: string }[];
  tasks: {
    id: string; title: string; description: string; category: string;
    rewardMinor: string; currency: string; capacity: number | null; claimedCount: number;
  }[];
};
const copy = {
  "zh-CN": {
    home: "首页", available: "可提现", support: "客服", language: "语言",
    noticeTitle: "重要提醒", notice: "请按照平台任务说明和安全规范完成操作。仅提交真实、经授权的任务结果；不要删除或篡改聊天记录、伪造截图或进行未经同意的消息发送。",
    settled: "今日已结算", pending: "待审核", balance: "可提现余额",
    referral: "推广奖励规则", referralText: "推广奖励仅按平台公布的有效规则及真实审核通过的业务任务计算，不因单纯邀请或注册产生奖励。",
    device: "设备与权限状态", deviceText: "网页不会擅自开启手机系统权限。需要提交截图时，由你主动选择文件并确认上传。",
    overlay: "悬浮窗权限", notApplicable: "网页版暂不适用", screenshot: "截图提交能力", userSelect: "提交时由你选择图片",
    enable: "查看权限说明", taskTitle: "任务大厅", taskHint: "以下仅展示当前已发布且在有效期内的任务。", reward: "单次奖励", claimed: "已领取", noTasks: "目前暂无开放任务", taskLoading: "正在读取任务…",
    tutorial: "任务使用教程", tutorialHint: "了解任务规则、流程与注意事项", invite: "邀请好友", inviteHint: "查看邀请码与推广关系", payout: "收款账户", payoutHint: "管理收款资料",
    homeTab: "首页", tasksTab: "任务", promoteTab: "推广", walletTab: "钱包", meTab: "我的",
    newUser: "新用户", copyCode: "复制邀请码", copied: "邀请码已复制", copyFail: "复制失败，请手动复制",
    supportMissing: "客服入口尚未配置，请稍后再试。", languageSaved: "语言已更新", languageFailed: "语言保存失败，请重试",
    loadFailed: "首页数据加载失败，请刷新重试。", account: "账户", active: "正常", logout: "退出登录",
    tutorialBody: "领取任务前请先阅读任务要求。只执行本人知情并授权的操作，按要求提交真实结果；不要群发陌生消息、伪造互动、抓取联系人或规避平台安全规则。",
    close: "知道了", moduleSoon: "该模块正在开发中。", tasksToday: "今日领取",
  },
  en: {
    home: "Home", available: "Withdrawable", support: "Support", language: "Language",
    noticeTitle: "Important notice", notice: "Follow the task instructions and platform safety rules. Submit only genuine, authorized task results. Do not delete or alter chat records, forge screenshots, or send messages without consent.",
    settled: "Settled today", pending: "Pending review", balance: "Withdrawable balance",
    referral: "Referral rewards", referralText: "Referral rewards follow the platform's published rules and are based only on genuine business tasks that pass review. Invites or registrations alone do not earn rewards.",
    device: "Device & permissions", deviceText: "The website will not enable phone permissions without your action. When a screenshot is required, you choose the file and confirm its upload.",
    overlay: "Floating-window permission", notApplicable: "Not applicable on web", screenshot: "Screenshot submission", userSelect: "You choose the image",
    enable: "Permission details", taskTitle: "Task hall", taskHint: "Only currently published tasks within their active period are shown.", reward: "Reward", claimed: "Claimed", noTasks: "No tasks are currently available", taskLoading: "Loading tasks…",
    tutorial: "Task guide", tutorialHint: "Rules, workflow and important notes", invite: "Invite friends", inviteHint: "Referral code and network", payout: "Payout account", payoutHint: "Manage payout details",
    homeTab: "Home", tasksTab: "Tasks", promoteTab: "Promote", walletTab: "Wallet", meTab: "Me",
    newUser: "New user", copyCode: "Copy invite code", copied: "Invite code copied", copyFail: "Copy failed. Please copy it manually",
    supportMissing: "Support has not been configured yet.", languageSaved: "Language updated", languageFailed: "Could not save language. Try again",
    loadFailed: "Could not load the dashboard. Refresh and try again.", account: "Account", active: "Active", logout: "Log out",
    tutorialBody: "Read each task's requirements before claiming it. Perform only actions you understand and are authorized to perform. Submit genuine results. Do not spam strangers, fake engagement, scrape contacts, or bypass platform safety rules.",
    close: "Got it", moduleSoon: "This module is under development.", tasksToday: "Claimed today",
  },
  ja: {
    home: "ホーム", available: "出金可能", support: "サポート", language: "言語",
    noticeTitle: "重要なお知らせ", notice: "タスクの説明と安全ルールに従ってください。本人が承認した実際の結果のみ提出してください。チャット履歴の削除・改ざん、スクリーンショットの偽造、同意のないメッセージ送信は禁止です。",
    settled: "本日の精算", pending: "審査待ち", balance: "出金可能残高",
    referral: "紹介報酬ルール", referralText: "紹介報酬は公開された有効なルールに従い、実際の業務タスクが審査に合格した場合のみ発生します。招待や登録だけでは報酬は発生しません。",
    device: "端末と権限の状態", deviceText: "ウェブサイトが端末の権限を勝手に有効にすることはありません。画像提出時はご自身でファイルを選択して確認してください。",
    overlay: "フローティングウィンドウ権限", notApplicable: "ウェブ版では対象外", screenshot: "画像提出", userSelect: "提出時に画像を選択",
    enable: "権限の説明", taskTitle: "タスク一覧", taskHint: "現在公開中で有効期間内のタスクのみ表示します。", reward: "報酬", claimed: "取得済み", noTasks: "現在利用可能なタスクはありません", taskLoading: "タスクを読み込み中…",
    tutorial: "タスク利用ガイド", tutorialHint: "ルール、手順、注意事項", invite: "友達を招待", inviteHint: "紹介コードと紹介関係", payout: "受取口座", payoutHint: "受取情報を管理",
    homeTab: "ホーム", tasksTab: "タスク", promoteTab: "紹介", walletTab: "ウォレット", meTab: "マイページ",
    newUser: "新規ユーザー", copyCode: "紹介コードをコピー", copied: "紹介コードをコピーしました", copyFail: "コピーできません。手動でコピーしてください",
    supportMissing: "サポート窓口はまだ設定されていません。", languageSaved: "言語を更新しました", languageFailed: "言語を保存できませんでした",
    loadFailed: "ホームデータを読み込めません。再読み込みしてください。", account: "アカウント", active: "有効", logout: "ログアウト",
    tutorialBody: "タスクを取得する前に要件を確認してください。本人が理解し許可した操作のみ行い、実際の結果を提出してください。迷惑メッセージ、偽の反応、連絡先の収集、安全ルールの回避は禁止です。",
    close: "閉じる", moduleSoon: "この機能は開発中です。", tasksToday: "本日の取得数",
  },
} satisfies Record<Locale, Record<string, string>>;

function money(amountMinor: string, currency: string, locale: Locale) {
  const amount = Number(amountMinor) / 100;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number.isFinite(amount) ? amount : 0) + " " + currency;
}

export function HomeDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const [loading, setLoading] = useState(true);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [notice, setNotice] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = copy[locale];
  const supportUrl = process.env.NEXT_PUBLIC_SUPPORT_URL;

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/v1/users/me", { credentials: "include" }),
      fetch("/api/v1/users/dashboard", { credentials: "include" }),
    ]).then(async ([userResponse, dashboardResponse]) => {
      if (userResponse.status === 401 || dashboardResponse.status === 401) {
        router.replace("/login");
        return null;
      }
      const userData = await userResponse.json();
      const dashboardData = await dashboardResponse.json();
      if (!userResponse.ok || !dashboardResponse.ok) {
        throw new Error(dashboardData.message || userData.message || "Dashboard request failed");
      }
      return { user: userData as User, dashboard: dashboardData as DashboardData };
    }).then((result) => {
      if (!active || !result) return;
      setUser(result.user);
      setData(result.dashboard);
      const saved = result.user.profile?.locale;
      if (saved === "en" || saved === "ja" || saved === "zh-CN") setLocale(saved);
    }).catch(() => {
      if (active) setNotice(copy["zh-CN"].loadFailed);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [router]);

  const primaryBalance = useMemo(() => {
    const balances = data?.balances ?? [];
    return balances.find((item) => item.currency === "USD") ?? balances[0] ?? null;
  }, [data]);

  async function changeLanguage(next: string) {
    if (next !== "zh-CN" && next !== "en" && next !== "ja") return;
    const previous = locale;
    setLocale(next);
    setSavingLanguage(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/users/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (!response.ok) throw new Error("save failed");
      setNotice(copy[next].languageSaved);
    } catch {
      setLocale(previous);
      setNotice(copy[previous].languageFailed);
    } finally {
      setSavingLanguage(false);
    }
  }

  async function copyReferral() {
    if (!user?.referralCode) return;
    try {
      await navigator.clipboard.writeText(user.referralCode);
      setNotice(t.copied);
    } catch {
      setNotice(t.copyFail + ": " + user.referralCode);
    }
  }

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return <main className="home-dashboard-shell"><div className="home-dashboard-loading"><LoaderCircle className="home-spin" />{copy["zh-CN"].taskLoading}</div></main>;
  }

  const amount = primaryBalance ? money(primaryBalance.amountMinor, primaryBalance.currency, locale) : "0.000";
  const taskCount = data?.tasks.length ?? 0;

  return (
    <main className="home-dashboard-shell">
      <header className="home-appbar">
        <button className="home-balance-pill" type="button" onClick={() => setNotice(t.moduleSoon)} aria-label={t.available}>
          <span>{t.available}</span><strong>{amount}</strong>
        </button>
        <div className="home-appbar-title">{t.home}</div>
        <div className="home-appbar-actions">
          {supportUrl ? (
            <a className="home-icon-button" href={supportUrl} target="_blank" rel="noreferrer" aria-label={t.support}><Headphones size={23} /></a>
          ) : (
            <button className="home-icon-button" type="button" onClick={() => setNotice(t.supportMissing)} aria-label={t.support}><Headphones size={23} /></button>
          )}
          <div className="home-language-wrap">
            <button className="home-icon-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-label={t.language}><Globe2 size={23} /></button>
            {menuOpen && (
              <div className="home-language-menu">
                <button type="button" disabled={savingLanguage} onClick={() => { setMenuOpen(false); void changeLanguage("zh-CN"); }}>简体中文</button>
                <button type="button" disabled={savingLanguage} onClick={() => { setMenuOpen(false); void changeLanguage("en"); }}>English</button>
                <button type="button" disabled={savingLanguage} onClick={() => { setMenuOpen(false); void changeLanguage("ja"); }}>日本語</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {notice && <div className="home-toast" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>×</button></div>}

      <section className="home-notice-card">
        <h2><AlertTriangle size={20} />{t.noticeTitle}</h2>
        <p>{t.notice}</p>
      </section>

      <section className="home-stats-card" aria-label="Account summary">
        <div><span>{t.settled}</span><strong>{data?.stats.settledToday ?? 0}</strong></div>
        <div><span>{t.pending}</span><strong>{data?.stats.pendingReview ?? 0}</strong></div>
        <div><span>{t.balance}</span><strong>{amount}</strong></div>
      </section>

      <section className="home-referral-banner">
        <div className="home-referral-title">{t.referral}</div>
        <p>{t.referralText}</p>
        <div className="home-referral-code">
          <span>{user?.referralCode ?? "—"}</span>
          <button type="button" onClick={() => void copyReferral()} disabled={!user?.referralCode}><Copy size={16} />{t.copyCode}</button>
        </div>
      </section>

      <section className="home-permission-card">
        <div className="home-permission-heading"><MonitorSmartphone size={22} /><h2>{t.device}</h2></div>
        <p>{t.deviceText}</p>
        <div className="home-permission-grid">
          <div><span className="home-permission-icon"><ShieldCheck size={22} /></span><strong>{t.overlay}</strong><small>{t.notApplicable}</small></div>
          <div><span className="home-permission-icon"><ImageIcon size={22} /></span><strong>{t.screenshot}</strong><small>{t.userSelect}</small></div>
        </div>
      </section>

      <section className="home-task-section">
        <div className="home-section-heading">
          <div><h2>{t.taskTitle}</h2><p>{t.taskHint}</p></div>
          <span>{t.tasksToday}: {data?.stats.claimedToday ?? 0}</span>
        </div>
        {taskCount === 0 ? (
          <div className="home-empty-tasks"><ClipboardList size={30} /><strong>{t.noTasks}</strong></div>
        ) : (
          <div className="home-task-list">
            {data?.tasks.map((task) => (
              <article className="home-task-card" key={task.id}>
                <div className="home-task-card-top"><span>{task.category}</span><small>{task.capacity === null ? t.claimed + ": " + task.claimedCount : task.claimedCount + " / " + task.capacity}</small></div>
                <h3>{task.title}</h3>
                <p>{task.description}</p>
                <div className="home-task-reward"><span>{t.reward}</span><strong>{money(task.rewardMinor, task.currency, locale)}</strong></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <button className="home-link-card" type="button" onClick={() => setTutorialOpen(true)}>
        <span className="home-link-icon"><ClipboardList size={25} /></span><span className="home-link-copy"><strong>{t.tutorial}</strong><small>{t.tutorialHint}</small></span><ChevronRight size={22} />
      </button>

      <section className="home-device-summary">
        <div className="home-device-summary-head"><h2>{t.device}</h2><span><CheckCircle2 size={15} />{t.account}: {user?.status === "ACTIVE" ? t.active : user?.status ?? "—"}</span></div>
        <div className="home-quick-actions">
          <button type="button" onClick={copyReferral}><Users size={25} /><strong>{t.invite}</strong><small>{t.inviteHint}</small></button>
          <button type="button" onClick={() => router.push("/profile")}><Wallet size={25} /><strong>{t.payout}</strong><small>{t.payoutHint}</small></button>
        </div>
      </section>

      <nav className="home-bottom-nav" aria-label="Main navigation">
        <button className="active" type="button" aria-current="page"><Home size={23} /><span>{t.homeTab}</span></button>
        <button type="button" onClick={() => setNotice(t.moduleSoon)}><ClipboardList size={23} /><span>{t.tasksTab}</span></button>
        <button type="button" onClick={() => setNotice(t.moduleSoon)}><Users size={23} /><span>{t.promoteTab}</span></button>
        <button type="button" onClick={() => setNotice(t.moduleSoon)}><Wallet size={23} /><span>{t.walletTab}</span></button>
        <button type="button" onClick={() => router.push("/profile")}><UserRound size={23} /><span>{t.meTab}</span></button>
      </nav>

      {tutorialOpen && (
        <div className="home-modal-backdrop" role="presentation" onClick={() => setTutorialOpen(false)}>
          <section className="home-tutorial-modal" role="dialog" aria-modal="true" aria-labelledby="home-tutorial-title" onClick={(event) => event.stopPropagation()}>
            <div><CircleHelp size={24} /><h2 id="home-tutorial-title">{t.tutorial}</h2></div>
            <p>{t.tutorialBody}</p>
            <button type="button" onClick={() => setTutorialOpen(false)}>{t.close}</button>
          </section>
        </div>
      )}
      <button className="home-logout-link" type="button" onClick={logout}>{t.logout}</button>
    </main>
  );
}
