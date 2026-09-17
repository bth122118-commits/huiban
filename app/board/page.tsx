"use client";
// 汇办 Huiban · 看板 / 表格双视图（界面语言跟随当前模板 lang）
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import TemplateEditor from "@/components/TemplateEditor";
import InboxDrawer from "@/components/InboxDrawer";
import MembersModal from "@/components/MembersModal";
import ExcelImportModal from "@/components/ExcelImportModal";

type Template = { id: string; name: string; lang: string; statuses: string[]; categories: string[] };
type Task = {
  id: string; template_id: string; title: string; description: string;
  status_index: number; priority: string; due_date: string | null;
  source: string; category: string; handler_id: string | null; handler_name: string | null; publisher_id: string | null; fresh: boolean;
};
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
const SOURCES = ["all", "mail", "excel", "manual"] as const;

export default function BoardPage() {
  const [userId, setUserId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
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
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { location.href = "/login"; return; }
      setUserId(data.user.id);
      // 一人一个工作台：取「我」owner 的工作台（联机协作进别人的工作台时再扩展）
      const { data: ms, error: msErr } = await supabase.from("memberships").select("workspace_id, role").eq("user_id", data.user.id);
      if (msErr) { setLoadError(msErr.message); setReady(true); return; }
      const mine = (ms || []).find((m) => m.role === "owner") || (ms || [])[0];
      if (!mine) { setReady(true); return; }
      const { data: ws } = await supabase.from("workspaces").select("id, name").eq("id", mine.workspace_id).maybeSingle();
      if (ws) {
        setWorkspaceId(ws.id);
        setWorkspaceName(ws.name);
        localStorage.setItem("huiban.workspace", ws.id);
      }
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
    const r = await apiFetch(`/api/workspaces/${workspaceId}/members`).then((x) => x.json());
    setMembers(Object.fromEntries((r.members || []).map((m: any) => [m.id, m.name])));
  }, [workspaceId]);
  useEffect(() => { loadMembers(); }, [loadMembers]);

  const template = templates.find((t) => t.id === templateId);
  const lang: Lang = template?.lang === "en" ? "en" : "zh";
  const statuses = template?.statuses || [];
  const categories = template?.categories || [];
  const handlerLabel = (task: Task) => task.handler_id ? (members[task.handler_id] || "…") : (task.handler_name || t(lang, "unassigned"));

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
    await apiFetch(`/api/tasks/${taskId}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_index: statusIndex, actor_id: userId }) });
    loadTasks();
  }

  function openEdit(task: Task) {
    if (task.fresh) apiFetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fresh: false }) });
    setModal({ mode: "edit", taskId: task.id });
  }

  if (!ready) return <p className="page-state">{t(lang, "loading")}</p>;
  if (loadError) return <p className="page-state" style={{ color: "var(--danger)" }}>{t(lang, "loadError")}{loadError}</p>;
  if (!workspaceId) return <p className="page-state"><a href="/onboarding">{t(lang, "firstWorkspace")}</a></p>;

  return (
    <main className="board-shell">
      <div className="toolbar">
        <span className="toolbar-title">{workspaceName}</span>
        <select className="select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={() => setEditingTemplate(true)}>{t(lang, "editTemplate")}</button>
        <button className="btn btn-secondary" onClick={() => setInboxOpen(true)}>{t(lang, "inbox")}</button>
        <button className="btn btn-secondary" onClick={() => setMembersOpen(true)}>{t(lang, "members")}</button>
        <button className="btn btn-secondary" onClick={() => setImportOpen(true)}>{t(lang, "importExcel")}</button>

        <div className="seg">
          {(["board", "table"] as const).map((v) => (
            <button key={v} className="seg-btn" data-on={view === v} onClick={() => setView(v)}>{t(lang, v)}</button>
          ))}
        </div>

        <input className="input" style={{ minWidth: 140, width: "auto" }} placeholder={t(lang, "search")} value={query} onChange={(e) => setQuery(e.target.value)} />

        <div style={{ display: "flex", gap: 6 }}>
          {SOURCES.map((s) => (
            <button key={s} className="chip" data-on={sourceFilter === s} onClick={() => setSourceFilter(s)}>{t(lang, s)}</button>
          ))}
        </div>
        {categories.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="chip" data-on={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>{t(lang, "allType")}</button>
            {categories.map((c) => (
              <button key={c} className="chip" data-on={categoryFilter === c} onClick={() => setCategoryFilter(c)}>{c}</button>
            ))}
          </div>
        )}

        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setModal({ mode: "create" })}>{t(lang, "newTask")}</button>
      </div>

      {view === "board" ? (
        <div className="board">
          {statuses.map((status, i) => {
            const col = visibleTasks.filter((t) => t.status_index === i);
            return (
              <section key={i} className="column">
                <h3 className="col-head"><span className="col-name">{status}</span><span className="col-count">{col.length}</span></h3>
                {col.map((task) => (
                  <div key={task.id} className="card" onClick={() => openEdit(task)}>
                    {task.fresh && <span className="badge-new">NEW</span>}
                    <span className="card-title">{task.title}</span>
                    <div className="card-meta">{t(lang, task.priority)} · {t(lang, task.source)}</div>
                    <div className="card-handler">{t(lang, "handler")}：{handlerLabel(task)}</div>
                  </div>
                ))}
                {col.length === 0 && <div className="col-empty">{t(lang, "noTasks")}</div>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th onClick={() => toggleSort("title")}>{t(lang, "title")}{arrow("title")}</th>
                <th onClick={() => toggleSort("priority")}>{t(lang, "priority")}{arrow("priority")}</th>
                <th>{t(lang, "type")}</th>
                <th>{t(lang, "handler")}</th>
                <th onClick={() => toggleSort("status")}>{t(lang, "status")}{arrow("status")}</th>
                <th onClick={() => toggleSort("due")}>{t(lang, "due")}{arrow("due")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((task) => (
                <tr key={task.id} onClick={() => openEdit(task)}>
                  <td><b>{task.title}</b>{task.fresh ? <span className="pill-new">NEW</span> : null}</td>
                  <td>{t(lang, task.priority)}</td>
                  <td>{task.category || "—"}</td>
                  <td>{handlerLabel(task)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select className="select" style={{ padding: "4px 8px" }} value={task.status_index} onChange={(e) => changeStatus(task.id, Number(e.target.value))}>
                      {statuses.map((s, i) => <option key={i} value={i}>{s}</option>)}
                    </select>
                  </td>
                  <td>{task.due_date || "—"}</td>
                </tr>
              ))}
              {sortedTasks.length === 0 && <tr><td className="empty" colSpan={6}>{t(lang, "noMatch")}</td></tr>}
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
      {importOpen && (
        <ExcelImportModal workspaceId={workspaceId} templateId={templateId} lang={lang} members={members} onClose={() => setImportOpen(false)} onChanged={loadTasks} />
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
      const r = await apiFetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: workspaceId, template_id: template?.id, title, description, priority, category, due_date: due || null, publisher_id: userId }) });
      if (!r.ok) { setError("ERR"); setSaving(false); return; }
    } else if (task) {
      const r = await apiFetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description, priority, category, due_date: due || null }) });
      if (!r.ok) { setError("ERR"); setSaving(false); return; }
      if (statusIndex !== task.status_index) await apiFetch(`/api/tasks/${task.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_index: statusIndex, actor_id: userId }) });
    }
    setSaving(false); onChanged(); onClose();
  }

  async function del() {
    if (!task) return;
    await apiFetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onChanged(); onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{mode === "create" ? t(lang, "newTaskTitle") : t(lang, "taskDetail")}</h2>

        {statuses.length > 1 && (
          <div className="status-picker">
            {statuses.map((s, i) => (
              <button key={i} className="step" data-on={i === statusIndex} onClick={() => setStatusIndex(i)}>{s}</button>
            ))}
          </div>
        )}

        <div className="form-grid">
          <label className="field">
            <span className="field-label">{t(lang, "title")}</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(lang, "search")} />
          </label>
          <label className="field">
            <span className="field-label">{t(lang, "desc")}</span>
            <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
          <div className="form-2col">
            <label className="field">
              <span className="field-label">{t(lang, "priority")}</span>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="urgent">{t(lang, "urgent")}</option><option value="high">{t(lang, "high")}</option><option value="normal">{t(lang, "normal")}</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t(lang, "type")}</span>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {(template?.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="field-label">{t(lang, "dueDate")}</span>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          {error && <p className="error-text">{error}</p>}
        </div>

        <div className="modal-actions">
          {mode === "edit" && <button className="btn btn-danger" onClick={del}>{t(lang, "del")}</button>}
          <div className="spacer">
            <button className="btn btn-secondary" onClick={onClose}>{t(lang, "cancel")}</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? t(lang, "saving") : t(lang, "save")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
