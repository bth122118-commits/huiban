import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "./supabase";

// =====================================================================
// 汇办 Huiban · API 鉴权助手（服务端 route handler 用）
//
// 浏览器把 Supabase 会话 token 放在 `Authorization: Bearer <token>` 里，
// 服务端用 anon key 校验 token → 拿可信 user id → 查 memberships 授权。
// 依赖环境变量：NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// =====================================================================

export type AuthResult = { userId: string } | { error: Response };

export const MEMBER_ROLES = ["owner", "admin", "member"];
export const ADMIN_ROLES = ["owner", "admin"];

async function resolveUser(req: Request): Promise<string | null> {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  if (!token) return null;
  try {
    // 用 anon key 校验用户 JWT（不是 service role），拿到可信 user id
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// 校验调用者是 workspace 成员（默认 member 及以上；owner/admin 用 ADMIN_ROLES）
export async function authorize(
  req: Request,
  workspaceId: string,
  roles: string[] = MEMBER_ROLES
): Promise<AuthResult> {
  const userId = await resolveUser(req);
  if (!userId) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (!workspaceId) return { error: Response.json({ error: "forbidden" }, { status: 403 }) };

  const db = getAdminClient();
  const { data: m } = await db
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!m) return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  if (roles.length && !roles.includes(m.role)) return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  return { userId };
}
