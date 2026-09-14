"use client";
// 编辑模板：状态流水线 + 类型×处理者矩阵 + 接受/回复关键词
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { supabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/i18n";

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
      const m = await fetch(`/api/workspaces/${workspaceId}/members`).then((r) => r.json());
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

  async function save() {
    if (!name.trim()) return;
    const st = statuses.map((s) => s.trim()).filter(Boolean);
    const ct = categories.map((c) => c.trim()).filter(Boolean);
    const hm = ct.map((_, ci) => st.map((_, si) => matrix[ci]?.[si] || null));
    setSaving(true);
    await fetch(`/api/templates/${templateId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), statuses: st, categories: ct, handler_matrix: hm, keywords, reply_keywords: replyKeywords }),
    });
    setSaving(false);
    onSaved();
  }

  if (loading) return <Overlay><p>{t(lang, "loading")}</p></Overlay>;

  return (
    <Overlay onClick={onClose}>
      <div style={{ ...panel, width: 680, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{t(lang, "editTemplateTitle")}</h2>

        <label style={fieldLabel}>{t(lang, "templateName")}
          <input value={name} onChange={(e) => setName(e.target.value)} style={input} />
        </label>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t(lang, "statusPipeline")}</div>
          {statuses.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input value={s} onChange={(e) => setStatuses((x) => x.map((v, xi) => (xi === i ? e.target.value : v)))} style={{ ...input, flex: 1 }} />
              <button onClick={() => moveStatus(i, -1)} disabled={i === 0} style={miniBtn}>↑</button>
              <button onClick={() => moveStatus(i, 1)} disabled={i === statuses.length - 1} style={miniBtn}>↓</button>
              <button onClick={() => delStatus(i)} style={{ ...miniBtn, color: "#dc2626" }}>×</button>
            </div>
          ))}
          <button onClick={addStatus} style={smallBtn}>{t(lang, "addStatus")}</button>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t(lang, "handlerMatrix")}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>{t(lang, "type")}</th>
                  {statuses.map((s, i) => <th key={i} style={th}>{s}</th>)}
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c, ci) => (
                  <tr key={ci}>
                    <td style={td}><input value={c} onChange={(e) => setCategories((x) => x.map((v, xi) => (xi === ci ? e.target.value : v)))} style={{ ...input, minWidth: 90 }} /></td>
                    {statuses.map((_, si) => (
                      <td key={si} style={td}>
                        <select value={matrix[ci]?.[si] || ""} onChange={(e) => setCell(ci, si, e.target.value)} style={{ ...input, minWidth: 100 }}>
                          <option value="">{t(lang, "unassigned")}</option>
                          {members.map((mm) => <option key={mm.id} value={mm.id}>{mm.name}</option>)}
                        </select>
                      </td>
                    ))}
                    <td style={td}><button onClick={() => delCategory(ci)} style={{ ...miniBtn, color: "#dc2626" }}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addCategory} style={smallBtn}>{t(lang, "addType")}</button>
        </div>

        <KeywordEditor label={t(lang, "acceptKw")} lang={lang} items={keywords} setItems={setKeywords} input={kwInput} setInput={setKwInput} />
        <KeywordEditor label={t(lang, "replyKw")} lang={lang} items={replyKeywords} setItems={setReplyKeywords} input={rkwInput} setInput={setRkwInput} />

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <button onClick={onClose} style={secondaryBtn}>{t(lang, "cancel")}</button>
            <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? t(lang, "saving") : t(lang, "saveTemplate")}</button>
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
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {items.map((k, i) => (
          <span key={i} style={{ background: "#eef3ff", color: "#2f6feb", borderRadius: 999, padding: "3px 10px", fontSize: 13 }}>
            {k} <button onClick={() => setItems(items.filter((_, x) => x !== i))} style={{ border: "none", background: "none", color: "inherit", cursor: "pointer" }}>×</button>
          </span>
        ))}
        {items.length === 0 && <span style={{ color: "#999", fontSize: 13 }}>{t(lang, "noKw")}</span>}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={t(lang, "kwPlaceholder")} style={{ ...input, maxWidth: 320 }} />
    </div>
  );
}

function Overlay({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }} onClick={onClick}>{children}</div>;
}

const panel: CSSProperties = { background: "#fff", borderRadius: 16, padding: 20 };
const input: CSSProperties = { padding: "8px 10px", border: "1px solid #e5e5e5", borderRadius: 8, fontSize: 14, boxSizing: "border-box" };
const fieldLabel: CSSProperties = { display: "grid", gap: 6, fontSize: 13, color: "#333" };
const th: CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e5e5", fontSize: 12, color: "#666", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "4px 4px", borderBottom: "1px solid #f0f0f0" };
const miniBtn: CSSProperties = { width: 28, height: 28, border: "1px solid #e5e5e5", background: "#fff", borderRadius: 6, cursor: "pointer" };
const smallBtn: CSSProperties = { marginTop: 8, padding: "6px 12px", border: "1px solid #e5e5e5", background: "#fff", borderRadius: 8, fontSize: 13, cursor: "pointer" };
const primaryBtn: CSSProperties = { padding: "9px 16px", background: "#2f6feb", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" };
const secondaryBtn: CSSProperties = { padding: "9px 16px", background: "#fff", color: "#111", border: "1px solid #e5e5e5", borderRadius: 8, fontSize: 14, cursor: "pointer" };
