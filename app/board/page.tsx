"use client";
// 汇办 Huiban · 看板 / 表格双视图（界面语言跟随当前模板 lang）
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/i18n";
import TemplateEditor from "@/components/TemplateEditor";
import InboxDrawer from "@/components/InboxDrawer";
import MembersModal from "@/components/MembersModal";

type Template = { id: string; name: string; lang: string; statuses: string[]; categories: string[] };
type Task = {
  id: string; template_id: string; title: string; description: string;
  status_index: number; priority: string; due_date: string | null;
  source: string; category: string; handler_id: string | null; publisher_id: string | null; fresh: boolean;
};
type Workspace = { id: string; name: string };

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
const SOURCES = ["all", "mail", "excel", "manual"] as const;

export default function BoardPage() {
  const [userId, setUserId] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [view, setView] = useState<"board" | "table">("board");
  const [sort, setSort] = useState<{ key: string; dir: number }>({ key: "", dir: 1 });
  const [modal, setModal] = useState<null | { mode: "create" | "edit"; taskId?: string }>(null);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { location.href = "/login"; return; }
      setUserId(data.user.id);
      const { data: ws, error: wsErr } = await supabase.from("workspaces").select("id, name");
      if (wsErr) { setLoadError(wsErr.message); setReady(true); return; }
      const saved = typeof window !== "undefined" ? (localStorage.getItem("huiban.workspace") || "") : "";
      if (ws?.length) { setWorkspaces(ws); setWorkspaceId(saved || ws[0].id); }
      setReady(true);
    })();
  }, []);

  const loadTemplates = useCallback(async () => {
    if (!workspaceId) return;
    const { data } = await supabase.from("templates").select("id, name, lang, statuses, categories").eq("workspace_id", workspaceId);
    setTemplates(data || []);
    if (data?.length) setTemplateId((prev) => (prev && data.some((t) => t.id === prev) ? prev : data[0].id));
  }, [workspaceId]);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const loadTasks = useCallback(async () => {
    if (!workspaceId) return;
    const { data } = await supabase.from("tasks").select("*").eq("workspace_id", workspaceId);
    setTasks(data || []);
  }, [workspaceId]);
  useEffect(() => {
    loadTasks();
    if (!workspaceId) return;
    const ch = supabase.channel(`board-${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${workspaceId}` }, loadTasks)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, loadTasks]);

  const loadMembers = useCallback(async () => {
    if (!workspaceId) return;
    const r = await fetch(`/api/workspaces/${workspaceId}/members`).then((x) => x.json());
    setMembers(Object.fromEntries((r.members || []).map((m: any) => [m.id, m.name])));
  }, [workspaceId]);
  useEffect(() => { loadMembers(); }, [loadMembers]);

  const template = templates.find((t) => t.id === templateId);
  const lang: Lang = template?.lang === "en" ? "en" : "zh";
  const statuses = template?.statuses || [];
  const categories = template?.categories || [];
  const handlerName = (id: string | null) => (id ? (members[id] || "…") : t(lang, "unassigned"));

  const visibleTasks = useMemo(() => tasks.filter((t) => {
    if (t.template_id !== templateId) return false;
    if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (query && !t.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [tasks, templateId, sourceFilter, categoryFilter, query]);

  const sortedTasks = useMemo(() => {
    if (!sort.key) return visibleTasks;
    const dir = sort.dir;
    return [...visibleTasks].sort((a, b) => {
      if (sort.key === "title") return dir * a.title.localeCompare(b.title, "zh");
      if (sort.key === "priority") return dir * ((PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
      if (sort.key === "status") return dir * (a.status_index - b.status_index);
      if (sort.key === "due") return dir * ((a.due_date || "9999").localeCompare(b.due_date || "9999"));
      return 0;
    });
  }, [visibleTasks, sort]);

  function toggleSort(key: string) { setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 })); }
  function arrow(key: string) { return sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""; }

  async function changeStatus(taskId: string, statusIndex: number) {
    await fetch(`/api/tasks/${taskId}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_index: statusIndex, actor_id: userId }) });
    loadTasks();
  }

  function openEdit(task: Task) {
    if (task.fresh) fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fresh: false }) });
    setModal({ mode: "edit", taskId: task.id });
  }

  if (!ready) return <p style={{ padding: 24 }}>{t(lang, "loading")}</p>;
  if (loadError) return <p style={{ padding: 24, color: "#dc2626" }}>{t(lang, "loadError")}{loadError}</p>;
  if (!workspaces.length) return <p style={{ padding: 24 }}><a href="/onboarding">{t(lang, "firstWorkspace")}</a></p>;

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} style={selStyle}>
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={selStyle}>
          {templates.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
        <button onClick={() => setEditingTemplate(true)} style={btnSecondary}>{t(lang, "editTemplate")}</button>
        <button onClick={() => setInboxOpen(true)} style={btnSecondary}>{t(lang, "inbox")}</button>
        <button onClick={() => setMembersOpen(true)} style={btnSecondary}>{t(lang, "members")}</button>

        <div style={{ display: "flex", gap: 2, background: "#eee", borderRadius: 8, padding: 2 }}>
          {(["board", "table"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ ...viewBtn, ...(view === v ? { background: "#fff", color: "#111" } : {}) }}>{t(lang, v)}</button>
          ))}
        </div>

        <input placeholder={t(lang, "search")} value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...selStyle, minWidth: 140 }} />

        <div style={{ display: "flex", gap: 6 }}>
          {SOURCES.map((s) => (
            <button key={s} onClick={() => setSourceFilter(s)} style={{ ...chip, ...(sourceFilter === s ? chipOn : {}) }}>{t(lang, s)}</button>
          ))}
        </div>
        {categories.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setCategoryFilter("all")} style={{ ...chip, ...(categoryFilter === "all" ? chipOn : {}) }}>{t(lang, "allType")}</button>
            {categories.map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)} style={{ ...chip, ...(categoryFilter === c ? chipOn : {}) }}>{c}</button>
            ))}
          </div>
        )}

        <button onClick={() => setModal({ mode: "create" })} style={{ ...btnPrimary, marginLeft: "auto" }}>{t(lang, "newTask")}</button>
      </div>

      {view === "board" ? (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", alignItems: "flex-start" }}>
          {statuses.map((status, i) => {
            const col = visibleTasks.filter((t) => t.status_index === i);
            return (
              <section key={i} style={{ minWidth: 240, border: "1px solid #e5e5e5", borderRadius: 12, padding: 12, background: "#fff" }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>{status} <small style={{ color: "#999" }}>{col.length}</small></h3>
                {col.map((task) => (
                  <div key={task.id} onClick={() => openEdit(task)} style={{ border: "1px solid #e5e5e5", borderRadius: 8, padding: 10, marginBottom: 8, background: "#fafafa", cursor: "pointer", position: "relative" }}>
                    {task.fresh && <span style={{ position: "absolute", top: 6, right: 6, background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "1px 6px" }}>NEW</span>}
                    <b style={{ fontSize: 14 }}>{task.title}</b>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{t(lang, task.priority)} · {t(lang, task.source)}</div>
                    <div style={{ fontSize: 12, color: "#333", marginTop: 4 }}>{t(lang, "handler")}：{handlerName(task.handler_id)}</div>
                  </div>
                ))}
                {col.length === 0 && <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: "20px 0" }}>{t(lang, "noTasks")}</div>}
              </section>
            );
          })}
        </div>
      ) : (
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, background: "#fff", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14, minWidth: 860 }}>
            <thead>
              <tr>
                <th style={th} onClick={() => toggleSort("title")}>{t(lang, "title")}{arrow("title")}</th>
                <th style={th} onClick={() => toggleSort("priority")}>{t(lang, "priority")}{arrow("priority")}</th>
                <th style={th}>{t(lang, "type")}</th>
                <th style={th}>{t(lang, "handler")}</th>
                <th style={th} onClick={() => toggleSort("status")}>{t(lang, "status")}{arrow("status")}</th>
                <th style={th} onClick={() => toggleSort("due")}>{t(lang, "due")}{arrow("due")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((task) => (
                <tr key={task.id} style={{ borderBottom: "1px solid #f0f0f0", cursor: "pointer" }} onClick={() => openEdit(task)}>
                  <td style={td}><b>{task.title}</b>{task.fresh ? <span style={newPill}>NEW</span> : null}</td>
                  <td style={td}>{t(lang, task.priority)}</td>
                  <td style={td}>{task.category || "—"}</td>
                  <td style={td}>{handlerName(task.handler_id)}</td>
                  <td style={td} onClick={(e) => e.stopPropagation()}>
                    <select value={task.status_index} onChange={(e) => changeStatus(task.id, Number(e.target.value))} style={{ ...selStyle, padding: "4px 8px" }}>
                      {statuses.map((s, i) => <option key={i} value={i}>{s}</option>)}
                    </select>
                  </td>
                  <td style={td}>{task.due_date || "—"}</td>
                </tr>
              ))}
              {sortedTasks.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#aaa", padding: "30px 0" }}>{t(lang, "noMatch")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <TaskModal
          mode={modal.mode}
          task={modal.taskId ? tasks.find((t) => t.id === modal.taskId) || null : null}
          template={template}
          lang={lang}
          userId={userId}
          workspaceId={workspaceId}
          onClose={() => setModal(null)}
          onChanged={loadTasks}
        />
      )}
      {editingTemplate && templateId && (
        <TemplateEditor templateId={templateId} workspaceId={workspaceId} lang={lang} onClose={() => setEditingTemplate(false)} onSaved={() => { setEditingTemplate(false); loadTemplates(); loadTasks(); }} />
      )}
      {inboxOpen && (
        <InboxDrawer workspaceId={workspaceId} userId={userId} templateId={templateId} lang={lang} tasks={tasks} templates={templates} onClose={() => setInboxOpen(false)} onChanged={loadTasks} />
      )}
      {membersOpen && (
        <MembersModal workspaceId={workspaceId} userId={userId} lang={lang} onClose={() => setMembersOpen(false)} onChanged={loadMembers} />
      )}
    </main>
  );
}

function TaskModal({ mode, task, template, lang, userId, workspaceId, onClose, onChanged }: {
  mode: "create" | "edit"; task: Task | null; template: Template | undefined; lang: Lang; userId: string; workspaceId: string; onClose: () => void; onChanged: () => void;
}) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [priority, setPriority] = useState(task?.priority || "normal");
  const [category, setCategory] = useState(task?.category || template?.categories?.[0] || "");
  const [due, setDue] = useState(task?.due_date || "");
  const [statusIndex, setStatusIndex] = useState(task?.status_index ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const statuses = template?.statuses || [];

  async function save() {
    if (!title.trim()) { setError(t(lang, "titleRequired")); return; }
    setError(""); setSaving(true);
    if (mode === "create") {
      const r = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: workspaceId, template_id: template?.id, title, description, priority, category, due_date: due || null, publisher_id: userId }) });
      if (!r.ok) { setError("ERR"); setSaving(false); return; }
    } else if (task) {
      const r = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description, priority, category, due_date: due || null }) });
      if (!r.ok) { setError("ERR"); setSaving(false); return; }
      if (statusIndex !== task.status_index) await fetch(`/api/tasks/${task.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_index: statusIndex, actor_id: userId }) });
    }
    setSaving(false); onChanged(); onClose();
  }

  async function del() {
    if (!task) return;
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onChanged(); onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 50 }} onClick={onClose}>
      <div style={{ width: 520, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 16, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{mode === "create" ? t(lang, "newTaskTitle") : t(lang, "taskDetail")}</h2>

        {statuses.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {statuses.map((s, i) => (
              <button key={i} onClick={() => setStatusIndex(i)} style={{ ...chip, ...(i === statusIndex ? { background: "#2f6feb", color: "#fff", borderColor: "#2f6feb" } : {}) }}>{s}</button>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          <label style={labelStyle}>{t(lang, "title")}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(lang, "search")} style={inputStyle} /></label>
          <label style={labelStyle}>{t(lang, "desc")}<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={inputStyle} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>{t(lang, "priority")}
              <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
                <option value="urgent">{t(lang, "urgent")}</option><option value="high">{t(lang, "high")}</option><option value="normal">{t(lang, "normal")}</option>
              </select>
            </label>
            <label style={labelStyle}>{t(lang, "type")}
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                {(template?.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label style={labelStyle}>{t(lang, "dueDate")}<input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inputStyle} /></label>
          {error && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          {mode === "edit" && <button onClick={del} style={{ ...btnSecondary, color: "#dc2626" }}>{t(lang, "del")}</button>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <button onClick={onClose} style={btnSecondary}>{t(lang, "cancel")}</button>
            <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? t(lang, "saving") : t(lang, "save")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const selStyle: CSSProperties = { padding: "8px 10px", border: "1px solid #e5e5e5", borderRadius: 8, fontSize: 14, background: "#fff" };
const chip: CSSProperties = { padding: "6px 12px", borderRadius: 999, border: "1px solid #e5e5e5", background: "#fff", fontSize: 13, cursor: "pointer" };
const chipOn: CSSProperties = { background: "#111", color: "#fff", borderColor: "#111" };
const viewBtn: CSSProperties = { padding: "6px 14px", borderRadius: 6, border: "none", background: "transparent", color: "#888", fontSize: 14, cursor: "pointer" };
const btnPrimary: CSSProperties = { padding: "9px 16px", background: "#2f6feb", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" };
const btnSecondary: CSSProperties = { padding: "9px 16px", background: "#fff", color: "#111", border: "1px solid #e5e5e5", borderRadius: 8, fontSize: 14, cursor: "pointer" };
const labelStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 13, color: "#333" };
const inputStyle: CSSProperties = { padding: "8px 10px", border: "1px solid #e5e5e5", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" };
const th: CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e5e5e5", fontSize: 13, color: "#666", cursor: "pointer", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "10px 12px", fontSize: 14, borderBottom: "1px solid #f0f0f0" };
const newPill: CSSProperties = { background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "1px 6px", marginLeft: 6 };
