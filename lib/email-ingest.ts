import type { SupabaseClient } from "@supabase/supabase-js";
import { splitHandler } from "./supabase";

// =====================================================================
// 汇办 Huiban · 邮件摄取核心（供应商无关）
//
// 任何「收新邮件」入口（Resend 转发 / Nylas / Aurinko / Unipile）解析出
// 统一的消息字段后，都调这里做：关键词匹配 → 建草稿 / 回复自动更新状态。
// 归属工作区由调用方负责（按收件地址 或 连接的账号 id → email_accounts）。
// =====================================================================

export type InboundMessage = {
  from: string;
  subject: string;
  body: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
};

export type IngestResult =
  | { ok: true; action: "reply_applied"; task_id: string; status: string }
  | { ok: true; action: "draft_created"; keyword: string }
  | { ok: true; skipped: "no_match" | "duplicate" };

// 关键词匹配：兼容旧格式（字符串数组）和新格式（{keyword, target}）。
// 接受关键词 target = 起始列；回复关键词 target = 目标列；空 target = 默认行为。
function matchKeywordEntry(text: string, entries: any[]): { keyword: string; target: string | null } | null {
  const t = text.toLowerCase();
  for (const item of entries || []) {
    if (typeof item === "string") {
      if (t.includes(item.toLowerCase())) return { keyword: item, target: null };
    } else if (item && typeof item.keyword === "string") {
      if (t.includes(item.keyword.toLowerCase())) return { keyword: item.keyword, target: item.target || null };
    }
  }
  return null;
}

async function applyStatusTransition(db: SupabaseClient, task: any, template: any, newIndex: number, note: string) {
  const statuses: string[] = template.statuses || [];
  const categories: string[] = template.categories || [];
  const matrix: any[][] = template.handler_matrix || [];
  let ci = categories.indexOf(task.category);
  if (ci < 0) ci = 0;
  let { id: hid, name: hname } = splitHandler(matrix[ci]?.[newIndex] || null);
  if (!hid && !hname) hid = task.publisher_id;
  await db.from("tasks").update({ status_index: newIndex, handler_id: hid, handler_name: hname, fresh: true }).eq("id", task.id);
  await db.from("task_events").insert({ task_id: task.id, actor_id: null, from_status: statuses[task.status_index], to_status: statuses[newIndex], note });
}

export async function ingestMessage(
  db: SupabaseClient,
  account: { workspace_id: string; template_id: string | null },
  msg: InboundMessage
): Promise<IngestResult> {
  const { workspace_id, template_id } = account;

  let templates: any[] = [];
  if (template_id) {
    const { data: t } = await db.from("templates").select("*").eq("id", template_id).maybeSingle();
    templates = t ? [t] : [];
  } else {
    const { data: ts } = await db.from("templates").select("*").eq("workspace_id", workspace_id);
    templates = ts || [];
  }

  const text = `${msg.subject}\n${msg.body}`;
  const reply = !!(msg.inReplyTo || msg.references) || /^(re:|回复：|回复:)/i.test(msg.subject);
  const refs = [msg.inReplyTo, ...(msg.references ? msg.references.split(/[\s,]+/) : [])].filter(Boolean) as string[];

  for (const tpl of templates) {
    if (reply) {
      // 回复关键词只看正文（主题会带「Re: 天台开工」这样的旧阶段，会抢词）
      const replyText = msg.body && msg.body.trim() ? msg.body : text;
      const matched = matchKeywordEntry(replyText, tpl.reply_keywords || []);
      if (!matched) continue;

      // 去重：同一线程已处理过的回复跳过（防 webhook 重复投递导致重复推进）
      if (msg.inReplyTo || msg.references) {
        const { data: dup } = await db.from("inbox_items").select("id").eq("thread_id", msg.inReplyTo || msg.references).eq("kind", "reply").eq("status", "applied").maybeSingle();
        if (dup) return { ok: true, skipped: "duplicate" };
      }

      let task: any = null;
      for (const r of refs) {
        const { data: found } = await db.from("tasks").select("*").eq("thread_id", r).eq("template_id", tpl.id).maybeSingle();
        if (found) { task = found; break; }
      }
      if (!task) {
        const bare = msg.subject.replace(/^(re:|回复：|回复:)/i, "").trim();
        const { data: found } = await db.from("tasks").select("*").ilike("title", `%${bare}%`).eq("template_id", tpl.id).limit(1);
        task = found?.[0] || null;
      }
      if (!task) continue;

      const statuses: string[] = tpl.statuses || [];
      let target = task.status_index + 1;
      if (matched.target) {
        const idx = statuses.indexOf(matched.target);
        if (idx >= 0) target = idx;
      } else {
        // 没显式设目标时，若有关键词同名的状态，自动映射到它（如「完工」→「完工」栏）
        const sameName = statuses.indexOf(matched.keyword);
        if (sameName >= 0) target = sameName;
      }
      target = Math.min(Math.max(target, 0), statuses.length - 1);
      await applyStatusTransition(db, task, tpl, target, `回复邮件「${matched.keyword}」`);
      await db.from("inbox_items").insert({
        workspace_id, template_id: tpl.id, kind: "reply",
        from_email: msg.from, subject: msg.subject, body: msg.body,
        matched_keyword: matched.keyword, ref_task_id: task.id, target_status_index: target,
        thread_id: msg.inReplyTo || msg.references || null, status: "applied",
      });
      return { ok: true, action: "reply_applied", task_id: task.id, status: statuses[target] };
    }

    const matched = matchKeywordEntry(text, tpl.keywords || []);
    if (!matched) continue;

    if (msg.inReplyTo || msg.references) {
      const { data: dup } = await db.from("inbox_items").select("id").eq("thread_id", msg.inReplyTo || msg.references).eq("status", "pending").maybeSingle();
      if (dup) return { ok: true, skipped: "duplicate" };
    }

    let startIndex = 0;
    if (matched.target) {
      const idx = (tpl.statuses || []).indexOf(matched.target);
      if (idx >= 0) startIndex = idx;
    } else {
      // 没显式设起始列时，若有关键词同名的状态，自动落到它
      const sameName = (tpl.statuses || []).indexOf(matched.keyword);
      if (sameName >= 0) startIndex = sameName;
    }

    await db.from("inbox_items").insert({
      workspace_id, template_id: tpl.id, kind: "create",
      from_email: msg.from, subject: msg.subject, body: msg.body,
      matched_keyword: matched.keyword, target_status_index: startIndex, thread_id: msg.messageId || null, status: "pending",
    });
    return { ok: true, action: "draft_created", keyword: matched.keyword };
  }

  return { ok: true, skipped: "no_match" };
}
