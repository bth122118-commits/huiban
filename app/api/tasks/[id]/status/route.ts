import { getAdminClient, applyStatusTransition } from "@/lib/supabase";

export const runtime = "nodejs";

// Next.js 14：params 同步；Next.js 15：需 `const { id } = await params`
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const newIndex = Number(body?.status_index);
  if (isNaN(newIndex)) return Response.json({ error: "invalid status_index" }, { status: 400 });

  const db = getAdminClient();
  const { data: task } = await db.from("tasks").select("*").eq("id", params.id).maybeSingle();
  if (!task) return Response.json({ error: "task not found" }, { status: 404 });

  const { data: template } = await db.from("templates").select("*").eq("id", task.template_id).maybeSingle();
  if (!template) return Response.json({ error: "template not found" }, { status: 404 });

  await applyStatusTransition(db, task, template, newIndex, {
    actorId: body?.actor_id ?? null,
    note: body?.note ?? null,
  });

  const { data: updated } = await db.from("tasks").select("*").eq("id", params.id).single();
  return Response.json({ task: updated });
}
