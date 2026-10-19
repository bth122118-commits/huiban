# 02 · 数据模型（Postgres / Supabase）

> 字段名与原型 `task-tracker.html` 完全对齐。除 `auth.users` 外，业务表统一加 `created_at timestamptz default now()`。
> 权威来源：`db/schema.sql`（可重复执行）。

## 1. 实体关系

```
workspace 1─n membership n─1 user(auth.users)
workspace 1─n template 1─n task 1─n task_event
workspace 1─n inbox_item
workspace 1─n email_account
task n─1 user(publisher)  ·  task handler = 成员(user_id) 或 外部姓名(handler_name)

（service-role 专属，无工作区归属）：
user 1─n subscription（Paddle 订阅镜像）
webhook_log / paddle_events（调试与审计日志）
```

## 2. 表结构

### users（复用 Supabase `auth.users`）
业务侧用 `auth.users.id` 作主键，另建 `profiles` 存显示名（注册时触发器自动建，name 取邮箱前缀）：

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,                -- 显示名（陈工 / Chen …）
  lang text default 'zh'
);
```

### workspaces
```sql
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);
```

### memberships（工作区成员 + 角色）
```sql
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',   -- owner | admin | member | viewer
  unique (workspace_id, user_id)
);
```

### templates（模板 = 流水线 + 类型 + 矩阵 + 关键词）
```sql
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,  -- null = 系统预设
  name text not null,
  lang text not null default 'zh',       -- 'zh' | 'en'（界面语言跟随）
  description text default '',
  statuses jsonb not null,               -- ["待处理","进行中",…]，有序
  categories jsonb not null,             -- ["一般","水喉",…]
  handler_matrix jsonb,                  -- [[user_id 或 'ext:姓名' 或 null,…],…] 维度 = categories × statuses
  keywords jsonb not null default '[]',        -- 接受关键词
  reply_keywords jsonb not null default '[]',  -- 回复关键词
  is_preset boolean default false,
  created_at timestamptz default now()
);
```

> 说明：原型里处理者按「姓名」存（我/陈工/王师傅）。落库时矩阵单元可以是成员 `user_id`，也可以是 `ext:姓名`（外部供应商/承办商，无账号）。状态转移时把矩阵单元拆成 `handler_id`（成员）或 `handler_name`（外部）。

### tasks
```sql
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  template_id uuid not null references templates(id) on delete cascade,
  title text not null,
  description text default '',
  source text not null default 'manual',   -- mail | excel | manual
  publisher_id uuid references auth.users(id),
  category text,                           -- 类型名（冗余，便于筛选）
  handler_id uuid references auth.users(id),   -- 当前处理者（成员）
  handler_name text,                           -- 外部处理者（供应商/承办商，非用户）
  priority text not null default 'normal', -- urgent | high | normal
  due_date date,
  status_index int not null default 0,     -- 指向 template.statuses 下标
  fresh boolean not null default true,     -- NEW 标记
  thread_id text,                          -- 邮件 Message-ID（回复线程归属用）
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index tasks_workspace_idx on tasks(workspace_id);
create index tasks_template_status_idx on tasks(template_id, status_index);
create index tasks_thread_idx on tasks(thread_id);
```

### task_events（协同记录 / 活动日志）
```sql
create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  actor_id uuid references auth.users(id),
  from_status text,
  to_status text,
  note text,                -- 可选，如「回复邮件「报价」」
  created_at timestamptz default now()
);
create index task_events_task_idx on task_events(task_id, created_at);
```

### inbox_items（邮件草稿 / 回复识别）
```sql
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  template_id uuid references templates(id) on delete cascade,
  kind text not null,               -- create | reply
  from_email text,
  subject text,
  body text,
  matched_keyword text,
  ref_task_id uuid references tasks(id) on delete set null,  -- kind='reply' 时指向原任务
  target_status_index int,                                     -- kind='reply' 时目标状态
  thread_id text,                  -- In-Reply-To / References，用于线程归属与去重
  status text not null default 'pending',   -- pending | applied | ignored
  created_at timestamptz default now()
);
```

### email_accounts（连接的邮箱：个人版连自己 / 团队版连一人）
```sql
create table public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  template_id uuid references templates(id) on delete set null,  -- 指定则按此模板匹配
  email text,                                 -- 连接的邮箱地址（连接流拿不到 email 时可为空）
  provider_account_id text,                   -- 统一邮箱 API 的账号 id（路由用）
  provider text not null default 'forward',    -- outlook | forward（forward 为旧方案兜底）
  connection jsonb,                           -- token/refresh（加密存储）
  created_at timestamptz default now()
);
```

### webhook_log（调试用，上线后可删；无 RLS 策略 = 仅 service role）
```sql
create table public.webhook_log (
  id bigint generated always as identity primary key,
  event text not null,
  detail text,
  created_at timestamptz not null default now()
);
```

### paddle_events（Paddle webhook 事件日志；无 RLS 策略 = 仅 service role）
```sql
create table public.paddle_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  payload text,
  created_at timestamptz not null default now()
);
```

### subscriptions（订阅状态镜像，Paddle subscription.* 事件驱动；无 RLS 策略 = 仅 service role）
```sql
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  paddle_subscription_id text not null unique,
  paddle_customer_id text,
  price_id text,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 3. 关键业务规则（服务端必须实现）

1. **状态转移（单一事实来源）**：`task.status_index = N` 时，取 `template.handler_matrix[category_idx][N]`——若为成员 `user_id` 写 `handler_id`，若为 `ext:姓名` 写 `handler_name`；矩阵未指派则回退 `publisher_id`。同时写一条 `task_events`，并置 `task.fresh = true`。实现：`lib/supabase.ts` 的 `applyStatusTransition()`，所有改状态入口（API 推进 / 表格下拉 / 回复邮件）都应走它。
2. **NEW 标记**：任务创建或状态变动 → `fresh=true`；用户打开详情 → `fresh=false`。
3. **回复更新**：`inbox_item(kind='reply')` 被应用 → 找到 `ref_task_id` → 改 `status_index`（当前为 +1）→ 按规则 1 切换处理者 → 写事件（`note = 关键词`）。
4. **类别删除/重排**：模板编辑后，把引用失效类别的任务 `category` 归到首个类别，`status_index` 钳制在 `statuses` 长度内，并按新矩阵重算 `handler_id`（见 `app/api/templates/[id]/route.ts`）。

## 4. 权限边界（RLS 摘要，详见 04-backend.md）

- 所有业务表按 `workspace_id` 开启 RLS：`membership` 存在且角色允许才可读写。
- `handler_matrix` / `statuses` 等模板字段仅 `owner/admin` 可改；`member` 可改任务状态；`viewer` 只读。
- `webhook_log` / `paddle_events` / `subscriptions` 不开成员策略，仅 service role 读写。
