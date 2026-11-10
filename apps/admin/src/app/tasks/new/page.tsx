"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import AdminSidebar from "../../../components/AdminSidebar";
import { ArrowLeft, Save } from "lucide-react";

type Template = { id: string; name: string; platform: string; action: string; content: string; enabled: boolean };
type TaskGroup = { id: string; name: string; description: string | null; taskCount: number };
type RewardPreset = { name: string; platform?: string; amount: number | string; currency?: string; enabled?: boolean };
type Form = { title: string; platform: string; groupId: string; rewardAmount: string; currency: string; description: string; messageTemplate: string; linkUrl: string; previewTitle: string; previewDescription: string; previewImageUrl: string; startsAt: string; endsAt: string };
const initial: Form = { title: "", platform: "WhatsApp", groupId: "", rewardAmount: "0.07", currency: "USD", description: "", messageTemplate: "", linkUrl: "", previewTitle: "", previewDescription: "", previewImageUrl: "", startsAt: "", endsAt: "" };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "请求失败，请检查 API 服务。");
  return data as T;
}
function iso(value: string) { return value ? new Date(value).toISOString() : null; }

export default function NewTaskPage() {
  const [form, setForm] = useState<Form>(initial);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [rewardPresets, setRewardPresets] = useState<RewardPreset[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [messageMode, setMessageMode] = useState<"manual" | "template">("manual");
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api("/api/v1/admin-auth/me").then(() => setAuthenticated(true)).catch(() => setAuthenticated(false)).finally(() => setChecking(false));
    api<Template[]>("/api/v1/admin/tasks/message-templates?enabled=true").then(setTemplates).catch(() => setTemplates([]));
    api<TaskGroup[]>("/api/v1/admin/tasks/groups").then(setGroups).catch(() => setGroups([]));
    api<RewardPreset[]>("/api/v1/admin/tasks/configuration/rewards").then((items) => setRewardPresets(Array.isArray(items) ? items.filter((item) => item.enabled !== false) : [])).catch(() => setRewardPresets([]));
  }, []);

  function update<K extends keyof Form>(key: K, value: Form[K]) { setForm((current) => ({ ...current, [key]: value })); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.messageTemplate.trim()) { setError("请先填写话术或选择一个已启用模板。"); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ id: string }>("/api/v1/admin/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.platform,
          groupId: form.groupId || null,
          rewardAmount: form.rewardAmount.trim(),
          currency: form.currency.toUpperCase(),
          startsAt: iso(form.startsAt),
          endsAt: iso(form.endsAt),
          messageTemplate: form.messageTemplate.trim(),
          linkUrl: form.linkUrl.trim() || null,
          previewTitle: form.previewTitle.trim() || null,
          previewDescription: form.previewDescription.trim() || null,
          previewImageUrl: form.previewImageUrl.trim() || null,
        }),
      });
      setMessage("任务草稿创建成功。请返回任务列表检查内容后发布。");
      window.location.assign("/tasks");
      void result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建任务失败。");
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <main style={shell}>正在检查管理员登录状态…</main>;
  if (!authenticated) return <main style={shell}><section style={card}><h2>尚未登录管理后台</h2><Link href="/">前往管理员登录</Link></section></main>;

  const applicableTemplates = templates.filter((item) => item.enabled && (item.platform === form.platform || item.platform === "通用"));
  return <div className="dashboard-app"><AdminSidebar /><main className="dashboard-main">
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5eaf1", paddingBottom: 14 }}>
        <Link href="/tasks" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#344054", textDecoration: "none", border: "1px solid #dce3ed", borderRadius: 7, padding: "8px 12px", background: "#fff" }}><ArrowLeft size={15}/>返回号码列表</Link>
        <Link href="/task-settings/messages" style={{ color: "#2864ed", textDecoration: "none", fontSize: 13 }}>话术管理</Link>
      </header>
      <div style={{ padding: "18px 0", borderBottom: "1px solid #e5eaf1" }}>
        <h1 style={{ margin: 0, fontSize: 23 }}>添加任务</h1>
        <p style={{ margin: "7px 0 0", color: "#68778d", fontSize: 13 }}>填写任务平台、奖励和话术并保存草稿；发布时从已授权号码池分配号码。</p>
      </div>
      {error && <div role="alert" style={{ marginTop: 14, color: "#b42318", background: "#fff1f0", padding: 12, borderRadius: 7 }}>{error}</div>}
      {message && <div role="status" style={{ marginTop: 14, color: "#16794b", background: "#eaf8f0", padding: 12, borderRadius: 7 }}>{message}</div>}
      <form onSubmit={submit}>
        <section style={{ ...card, marginTop: 16 }}>
          <div style={grid}>
            <label style={label}>目标平台<select required value={form.platform} onChange={(e) => update("platform", e.target.value)} style={input}><option>WhatsApp</option><option>Telegram</option><option>Facebook</option></select><small style={hint}>平台分类会保存到任务分类字段。</small></label>
            <label style={label}>奖励预设（可选）<select value="" onChange={(e) => { const preset = rewardPresets[Number(e.target.value)]; if (preset) { update("rewardAmount", String(preset.amount)); if (preset.currency) update("currency", preset.currency.toUpperCase()); if (preset.platform && preset.platform !== "通用") update("platform", preset.platform); } }} style={input}><option value="">不使用预设，手动填写</option>{rewardPresets.map((preset, index) => <option key={`${preset.name}-${index}`} value={index}>{preset.name} · {preset.amount} {preset.currency ?? ""}</option>)}</select><small style={hint}>选择后自动填入奖励金额、币种及适用平台（如有）。</small></label>\n            <label style={label}>单个任务奖励<input required value={form.rewardAmount} onChange={(e) => update("rewardAmount", e.target.value)} inputMode="decimal" pattern="\d{1,8}(\.\d{1,2})?" style={input}/></label>
            <label style={label}>奖励币种<input required maxLength={3} minLength={3} value={form.currency} onChange={(e) => update("currency", e.target.value.toUpperCase())} style={input}/></label>
            <label style={label}>任务名称<input required minLength={2} maxLength={120} value={form.title} onChange={(e) => update("title", e.target.value)} style={input} placeholder="请输入任务名称"/></label>
            <label style={label}>任务组<select value={form.groupId} onChange={(e) => update("groupId", e.target.value)} style={input}><option value="">暂不分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><small style={hint}>可在任务管理的“任务组”弹窗中新建任务组。</small></label>
          </div>
          <label style={{ ...label, marginTop: 16 }}>任务说明<textarea required minLength={2} maxLength={5000} rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} style={{ ...input, resize: "vertical" }}/></label>
          <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 14 }}>AI 审核配置</strong><Link href="/ai-settings" style={{ color: "#2864ed", fontSize: 12, textDecoration: "none" }}>管理审核配置</Link>
          </div>
          <p style={{ ...hint, marginTop: 7 }}>当前任务使用系统中已配置的 AI 审核规则；此处可前往审核设置管理，不在任务表中重复保存密钥或审核阈值。</p>
          <div style={{ marginTop: 18 }}>
            <strong style={{ fontSize: 14 }}>发送话术</strong>
            <div style={tabs}>
              <button type="button" onClick={() => setMessageMode("manual")} style={tab(messageMode === "manual")}>手工输入</button>
              <button type="button" onClick={() => setMessageMode("template")} style={tab(messageMode === "template")}>选择模板</button>
            </div>
            {messageMode === "manual" ? <textarea required rows={5} maxLength={5000} value={form.messageTemplate} onChange={(e) => update("messageTemplate", e.target.value)} placeholder="请输入用户需要手工发送的话术" style={{ ...input, marginTop: 12, resize: "vertical" }}/> :
              <div style={{ marginTop: 12 }}><select value={templateId} onChange={(e) => { const id = e.target.value; setTemplateId(id); const found = applicableTemplates.find((item) => item.id === id); if (found) update("messageTemplate", found.content); }} style={input}><option value="">请选择话术模板</option>{applicableTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.action}</option>)}</select>{templateId && <pre style={{ whiteSpace: "pre-wrap", background: "#f8fafc", border: "1px solid #e5eaf1", padding: 12, borderRadius: 7, fontSize: 12 }}>{form.messageTemplate}</pre>}</div>}
          </div>
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            <label style={label}>开始时间（留空表示立即开放）<input type="datetime-local" value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} style={input}/></label>
            <label style={label}>结束时间（留空表示不自动到期）<input type="datetime-local" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} style={input}/></label>
          </div>
        </section>
        <section style={{ ...card, marginTop: 16 }}>
          <strong style={{ fontSize: 14 }}>号码库存与任务分配</strong>
          <p style={{ ...hint, margin: "9px 0 0", lineHeight: 1.7 }}>
            创建任务只会保存任务草稿，不会把本页输入或选择的文件写入号码池。请先到“号码池管理”导入号码，并记录号码持有人的有效授权来源与时间。任务发布后，系统会从已授权且未分配的号码中按 FIFO 规则自动分配。
          </p>
          <div style={{ marginTop: 13, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Link href="/contact-numbers" style={{ ...primary, textDecoration: "none" }}>打开号码池管理</Link>
            <span style={hint}>导入完成后返回任务列表发布草稿即可。</span>
          </div>
        </section>
        <section style={{ ...card, marginTop: 16 }}>
          <strong style={{ fontSize: 14 }}>消息链接与预览（可选）</strong>
          <div style={{ ...grid, marginTop: 14 }}>
            <label style={label}>消息中的网页链接<input type="url" value={form.linkUrl} onChange={(e) => update("linkUrl", e.target.value)} style={input} placeholder="https://example.com"/></label>
            <label style={label}>预览标题<input value={form.previewTitle} onChange={(e) => update("previewTitle", e.target.value)} maxLength={180} style={input}/></label>
            <label style={label}>预览图片 URL<input type="url" value={form.previewImageUrl} onChange={(e) => update("previewImageUrl", e.target.value)} style={input}/></label>
          </div>
          <label style={{ ...label, marginTop: 14 }}>预览描述<textarea rows={2} maxLength={1000} value={form.previewDescription} onChange={(e) => update("previewDescription", e.target.value)} style={{ ...input, resize: "vertical" }}/></label>
        </section>
        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 9, padding: "18px 0 32px" }}>
          <Link href="/tasks" style={{ ...secondary, textDecoration: "none" }}>取消</Link>
          <button type="submit" disabled={busy} style={primary}><Save size={15}/>{busy ? "正在保存…" : "保存为草稿"}</button>
        </footer>
      </form>
    </div>
  </main></div>;
}

const shell = { minHeight: "100vh", background: "#f5f7fb", color: "#172033", padding: 22, boxSizing: "border-box" as const } as const;
const card = { background: "#fff", border: "1px solid #e4e9f1", borderRadius: 9, padding: 18 } as const;
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 } as const;
const label = { display: "flex", flexDirection: "column" as const, gap: 7, color: "#344054", fontSize: 13, fontWeight: 600 } as const;
const input = { width: "100%", boxSizing: "border-box" as const, padding: "10px 11px", border: "1px solid #d9e1ec", borderRadius: 7, color: "#172033", background: "#fff", font: "inherit", fontWeight: 400 } as const;
const hint = { color: "#718096", fontSize: 12, fontWeight: 400 } as const;
const tabs = { display: "flex", gap: 18, borderBottom: "1px solid #e5eaf1", marginTop: 9 } as const;
const tab = (active: boolean) => ({ padding: "10px 12px", border: 0, borderBottom: active ? "2px solid #2864ed" : "2px solid transparent", background: "transparent", color: active ? "#2864ed" : "#52627a", cursor: "pointer" } as const);
const primary = { display: "inline-flex", alignItems: "center", gap: 7, border: 0, borderRadius: 7, padding: "10px 15px", background: "#2864ed", color: "#fff", cursor: "pointer" } as const;
const secondary = { display: "inline-flex", alignItems: "center", border: "1px solid #d9e1ec", borderRadius: 7, padding: "10px 15px", color: "#344054", background: "#fff" } as const;
