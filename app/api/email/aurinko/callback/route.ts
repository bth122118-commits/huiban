import { getAdminClient } from "@/lib/supabase";
import { exchangeCode, subscribeWebhook } from "@/lib/aurinko";

export const runtime = "nodejs";

// Aurinko 授权完成后的回调：换 token → 存 email_accounts → 订阅 webhook → 回看板
export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state"); // workspace id
  const origin = u.origin;

  if (!code || !state) return Response.redirect(`${origin}/board?connect=error`);

  try {
    const { accountId, accessToken } = await exchangeCode(code);
    const db = getAdminClient();
    const { data: existing } = await db.from("email_accounts").select("id").eq("workspace_id", state).maybeSingle();
    const row = {
      workspace_id: state,
      provider_account_id: String(accountId),
      provider: "gmail",
      connection: { accessToken, accountId },
    };
    if (existing) await db.from("email_accounts").update(row).eq("id", existing.id);
    else await db.from("email_accounts").insert(row);

    // 订阅新邮件 webhook（失败不阻断连接）
    await subscribeWebhook(accessToken, `${origin}/api/email/aurinko`).catch(() => {});

    return Response.redirect(`${origin}/board?connect=ok`);
  } catch {
    return Response.redirect(`${origin}/board?connect=error`);
  }
}
