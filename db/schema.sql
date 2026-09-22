-- =====================================================================
-- 汇办 Huiban · 数据库 Schema（Supabase / Postgres）
-- 用法：Supabase 控制台 → SQL Editor → 整段粘贴执行（可重复执行）
-- 说明：JSONB 字段承载模板的数组结构，与前端原型 task-tracker.html 对齐
-- =====================================================================

create extension if not exists "pgcrypto";

-- ── profiles：用户显示名（挂在 auth.users 上）────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  lang text not null default 'zh',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id);

-- 新用户注册时自动建 profile（name 取邮箱前缀，供「处理者」按名解析）
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, lang)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 'zh')
  on conflict (id) do nothing;
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── workspaces ────────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;

-- ── memberships：成员 + 角色 ──────────────────────────────────────────
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',      -- owner | admin | member | viewer
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
alter table public.memberships enable row level security;

-- ── templates：模板 = 流水线 + 类型 + 矩阵 + 关键词 ─────────────────────
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,  -- null = 系统预设
  name text not null,
  lang text not null default 'zh',           -- 'zh' | 'en'，界面语言跟随
  description text default '',
  statuses jsonb not null default '[]'::jsonb,          -- ["待处理","进行中",…]
  categories jsonb not null default '[]'::jsonb,        -- ["一般","水喉",…]
  handler_matrix jsonb,                                 -- [[user_id|null],…] 维度 categories × statuses
  keywords jsonb not null default '[]'::jsonb,          -- 接受关键词
  reply_keywords jsonb not null default '[]'::jsonb,    -- 回复关键词
  is_preset boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.templates enable row level security;

-- ── tasks ─────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null references public.templates(id) on delete cascade,
  title text not null,
  description text default '',
  source text not null default 'manual',       -- mail | excel | manual
  publisher_id uuid references auth.users(id),
  category text,                               -- 类型名（冗余，便于筛选）
  handler_id uuid references auth.users(id),   -- 当前处理者（成员，随状态自动切换）
  handler_name text,                           -- 外部处理者（供应商/承办商，非用户）
  priority text not null default 'normal',     -- urgent | high | normal
  due_date date,
  status_index int not null default 0,         -- 指向 template.statuses 下标
  fresh boolean not null default true,         -- NEW 标记
  thread_id text,                              -- 邮件 Message-ID（回复线程归属用）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_workspace_idx on public.tasks(workspace_id);
create index if not exists tasks_template_status_idx on public.tasks(template_id, status_index);
create index if not exists tasks_thread_idx on public.tasks(thread_id);
alter table public.tasks enable row level security;
-- 迁移：老库补 handler_name 列（幂等）
alter table public.tasks add column if not exists handler_name text;

-- ── task_events：协同记录 / 活动日志 ───────────────────────────────────
create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references auth.users(id),
  from_status text,
  to_status text,
  note text,                                   -- 如「回复邮件「报价」」
  created_at timestamptz not null default now()
);
create index if not exists task_events_task_idx on public.task_events(task_id, created_at);
alter table public.task_events enable row level security;

-- ── inbox_items：邮件草稿 / 回复识别 ──────────────────────────────────
create table if not exists public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid references public.templates(id) on delete cascade,
  kind text not null,                          -- create | reply
  from_email text,
  subject text,
  body text,
  matched_keyword text,
  ref_task_id uuid references public.tasks(id) on delete set null,
  target_status_index int,
  thread_id text,
  status text not null default 'pending',      -- pending | applied | ignored
  created_at timestamptz not null default now()
);
alter table public.inbox_items enable row level security;

-- ── email_accounts：连接的邮箱（个人版连自己 / 团队版连一人）──────────
create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid references public.templates(id) on delete set null,  -- 指定则按此模板匹配
  email text,                                 -- 连接的邮箱地址（连接流拿不到 email 时可为空）
  provider_account_id text,                   -- 统一邮箱 API 的账号 id（路由用）
  provider text not null default 'forward',    -- gmail | outlook | imap（forward 为旧方案兜底）
  connection jsonb,
  created_at timestamptz not null default now()
);
alter table public.email_accounts enable row level security;
-- 迁移：老库补 provider_account_id 列（幂等）
alter table public.email_accounts add column if not exists provider_account_id text;
alter table public.email_accounts alter column email drop not null;

-- ── updated_at 触发器 ────────────────────────────────────────────────
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- ── RLS 策略 ─────────────────────────────────────────────────────────
-- workspaces：成员可读（创建走 create_workspace 函数）
drop policy if exists "ws_read_member" on public.workspaces;
create policy "ws_read_member" on public.workspaces for select using (
  exists (select 1 from public.memberships m where m.workspace_id = workspaces.id and m.user_id = auth.uid())
);

-- memberships：成员可读自己的记录；owner/admin 可写（用 security definer 助手避免自引用递归）
drop policy if exists "membership_read" on public.memberships;
create policy "membership_read" on public.memberships for select using (user_id = auth.uid());

create or replace function public.is_workspace_admin(ws uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where workspace_id = ws and user_id = auth.uid() and role in ('owner','admin')
  );
$$;

drop policy if exists "membership_write" on public.memberships;
create policy "membership_write" on public.memberships for all
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- templates：预设（null 工作区）对登录用户可见；工作区模板成员读、owner/admin 写
drop policy if exists "template_read" on public.templates;
create policy "template_read" on public.templates for select using (
  workspace_id is null or
  exists (select 1 from public.memberships m where m.workspace_id = templates.workspace_id and m.user_id = auth.uid())
);
drop policy if exists "template_write" on public.templates;
create policy "template_write" on public.templates for all using (
  exists (select 1 from public.memberships m where m.workspace_id = templates.workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
);

-- tasks：成员读，member 及以上写
drop policy if exists "task_read" on public.tasks;
create policy "task_read" on public.tasks for select using (
  exists (select 1 from public.memberships m where m.workspace_id = tasks.workspace_id and m.user_id = auth.uid())
);
drop policy if exists "task_write" on public.tasks;
create policy "task_write" on public.tasks for all using (
  exists (select 1 from public.memberships m where m.workspace_id = tasks.workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin','member'))
);

-- events：通过任务归属工作区，成员可读
drop policy if exists "event_read" on public.task_events;
create policy "event_read" on public.task_events for select using (
  exists (select 1 from public.tasks t join public.memberships m on m.workspace_id = t.workspace_id where t.id = task_events.task_id and m.user_id = auth.uid())
);

-- inbox_items：成员读，member 及以上写
drop policy if exists "inbox_read" on public.inbox_items;
create policy "inbox_read" on public.inbox_items for select using (
  exists (select 1 from public.memberships m where m.workspace_id = inbox_items.workspace_id and m.user_id = auth.uid())
);
drop policy if exists "inbox_write" on public.inbox_items;
create policy "inbox_write" on public.inbox_items for all using (
  exists (select 1 from public.memberships m where m.workspace_id = inbox_items.workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin','member'))
);

-- email_accounts：owner/admin 可读写，成员可读
drop policy if exists "account_read" on public.email_accounts;
create policy "account_read" on public.email_accounts for select using (
  exists (select 1 from public.memberships m where m.workspace_id = email_accounts.workspace_id and m.user_id = auth.uid())
);
drop policy if exists "account_write" on public.email_accounts;
create policy "account_write" on public.email_accounts for all using (
  exists (select 1 from public.memberships m where m.workspace_id = email_accounts.workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
);

-- ── 预设模板（系统级，workspace_id = null；handler_matrix 建工作区后由 owner 配置）──
insert into public.templates (name, lang, description, statuses, categories, keywords, reply_keywords, is_preset)
select name, lang, description, statuses, categories, keywords, reply_keywords, true from (values
  ('通用待办','zh','适合任何团队：把散在邮件和 Excel 里的杂事收成一条清晰的进度流。',
    '["待处理","进行中","待确认","已完成"]'::jsonb, '["一般"]'::jsonb,
    '["待办","跟进","确认","报价","发票"]'::jsonb, '[]'::jsonb),
  ('工程交付','zh','为地盘/工程场景预制：从发现问题到递交发票，六步走完一单。',
    '["发现问题","出报价","等承办商报价","开工","完工","交发票"]'::jsonb, '["一般","水喉"]'::jsonb,
    '["地盘","报价","开工","完工","发票","承办商"]'::jsonb, '["报价","开工","完工"]'::jsonb),
  ('销售跟进','zh','把询价邮件和跟进动作收进一条漏斗，谁在哪个阶段一目了然。',
    '["新线索","已联系","报价中","已签约","已关闭"]'::jsonb, '["一般"]'::jsonb,
    '["询价","报价","合同","回款"]'::jsonb, '[]'::jsonb),
  ('General Workflow','en','A clean generic pipeline for any team — collect scattered tasks from email and Excel.',
    '["Backlog","In Progress","Awaiting Reply","Done"]'::jsonb, '["General"]'::jsonb,
    '["todo","follow up","approve","invoice"]'::jsonb, '[]'::jsonb),
  ('Construction Delivery','en','Six-step site pipeline: from issue found to invoiced.',
    '["Issue Found","Quoting","Awaiting Quote","Work Started","Completed","Invoiced"]'::jsonb, '["General","Plumbing"]'::jsonb,
    '["site","quote","start","complete","invoice","contractor"]'::jsonb, '["quote","start","complete"]'::jsonb)
) as t(name, lang, description, statuses, categories, keywords, reply_keywords)
where not exists (select 1 from public.templates where is_preset);

-- ── 把预设克隆进某工作区 ──────────────────────────────────────────────
create or replace function public.clone_presets(ws uuid) returns void as $$
begin
  insert into public.templates (workspace_id, name, lang, description, statuses, categories, handler_matrix, keywords, reply_keywords, is_preset)
  select ws, name, lang, description, statuses, categories, null, keywords, reply_keywords, false
  from public.templates where is_preset;
end; $$ language plpgsql security definer;

-- ── 建工作区：owner 取 auth.uid()，一人一个工作区（幂等）──────────────
-- 不再信任客户端传 owner；已拥有工作区则直接返回，避免重复建。
create or replace function public.create_workspace(p_name text) returns uuid as $$
declare
  v_owner uuid := auth.uid();
  v_ws uuid;
begin
  if v_owner is null then
    raise exception 'not authenticated' using errcode = 'A0001';
  end if;

  -- 一人一个工作区：已有 owner 工作区则幂等返回
  select m.workspace_id into v_ws
  from public.memberships m
  where m.user_id = v_owner and m.role = 'owner'
  order by m.created_at asc
  limit 1;

  if v_ws is not null then
    return v_ws;
  end if;

  v_ws := gen_random_uuid();
  insert into public.workspaces (id, name) values (v_ws, coalesce(nullif(trim(p_name), ''), '我的工作台'));
  insert into public.memberships (workspace_id, user_id, role) values (v_ws, v_owner, 'owner');
  perform public.clone_presets(v_ws);
  return v_ws;
end; $$ language plpgsql security definer set search_path = public;

-- =====================================================================
-- 状态转移规则（供服务端复用的单一事实来源，见 02-data-model.md §3）
-- handler_id = handler_matrix[类型下标][状态下标]，空则回退 publisher
-- 应用层（webhook / API / 前端 RPC）在改 status_index 时都必须执行此规则。
-- =====================================================================
