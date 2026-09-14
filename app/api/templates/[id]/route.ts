import { getAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

// 更新模板：名称、状态、类型、处理者矩阵、关键词；并同步钳制任务状态与处理者
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const db = getAdminClient();
  const { data: tpl } = await db.from("templates").select("*").eq("id", params.id).maybeSingle();
  if (!tpl) return Response.json({ error: "template not found" }, { status: 404 });

  const patch: Record<string, any> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.statuses !== undefined) patch.statuses = body.statuses;
  if (body.categories !== undefined) patch.categories = body.categories;
  if (body.handler_matrix !== undefined) patch.handler_matrix = body.handler_matrix;
  if (body.keywords !== undefined) patch.keywords = body.keywords;
  if (body.reply_keywords !== undefined) patch.reply_keywords = body.reply_keywords;

  const { data: updated, error } = await db.from("templates").update(patch).eq("id", params.id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 状态/类型变化后，钳制任务状态并按新矩阵重算处理者
  const statuses: string[] = updated.statuses || [];
  const categories: string[] = updated.categories || [];
  const matrix: (string | null)[][] = updated.handler_matrix || [];
  const { data: tasks } = await db.from("tasks").select("id, status_index, category, publisher_id").eq("template_id", params.id);
  for (const t of tasks || []) {
    const newStatus = Math.min(t.status_index, statuses.length - 1);
    const ci = Math.max(0, categories.indexOf(t.category));
    const handler = matrix[ci]?.[newStatus] || null;
    await db.from("tasks").update({ status_index: newStatus, handler_id: handler }).eq("id", t.id);
  }

  return Response.json({ template: updated });
}
