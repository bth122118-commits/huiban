"use client";
// 汇办 Huiban · 登录 / 注册（Supabase Auth，邮箱 + 密码）
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { t, type Lang } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<Lang>("zh");

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "zh") setLang(saved);
  }, []);
  function setLanguage(l: Lang) { setLang(l); localStorage.setItem("lang", l); }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) return setError(error.message);
      // 邮箱确认开启时 session 为 null：尚未真正登录，不能直接进看板
      if (!data.session) {
        setMode("signin");
        return setError(t(lang, "verifyEmail"));
      }
      // 已登录：确保「一人一个工作区」（幂等），然后进看板
      const { data: wsId, error: wsErr } = await supabase.rpc("create_workspace", {
        p_name: email.split("@")[0] + (lang === "en" ? "'s workspace" : " 的工作台"),
      });
      if (wsErr) return setError(wsErr.message);
      enterWorkspace(String(wsId));
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    // 登录成功：精确落到「我自己的工作区」（优先 owner），没有才去创建
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return setError(t(lang, "sessionInvalid"));
    const { data: ms } = await supabase.from("memberships").select("workspace_id, role").eq("user_id", user.user.id);
    const mine = (ms || []).find((m) => m.role === "owner") || (ms || [])[0];
    if (mine?.workspace_id) enterWorkspace(mine.workspace_id);
    else router.push("/onboarding");
  }

  function enterWorkspace(id: string) {
    localStorage.setItem("huiban.workspace", id);
    router.push("/board");
  }

  return (
    <main className="auth-shell">
      <div className="lang-switch">
        <button className={lang === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中</button>
        <button className={lang === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
      </div>
      <div className="auth-card">
        <h1 className="auth-brand">{t(lang, "brandName")}</h1>
        <p className="auth-tagline">{t(lang, "authTagline")}</p>

        <h2 className="auth-title">{t(lang, mode === "signin" ? "login" : "signup")}</h2>
        <form onSubmit={submit} className="auth-form">
          <label className="auth-field">
            <span className="auth-label">{t(lang, "email")}</span>
            <input
              className="auth-input"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="auth-field">
            <span className="auth-label">{t(lang, "passwordLabel")}</span>
            <input
              className="auth-input"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder={t(lang, "passwordHint")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? t(lang, "wait") : t(lang, mode === "signin" ? "login" : "createAccount")}
          </button>
        </form>

        <div className="auth-switch">
          <button className="auth-link" type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {t(lang, mode === "signin" ? "noAccount" : "haveAccount")}
          </button>
        </div>
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <a href="/" className="auth-link" style={{ fontSize: 13 }}>{t(lang, "backHome")}</a>
        </div>
      </div>
    </main>
  );
}
