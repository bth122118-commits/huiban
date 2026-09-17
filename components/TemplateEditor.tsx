"use client";
// 编辑模板：状态流水线 + 类型×处理者矩阵 + 接受/回复关键词
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";

type Member = { id: string; name: string };

export default function TemplateEditor({ templateId, workspaceId, lang, onClose, onSaved }: {
  templateId: string; workspaceId: string; lang: Lang; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [replyKeywords, setReplyKeywords] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [kwInput, setKwInput] = useState("");
  const [rkwInput, setRkwInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: tpl } = await supabase.from("templates").select("*").eq("id", templateId).single();
      const m = await apiFetch(`/api/workspaces/${workspaceId}/members`).then((r) => r.json());
      setMembers(m.members || []);
      if (tpl) {
        setName(tpl.name);
        const st: string[] = tpl.statuses || [];
        const ct: string[] = tpl.categories || [];
        setStatuses(st);
        setCategories(ct);
        const hm: (string | null)[][] = tpl.handler_matrix || [];
        setMatrix(ct.map((_, ci) => st.map((_, si) => hm[ci]?.[si] || "")));
        setKeywords(tpl.keywords || []);
        setReplyKeywords(tpl.reply_keywords || []);
      }
      setLoading(false);
    })();
  }, [templateId, workspaceId]);

  function addStatus() { setStatuses((s) => [...s, t(lang, "newStatus")]); setMatrix((m) => m.map((r) => [...r, ""])); }
  function delStatus(i: number) { setStatuses((s) => s.filter((_, x) => x !== i)); setMatrix((m) => m.map((r) => r.filter((_, x) => x !== i))); }
  function moveStatus(i: number, d: number) {
    setStatuses((s) => { const a = [...s]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a; });
    setMatrix((m) => m.map((r) => { const a = [...r]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a; }));
  }
  function addCategory() { setCategories((c) => [...c, t(lang, "newType")]); setMatrix((m) => [...m, statuses.map(() => "")]); }
  function delCategory(i: number) { setCategories((c) => c.filter((_, x) => x !== i)); setMatrix((m) => m.filter((_, x) => x !== i)); }
  function setCell(ci: number, si: number, v: string) { setMatrix((m) => m.map((r, ri) => (ri === ci ? r.map((c, ci2) => (ci2 === si ? v : c)) : r))); }
  function cellDisplay(v: string): string {
    if (!v) return "";
    if (v.startsWith("ext:")) return v.slice(4);
    const m = members.find((mm) => mm.id === v);
    return m ? m.name : v;
  }
  function cellEncode(name: string): string {
    const n = name.trim();
    if (!n) return "";
    const m = members.find((mm) => mm.name === n);
    return m ? m.id : `ext:${n}`;
  }

  async function save() {
    if (!name.trim()) return;
    const st = statuses.map((s) => s.trim()).filter(Boolean);
    const ct = categories.map((c) => c.trim()).filter(Boolean);
    const hm = ct.map((_, ci) => st.map((_, si) => matrix[ci]?.[si] || null));
    setSaving(true);
    await apiFetch(`/api/templates/${templateId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), statuses: st, categories: ct, handler_matrix: hm, keywords, reply_keywords: replyKeywords }),
    });
    setSaving(false);
    onSaved();
  }

  if (loading) return <Overlay><p>{t(lang, "loading")}</p></Overlay>;

  return (
    <Overlay onClick={onClose}>
      <div className="modal" style={{ width: 680 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{t(lang, "editTemplateTitle")}</h2>

        <label className="field">
          <span className="field-label">{t(lang, "templateName")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div style={{ marginTop: 20 }}>
          <p className="section-title">{t(lang, "statusPipeline")}</p>
          {statuses.map((s, i) => (
            <div key={i} className="status-row">
              <input className="input" style={{ flex: 1 }} value={s} onChange={(e) => setStatuses((x) => x.map((v, xi) => (xi === i ? e.target.value : v)))} />
              <button className="mini-btn" onClick={() => moveStatus(i, -1)} disabled={i === 0} aria-label="up">↑</button>
              <button className="mini-btn" onClick={() => moveStatus(i, 1)} disabled={i === statuses.length - 1} aria-label="down">↓</button>
              <button className="mini-btn danger" onClick={() => delStatus(i)} aria-label="delete">×</button>
            </div>
          ))}
          <button className="small-btn" onClick={addStatus}>{t(lang, "addStatus")}</button>
        </div>

        <div style={{ marginTop: 20 }}>
          <p className="section-title">{t(lang, "handlerMatrix")}</p>
          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th>{t(lang, "type")}</th>
                  {statuses.map((s, i) => <th key={i}>{s}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c, ci) => (
                  <tr key={ci}>
                    <td><input className="input" style={{ minWidth: 90 }} value={c} onChange={(e) => setCategories((x) => x.map((v, xi) => (xi === ci ? e.target.value : v)))} /></td>
                    {statuses.map((_, si) => (
                      <td key={si}>
                        <input
                          className="input"
                          style={{ minWidth: 110 }}
                          list="handler-options"
                          value={cellDisplay(matrix[ci]?.[si] || "")}
                          onChange={(e) => setCell(ci, si, cellEncode(e.target.value))}
                          placeholder={t(lang, "unassigned")}
                        />
                      </td>
                    ))}
                    <td><button className="mini-btn danger" onClick={() => delCategory(ci)} aria-label="delete">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="handler-options">
              {members.map((mm) => <option key={mm.id} value={mm.name} />)}
            </datalist>
          </div>
          <button className="small-btn" onClick={addCategory}>{t(lang, "addType")}</button>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>{t(lang, "handlerHint")}</p>
        </div>

        <KeywordEditor label={t(lang, "acceptKw")} lang={lang} items={keywords} setItems={setKeywords} input={kwInput} setInput={setKwInput} />
        <KeywordEditor label={t(lang, "replyKw")} lang={lang} items={replyKeywords} setItems={setReplyKeywords} input={rkwInput} setInput={setRkwInput} />

        <div className="modal-actions">
          <div className="spacer">
            <button className="btn btn-secondary" onClick={onClose}>{t(lang, "cancel")}</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? t(lang, "saving") : t(lang, "saveTemplate")}</button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function KeywordEditor({ label, lang, items, setItems, input, setInput }: {
  label: string; lang: Lang; items: string[]; setItems: (v: string[]) => void; input: string; setInput: (v: string) => void;
}) {
  function add() { if (input.trim() && !items.includes(input.trim())) setItems([...items, input.trim()]); setInput(""); }
  return (
    <div className="kw-editor">
      <p className="section-title">{label}</p>
      <div className="kw-list">
        {items.map((k, i) => (
          <span key={i} className="kw-chip">
            {k} <button className="kw-remove" onClick={() => setItems(items.filter((_, x) => x !== i))} aria-label="remove">×</button>
          </span>
        ))}
        {items.length === 0 && <span style={{ color: "var(--muted)", fontSize: 13 }}>{t(lang, "noKw")}</span>}
      </div>
      <input className="input" style={{ maxWidth: 320 }} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={t(lang, "kwPlaceholder")} />
    </div>
  );
}

function Overlay({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <div className="modal-overlay" style={{ zIndex: 60 }} onClick={onClick}>{children}</div>;
}
