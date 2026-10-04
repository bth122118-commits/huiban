import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

const supabase = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const runtime = "nodejs";

// Paddle 签名格式：`Paddle-Signature: ts=<时间戳>;h1=<HMAC-SHA256 hex>`
// h1 = HMAC_SHA256(endpoint_secret_key, `${ts}:${rawBody}`)
function verifyPaddleSignature(req: Request, rawBody: string): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return true; // 未配置则跳过（本地）；生产必须配
  const sig = req.headers.get("paddle-signature");
  if (!sig) return false;
  const parts: Record<string, string> = {};
  for (const p of sig.split(";")) {
    const i = p.indexOf("=");
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(h1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyPaddleSignature(req, rawBody)) {
    return Response.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventType: string = payload.event_type || "";
  const data: any = payload.data || {};

  const db = supabase();

  // 记录事件（调试 / 审计）
  await db.from("paddle_events").insert({ event_type: eventType, payload: rawBody.slice(0, 8000) }).then(() => {}, () => {});

  // 订阅状态镜像：subscription.* 事件 → 更新 subscriptions 表
  if (eventType.startsWith("subscription.") && data.id) {
    const row = {
      paddle_subscription_id: String(data.id),
      paddle_customer_id: data.customer_id ? String(data.customer_id) : null,
      price_id: data.items?.[0]?.price_id ? String(data.items[0].price_id) : null,
      user_id: data.custom_data?.user_id || null,
      status: data.status || null,
    };
    const { data: existing } = await db.from("subscriptions").select("id").eq("paddle_subscription_id", row.paddle_subscription_id).maybeSingle();
    if (existing) await db.from("subscriptions").update(row).eq("id", existing.id);
    else await db.from("subscriptions").insert(row);
  }

  return Response.json({ ok: true, event: eventType });
}
