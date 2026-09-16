import { createClient } from "@supabase/supabase-js";

const supabase = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const runtime = "nodejs";

function matchKeyword(text: string, keywords: string[]): string | null {
  const t = text.toLowerCase();
  return keywords.find((k) => t.includes(String(k).toLowerCase())) || null;
}
function isReply(headers: Record<string, string>, subject: string): boolean {
  if (headers["in-reply-to"] || headers["references"]) return true;
  return /^(re:|回复：|回复:)/i.test(subject);
}
async function applyStatusTransition(db: ReturnType<typeof supabase>, task: any, template: any, newIndex: number, note: string) {
  const statuses: string[] = template.statuses || [];
  const categories: string[] = template.categories || [];
  const matrix: any[][] = template.handler_matrix || [];
  let ci = categories.indexOf(task.category);
  if (ci < 0) ci = 0;
  const handler = matrix[ci]?.[newIndex] || task.publisher_id;
  await db.from("tasks").update({ status_index: newIndex, handler_id: handler, fresh: true }).eq("id", task.id);
  await db.from("task_events").insert({ task_id: task.id, actor_id: null, from_status: statuses[task.status_index], to_status: statuses[newIndex], note });
}

export async function POST(req: Request) {
  // TODO(生产)：校验 Resend 签名（svix-id / svix-timestamp / svix-signature）
  const payload = await req.json();

  // Resend 只会在该 webhook 上发 email.received 事件（只要你在控制台只勾了这个）
  if (payload.type && payload.type !== "email.received") {
    return Response.json({ ok: true, skipped: "not_email_received" });
  }

  // Resend 的收件 payload 是 { type, data: {from, to, subject, ...} }
  const data = payload.data || payload;
  const recipient = Array.isArray(data.to) ? data.to[0] : data.to;
  const from = data.from;
  const subject: string = data.subject || "";
  const body: string = String(data.text || "").slice(0, 4000);
  const headers: Record<string, string> = {};
  (data.headers || []).forEach((h: { name: string; value: string }) => {
    headers[String(h.name).toLowerCase()] = h.value;
  });
  const messageId = headers["message-id"] || null;
  const inReplyTo = headers["in-reply-to"] || null;
  const references = headers["references"] || null;

  const db = supabase();

  const { data: account } = await db.from("email_accounts").select("workspace_id, template_id").eq("email", recipient).maybeSingle();
  if (!account) return Response.json({ ok: true, skipped: "no_account" });
  const { workspace_id, template_id } = account;

  let templates: any[] = [];
  if (template_id) {
    const { data: t } = await db.from("templates").select("*").eq("id", template_id).maybeSingle();
    templates = t ? [t] : [];
  } else {
    const { data: ts } = await db.from("templates").select("*").eq("workspace_id", workspace_id);
    templates = ts || [];
  }

  const text = `${subject}\n${body}`;
  const reply = isReply(headers, subject);
  const refs = [inReplyTo, ...(references ? references.split(/[\s,]+/) : [])].filter(Boolean);

  for (const tpl of templates) {
    if (reply) {
      const kw = matchKeyword(text, tpl.reply_keywords || []);
      if (!kw) continue;

      let task = null;
      for (const r of refs) {
        const { data: found } = await db.from("tasks").select("*").eq("thread_id", r).eq("template_id", tpl.id).maybeSingle();
        if (found) { task = found; break; }
      }
      if (!task) {
        const bare = subject.replace(/^(re:|回复：|回复:)/i, "").trim();
        const { data: found } = await db.from("tasks").select("*").ilike("title", `%${bare}%`).eq("template_id", tpl.id).limit(1);
        task = found?.[0] || null;
      }
      if (!task) continue;

      const statuses: string[] = tpl.statuses || [];
      const target = Math.min(task.status_index + 1, statuses.length - 1);
      await applyStatusTransition(db, task, tpl, target, `回复邮件「${kw}」`);
      await db.from("inbox_items").insert({ workspace_id, template_id: tpl.id, kind: "reply", from_email: from, subject, body, matched_keyword: kw, ref_task_id: task.id, target_status_index: target, thread_id: inReplyTo || references || null, status: "applied" });
      return Response.json({ ok: true, action: "reply_applied", task_id: task.id, status: statuses[target] });
    }

    const kw = matchKeyword(text, tpl.keywords || []);
    if (!kw) continue;

    if (inReplyTo || references) {
      const { data: dup } = await db.from("inbox_items").select("id").eq("thread_id", inReplyTo || references).eq("status", "pending").maybeSingle();
      if (dup) return Response.json({ ok: true, skipped: "duplicate" });
    }

    await db.from("inbox_items").insert({ workspace_id, template_id: tpl.id, kind: "create", from_email: from, subject, body, matched_keyword: kw, thread_id: messageId || null, status: "pending" });
    return Response.json({ ok: true, action: "draft_created", keyword: kw });
  }

  return Response.json({ ok: true, skipped: "no_match" });
}
