"use client";
// =====================================================================
// 汇办 Huiban · 登录 / 注册（Supabase Auth，邮箱 + 密码）
// 依赖：npm i @supabase/supabase-js
// 样式请按 task-tracker.html 的 Neutral Modern tokens 套用
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
    const { error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push("/onboarding"); // 首次进引导；有工作区则跳 /board
  }

  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: 24 }}>
      <h1>汇办</h1>
      <p style={{ color: "#666" }}>{mode === "signin" ? "登录" : "注册"}</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <input
          type="email" required placeholder="邮箱" value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: "10px 12px", border: "1px solid #e5e5e5", borderRadius: 8 }}
        />
        <input
          type="password" required minLength={6} placeholder="密码（至少 6 位）" value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: "10px 12px", border: "1px solid #e5e5e5", borderRadius: 8 }}
        />
        {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ padding: "10px 16px", background: "#2f6feb", color: "#fff", border: "none", borderRadius: 8 }}>
          {loading ? "请稍候…" : mode === "signin" ? "登录" : "创建账号"}
        </button>
      </form>
      <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        style={{ marginTop: 12, background: "none", border: "none", color: "#2f6feb", cursor: "pointer" }}>
        {mode === "signin" ? "没有账号？注册" : "已有账号？登录"}
      </button>
    </main>
  );
}
