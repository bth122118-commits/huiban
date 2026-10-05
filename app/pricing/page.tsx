"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";

declare global {
  interface Window { Paddle?: any; }
}

type Billing = "monthly" | "yearly";

type Plan = {
  id: string;
  name: string;
  desc: string;
  monthlyPrice: string;
  yearlyPrice: string;
  monthlyNote?: string;
  yearlyNote?: string;
  monthlyPriceId: string;
  yearlyPriceId: string;
  features: string[];
  primary?: boolean;
  free?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "免费版",
    desc: "个人体验，把邮件和 Excel 的杂事收成看板。",
    monthlyPrice: "$0",
    yearlyPrice: "$0",
    monthlyPriceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_FREE || "",
    yearlyPriceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_FREE || "",
    features: ["1 个工作台", "连接 1 个邮箱", "邮件 / Excel 建任务"],
    free: true,
  },
  {
    id: "personal",
    name: "个人版",
    desc: "一个人，完整功能。",
    monthlyPrice: "$13",
    yearlyPrice: "$119",
    yearlyNote: "≈ $10 / 月",
    monthlyPriceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_PERSONAL_MONTHLY || "",
    yearlyPriceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_PERSONAL_YEARLY || "",
    features: ["无限任务", "连接 1 个邮箱", "邮件 / Excel 建任务", "自定义模板"],
  },
  {
    id: "team",
    name: "团队版",
    desc: "一个团队，共享一条流水线，谁在办一眼看清。",
    monthlyPrice: "$39",
    yearlyPrice: "$349",
    yearlyNote: "≈ $29 / 月",
    monthlyPriceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_TEAM_MONTHLY || "",
    yearlyPriceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_TEAM_YEARLY || "",
    features: ["多人协作", "类型 × 处理者矩阵", "连接团队邮箱", "无限任务"],
    primary: true,
  },
];

export default function PricingPage() {
  const [paddle, setPaddle] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => {
      if (!window.Paddle) return;
      window.Paddle.Environment.set(process.env.NEXT_PUBLIC_PADDLE_ENV || "sandbox");
      const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "";
      if (token) {
        window.Paddle.Initialize({ token });
        setPaddle(window.Paddle);
      }
    };
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setEmail(data.user.email || ""); setUserId(data.user.id); }
    });
  }, []);

  function subscribe(plan: Plan) {
    const priceId = billing === "monthly" ? plan.monthlyPriceId : plan.yearlyPriceId;
    if (!priceId) { setError("该套餐还未配置价格，请稍后再试。"); return; }
    if (!paddle) { setError("支付组件加载中，请稍后重试。"); return; }
    setError("");
    setLoading(true);
    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: { email },
      customData: { user_id: userId, plan: plan.id, billing },
    });
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 8px" }}>选择套餐</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 28px" }}>免费开始，随时升级。所有套餐都支持邮件自动建任务、Excel 导入。</p>

      <div className="seg" style={{ marginBottom: 24 }}>
        <button className="seg-btn" data-on={billing === "monthly"} onClick={() => setBilling("monthly")}>月付</button>
        <button className="seg-btn" data-on={billing === "yearly"} onClick={() => setBilling("yearly")}>年付 · 省约 25%</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, alignItems: "start" }}>
        {PLANS.map((plan) => {
          const price = billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
          const note = billing === "yearly" ? plan.yearlyNote : null;
          const suffix = billing === "monthly" ? "/ 月" : "/ 年";
          return (
            <div key={plan.id} style={{
              border: `1px solid ${plan.primary ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 12, padding: 28, background: "var(--surface)",
            }}>
              <div style={{ fontSize: 14, color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                {price}<span style={{ fontSize: 16, color: "var(--muted)", fontWeight: 400 }}>{suffix}</span>
              </div>
              {note && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{note}</div>}
              <p style={{ color: "var(--muted)", fontSize: 14, margin: "14px 0 20px" }}>{plan.desc}</p>
              <ul style={{ paddingLeft: 18, margin: "0 0 24px", fontSize: 14, color: "var(--fg)", lineHeight: 2 }}>
                {plan.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <button
                className={plan.primary ? "btn btn-primary" : "btn btn-secondary"}
                style={{ width: "100%" }}
                onClick={() => subscribe(plan)}
                disabled={loading}
              >
                {plan.free ? "免费开始" : "订阅"}
              </button>
            </div>
          );
        })}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 16 }}>{error}</p>}
    </main>
  );
}
