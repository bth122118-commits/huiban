"use client";
// =====================================================================
// 汇办 Huiban · 登录 / 注册（Supabase Auth，邮箱 + 密码）
// 样式对齐 task-tracker.html 的 Neutral Modern（令牌见 app/globals.css）
// =====================================================================

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        return setError("注册成功，请查收验证邮件后登录。");
      }
      // 已登录：确保「一人一个工作区」（幂等），然后进看板
      const { data: wsId, error: wsErr } = await supabase.rpc("create_workspace", {
        p_name: email.split("@")[0] + " 的工作台",
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
    if (!user.user) return setError("登录状态失效，请重试");
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
      <div className="auth-card">
        <h1 className="auth-brand">汇办</h1>
        <p className="auth-tagline">把散在邮件和 Excel 里的杂事，收进一个共享的进度面板。</p>

        <h2 className="auth-title">{mode === "signin" ? "登录" : "注册"}</h2>
        <form onSubmit={submit} className="auth-form">
          <label className="auth-field">
            <span className="auth-label">邮箱</span>
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
            <span className="auth-label">密码</span>
            <input
              className="auth-input"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? "请稍候…" : mode === "signin" ? "登录" : "创建账号"}
          </button>
        </form>

        <div className="auth-switch">
          <button className="auth-link" type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "没有账号？注册" : "已有账号？登录"}
          </button>
        </div>
      </div>
    </main>
  );
}
