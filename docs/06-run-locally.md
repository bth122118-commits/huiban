# 06 · 本地跑起来（Step-by-step）

> 从零把整套骨架跑起来，看到登录 → 建工作区 → 看板。

## 0. 准备

- Node.js 18+
- 免费账号：Supabase、Resend

## 1. Supabase（数据库 + 认证）

1. [supabase.com](https://supabase.com) → New project → 记下 DB password。
2. 左侧 **SQL Editor** → New query → 粘贴 `db/schema.sql` 全文 → **Run**（可重复执行）。
3. **Settings → API** 记下三个值：
   - Project URL → 下面第 5 步的 `SUPABASE_URL`
   - anon / public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`（**别提交 git**）
4. **Authentication → Providers → Email**：确认 Email 已开启（邮箱+密码默认开）。

## 2. Resend（邮件入站，阶段 0 护城河）

1. [resend.com](https://resend.com) → **Domains** → 添加你的域名 → 按提示加 DNS 记录 → 等验证通过。
2. **Inbound** → 新建一个入站邮箱（如 `todo@你的域名`）。
3. Webhook URL 填你的 `/api/email/inbound`。本地开发用隧道把 localhost 暴露出来：
   ```bash
   npx ngrok http 3000
   # 得到 https://xxxx.ngrok.io → 填 https://xxxx.ngrok.io/api/email/inbound
   ```
4. 记下 webhook 的 signing secret，填到第 5 步的 `RESEND_WEBHOOK_SECRET`（入站 webhook 用它验签，未填则跳过校验）。

## 3. Next.js 工程

```bash
npx create-next-app@latest huiban --ts --app --eslint
cd huiban
npm i @supabase/supabase-js xlsx
```

> 按提示选 **App Router + TypeScript**；Tailwind 用不用都行（骨架是内联样式）。`@/` 别名是 create-next-app 默认，与 `lib/api/app` 里的 `@/lib/...` 正好匹配。

## 4. 拷贝文件

把本项目这些目录拷进 `huiban/`：

```
lib/   api/   app/   db/
```

`docs/` 和 `task-tracker.html` 是文档与 UX 参考，可放项目根、不影响运行。

## 5. 环境变量 `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # 仅服务端，别暴露给浏览器

RESEND_WEBHOOK_SECRET=whsec_...    # Resend 入站 webhook 签名（可选，未填则跳过验签）
```

> 后端 `api/*` 用 `SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY`（admin client）；前端 `lib/supabase-browser.ts` 用 `NEXT_PUBLIC_*`（走 RLS）。

## 6. 跑起来

```bash
npm run dev
```

打开 `http://localhost:3000/login` → 注册 → 建工作区 → 自动进入 `/board`。

## 7. 第一次验证（对照验收标准）

1. **注册**：Supabase Auth → Authentication → Users 里能看到新用户；`profiles` 表也自动多了一行。
2. **建工作区**：SQL Editor 查
   ```sql
   select * from templates where workspace_id = '你的工作区id';
   ```
   应看到 5 个预设模板（3 中文 + 2 英文）被克隆进来。
3. **看板改状态**：点某任务「下一状态」→ `tasks.status_index` 变、`handler_id` 按矩阵切换、`task_events` 多一条。
4. **邮件**：发一封带关键词的邮件到 Resend inbound 地址 → 查 `inbox_items` 出现 `pending` 记录；调 `POST /api/inbox` `{action:"apply"}` → 任务入板。

## 8. 已知待补（骨架级，非阻塞）

- 前端是**功能骨架**，完整交互/视觉按 `task-tracker.html` 逐块实现。
