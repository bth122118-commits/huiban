import { read, utils } from "xlsx";
import { getAdminClient, handlerFor, resolveMemberIdByName } from "@/lib/supabase";

export const runtime = "nodejs";

const HEADER_ALIASES: Record<string, string[]> = {
  title: ["任务", "标题", "事项", "内容", "task", "title", "name"],
  handler: ["处理者", "负责人", "经办人", "handler", "assignee", "owner"],
  due: ["截止", "截止日期", "日期", "due", "date", "deadline"],
};

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}
function findField(row: Record<string, any>, aliases: string[]): any {
  for (const key of Object.keys(row)) {
    if (aliases.some((a) => norm(key) === a || norm(key).includes(a))) return row[key];
  }
  return null;
}
function parseDate(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const mode = new URL(req.url).searchParams.get("mode") || "import";
  const form = await req.formData();
  const workspaceId = String(form.get("workspace_id") || "");
  const templateId = String(form.get("template_id") || "");
  const publisherId = String(form.get("publisher_id") || "");
  const file = form.get("file") as File | null;

  if (!workspaceId || !templateId) return Response.json({ error: "missing workspace_id or template_id" }, { status: 400 });
  if (!file) return Response.json({ error: "missing file" }, { status: 400 });

  const db = getAdminClient();
  const { data: template } = await db.from("templates").select("*").eq("id", templateId).maybeSingle();
  if (!template) return Response.json({ error: "template not found" }, { status: 404 });

  const wb = read(await file.arrayBuffer());
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, any>[] = sheet ? utils.sheet_to_json(sheet, { defval: "" }) : [];

  const category = template.categories?.[0] || null;
  const mapped: any[] = [];
  for (const row of rows) {
    const title = findField(row, HEADER_ALIASES.title);
    if (!title) continue;
    const handlerName = findField(row, HEADER_ALIASES.handler);
    const handlerId = (await resolveMemberIdByName(db, workspaceId, handlerName))
      || handlerFor(template, category, 0)
      || (publisherId || null);
    mapped.push({
      workspace_id: workspaceId, template_id: templateId,
      title: String(title).trim(), description: "", source: "excel",
      publisher_id: publisherId || null, category, handler_id: handlerId,
      priority: "normal", due_date: parseDate(findField(row, HEADER_ALIASES.due)),
      status_index: 0, fresh: true,
    });
  }

  if (mode === "preview") return Response.json({ rows: mapped });

  const toInsert: any[] = [];
  for (const m of mapped) {
    const { data: dup } = await db.from("tasks").select("id").eq("workspace_id", workspaceId).eq("title", m.title).maybeSingle();
    if (!dup) toInsert.push(m);
  }

  const { data, error } = await db.from("tasks").insert(toInsert).select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ imported: (data || []).length, skipped: mapped.length - (data || []).length });
}
