import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Stripe webhook：验签 → 记录事件 → 镜像订阅状态到 subscriptions 表
export async function POST(req: Request) {
  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature") || "";
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  const db = getAdminClient();
  await db.from("webhook_log").insert({ event: `stripe_${event.type}`, detail: rawBody.slice(0, 800) }).then(() => {}, () => {});

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = (session.metadata?.user_id as string) || null;
    const subId = (session.subscription as string) || null;
    const customerId = (session.customer as string) || null;
    if (userId && subId) {
      await db.from("subscriptions").upsert(
        { user_id: userId, stripe_subscription_id: subId, stripe_customer_id: customerId, status: "active" },
        { onConflict: "stripe_subscription_id" }
      );
    }
  } else if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object as Stripe.Subscription;
    const userId = (sub.metadata?.user_id as string) || null;
    if (userId) {
      await db.from("subscriptions").update({ status: sub.status }).eq("stripe_subscription_id", sub.id);
    }
  }

  return Response.json({ ok: true, event: event.type });
}
