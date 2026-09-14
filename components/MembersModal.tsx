"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/i18n";

type Member = { id: string; name: string; role: string };

export default function MembersModal({ workspaceId, userId, lang, onClose, onChanged }: {
  workspaceId: string; userId: string; lang: Lang; onClose: () => void; onChanged: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [myName, setMyName] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/workspaces/${workspaceId}/members`).then((x) => x.json());
    setMembers(r.members || []);
    const me = (r.members || []).find((m) => m.id === userId);
    if (me) setMyName(me.name);
  }, [workspaceId, userId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    setError(""); setMsg("");
    const r = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    });
    const d = await r.json();
    if (!r.ok) { setError(d.error || "ERR"); return; }
    setEmail(""); setMsg("OK"); load(); onChanged();
  }

  async function rename() {
    if (!myName.trim()) return;
    await supabase.from("profiles").update({ name: myName.trim() }).eq("id", userId);
    load(); onChanged();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ width: 460, maxWidth: "92vw", background: "#fff", borderRadius: 16, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{t(lang, "membersTitle")}</h2>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t(lang, "myName")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input value={myName} onChange={(e) => setMyName(e.target.value)} style={{ ...input, flex: 1 }} />
          <button onClick={rename} style={primary}>{t(lang, "saveName")}</button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t(lang, "addMember")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t(lang, "memberEmail")} style={{ ...input, flex: 1 }} />
          <button onClick={add} style={primary}>{t(lang, "add")}</button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t(lang, "memberList")}</div>
        {members.map((m) => (
          <div key={m.id} style={{ display: "flex", gap: 8, padding: "6px 0", fontSize: 14 }}>
            <span style={{ flex: 1 }}>{m.name}{m.id === userId ? t(lang, "me") : ""}</span>
            <span style={{ color: "#999", fontSize: 13 }}>{m.role === "owner" ? t(lang, "admin") : t(lang, "member")}</span>
          </div>
        ))}

        {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
        {msg && <p style={{ color: "#17a34a", fontSize: 13, margin: "10px 0 0" }}>{msg}</p>}

        <div style={{ marginTop: 20, textAlign: "right" }}>
          <button onClick={onClose} style={secondary}>{t(lang, "close")}</button>
        </div>
      </div>
    </div>
  );
}

const input: CSSProperties = { padding: "8px 10px", border: "1px solid #e5e5e5", borderRadius: 8, fontSize: 14, boxSizing: "border-box" };
const primary: CSSProperties = { padding: "8px 14px", background: "#2f6feb", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" };
const secondary: CSSProperties = { padding: "8px 14px", background: "#fff", color: "#111", border: "1px solid #e5e5e5", borderRadius: 8, fontSize: 14, cursor: "pointer" };
