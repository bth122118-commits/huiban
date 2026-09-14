import { getAdminClient, handlerFor } from "@/lib/supabase";

export const runtime = "nodejs";

// 编辑任务：改字段；若类型(category)变了，按矩阵重算处理者
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const db = getAdminClient();
  const { data: task } = await db.from("tasks").select("*").eq("id", params.id).maybeSingle();
  if (!task) return Response.json({ error: "task not found" }, { status: 404 });

  const patch: Record<string, any> = {};
  if (body.title !== undefined) patch.title = String(body.title).trim();
  if (body.description !== undefined) patch.description = body.description;
  if (body.priority !== undefined) patch.priority = body.priority;
  if (body.due_date !== undefined) patch.due_date = body.due_date || null;
  if (body.fresh !== undefined) patch.fresh = body.fresh;

  if (body.category !== undefined && body.category !== task.category) {
    patch.category = body.category;
    const { data: template } = await db.from("templates").select("*").eq("id", task.template_id).maybeSingle();
    if (template) patch.handler_id = handlerFor(template, body.category, task.status_index) || task.publisher_id || task.handler_id;
  }

  if (!Object.keys(patch).length) return Response.json({ task });

  const { data, error } = await db.from("tasks").update(patch).eq("id", params.id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ task: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const db = getAdminClient();
  const { error } = await db.from("tasks").delete().eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
