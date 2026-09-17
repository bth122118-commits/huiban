-- =====================================================================
-- 汇办 Huiban · 清理测试产生的多余工作台
-- 目标：一个帐号只保留一个工作台（联机协作进别人的工作台是另一回事）
-- 用法：Supabase → SQL Editor → 依次执行下面两步
-- 注意：删除工作台会「级联」删掉它的任务/模板/收件箱草稿/绑定邮箱/成员关系
-- =====================================================================

-- ── 第 1 步：列出所有工作台（含 owner 邮箱 + 任务数）───────────────────
-- 直接整段粘贴执行，无需替换任何东西。
-- 在结果里找到 owner_email 是你邮箱的那些行，判断留哪个（通常留任务数最多的）。
select
  w.id,
  w.name,
  w.created_at,
  u.email as owner_email,
  (select count(*) from public.tasks t where t.workspace_id = w.id) as task_count
from public.workspaces w
join public.memberships m on m.workspace_id = w.id and m.role = 'owner'
join auth.users u on u.id = m.user_id
order by owner_email, task_count desc;

-- ── 第 2 步：删除多余的工作台（保留一个，其余逐个删）────────────────────
-- 每删一个：把 '粘贴要删的工作台id' 换成第 1 步结果里的 id，执行一次。
-- 想「合并」而不是「整删」的话，先别跑 delete，告诉我，我给你写 merge 版。
-- delete from public.workspaces where id = '粘贴要删的工作台id';

-- ── 方案 B：一键全删（想彻底重来用这个）────────────────────────────────
-- 换成你的邮箱执行一次，把该邮箱名下所有工作台连同数据全删。
-- 删完这个账号就没有工作台了，下次打开应用会自动跳到「创建工作台」。
-- delete from public.workspaces
-- where id in (
--   select m.workspace_id
--   from public.memberships m
--   join auth.users u on u.id = m.user_id
--   where u.email = '你的邮箱'
-- );
