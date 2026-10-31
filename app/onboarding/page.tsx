"use client";
// 汇办 Huiban · 建工作区（一人一个工作区）
// 调 db/schema.sql 里的 create_workspace RPC（owner 取 auth.uid()）
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/i18n";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<Lang>("zh");

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "zh") setLang(saved);
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/login");
    });
  }, [router]);
  function setLanguage(l: Lang) { setLang(l); localStorage.setItem("lang", l); }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return setError(t(lang, "nameRequired"));
    setError("");
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return router.push("/login");

    const { data: wsId, error } = await supabase.rpc("create_workspace", { p_name: name.trim() });
    setLoading(false);
    if (error) return setError(error.message);
    localStorage.setItem("huiban.workspace", String(wsId));
    router.push(`/board?workspace=${wsId}`);
  }

  return (
    <main className="auth-shell">
      <div className="lang-switch">
        <button className={lang === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中</button>
        <button className={lang === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
      </div>
      <div className="auth-card">
        <h1 className="auth-brand">{t(lang, "brandName")}</h1>
        <p className="auth-tagline">{t(lang, "workspaceTagline")}</p>

        <h2 className="auth-title">{t(lang, "createWorkspace")}</h2>
        <form onSubmit={create} className="auth-form">
          <label className="auth-field">
            <span className="auth-label">{t(lang, "workspaceNameLabel")}</span>
            <input
              className="auth-input"
              autoFocus
              placeholder={t(lang, "workspaceNameExample")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? t(lang, "creating") : t(lang, "createAndEnter")}
          </button>
        </form>
      </div>
    </main>
  );
}
