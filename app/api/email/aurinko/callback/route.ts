import { getAdminClient } from "@/lib/supabase";
import { exchangeCode, subscribeWebhook } from "@/lib/aurinko";

export const runtime = "nodejs";

// Aurinko 授权完成后的回调：换 token → 存 email_accounts → 订阅 webhook → 回看板
export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state"); // workspace id
  const origin = u.origin;

  const db = getAdminClient();
  const log = (event: string, detail: any) =>
    db.from("webhook_log").insert({ event, detail: JSON.stringify(detail) }).then(() => {}, () => {});

  if (!code || !state) {
    await log("callback_no_code", { origin });
    return Response.redirect(`${origin}/board?connect=error`);
  }

  try {
    const { accountId, accessToken } = await exchangeCode(code);
    const { data: existing } = await db.from("email_accounts").select("id").eq("workspace_id", state).maybeSingle();
    const row = {
      workspace_id: state,
      provider_account_id: String(accountId),
      provider: "gmail",
      connection: { accessToken, accountId },
    };
    if (existing) await db.from("email_accounts").update(row).eq("id", existing.id);
    else await db.from("email_accounts").insert(row);

    let subscribeResult = "ok";
    let subscribeError = "";
    try {
      await subscribeWebhook(accessToken, `${origin}/api/email/aurinko`);
    } catch (e) {
      subscribeResult = "failed";
      subscribeError = String(e);
    }
    await log("callback", { accountId, origin, subscribeResult, subscribeError });

    return Response.redirect(`${origin}/board?connect=ok`);
  } catch (e) {
    await log("callback_error", { error: String(e) });
    return Response.redirect(`${origin}/board?connect=error`);
  }
}
