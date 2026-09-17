import { getAdminClient } from "@/lib/supabase";
import { authorize, ADMIN_ROLES } from "@/lib/api-auth";

export const runtime = "nodejs";

// 查当前工作台绑定的收件邮箱
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(req, params.id);
  if ("error" in auth) return auth.error;

  const db = getAdminClient();
  const { data } = await db.from("email_accounts").select("email").eq("workspace_id", params.id).maybeSingle();
  return Response.json({ account: data || null });
}

// 设置/更新收件邮箱（upsert）
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(req, params.id, ADMIN_ROLES);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const email = String(body?.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }
  const db = getAdminClient();
  const { data: existing } = await db.from("email_accounts").select("id").eq("workspace_id", params.id).maybeSingle();
  if (existing) {
    await db.from("email_accounts").update({ email }).eq("id", existing.id);
  } else {
    await db.from("email_accounts").insert({ workspace_id: params.id, email, provider: "forward" });
  }
  return Response.json({ ok: true, email });
}
