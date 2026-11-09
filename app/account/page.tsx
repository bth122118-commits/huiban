"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { apiFetch } from "@/lib/api";
import { t, type Lang } from "@/lib/i18n";

type Sub = { plan: string | null; status: string; renews_at: string | null };

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sub, setSub] = useState<Sub | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<Lang>("zh");

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "zh") setLang(saved);
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push("/login"); return; }
      setEmail(data.user.email || "");
      apiFetch("/api/billing").then((r) => r.json()).then((j) => setSub(j.subscription || null)).finally(() => setLoading(false));
    });
  }, [router]);
  function setLanguage(l: Lang) { setLang(l); localStorage.setItem("lang", l); }

  const planName = sub?.plan === "personal" ? (lang === "zh" ? "个人版" : "Personal")
    : sub?.plan === "team" ? (lang === "zh" ? "团队版" : "Team")
    : (lang === "zh" ? "免费版" : "Free");
  const active = !!(sub && sub.status === "active" && sub.plan);
  const daysLeft = sub?.renews_at ? Math.max(0, Math.ceil((new Date(sub.renews_at).getTime() - Date.now()) / 86400000)) : null;
  const renewDate = sub?.renews_at ? new Date(sub.renews_at).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US") : null;

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
      <div className="lang-switch">
        <button className={lang === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中</button>
        <button className={lang === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
      </div>
      <a href="/" style={{ fontSize: 14, color: "var(--accent)", display: "inline-block", marginBottom: 16 }}>{t(lang, "backHome")}</a>
      <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 24px" }}>{t(lang, "account")}</h1>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>{t(lang, "loading")}</p>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 28 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{t(lang, "email")}</div>
            <div style={{ fontSize: 15 }}>{email || "—"}</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{t(lang, "plan")}</div>
            <div style={{ fontSize: 15 }}>{planName}</div>
          </div>
          {active && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{t(lang, "renewal")}</div>
              <div style={{ fontSize: 15 }}>
                {daysLeft !== null && (lang === "zh" ? `剩余 ${daysLeft} 天` : `${daysLeft} days left`)}
                {renewDate && ` · ${renewDate}`}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            {!active && (
              <a href="/pricing" className="btn btn-primary" style={{ textDecoration: "none" }}>{t(lang, "upgrade")}</a>
            )}
            <a href="/board" className="btn btn-secondary" style={{ textDecoration: "none" }}>{t(lang, "backBoard")}</a>
          </div>
        </div>
      )}
    </main>
  );
}
