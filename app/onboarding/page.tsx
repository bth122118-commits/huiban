"use client";
// =====================================================================
// 汇办 Huiban · 建工作区
// 调 db/schema.sql 里的 create_workspace RPC（原子：建 workspace + owner 成员 + 克隆预设模板）
// 生产建议：把 create_workspace 改成内部用 auth.uid() 取 owner，避免信任客户端传 owner。
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

    const { data: wsId, error } = await supabase.rpc("create_workspace", {
      p_name: name.trim(),
      p_owner: user.user.id,
    });
    setLoading(false);
    if (error) return setError(error.message);
    localStorage.setItem("huiban.workspace", String(wsId));
    router.push(`/board?workspace=${wsId}`);
  }

  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: 24 }}>
      <h1>创建工作区</h1>
      <p style={{ color: "#666" }}>一个工作区 = 一个团队，创建后会自动带上 5 个预设模板。</p>
      <form onSubmit={create} style={{ display: "grid", gap: 12 }}>
        <input
          placeholder="工作区名称，如「我的工程队」" value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: "10px 12px", border: "1px solid #e5e5e5", borderRadius: 8 }}
        />
        {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ padding: "10px 16px", background: "#2f6feb", color: "#fff", border: "none", borderRadius: 8 }}>
          {loading ? "创建中…" : "创建并进入"}
        </button>
      </form>
    </main>
  );
}
