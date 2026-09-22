"use client";
// 收件箱：待确认草稿（邮件建任务）+ 回复识别（自动更新状态）
import { useCallback, useEffect, useState } from "react";
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
  const [connected, setConnected] = useState(false);
  const [boundEmail, setBoundEmail] = useState("");
  const [connecting, setConnecting] = useState(false);
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
      const a = r.account;
      setBoundEmail(a?.email || "");
      setConnected(!!(a?.provider_account_id || a?.connection));
    }).catch(() => {});
  }, [workspaceId]);

  async function connect() {
    setEmailMsg(""); setConnecting(true);
    const r = await apiFetch(`/api/workspaces/${workspaceId}/email/connect`, { method: "POST" });
    setConnecting(false);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) window.location.href = j.url;
    else { setEmailMsg(j.error || t(lang, "saveFailed")); setEmailErr(true); }
  }

  async function disconnect() {
    setEmailMsg(""); setEmailErr(false);
    const r = await apiFetch(`/api/workspaces/${workspaceId}/email`, { method: "DELETE" });
    if (r.ok) { setConnected(false); setBoundEmail(""); }
    else { setEmailMsg(t(lang, "saveFailed")); setEmailErr(true); }
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
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <span className="drawer-title">{t(lang, "inboxTitle")}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btn-secondary" onClick={simulate}>{t(lang, "simEmail")}</button>
            <button className="drawer-close" onClick={onClose} aria-label="close">×</button>
          </div>
        </header>

        <section className="email-section">
          <span className="field-label">{t(lang, "inboundEmail")}</span>
          {connected ? (
            <>
              <p style={{ fontSize: 13, margin: "6px 0 0" }}>{t(lang, "connectedEmail")}{boundEmail ? `：${boundEmail}` : ""}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={disconnect}>{t(lang, "disconnect")}</button>
              </div>
            </>
          ) : (
            <>
              <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={connect} disabled={connecting}>{connecting ? t(lang, "loading") : t(lang, "connectEmail")}</button>
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0" }}>{t(lang, "connectEmailHelp")}</p>
            </>
          )}
          {emailMsg && <p className={emailErr ? "error-text" : "success-text"} style={{ margin: "6px 0 0", fontSize: 12 }}>{emailMsg}</p>}
        </section>

        <div className="drawer-body">
          {loading ? <p style={{ color: "var(--muted)" }}>{t(lang, "loading")}</p> : (
            <>
              <div>
                <p className="section-label">{t(lang, "pendingCreate")}</p>
                {drafts.length === 0 && <p className="empty">{t(lang, "noPending")}</p>}
                {drafts.map((d) => (
                  <div key={d.id} className="draft">
                    <div className="draft-meta">{d.from_email} · {t(lang, "hit")}「{d.matched_keyword}」</div>
                    <div className="draft-subject">{d.subject}</div>
                    <div className="draft-actions">
                      <button className="btn btn-secondary" onClick={() => act(d.id, "ignore")}>{t(lang, "ignore")}</button>
                      <button className="btn btn-primary" onClick={() => act(d.id, "apply")}>{t(lang, "confirm")}</button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <p className="section-label">{t(lang, "replyUpdate")}</p>
                {replies.length === 0 && <p className="empty">{t(lang, "noReplies")}</p>}
                {replies.map((r) => {
                  const ref = tasks.find((t) => t.id === r.ref_task_id);
                  const tpl = templates.find((t) => t.id === r.template_id);
                  const statusName = tpl?.statuses?.[r.target_status_index ?? 0] || "?";
                  return (
                    <div key={r.id} className="draft">
                      <div className="draft-meta">{r.from_email} · {t(lang, "hit")}「{r.matched_keyword}」</div>
                      <div className="draft-subject">{r.subject}</div>
                      <div className="draft-update">{t(lang, "updateTask")}「{ref?.title || t(lang, "deleted")}」 → <b>{statusName}</b></div>
                      <div className="draft-actions">
                        <button className="btn btn-secondary" onClick={() => act(r.id, "ignore")}>{t(lang, "ignore")}</button>
                        <button className="btn btn-primary" onClick={() => act(r.id, "apply")}>{t(lang, "apply")}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
