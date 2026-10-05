"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";

declare global {
  interface Window { Paddle?: any; }
}

type Plan = {
  id: string;
  name: string;
  price: string;
  desc: string;
  priceId: string;
  features: string[];
  primary?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "personal",
    name: "个人版",
    price: "$9",
    desc: "一个人，把邮件和 Excel 的杂事收成看板。",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_PERSONAL || "",
    features: ["1 个工作台", "连接 1 个邮箱", "无限任务", "邮件 / Excel 自动建任务"],
  },
  {
    id: "team",
    name: "团队版",
    price: "$29",
    desc: "一个团队，共享一条流水线，谁在办一眼看清。",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_TEAM || "",
    features: ["多人协作", "连接团队邮箱", "类型 × 处理者矩阵", "无限任务"],
    primary: true,
  },
];

export default function PricingPage() {
  const [paddle, setPaddle] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
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
    if (!plan.priceId) { setError("该套餐还未配置价格，请稍后再试。"); return; }
    if (!paddle) { setError("支付组件加载中，请稍后重试。"); return; }
    setError("");
    setLoading(true);
    paddle.Checkout.open({
      items: [{ priceId: plan.priceId, quantity: 1 }],
      customer: { email },
      customData: { user_id: userId },
    });
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 8px" }}>选择套餐</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 32px" }}>免费开始，随时升级。所有套餐都支持邮件自动建任务、Excel 导入。</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        {PLANS.map((plan) => (
          <div key={plan.id} style={{
            border: `1px solid ${plan.primary ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 12, padding: 28, background: "var(--surface)",
          }}>
            <div style={{ fontSize: 14, color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>{plan.name}</div>
            <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {plan.price}<span style={{ fontSize: 16, color: "var(--muted)", fontWeight: 400 }}> / 月</span>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "12px 0 20px" }}>{plan.desc}</p>
            <ul style={{ paddingLeft: 18, margin: "0 0 24px", fontSize: 14, color: "var(--fg)", lineHeight: 2 }}>
              {plan.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button
              className={plan.primary ? "btn btn-primary" : "btn btn-secondary"}
              style={{ width: "100%" }}
              onClick={() => subscribe(plan)}
              disabled={loading}
            >
              订阅
            </button>
          </div>
        ))}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 16 }}>{error}</p>}
    </main>
  );
}
