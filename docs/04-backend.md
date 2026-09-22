# 04 · 后端架构 + API + 认证 + 实时

## 1. 技术栈（推荐，单人可维护、近零成本起步）

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | Next.js（React）+ TypeScript | SSR/API Routes/Edge Functions 一体 |
| 数据库 | Supabase（Postgres） | 托管 Postgres + 内置 RLS |
| 认证 | Supabase Auth | 邮箱/Google 登录，零后端 |
| 实时 | Supabase Realtime | 任务变更/在场，免自建 WebSocket |
| 存储 | Supabase Storage | 照片（后期） |
| 邮件接入 | Nylas / Aurinko / Unipile 统一邮箱 API | OAuth 连接用户邮箱 → webhook |
| 部署 | Vercel（前端）+ Supabase（后端） | 免费层够内测 |

> 备选：Firebase（Firestore + Auth）亦可，但 Postgres + RLS 对关系型业务更顺。

## 2. 架构（文字）

```
浏览器(Next.js)
  ├─ Supabase Auth（登录/会话）
  ├─ Supabase Postgres（数据 + RLS 权限）
  ├─ Supabase Realtime（任务变更订阅）
  └─ 邮件服务 webhook ─→ Edge Function ─→ 写 inbox_items / 更新任务
```

## 3. 认证与授权

- **认证**：Supabase Auth（email + magic link 起步，后续加 Google）。
- **授权**：`memberships.role` → `owner | admin | member | viewer`。
- **RLS 策略**（每张业务表）：

```sql
-- 例：tasks 表只允许本工作区成员读、member 及以上写
alter table public.tasks enable row level security;
create policy "member read" on public.tasks for select
  using (exists (
    select 1 from memberships m
    where m.workspace_id = tasks.workspace_id and m.user_id = auth.uid()
  ));
create policy "member write" on public.tasks for update
  using (exists (
    select 1 from memberships m
    where m.workspace_id = tasks.workspace_id
      and m.user_id = auth.uid() and m.role in ('owner','admin','member')
  ));
```

模板结构字段（statuses/handler_matrix）的修改策略加 `role in ('owner','admin')` 条件。

> 实现：Next.js API Routes 统一走 `lib/api-auth.ts` 的 `authorize()`——浏览器带 `Bearer` token，服务端校验 JWT 后按 `memberships` 授权（member 读/写任务，owner/admin 改模板/成员/邮箱）。

## 4. API 端点（REST，走 Next.js API Routes / 或 Supabase Edge Functions）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/workspaces` | 我的工作区 |
| POST | `/api/workspaces` | 建工作区 |
| GET | `/api/templates?workspace_id=` | 模板列表（预设 + 自定义） |
| POST/PUT | `/api/templates/:id` | 建/改模板（状态、类型、矩阵、关键词） |
| GET | `/api/tasks?workspace_id=&template_id=&source=&category=&q=` | 任务列表（含筛选/搜索） |
| POST | `/api/tasks` | 建任务（手动） |
| PATCH | `/api/tasks/:id/status` | 改状态（服务端按矩阵切处理者 + 写事件） |
| PATCH | `/api/tasks/:id` | 改标题/描述/发布者/类型/重要性/截止 |
| GET | `/api/inbox?workspace_id=` | 待确认草稿 + 回复识别 |
| POST | `/api/inbox/:id/apply` | 确认入板 / 应用回复更新 |
| POST | `/api/inbox/:id/ignore` | 忽略 |
| POST | `/api/import/excel` | 上传 Excel → 解析 → 预览/导入 |
| POST | `/api/email/inbound` | 邮件服务 webhook（见 03-ingestion） |

## 5. 多人协作 / 实时

- **任务变更**：客户端订阅 `tasks` 表（Supabase Realtime postgres_changes），队友改状态即时刷新。
- **在场**：Realtime presence 显示谁在线（MVP 可选）。
- **冲突**：状态转移是「推进到下一状态/显式设目标」，天然幂等；用 `updated_at` 乐观锁防旧写覆盖。

## 6. 邮件 webhook 处理（Edge Function 伪代码）

```js
// POST /api/email/inbound
function handleInbound(msg) {
  const ws = resolveWorkspace(msg.account);          // 连接的邮箱账号 → email_accounts
  const isReply = !!(msg.headers['In-Reply-To'] || msg.headers['References'])
                  || /^(Re:|回复：)/i.test(msg.subject);
  if (isReply) {
    const kw = matchKeyword(msg, template.reply_keywords);
    if (kw) {
      const task = findByThread(msg.headers, msg.subject);  // 线程归属
      if (task) { applyReply(task, kw); return; }
    }
  } else {
    const kw = matchKeyword(msg, template.keywords);
    if (kw) createDraft(msg, kw);   // inbox_item(kind=create)
  }
}
```

## 7. 环境变量 / 密钥

`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE`、`MAILGUN_API_KEY`、`MAILGUN_WEBHOOK_SIGNING_KEY`、`OPENAI_API_KEY`（AI 兜底，可选）。

## 8. 安全清单

- 邮件 webhook 校验签名（按所接的统一邮箱 API 的签名机制验签）。
- 上传 Excel 限制类型/大小、行数与字段长度（已实现，见 `app/api/import/excel/route.ts`）。
- API 层逐请求鉴权（已实现：`lib/api-auth.ts`——Bearer token 校验 + `memberships` 授权；服务端用 service_role 查询，但每个路由都先过授权闸门）。
