import { read, utils } from "xlsx";
import { getAdminClient, handlerFor, resolveMemberIdByName, splitHandler } from "@/lib/supabase";
import { authorize } from "@/lib/api-auth";

export const runtime = "nodejs";

const HEADER_ALIASES: Record<string, string[]> = {
  title: ["任务", "标题", "事项", "内容", "task", "title", "name"],
  handler: ["处理者", "负责人", "经办人", "handler", "assignee", "owner"],
  due: ["截止", "截止日期", "日期", "due", "date", "deadline"],
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 2000;
const MAX_TITLE_LEN = 300;

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
  const file = form.get("file") as File | null;

  if (!workspaceId || !templateId) return Response.json({ error: "missing workspace_id or template_id" }, { status: 400 });
  if (!file) return Response.json({ error: "missing file" }, { status: 400 });
  if (!/\.(xlsx|xls)$/i.test(file.name)) return Response.json({ error: "unsupported_file_type" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return Response.json({ error: "file_too_large" }, { status: 400 });

  const auth = await authorize(req, workspaceId);
  if ("error" in auth) return auth.error;

  const db = getAdminClient();
  const { data: template } = await db.from("templates").select("*").eq("id", templateId).maybeSingle();
  if (!template) return Response.json({ error: "template not found" }, { status: 404 });
  if (template.workspace_id && template.workspace_id !== workspaceId) {
    return Response.json({ error: "template not in workspace" }, { status: 403 });
  }

  const wb = read(await file.arrayBuffer());
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, any>[] = sheet ? utils.sheet_to_json(sheet, { defval: "" }) : [];
  if (rows.length > MAX_ROWS) return Response.json({ error: "too_many_rows" }, { status: 400 });

  const category = template.categories?.[0] || null;
  const mapped: any[] = [];
  for (const row of rows) {
    const title = findField(row, HEADER_ALIASES.title);
    if (!title) continue;
    const handlerName = findField(row, HEADER_ALIASES.handler);
    // 处理者：Excel 里是姓名 —— 命中成员转 user_id，否则当外部处理者存姓名
    let hid: string | null = null;
    let hname: string | null = null;
    const memberId = await resolveMemberIdByName(db, workspaceId, handlerName);
    if (memberId) hid = memberId;
    else if (handlerName) hname = String(handlerName).trim();
    if (!hid && !hname) {
      const { id, name } = splitHandler(handlerFor(template, category, 0));
      hid = id; hname = name;
      if (!hid && !hname) hid = auth.userId;
    }
    mapped.push({
      workspace_id: workspaceId, template_id: templateId,
      title: String(title).trim().slice(0, MAX_TITLE_LEN), description: "", source: "excel",
      publisher_id: auth.userId, category, handler_id: hid, handler_name: hname,
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
