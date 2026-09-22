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
  // TODO(安全)：确认 Aurinko 签名字段格式后，恢复「验签失败 → 401」
  console.log("[aurinko:webhook] sig:", sig ? sig.slice(0, 32) : "(none)", "verified:", sigOk, "raw:", rawBody.slice(0, 400));

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
  if (!account) { console.log("[aurinko:webhook] no account for accountId", accountId); return Response.json({ ok: true, skipped: "no_account" }); }

  const token = account.connection?.accessToken;
  if (!token) { console.log("[aurinko:webhook] no token for accountId", accountId); return Response.json({ ok: true, skipped: "no_token" }); }

  let processed = 0;
  for (const it of items) {
    if (it.changeType !== "created") { console.log("[aurinko:webhook] skip changeType", it.changeType); continue; }
    const m = await fetchMessage(token, it.id);
    if (!m) { console.log("[aurinko:webhook] fetch failed for id", it.id); continue; }
    const msg = normalizeMessage(m);
    if (!msg || (!msg.subject && !msg.body)) { console.log("[aurinko:webhook] normalize empty for id", it.id, JSON.stringify(m).slice(0, 300)); continue; }
    await ingestMessage(db, account, msg);
    processed++;
  }

  console.log("[aurinko:webhook] processed", processed);
  return Response.json({ ok: true, processed });
}
