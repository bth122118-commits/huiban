"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";

type Member = { id: string; name: string; role: string };
type Seats = { plan: string | null; limit: number; used: number };

export default function MembersModal({ workspaceId, userId, lang, onClose, onChanged }: {
  workspaceId: string; userId: string; lang: Lang; onClose: () => void; onChanged: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [seats, setSeats] = useState<Seats>({ plan: null, limit: 0, used: 0 });
  const [email, setEmail] = useState("");
  const [myName, setMyName] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/workspaces/${workspaceId}/members`).then((x) => x.json());
    setMembers(r.members || []);
    setSeats(r.seats || { plan: null, limit: 0, used: 0 });
    const me = (r.members || []).find((m: Member) => m.id === userId);
    if (me) setMyName(me.name);
  }, [workspaceId, userId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    setError(""); setMsg("");
    const r = await apiFetch(`/api/workspaces/${workspaceId}/members`, {
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

  const full = seats.limit > 0 && seats.used >= seats.limit;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{t(lang, "membersTitle")}</h2>

        <p className="section-title">{t(lang, "myName")}</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input className="input" style={{ flex: 1 }} value={myName} onChange={(e) => setMyName(e.target.value)} />
          <button className="btn btn-primary" onClick={rename}>{t(lang, "saveName")}</button>
        </div>

        <p className="section-title">
          {t(lang, "addMember")}
          {seats.limit > 0 && <span className="member-role"> · {t(lang, "seatUsed")} {seats.used}/{seats.limit}</span>}
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input className="input" style={{ flex: 1 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t(lang, "memberEmail")} />
          <button className="btn btn-primary" onClick={add} disabled={full}>{t(lang, "add")}</button>
        </div>
        {seats.limit === 0 && (
          <p className="error-text" style={{ margin: "0 0 12px" }}>
            {t(lang, "seatNoInvite")} <a href="/pricing" style={{ color: "var(--accent)" }}>{t(lang, "upgrade")} →</a>
          </p>
        )}
        {full && (
          <p className="error-text" style={{ margin: "0 0 12px" }}>
            {t(lang, "seatLimitReached")} <a href="/pricing" style={{ color: "var(--accent)" }}>{t(lang, "upgrade")} →</a>
          </p>
        )}

        <p className="section-title">{t(lang, "memberList")}</p>
        {members.map((m) => (
          <div key={m.id} className="member-row">
            <span className="member-name">{m.name}{m.id === userId ? t(lang, "me") : ""}</span>
            <span className="member-role">{m.role === "owner" ? t(lang, "admin") : t(lang, "member")}</span>
          </div>
        ))}

        {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
        {msg && <p className="success-text">{msg}</p>}

        <div style={{ marginTop: 20, textAlign: "right" }}>
          <button className="btn btn-secondary" onClick={onClose}>{t(lang, "close")}</button>
        </div>
      </div>
    </div>
  );
}
