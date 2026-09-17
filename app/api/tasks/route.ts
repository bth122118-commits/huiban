import { getAdminClient, handlerFor, splitHandler } from "@/lib/supabase";
import { authorize } from "@/lib/api-auth";

export const runtime = "nodejs";

const SORT_COLUMNS: Record<string, string> = {
  title: "title",
  status: "status_index",
  priority: "priority",
  due: "due_date",
  created: "created_at",
};

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const workspaceId = u.get("workspace_id");
  if (!workspaceId) return Response.json({ error: "missing workspace_id" }, { status: 400 });

  const auth = await authorize(req, workspaceId);
  if ("error" in auth) return auth.error;

  const db = getAdminClient();
  let query = db.from("tasks").select("*").eq("workspace_id", workspaceId);

  const templateId = u.get("template_id");
  if (templateId) query = query.eq("template_id", templateId);
  const source = u.get("source");
  if (source) query = query.eq("source", source);
  const category = u.get("category");
  if (category) query = query.eq("category", category);
  const q = u.get("q");
  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, "")}%`);

  const sort = u.get("sort") || "created";
  const col = SORT_COLUMNS[sort] || "created_at";
  const ascending = (u.get("dir") || "asc") !== "desc";
  query = query.order(col, { ascending });

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ tasks: data || [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { workspace_id, template_id, title, description, category, priority, due_date } = body || {};

  if (!workspace_id || !template_id || !String(title || "").trim()) {
    return Response.json({ error: "missing workspace_id / template_id / title" }, { status: 400 });
  }

  const auth = await authorize(req, workspace_id);
  if ("error" in auth) return auth.error;

  const db = getAdminClient();
  const { data: template } = await db.from("templates").select("*").eq("id", template_id).maybeSingle();
  if (!template) return Response.json({ error: "template not found" }, { status: 404 });
  if (template.workspace_id && template.workspace_id !== workspace_id) {
    return Response.json({ error: "template not in workspace" }, { status: 403 });
  }

  const cat = category || template.categories?.[0] || null;
  const cell = handlerFor(template, cat, 0);
  let { id: hid, name: hname } = splitHandler(cell);
  if (!hid && !hname) hid = auth.userId;

  const { data, error } = await db.from("tasks").insert({
    workspace_id, template_id,
    title: String(title).trim(),
    description: description || "",
    source: "manual",
    publisher_id: auth.userId,
    category: cat,
    handler_id: hid,
    handler_name: hname,
    priority: priority || "normal",
    due_date: due_date || null,
    status_index: 0,
    fresh: true,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ task: data });
}
