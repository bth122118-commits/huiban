import { createClient } from "@supabase/supabase-js";
import { verifyWebhookSignature, fetchMessage, normalizeMessage } from "@/lib/aurinko";
import { ingestMessage } from "@/lib/email-ingest";

const supabase = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const runtime = "nodejs";

// Aurinko「新邮件」webhook：payload = { accountId, payloads: [{ id, changeType }] }
export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = req.headers.get("x-aurinko-signature") || "";
  const sigOk = verifyWebhookSignature(req, rawBody);

  const db = supabase();
  // 每次到达都先写日志（确保能看出有没有被 Aurinko 调用）
  await db.from("webhook_log").insert({
    event: "webhook",
    detail: JSON.stringify({ sig: !!sig, sigOk, raw: rawBody.slice(0, 800) }),
  }).then(() => {}, () => {});

  // 空 body = Aurinko 的「订阅验证」请求，直接回 200 即可
  if (!rawBody || !rawBody.trim()) {
    return Response.json({ ok: true, skipped: "empty_body" });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // 非 JSON 也回 200，避免把验证/未知请求挡掉
    return Response.json({ ok: true, skipped: "non_json" });
  }

  const accountId = payload.accountId ?? payload.account_id ?? null;
  const items: any[] = payload.payloads || [];
  if (!accountId || !items.length) return Response.json({ ok: true, skipped: "empty" });

  const { data: account } = await db
    .from("email_accounts")
    .select("workspace_id, template_id, connection")
    .eq("provider_account_id", String(accountId))
    .maybeSingle();
  if (!account) {
    await db.from("webhook_log").insert({ event: "webhook_no_account", detail: JSON.stringify({ accountId }) }).then(() => {}, () => {});
    return Response.json({ ok: true, skipped: "no_account" });
  }

  const token = account.connection?.accessToken;
  if (!token) return Response.json({ ok: true, skipped: "no_token" });

  let processed = 0;
  const errors: string[] = [];
  for (const it of items) {
    if (it.changeType !== "created") continue;
    const m = await fetchMessage(token, it.id);
    if (!m) { errors.push(`fetch_failed:${it.id}`); continue; }
    const msg = normalizeMessage(m);
    if (!msg || (!msg.subject && !msg.body)) { errors.push(`normalize_empty:${it.id}:${JSON.stringify(m).slice(0, 200)}`); continue; }
    await ingestMessage(db, account, msg);
    processed++;
  }

  await db.from("webhook_log").insert({
    event: "webhook_result",
    detail: JSON.stringify({ accountId, items: items.length, processed, errors }),
  }).then(() => {}, () => {});

  return Response.json({ ok: true, processed });
}
