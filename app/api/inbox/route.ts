import { getAdminClient, applyStatusTransition, handlerFor } from "@/lib/supabase";
import { authorize } from "@/lib/api-auth";

export const runtime = "nodejs";

const PREFIX_RE = /^(re:|回复：|回复:|follow up:|quote request:|询价:|跟进:|待办:)/i;

export async function GET(req: Request) {
  const workspaceId = new URL(req.url).searchParams.get("workspace_id");
  if (!workspaceId) return Response.json({ error: "missing workspace_id" }, { status: 400 });

  const auth = await authorize(req, workspaceId);
  if ("error" in auth) return auth.error;

  const db = getAdminClient();
  const { data, error } = await db
    .from("inbox_items")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const drafts = (data || []).filter((i) => i.kind === "create");
  const replies = (data || []).filter((i) => i.kind === "reply");
  return Response.json({ drafts, replies });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, action } = body || {};
  if (!id || !action) return Response.json({ error: "missing id or action" }, { status: 400 });

  const db = getAdminClient();
  const { data: item } = await db.from("inbox_items").select("*").eq("id", id).maybeSingle();
  if (!item) return Response.json({ error: "not found" }, { status: 404 });
  if (item.status !== "pending") return Response.json({ already: item.status });

  const auth = await authorize(req, item.workspace_id);
  if ("error" in auth) return auth.error;

  if (action === "ignore") {
    await db.from("inbox_items").update({ status: "ignored" }).eq("id", id);
    return Response.json({ ok: true, action: "ignored" });
  }
  if (action !== "apply") return Response.json({ error: "unknown action" }, { status: 400 });

  if (item.kind === "create") {
    const { data: template } = await db.from("templates").select("*").eq("id", item.template_id).maybeSingle();
    if (!template) return Response.json({ error: "template not found" }, { status: 404 });

    const cat = template.categories?.[0] || null;
    const statusIndex = Math.min(item.target_status_index ?? 0, (template.statuses || []).length - 1);
    const handler = handlerFor(template, cat, statusIndex) || auth.userId;
    const title = String(item.subject || "").replace(PREFIX_RE, "").trim() || item.subject;

    const { data: task, error } = await db.from("tasks").insert({
      workspace_id: item.workspace_id, template_id: item.template_id,
      title, description: item.body || "", source: "mail",
      publisher_id: auth.userId, category: cat, handler_id: handler,
      priority: "normal", due_date: null, status_index: statusIndex,
      fresh: true, thread_id: item.thread_id || null,
    }).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await db.from("inbox_items").update({ status: "applied" }).eq("id", id);
    return Response.json({ ok: true, action: "created", task });
  }

  // kind === 'reply'
  const { data: task } = await db.from("tasks").select("*").eq("id", item.ref_task_id).maybeSingle();
  if (!task) {
    await db.from("inbox_items").update({ status: "ignored" }).eq("id", id);
    return Response.json({ ok: true, action: "skipped", reason: "ref_task_missing" });
  }
  const { data: template } = await db.from("templates").select("*").eq("id", task.template_id).maybeSingle();
  if (!template) return Response.json({ error: "template not found" }, { status: 404 });

  const statuses: string[] = template.statuses || [];
  const target = Math.min(item.target_status_index ?? task.status_index + 1, statuses.length - 1);
  await applyStatusTransition(db, task, template, target, {
    actorId: auth.userId,
    note: `回复邮件「${item.matched_keyword || ""}」`,
  });

  await db.from("inbox_items").update({ status: "applied" }).eq("id", id);
  return Response.json({ ok: true, action: "reply_applied", status: statuses[target] });
}
