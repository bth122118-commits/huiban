"use client";
// Excel 导入：选择文件 → 预览 → 确认导入
import { useRef, useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";

type Row = {
  title: string; category: string | null; due_date: string | null;
  handler_id: string | null; handler_name: string | null;
};

export default function ExcelImportModal({ workspaceId, templateId, lang, members, onClose, onChanged }: {
  workspaceId: string; templateId: string; lang: Lang; members: Record<string, string>; onClose: () => void; onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function run(mode: "preview" | "import") {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError(t(lang, "pickFileFirst")); return; }
    setError(""); setResult(""); setBusy(true);
    const fd = new FormData();
    fd.append("workspace_id", workspaceId);
    fd.append("template_id", templateId);
    fd.append("file", file);
    const r = await apiFetch(`/api/import/excel?mode=${mode}`, { method: "POST", body: fd });
    setBusy(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setError(j.error || "ERR"); return; }
    if (mode === "preview") {
      setRows(j.rows || []);
      if (!(j.rows || []).length) setError(t(lang, "noRows"));
    } else {
      setResult(`${t(lang, "imported")} ${j.imported ?? 0} · ${t(lang, "skipped")} ${j.skipped ?? 0}`);
      setRows(null);
      onChanged();
    }
  }

  const handlerLabel = (row: Row) => row.handler_id ? (members[row.handler_id] || "…") : (row.handler_name || t(lang, "unassigned"));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{t(lang, "importExcel")}</h2>

        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ fontSize: 14 }} />
        <p className="field-label" style={{ margin: "8px 0 16px" }}>{t(lang, "chooseFile")}</p>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => run("preview")} disabled={busy}>{t(lang, "preview")}</button>
          <button className="btn btn-primary" onClick={() => run("import")} disabled={busy || !rows}>{busy ? t(lang, "loading") : t(lang, "importBtn")}</button>
        </div>

        {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}
        {result && <p className="success-text">{result}</p>}

        {rows && rows.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="table" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>{t(lang, "title")}</th>
                  <th>{t(lang, "handler")}</th>
                  <th>{t(lang, "due")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.title}</td>
                    <td>{handlerLabel(r)}</td>
                    <td>{r.due_date || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 20, textAlign: "right" }}>
          <button className="btn btn-secondary" onClick={onClose}>{t(lang, "close")}</button>
        </div>
      </div>
    </div>
  );
}
