"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { apiFetch } from "@/lib/api";
import { t, type Lang } from "@/lib/i18n";

type Billing = "monthly" | "yearly";

type Plan = {
  id: string;
  name: string;
  desc: string;
  monthlyPrice: string;
  yearlyPrice: string;
  yearlyNote?: string;
  features: string[];
  primary?: boolean;
  free?: boolean;
};

const PLANS: Record<Lang, Plan[]> = {
  zh: [
    { id: "free", name: "免费版", desc: "个人体验，把邮件和 Excel 的杂事收成看板。", monthlyPrice: "$0", yearlyPrice: "$0", features: ["1 个工作台", "连接 1 个邮箱", "邮件 / Excel 建任务"], free: true },
    { id: "personal", name: "个人版", desc: "一个人，完整功能。", monthlyPrice: "$13", yearlyPrice: "$119", yearlyNote: "≈ $10 / 月", features: ["无限任务", "连接 1 个邮箱", "邮件 / Excel 建任务", "自定义模板"] },
    { id: "team", name: "团队版", desc: "一个团队，共享一条流水线，谁在办一眼看清。", monthlyPrice: "$39", yearlyPrice: "$349", yearlyNote: "≈ $29 / 月", features: ["多人协作", "类型 × 处理者矩阵", "连接团队邮箱", "无限任务"], primary: true },
  ],
  en: [
    { id: "free", name: "Free", desc: "For individuals — turn email and Excel items into a board.", monthlyPrice: "$0", yearlyPrice: "$0", features: ["1 workspace", "1 connected email", "Email / Excel tasks"], free: true },
    { id: "personal", name: "Personal", desc: "One person, full features.", monthlyPrice: "$13", yearlyPrice: "$119", yearlyNote: "≈ $10 /mo", features: ["Unlimited tasks", "1 connected email", "Email / Excel tasks", "Custom templates"] },
    { id: "team", name: "Team", desc: "One team, one pipeline — see who's doing what at a glance.", monthlyPrice: "$39", yearlyPrice: "$349", yearlyNote: "≈ $29 /mo", features: ["Collaboration", "Type × handler matrix", "Team email", "Unlimited tasks"], primary: true },
  ],
};

export default function PricingPage() {
  const [userId, setUserId] = useState("");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<Lang>("zh");

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "zh") setLang(saved);
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);
  function setLanguage(l: Lang) { setLang(l); localStorage.setItem("lang", l); }

  async function subscribe(plan: Plan) {
    if (plan.free) { window.location.href = "/board"; return; }
    if (!userId) { window.location.href = "/login"; return; }
    setError(""); setLoading(true);
    const r = await apiFetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: plan.id, billing }),
    });
    setLoading(false);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) window.location.href = j.url;
    else setError(j.error || t(lang, "checkoutFailed"));
  }

  const plans = PLANS[lang];

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
      <div className="lang-switch">
        <button className={lang === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中</button>
        <button className={lang === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
      </div>
      <a href="/" style={{ fontSize: 14, color: "var(--accent)", display: "inline-block", marginBottom: 16 }}>{t(lang, "backHome")}</a>
      <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 8px" }}>{t(lang, "pricingTitle")}</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 28px" }}>{t(lang, "pricingSub")}</p>

      <div className="seg" style={{ marginBottom: 24 }}>
        <button className="seg-btn" data-on={billing === "monthly"} onClick={() => setBilling("monthly")}>{t(lang, "monthly")}</button>
        <button className="seg-btn" data-on={billing === "yearly"} onClick={() => setBilling("yearly")}>{t(lang, "yearly")}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, alignItems: "start" }}>
        {plans.map((plan) => {
          const price = billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
          const note = billing === "yearly" ? plan.yearlyNote : null;
          const suffix = billing === "monthly" ? t(lang, "perMonth") : t(lang, "perYear");
          return (
            <div key={plan.id} style={{ border: `1px solid ${plan.primary ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, padding: 28, background: "var(--surface)" }}>
              <div style={{ fontSize: 14, color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{price}<span style={{ fontSize: 16, color: "var(--muted)", fontWeight: 400 }}>{suffix}</span></div>
              {note && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{note}</div>}
              <p style={{ color: "var(--muted)", fontSize: 14, margin: "14px 0 20px" }}>{plan.desc}</p>
              <ul style={{ paddingLeft: 18, margin: "0 0 24px", fontSize: 14, color: "var(--fg)", lineHeight: 2 }}>
                {plan.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <button className={plan.primary ? "btn btn-primary" : "btn btn-secondary"} style={{ width: "100%" }} onClick={() => subscribe(plan)} disabled={loading}>
                {plan.free ? t(lang, "freeStart") : t(lang, "subscribe")}
              </button>
            </div>
          );
        })}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 16 }}>{error}</p>}
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 24 }}>{t(lang, "paymentsNote")}</p>
    </main>
  );
}
