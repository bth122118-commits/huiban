"use client";
// 收件箱：待确认草稿（邮件建任务）+ 回复识别（自动更新状态）
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";

type Draft = {
  id: string; kind: string; from_email: string; subject: string; matched_keyword: string;
  ref_task_id: string | null; target_status_index: number | null; template_id: string | null;
};
type Task = { id: string; title: string };
type Template = { id: string; statuses: string[] };

export default function InboxDrawer({ workspaceId, userId, templateId, lang, tasks, templates, onClose, onChanged }: {
  workspaceId: string; userId: string; templateId: string; lang: Lang; tasks: Task[]; templates: Template[]; onClose: () => void; onChanged: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [replies, setReplies] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [boundEmail, setBoundEmail] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [emailErr, setEmailErr] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/inbox?workspace_id=${workspaceId}`).then((x) => x.json());
    setDrafts(r.drafts || []);
    setReplies(r.replies || []);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch(`/api/workspaces/${workspaceId}/email`).then((x) => x.json()).then((r) => {
      const v = r.account?.email || "";
      setBoundEmail(v); setEmailInput(v);
    }).catch(() => {});
  }, [workspaceId]);

  async function saveEmail() {
    const v = emailInput.trim();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setEmailMsg(t(lang, "invalidEmail")); setEmailErr(true); return; }
    setSavingEmail(true); setEmailMsg("");
    const r = await apiFetch(`/api/workspaces/${workspaceId}/email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: v }) });
    setSavingEmail(false);
    if (r.ok) { setBoundEmail(v); setEmailMsg(t(lang, "saved")); setEmailErr(false); }
    else { const j = await r.json().catch(() => ({})); setEmailMsg(j.error || t(lang, "saveFailed")); setEmailErr(true); }
  }

  async function act(id: string, action: "apply" | "ignore") {
    await apiFetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, publisher_id: userId }) });
    onChanged();
    load();
  }

  async function simulate() {
    await supabase.from("inbox_items").insert({
      workspace_id: workspaceId, template_id: templateId, kind: "create",
      from_email: "test@example.com", subject: "测试邮件：命中关键词",
      body: "这是一封模拟的命中接受关键词的邮件。", matched_keyword: "测试", status: "pending",
    });
    load();
  }

  return (
    <>
      <div style={overlayStyle} onClick={onClose} />
      <aside style={drawerStyle}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "16px 20px", borderBottom: "1px solid #e5e5e5" }}>
          <b>{t(lang, "inboxTitle")}</b>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={simulate} style={secondary}>{t(lang, "simEmail")}</button>
            <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#666" }}>×</button>
          </div>
        </header>

        <section style={{ padding: "12px 16px", borderBottom: "1px solid #e5e5e5", background: "#fafafa" }}>
          <label style={{ fontSize: 12, color: "#666", display: "grid", gap: 6 }}>
            {t(lang, "inboundEmail")}
            <div style={{ display: "flex", gap: 8 }}>
              <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder={t(lang, "inboundEmailPh")} style={inputStyle} />
              <button onClick={saveEmail} disabled={savingEmail} style={primary}>{savingEmail ? t(lang, "saving") : t(lang, "save")}</button>
            </div>
          </label>
          <p style={{ fontSize: 12, color: "#888", margin: "8px 0 0" }}>{t(lang, "inboundEmailHelp")}</p>
          {emailMsg && <p style={{ fontSize: 12, color: emailErr ? "#dc2626" : "#17a34a", margin: "6px 0 0" }}>{emailMsg}</p>}
        </section>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading ? <p style={{ color: "#999" }}>{t(lang, "loading")}</p> : (
            <>
              <p style={sectionTitle}>{t(lang, "pendingCreate")}</p>
              {drafts.length === 0 && <p style={empty}>{t(lang, "noPending")}</p>}
              {drafts.map((d) => (
                <div key={d.id} style={card}>
                  <div style={{ fontSize: 12, color: "#666" }}>{d.from_email} · {t(lang, "hit")}「{d.matched_keyword}」</div>
                  <div style={{ fontWeight: 600, margin: "4px 0", fontSize: 14 }}>{d.subject}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => act(d.id, "ignore")} style={secondary}>{t(lang, "ignore")}</button>
                    <button onClick={() => act(d.id, "apply")} style={primary}>{t(lang, "confirm")}</button>
                  </div>
                </div>
              ))}

              <p style={{ ...sectionTitle, marginTop: 20 }}>{t(lang, "replyUpdate")}</p>
              {replies.length === 0 && <p style={empty}>{t(lang, "noReplies")}</p>}
              {replies.map((r) => {
                const ref = tasks.find((t) => t.id === r.ref_task_id);
                const tpl = templates.find((t) => t.id === r.template_id);
                const statusName = tpl?.statuses?.[r.target_status_index ?? 0] || "?";
                return (
                  <div key={r.id} style={card}>
                    <div style={{ fontSize: 12, color: "#666" }}>{r.from_email} · {t(lang, "hit")}「{r.matched_keyword}」</div>
                    <div style={{ fontWeight: 600, margin: "4px 0", fontSize: 14 }}>{r.subject}</div>
                    <div style={{ fontSize: 13, color: "#333", margin: "4px 0" }}>
                      {t(lang, "updateTask")}「{ref?.title || t(lang, "deleted")}」 → <b>{statusName}</b>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => act(r.id, "ignore")} style={secondary}>{t(lang, "ignore")}</button>
                      <button onClick={() => act(r.id, "apply")} style={primary}>{t(lang, "apply")}</button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

const overlayStyle: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60 };
const drawerStyle: CSSProperties = { position: "fixed", top: 0, right: 0, bottom: 0, width: 400, maxWidth: "92vw", background: "#fff", zIndex: 61, display: "flex", flexDirection: "column", boxShadow: "0 2px 16px rgba(0,0,0,0.15)" };
const sectionTitle: CSSProperties = { fontSize: 12, color: "#888", letterSpacing: 0.5, textTransform: "uppercase" };
const empty: CSSProperties = { color: "#999", fontSize: 13, padding: "8px 0" };
const card: CSSProperties = { border: "1px solid #e5e5e5", borderRadius: 10, padding: 12, marginBottom: 10, background: "#fafafa" };
const primary: CSSProperties = { padding: "6px 12px", background: "#2f6feb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const secondary: CSSProperties = { padding: "6px 12px", background: "#fff", color: "#111", border: "1px solid #e5e5e5", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const inputStyle: CSSProperties = { padding: "8px 10px", border: "1px solid #e5e5e5", borderRadius: 8, fontSize: 14, flex: 1, minWidth: 0 };
