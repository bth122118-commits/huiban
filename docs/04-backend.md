# 04 · 后端架构 + API + 认证 + 实时

> 当前实现状态：阶段 0 + 阶段 1 的 API 已全部落地，见下方端点表。代码在 `app/api/**/route.ts`。

## 1. 技术栈（当前实现）

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | Next.js 14（App Router）+ React + TypeScript | SSR/API Routes 一体 |
| 数据库 | Supabase（Postgres） | 托管 Postgres + 内置 RLS |
| 认证 | Supabase Auth（邮箱+密码） | 零后端 |
| 实时 | Supabase Realtime | 任务变更订阅，免自建 WebSocket |
| 存储 | Supabase Storage | 照片（后期） |
| 邮件接入 | **Aurinko**（OAuth 连接用户邮箱，主）+ **Resend inbound**（转发兜底） | 见 03-ingestion |
| 支付 | **Paddle**（Checkout + webhook） | Merchant of Record |
| 部署 | Vercel（前端）+ Supabase（后端） | 免费层够内测 |

## 2. 架构（文字）

```
浏览器(Next.js)
  ├─ Supabase Auth（登录/会话）
  ├─ Supabase Postgres（数据 + RLS 权限）
  ├─ Supabase Realtime（任务变更订阅）
  ├─ 邮件服务 webhook ─┐
  │    ├─ Aurinko  ────┴→ POST /api/email/aurinko   ─→ 拉取邮件 → ingestMessage → 写 inbox_items / 更新任务
  │    └─ Resend  ───────→ POST /api/email/inbound   ─→ 解析邮件 → ingestMessage → 同上
  └─ Paddle webhook ─────→ POST /api/paddle/webhook  ─→ paddle_events + subscriptions 镜像
```

## 3. 认证与授权

- **认证**：Supabase Auth（邮箱 + 密码，`app/login/page.tsx`）。
- **授权**：`memberships.role` → `owner | admin | member | viewer`。
- **实现**：Next.js API Routes 统一走 `lib/api-auth.ts` 的 `authorize(req, workspaceId, roles?)`——浏览器带 `Bearer` token（`lib/api.ts` 的 `apiFetch` 自动附加），服务端用 anon key 校验 JWT 拿可信 user id，再查 `memberships` 授权：
  - 默认 `MEMBER_ROLES = ["owner","admin","member"]`（读/写任务、收件箱）；
  - `ADMIN_ROLES = ["owner","admin"]`（改模板、成员、邮箱、连接邮箱、Paddle 相关）。
- 服务端数据操作统一走 `getAdminClient()`（service_role，绕过 RLS），但**每个路由都先过 `authorize()` 闸门**。
- **RLS 策略**（每张业务表，见 `db/schema.sql`）：按 `workspace_id` + `membership` 存在性授权；模板结构字段（statuses/handler_matrix）与成员/邮箱写入仅 owner/admin。

## 4. API 端点（REST，Next.js API Routes）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/tasks` | 建任务（手动；按矩阵算首状态处理者） | member+ |
| GET | `/api/tasks?workspace_id=&template_id=&source=&category=&q=&sort=&dir=` | 任务列表（筛选/搜索/排序） | member+ |
| PATCH | `/api/tasks/[id]` | 改字段（标题/描述/重要性/截止/类型；类型变化时重算处理者） | member+ |
| DELETE | `/api/tasks/[id]` | 删除任务 | member+ |
| PATCH | `/api/tasks/[id]/status` | 状态转移（`applyStatusTransition`：切处理者 + 写事件 + 置 fresh） | member+ |
| GET | `/api/inbox?workspace_id=` | 待确认草稿 + 回复识别（pending） | member+ |
| POST | `/api/inbox` | `{id, action}`：apply（建任务/应用回复）或 ignore | member+ |
| POST | `/api/import/excel?mode=preview|import` | 上传 .xlsx → 解析/预览/导入（去重） | member+ |
| POST | `/api/email/inbound` | Resend 入站 webhook（Svix 验签） | webhook |
| POST | `/api/email/aurinko` | Aurinko「新邮件」webhook（订阅验证 + 验签） | webhook |
| GET | `/api/email/aurinko/callback` | Aurinko OAuth 回调（换 token → 存账号 → 订阅） | OAuth |
| POST | `/api/workspaces/[id]/email/connect` | 发起连接邮箱（返回 Aurinko 授权 URL） | admin |
| GET | `/api/workspaces/[id]/email` | 查当前绑定的收件邮箱 | member+ |
| POST | `/api/workspaces/[id]/email` | 设置/更新收件邮箱（forward 方案） | admin |
| DELETE | `/api/workspaces/[id]/email` | 断开连接 | admin |
| GET | `/api/workspaces/[id]/members` | 成员列表（含显示名，供矩阵下拉） | member+ |
| POST | `/api/workspaces/[id]/members` | 按邮箱添加成员（对方需已注册） | admin |
| PATCH | `/api/templates/[id]` | 更新模板（状态/类型/矩阵/关键词）+ 同步钳制任务 | admin |
| POST | `/api/paddle/webhook` | Paddle 事件（验签 + 订阅状态镜像） | webhook |

> 工作区创建不走 HTTP：客户端直接 `supabase.rpc("create_workspace", { p_name })`（`db/schema.sql` 里 security definer，owner 取 `auth.uid()`，一人一个工作区、幂等）。
> 模板列表也不走 HTTP：看板页直接 `supabase.from("templates").select(...)` 读（RLS 允许成员读）。

## 5. 多人协作 / 实时

- **任务变更**：看板页订阅 `tasks` 表（`supabase.channel(...).on("postgres_changes", ...)`），队友改状态即时刷新。
- **冲突**：状态转移是「显式设目标状态」，天然幂等；`updated_at` 触发器保留最后写入时间。

## 6. 邮件 webhook 处理

### Resend inbound（`app/api/email/inbound/route.ts`）

Svix 签名（`svix-id` / `svix-timestamp` / `svix-signature`）验签 → 解析 `from/to/subject/text/headers` → 按「收件地址」或 `account_id` 归属 `email_accounts` → 调 `lib/email-ingest.ts` 的 `ingestMessage`。

### Aurinko（`app/api/email/aurinko/route.ts` + `callback/route.ts`）

1. `POST /api/workspaces/[id]/email/connect` → `lib/aurinko.ts` 生成授权 URL（state = workspace id）。
2. 用户授权后回调 `callback`：`exchangeCode` 换 accountToken → upsert `email_accounts(provider_account_id, connection)` → `subscribeWebhook` 订阅 `/email/messages`。
3. 新邮件 webhook：验证 `validationToken`（订阅验证）/ 验签 → 按 `accountId` 找账号 → `fetchMessage` 拉取 → `normalizeMessage` 归一化 → `ingestMessage`。

> 摄取核心 `lib/email-ingest.ts` 是供应商无关的：任何入口只要归一化成 `InboundMessage{from,subject,body,messageId,inReplyTo,references}`，就做关键词匹配 → 建草稿 / 回复更新（含线程归属与去重）。

## 7. 环境变量 / 密钥

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=        # 仅服务端

# Resend inbound（可选，未填则跳过验签）
RESEND_WEBHOOK_SECRET=

# Aurinko 统一邮箱 API
AURINKO_CLIENT_ID=
AURINKO_CLIENT_SECRET=
AURINKO_WEBHOOK_SECRET=           # 可选，未填则跳过验签

# Paddle
NEXT_PUBLIC_PADDLE_ENV=sandbox
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=
PADDLE_WEBHOOK_SECRET=            # 可选，未填则跳过验签
NEXT_PUBLIC_PADDLE_PRICE_FREE=
NEXT_PUBLIC_PADDLE_PRICE_PERSONAL_MONTHLY=
NEXT_PUBLIC_PADDLE_PRICE_PERSONAL_YEARLY=
NEXT_PUBLIC_PADDLE_PRICE_TEAM_MONTHLY=
NEXT_PUBLIC_PADDLE_PRICE_TEAM_YEARLY=

# AI 兜底（可选，暂未接入）
OPENAI_API_KEY=
```

## 8. 安全清单

- 邮件 webhook 验签：Resend 用 Svix 签名；Aurinko 用 HMAC-SHA256；Paddle 用 `Paddle-Signature`。均「未配置密钥则跳过（本地开发），生产必须配置」。
- 上传 Excel 限制：类型 `.xlsx/.xls`、≤5MB、≤2000 行、标题 ≤300 字符（`app/api/import/excel/route.ts`）。
- API 层逐请求鉴权：`authorize()` 先过闸门，再用 service_role 查询；JWT 用 anon key 校验而非 service role。
