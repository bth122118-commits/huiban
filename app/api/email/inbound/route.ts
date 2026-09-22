import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { ingestMessage } from "@/lib/email-ingest";

const supabase = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const runtime = "nodejs";

// Resend 入站 webhook 用 Svix 签名：svix-id / svix-timestamp / svix-signature。
// 未配置 RESEND_WEBHOOK_SECRET 时跳过校验（本地开发）；生产必须配置。
function verifyResendSignature(req: Request, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true;
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;
  try {
    const age = Math.floor(Date.now() / 1000) - Number(timestamp);
    if (Number.isFinite(age) && Math.abs(age) > 300) return false;
  } catch { /* 时间戳异常则拒绝 */ }
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const buf = Buffer.from(sig, "base64");
    return buf.length === expected.length && timingSafeEqual(buf, expected);
  });
}

export async function POST(req: Request) {
  // 先取原始 body 验签，再解析 JSON（验签需要精确字节）
  const rawBody = await req.text();
  if (!verifyResendSignature(req, rawBody)) {
    return Response.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Resend 只会在该 webhook 上发 email.received 事件（只要你在控制台只勾了这个）
  if (payload.type && payload.type !== "email.received") {
    return Response.json({ ok: true, skipped: "not_email_received" });
  }

  // Resend 的收件 payload 是 { type, data: {from, to, subject, ...} }
  const data = payload.data || payload;
  const recipient = Array.isArray(data.to) ? data.to[0] : data.to;
  const from = data.from;
  const subject: string = data.subject || "";
  const body: string = String(data.text || "").slice(0, 4000);
  const headers: Record<string, string> = {};
  (data.headers || []).forEach((h: { name: string; value: string }) => {
    headers[String(h.name).toLowerCase()] = h.value;
  });

  const db = supabase();

  // 归属工作区：Resend 转发按「收件地址」匹配；将来统一邮箱 API 按 provider_account_id。
  const accountId = payload.account_id || data.account_id || null;
  let accountQuery = db.from("email_accounts").select("workspace_id, template_id");
  accountQuery = accountId
    ? accountQuery.eq("provider_account_id", accountId)
    : accountQuery.eq("email", recipient);
  const { data: account } = await accountQuery.maybeSingle();
  if (!account) return Response.json({ ok: true, skipped: "no_account" });

  const result = await ingestMessage(db, account, {
    from,
    subject,
    body,
    messageId: headers["message-id"] || null,
    inReplyTo: headers["in-reply-to"] || null,
    references: headers["references"] || null,
  });

  return Response.json(result);
}
