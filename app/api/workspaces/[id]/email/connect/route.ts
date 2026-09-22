import { authorize, ADMIN_ROLES } from "@/lib/api-auth";
import { authorizeUrl } from "@/lib/aurinko";

export const runtime = "nodejs";

// 发起「连接邮箱」：返回 Aurinko 授权 URL，前端跳转过去
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(req, params.id, ADMIN_ROLES);
  if ("error" in auth) return auth.error;

  const origin = new URL(req.url).origin;
  const returnUrl = `${origin}/api/email/aurinko/callback`;
  const url = authorizeUrl(returnUrl, params.id); // state = workspace id（回调时归属用）
  return Response.json({ url });
}
