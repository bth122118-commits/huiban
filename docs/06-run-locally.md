# 06 · 本地跑起来（Step-by-step）

> 从零把整套跑起来，看到登录 → 建工作区 → 看板 → 连接邮箱 → 订阅定价。

## 0. 准备

- Node.js 18+
- 免费账号：Supabase、Aurinko（连接邮箱）、Resend（邮件兜底，可选）、Paddle（支付，可选）

## 1. Supabase（数据库 + 认证）

1. [supabase.com](https://supabase.com) → New project → 记下 DB password。
2. 左侧 **SQL Editor** → New query → 粘贴 `db/schema.sql` 全文 → **Run**（可重复执行）。
3. **Settings → API** 记下三个值：
   - Project URL → 下面第 5 步的 `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
   - anon / public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`（**别提交 git**）
4. **Authentication → Providers → Email**：确认 Email 已开启（邮箱+密码默认开）。

## 2. Aurinko（连接邮箱，阶段 0 护城河·主）

1. [aurinko.io](https://aurinko.io) → 建应用 → 记下 `Client ID` / `Client Secret`。
2. 在 Aurinko 后台配置 **Redirect URI** 为 `https://<你的域名>/api/email/aurinko/callback`（本地用 ngrok 隧道地址）。
3. 填到第 5 步的 `AURINKO_CLIENT_ID` / `AURINKO_CLIENT_SECRET`。

> **接 Outlook / Office365**：还需在 Azure Portal 注册应用（App registrations），授予 `Mail.ReadWrite` / `Mail.Send` 等委托权限，并把该 Azure 应用凭据配进你的 Aurinko 应用、启用 Office365 服务类型。参见 [Aurinko · Office 365 OAuth setup](https://docs.aurinko.io/authentication/office-365-oauth-setup)。

## 3. Resend（邮件入站兜底，可选）

1. [resend.com](https://resend.com) → **Domains** → 添加域名 → 加 DNS 记录 → 等验证通过。
2. **Inbound** → 新建入站邮箱（如 `todo@你的域名`）。
3. Webhook URL 填 `/api/email/inbound`。本地用隧道暴露：
   ```bash
   npx ngrok http 3000
   # 得到 https://xxxx.ngrok.io → 填 https://xxxx.ngrok.io/api/email/inbound
   ```
4. 记下 webhook signing secret → 第 5 步的 `RESEND_WEBHOOK_SECRET`（未填则跳过验签）。

## 4. Paddle（支付，可选）

1. [paddle.com](https://paddle.com) → Sandbox 建产品/价格。
2. 记下 Client Token 与各档 price id → 填第 5 步的 `NEXT_PUBLIC_PADDLE_*`。
3. Webhook 指向 `/api/paddle/webhook`，secret 填 `PADDLE_WEBHOOK_SECRET`。

## 5. Next.js 工程

```bash
npx create-next-app@latest huiban --ts --app --eslint
cd huiban
npm i @supabase/supabase-js xlsx
```

> 按提示选 **App Router + TypeScript**。`@/` 别名是 create-next-app 默认，与 `app/**` 里的 `@/lib/...` 正好匹配。

## 6. 拷贝文件

把本项目这些目录拷进 `huiban/`：

```
app/   lib/   components/   db/   public/
```

`docs/` 和 `task-tracker.html` 是文档与 UX 参考，可放项目根、不影响运行。

## 7. 环境变量 `.env.local`

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # 仅服务端，别暴露给浏览器

# Resend 入站（可选）
RESEND_WEBHOOK_SECRET=whsec_...

# Aurinko 统一邮箱 API
AURINKO_CLIENT_ID=...
AURINKO_CLIENT_SECRET=...
AURINKO_WEBHOOK_SECRET=...         # 可选，未填则跳过验签

# Paddle（可选）
NEXT_PUBLIC_PADDLE_ENV=sandbox
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=...
PADDLE_WEBHOOK_SECRET=...          # 可选，未填则跳过验签
NEXT_PUBLIC_PADDLE_PRICE_FREE=...
NEXT_PUBLIC_PADDLE_PRICE_PERSONAL_MONTHLY=...
NEXT_PUBLIC_PADDLE_PRICE_PERSONAL_YEARLY=...
NEXT_PUBLIC_PADDLE_PRICE_TEAM_MONTHLY=...
NEXT_PUBLIC_PADDLE_PRICE_TEAM_YEARLY=...
```

> 后端 `app/api/*` 用 `SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY`（admin client）；前端 `lib/supabase-browser.ts` 用 `NEXT_PUBLIC_*`（走 RLS）。

## 8. 跑起来

```bash
npm run dev
```

打开 `http://localhost:3000/login` → 注册 → 建工作区 → 自动进入 `/board`。

## 9. 第一次验证（对照验收标准）

1. **注册**：Supabase Auth → Authentication → Users 里能看到新用户；`profiles` 表也自动多了一行。
2. **建工作区**：SQL Editor 查
   ```sql
   select * from templates where workspace_id = '你的工作区id';
   ```
   应看到 5 个预设模板（3 中文 + 2 英文）被克隆进来。
3. **看板改状态**：点某任务「下一状态」或表格下拉 → `tasks.status_index` 变、`handler_id` 按矩阵切换、`task_events` 多一条。
4. **邮件**：发一封带关键词的邮件到 Resend inbound 地址，或走 Aurinko 连接邮箱 → 查 `inbox_items` 出现 `pending` 记录；收件箱「确认入板」→ 任务入板。
5. **支付**：定价页点订阅 → Paddle Checkout 弹出；支付后 `/api/paddle/webhook` 收到 `subscription.*` 事件、`subscriptions` 表多一行。

## 10. 已知待补

- 前端是**功能级实现**，完整视觉/交互以 `task-tracker.html` 原型为规格逐块打磨。
- 「回复关键词 → 目标状态可配置」仍是 P1 未做项（当前按「推进到下一状态」）。
- `lib/email-ingest.ts` 与 `lib/supabase.ts` 各有一份状态转移逻辑，待收敛到 `applyStatusTransition`。
