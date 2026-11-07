"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminSidebar from "../../../components/AdminSidebar";
import { ArrowLeft, Plus, RefreshCw, Save, ToggleLeft, ToggleRight } from "lucide-react";

type MessageTemplate = {
  id: string;
  name: string;
  platform: string;
  action: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type TemplateForm = { name: string; platform: string; action: string; content: string };
const emptyForm: TemplateForm = { name: "", platform: "WhatsApp", action: "MESSAGE", content: "" };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "请求失败，请检查 API 服务。");
  return data as T;
}

export default function MessageTemplatesPage() {
  const [items, setItems] = useState<MessageTemplate[]>([]);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const data = await api<MessageTemplate[]>("/api/v1/admin/tasks/message-templates");
    setItems(data);
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "话术模板加载失败。"))
      .finally(() => setLoading(false));
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setError("");
    setMessage("");
  }

  function openEdit(item: MessageTemplate) {
    setEditingId(item.id);
    setForm({ name: item.name, platform: item.platform, action: item.action, content: item.content });
    setShowForm(true);
    setError("");
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api<MessageTemplate>(editingId ? `/api/v1/admin/tasks/message-templates/${editingId}` : "/api/v1/admin/tasks/message-templates", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ ...form, enabled: true }),
      });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      setMessage(editingId ? "话术模板已更新。" : "话术模板已创建。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存话术模板失败。");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: MessageTemplate) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/v1/admin/tasks/message-templates/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      await load();
      setMessage(item.enabled ? "模板已停用；历史任务话术不会改变。" : "模板已启用，可供新任务和批量更换使用。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新模板状态失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-app"><AdminSidebar /><main className="dashboard-main">
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, borderBottom: "1px solid #e4e9f1", paddingBottom: 18 }}>
          <div>
            <Link href="/tasks" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#52627a", textDecoration: "none", marginBottom: 12 }}><ArrowLeft size={16}/>返回任务管理</Link>
            <h1 style={{ fontSize: 24, margin: 0 }}>话术管理</h1>
            <p style={{ color: "#68778d", margin: "7px 0 0" }}>管理可复用的话术模板；停用模板不会修改已创建任务的历史话术。</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void load()} disabled={busy} style={secondaryButton}><RefreshCw size={15}/>刷新</button>
            <button type="button" onClick={openCreate} style={primaryButton}><Plus size={16}/>新增话术</button>
          </div>
        </header>

        {error && <div role="alert" style={{ marginTop: 16, padding: 12, borderRadius: 8, color: "#b42318", background: "#fff1f0" }}>{error}</div>}
        {message && <div role="status" style={{ marginTop: 16, padding: 12, borderRadius: 8, color: "#16794b", background: "#eaf8f0" }}>{message}</div>}

        {showForm && <form onSubmit={save} style={{ marginTop: 18, padding: 20, background: "#fff", border: "1px solid #e4e9f1", borderRadius: 10 }}>
          <h2 style={{ fontSize: 17, margin: "0 0 16px" }}>{editingId ? "编辑话术模板" : "新增话术模板"}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
            <label style={fieldLabel}>模板名称<input required minLength={2} maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={fieldInput} placeholder="例如：WhatsApp 注册引导" /></label>
            <label style={fieldLabel}>目标平台<select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} style={fieldInput}><option>WhatsApp</option><option>Telegram</option><option>Facebook</option><option>通用</option></select></label>
            <label style={fieldLabel}>动作<select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} style={fieldInput}><option value="MESSAGE">Message（发送消息）</option><option value="GROUP">Group（群组操作）</option></select></label>
          </div>
          <label style={{ ...fieldLabel, marginTop: 14 }}>话术内容<textarea required maxLength={10000} rows={7} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ ...fieldInput, resize: "vertical" }} placeholder="请输入完整话术内容" /></label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setShowForm(false)} style={secondaryButton}>取消</button>
            <button type="submit" disabled={busy} style={primaryButton}><Save size={15}/>{busy ? "保存中…" : "保存模板"}</button>
          </div>
        </form>}

        <section style={{ marginTop: 18, background: "#fff", border: "1px solid #e4e9f1", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "15px 18px", borderBottom: "1px solid #edf0f5", display: "flex", justifyContent: "space-between" }}>
            <strong>模板列表</strong><span style={{ color: "#718096", fontSize: 13 }}>共 {items.length} 个模板</span>
          </div>
          {loading ? <p style={{ padding: 20, color: "#718096" }}>正在加载话术模板…</p> : items.length === 0 ? <p style={{ padding: 28, textAlign: "center", color: "#718096" }}>暂无话术模板，点击“新增话术”创建第一个模板。</p> :
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead><tr style={{ background: "#f8fafc", textAlign: "left" }}>{["模板名称","平台","动作","话术预览","状态","更新时间","操作"].map((title) => <th key={title} style={tableHead}>{title}</th>)}</tr></thead>
                <tbody>{items.map((item) => <tr key={item.id}>
                  <td style={tableCell}><strong>{item.name}</strong></td>
                  <td style={tableCell}>{item.platform}</td>
                  <td style={tableCell}>{item.action === "MESSAGE" ? "Message" : item.action}</td>
                  <td style={{ ...tableCell, maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={item.content}>{item.content}</td>
                  <td style={tableCell}><span style={{ color: item.enabled ? "#16804a" : "#8b95a5" }}>{item.enabled ? "已启用" : "已停用"}</span></td>
                  <td style={tableCell}>{new Date(item.updatedAt).toLocaleString("zh-CN", { hour12: false })}</td>
                  <td style={tableCell}><div style={{ display: "flex", gap: 8, whiteSpace: "nowrap" }}>
                    <button type="button" onClick={() => openEdit(item)} style={textButton}>编辑</button>
                    <button type="button" disabled={busy} onClick={() => void toggle(item)} style={textButton}>{item.enabled ? <ToggleRight size={15}/> : <ToggleLeft size={15}/>} {item.enabled ? "停用" : "启用"}</button>
                    
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>}
        </section>
      </div>
    </main></div>
  );
}

const primaryButton = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, border: 0, borderRadius: 7, padding: "9px 14px", background: "#2864ed", color: "#fff", cursor: "pointer", fontSize: 13 } as const;
const secondaryButton = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1px solid #d9e1ec", borderRadius: 7, padding: "9px 14px", background: "#fff", color: "#344054", cursor: "pointer", fontSize: 13 } as const;
const fieldLabel = { display: "flex", flexDirection: "column" as const, gap: 7, color: "#344054", fontSize: 13, fontWeight: 600 } as const;
const fieldInput = { width: "100%", boxSizing: "border-box" as const, border: "1px solid #d9e1ec", borderRadius: 7, padding: "10px 11px", color: "#172033", background: "#fff", font: "inherit", fontWeight: 400 } as const;
const tableHead = { padding: "12px 14px", color: "#667085", fontSize: 12, fontWeight: 600, borderBottom: "1px solid #edf0f5" } as const;
const tableCell = { padding: "13px 14px", borderBottom: "1px solid #edf0f5", fontSize: 13, color: "#344054" } as const;
const textButton = { display: "inline-flex", alignItems: "center", gap: 4, border: 0, background: "transparent", color: "#2864ed", cursor: "pointer", fontSize: 12, padding: 0 } as const;
