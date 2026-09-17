"use client";
// =====================================================================
// 汇办 Huiban · 建工作区（一人一个工作区）
// 调 db/schema.sql 里的 create_workspace RPC（owner 取 auth.uid()）
// 样式对齐 task-tracker.html 的 Neutral Modern（令牌见 app/globals.css）
// =====================================================================

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/login");
    });
  }, [router]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return setError("请填写工作区名称");
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
      <div className="auth-card">
        <h1 className="auth-brand">汇办</h1>
        <p className="auth-tagline">一个工作区 = 一个团队。创建后会自动带上预设模板，马上就能用。</p>

        <h2 className="auth-title">创建工作区</h2>
        <form onSubmit={create} className="auth-form">
          <label className="auth-field">
            <span className="auth-label">工作区名称</span>
            <input
              className="auth-input"
              autoFocus
              placeholder="如「我的工程队」"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? "创建中…" : "创建并进入"}
          </button>
        </form>
      </div>
    </main>
  );
}
