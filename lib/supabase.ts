// =====================================================================
// 汇办 Huiban · 共享 Supabase 工具库
// 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// =====================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** 服务端 admin client（绕过 RLS，用于 webhook / 后台任务）。切勿暴露到浏览器。 */
export function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/** 浏览器 client（走 RLS，用 anon key + 用户会话）。 */
export function getBrowserClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ── 处理者解析：矩阵单元 = 成员 user_id | "ext:外部姓名" | null ─────────
export function splitHandler(cell: string | null): { id: string | null; name: string | null } {
  if (!cell) return { id: null, name: null };
  if (cell.startsWith("ext:")) return { id: null, name: cell.slice(4) };
  return { id: cell, name: null };
}

// ── 处理者推导：handler_matrix[类型下标][状态下标]，空则回退 null ───────
export function handlerFor(template: any, category: string, statusIndex: number): string | null {
  const categories: string[] = template.categories || [];
  const matrix: any[][] = template.handler_matrix || [];
  let ci = categories.indexOf(category);
  if (ci < 0) ci = 0;
  return matrix[ci]?.[statusIndex] || null;
}

// ── 状态转移的「单一事实来源」：改状态 + 按矩阵切处理者 + 写协同记录 ───
// 所有改状态的入口（前端推进 / 表格下拉 / 回复邮件 / 未来 RPC）都应走这里。
export async function applyStatusTransition(
  db: SupabaseClient,
  task: any,
  template: any,
  newIndex: number,
  opts: { actorId?: string | null; note?: string | null } = {}
): Promise<void> {
  const statuses: string[] = template.statuses || [];
  if (newIndex < 0 || newIndex >= statuses.length) {
    throw new Error(`invalid status index: ${newIndex}`);
  }

  const cell = handlerFor(template, task.category, newIndex);
  let { id, name } = splitHandler(cell);
  if (!id && !name) id = task.publisher_id; // 矩阵未指派时回退给发布者

  const { error: upd } = await db
    .from("tasks")
    .update({ status_index: newIndex, handler_id: id, handler_name: name, fresh: true })
    .eq("id", task.id);
  if (upd) throw upd;

  await db.from("task_events").insert({
    task_id: task.id,
    actor_id: opts.actorId ?? null,
    from_status: statuses[task.status_index],
    to_status: statuses[newIndex],
    note: opts.note ?? null,
  });
}

// ── 建工作区：调 schema.sql 里的 create_workspace RPC（owner 取 auth.uid()）──
export async function createWorkspace(db: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await db.rpc("create_workspace", { p_name: name });
  if (error) throw error;
  return data as string;
}

// ── 按显示名在工作区内解析成员 id（用于 Excel 导入的「处理者」列）──────
export async function resolveMemberIdByName(db: SupabaseClient, workspaceId: string, name: string): Promise<string | null> {
  if (!name) return null;
  const { data } = await db
    .from("profiles")
    .select("id")
    .eq("name", String(name).trim())
    .maybeSingle();
  return data?.id || null;
}
