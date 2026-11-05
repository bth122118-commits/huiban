import { getAdminClient, seatLimit } from "@/lib/supabase";
import { authorize, ADMIN_ROLES } from "@/lib/api-auth";

export const runtime = "nodejs";

// 查工作区的座位信息：owner 的套餐 → 上限 + 已用数
async function getSeatInfo(db: any, workspaceId: string) {
  const { data: owners } = await db.from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").limit(1);
  const ownerId = owners?.[0]?.user_id;
  let plan: string | null = null;
  if (ownerId) {
    const { data: subs } = await db.from("subscriptions").select("plan, status").eq("user_id", ownerId).eq("status", "active").limit(1);
    plan = subs?.[0]?.plan || null;
  }
  const limit = seatLimit(plan);
  const { data: nonOwner } = await db.from("memberships").select("id").eq("workspace_id", workspaceId).neq("role", "owner");
  const used = (nonOwner || []).length;
  return { plan, limit, used };
}

// 工作区成员列表（供处理者矩阵下拉选择）+ 座位信息
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
  const seats = await getSeatInfo(db, params.id);
  return Response.json({ members, seats });
}

// 添加成员（按邮箱；对方需先在系统注册过）；受座位限制
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(req, params.id, ADMIN_ROLES);
  if ("error" in auth) return auth.error;

  const db = getAdminClient();
  const seats = await getSeatInfo(db, params.id);
  if (seats.used >= seats.limit) {
    const err = seats.limit === 0
      ? "当前套餐不能邀请成员，请升级"
      : `座位已满（${seats.used}/${seats.limit}），请升级`;
    return Response.json({ error: err }, { status: 403 });
  }

  const { email } = await req.json();
  const { data } = await db.auth.admin.listUsers();
  const user = (data?.users || []).find((u) => (u.email || "").toLowerCase() === String(email || "").toLowerCase());
  if (!user) return Response.json({ error: "找不到这个邮箱的用户（需先注册）" }, { status: 404 });
  const { data: dup } = await db.from("memberships").select("id").eq("workspace_id", params.id).eq("user_id", user.id).maybeSingle();
  if (dup) return Response.json({ error: "该用户已是成员" }, { status: 409 });
  await db.from("memberships").insert({ workspace_id: params.id, user_id: user.id, role: "member" });
  return Response.json({ ok: true });
}
