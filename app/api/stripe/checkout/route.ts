import { getStripe } from "@/lib/stripe";
import { getAdminClient } from "@/lib/supabase";
import { resolveUser } from "@/lib/api-auth";

export const runtime = "nodejs";

// planId → 价格（美分）与产品名。服务端权威定价，不信任客户端金额。
const PLAN_PRICES: Record<string, { monthly: number; yearly: number; name: string }> = {
  personal: { monthly: 1300, yearly: 11900, name: "BuildTrace Personal" },
  team: { monthly: 3900, yearly: 34900, name: "BuildTrace Team" },
};

export async function POST(req: Request) {
  const userId = await resolveUser(req);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const planId = String(body?.plan || "");
  const billing = body?.billing === "yearly" ? "yearly" : "monthly";
  const conf = PLAN_PRICES[planId];
  if (!conf) return Response.json({ error: "unknown plan" }, { status: 400 });

  // 用服务端拿到的可信邮箱（不信任客户端）
  const db = getAdminClient();
  const { data: user } = await db.auth.admin.getUserById(userId);
  const email = user?.user?.email || undefined;

  const origin = new URL(req.url).origin;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    client_reference_id: userId,
    metadata: { user_id: userId, plan: planId, billing },
    subscription_data: { metadata: { user_id: userId, plan: planId, billing } },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: billing === "yearly" ? conf.yearly : conf.monthly,
          recurring: { interval: billing === "yearly" ? "year" : "month" },
          product_data: { name: conf.name },
        },
      },
    ],
    success_url: `${origin}/board?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=canceled`,
  });

  return Response.json({ url: session.url });
}
