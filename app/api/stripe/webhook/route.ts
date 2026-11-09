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

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = (session.metadata?.user_id as string) || null;
      const subId = (session.subscription as string) || null;
      const customerId = (session.customer as string) || null;
      if (userId && subId) {
        const status = session.payment_status === "paid" ? "active" : "incomplete";
        const plan = (session.metadata?.plan as string) || null;
        await db.from("subscriptions").upsert(
          { user_id: userId, stripe_subscription_id: subId, stripe_customer_id: customerId, status, plan },
          { onConflict: "stripe_subscription_id" }
        );
      }
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      // 付款真正完成 → 置 active（修正「incomplete」中间态）
      const inv = event.data.object as Stripe.Invoice;
      const subId = (inv.subscription as string) || null;
      if (subId) {
        await db.from("subscriptions").update({ status: "active" }).eq("stripe_subscription_id", subId);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      await db.from("subscriptions").update({ status: "canceled" }).eq("stripe_subscription_id", sub.id);
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      // 同步状态 + 续期时间，但跳过 incomplete（首笔未结算的中间态，别覆盖 active）
      const sub = event.data.object as Stripe.Subscription;
      if (sub.status !== "incomplete") {
        const renewsAt = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
        await db.from("subscriptions").update({ status: sub.status, renews_at: renewsAt }).eq("stripe_subscription_id", sub.id);
      }
    }
  } catch (e: any) {
    console.error("stripe webhook handle failed:", e);
    return Response.json({ ok: false, error: e?.message || "handle error" }, { status: 500 });
  }

  return Response.json({ ok: true, event: event.type });
}
