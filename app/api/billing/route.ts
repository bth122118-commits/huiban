import { getAdminClient } from "@/lib/supabase";
import { resolveUser } from "@/lib/api-auth";

export const runtime = "nodejs";

// 当前用户的订阅信息（定价页显示「已订阅 / 剩余天数」用）
export async function GET(req: Request) {
  const userId = await resolveUser(req);
  if (!userId) return Response.json({ subscription: null });

  const db = getAdminClient();
  const { data } = await db
    .from("subscriptions")
    .select("plan, status, renews_at, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  return Response.json({ subscription: data?.[0] || null });
}
