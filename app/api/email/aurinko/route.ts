import { createClient } from "@supabase/supabase-js";
import { verifyWebhookSignature, fetchMessage, normalizeMessage } from "@/lib/aurinko";
import { ingestMessage } from "@/lib/email-ingest";

const supabase = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const runtime = "nodejs";

// Aurinko「新邮件」webhook：payload = { accountId, payloads: [{ id, changeType }] }
// 只推 id，不带正文 → 取正文后交给 ingestMessage 做关键词匹配
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyWebhookSignature(req, rawBody)) {
    return Response.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const accountId = payload.accountId ?? payload.account_id ?? null;
  const items: any[] = payload.payloads || [];
  if (!accountId || !items.length) return Response.json({ ok: true, skipped: "empty" });

  const db = supabase();
  const { data: account } = await db
    .from("email_accounts")
    .select("workspace_id, template_id, connection")
    .eq("provider_account_id", String(accountId))
    .maybeSingle();
  if (!account) return Response.json({ ok: true, skipped: "no_account" });

  const token = account.connection?.accessToken;
  if (!token) return Response.json({ ok: true, skipped: "no_token" });

  let processed = 0;
  for (const it of items) {
    if (it.changeType !== "created") continue;
    const m = await fetchMessage(token, it.id);
    if (!m) continue;
    const msg = normalizeMessage(m);
    if (!msg || (!msg.subject && !msg.body)) continue;
    await ingestMessage(db, account, msg);
    processed++;
  }

  return Response.json({ ok: true, processed });
}
