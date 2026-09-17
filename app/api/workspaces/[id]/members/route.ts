import { getAdminClient } from "@/lib/supabase";
import { authorize, ADMIN_ROLES } from "@/lib/api-auth";

export const runtime = "nodejs";

// 工作区成员列表（供处理者矩阵下拉选择）
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(req, params.id);
  if ("error" in auth) return auth.error;

  const db = getAdminClient();
  const { data: mems } = await db.from("memberships").select("user_id, role").eq("workspace_id", params.id);
  const ids = (mems || []).map((m) => m.user_id);
  let profs: any[] = [];
  if (ids.length) {
    const { data } = await db.from("profiles").select("id, name").in("id", ids);
    profs = data || [];
  }
  const members = (mems || []).map((m) => {
    const p = profs.find((x) => x.id === m.user_id);
    return { id: m.user_id, name: p?.name || m.user_id.slice(0, 8), role: m.role };
  });
  return Response.json({ members });
}

// 添加成员（按邮箱；对方需先在系统注册过）
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(req, params.id, ADMIN_ROLES);
  if ("error" in auth) return auth.error;

  const { email } = await req.json();
  const db = getAdminClient();
  const { data } = await db.auth.admin.listUsers();
  const user = (data?.users || []).find((u) => (u.email || "").toLowerCase() === String(email || "").toLowerCase());
  if (!user) return Response.json({ error: "找不到这个邮箱的用户（需先注册）" }, { status: 404 });
  const { data: dup } = await db.from("memberships").select("id").eq("workspace_id", params.id).eq("user_id", user.id).maybeSingle();
  if (dup) return Response.json({ error: "该用户已是成员" }, { status: 409 });
  await db.from("memberships").insert({ workspace_id: params.id, user_id: user.id, role: "member" });
  return Response.json({ ok: true });
}
