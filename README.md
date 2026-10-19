# 汇办（Huiban）· 任务追踪 SaaS

> 英文品牌 **BuildTrace** · 中文品牌 **汇办**

把散在**邮件**和 **Excel** 里的杂事，自动收进一个团队共享的进度面板——多任务追踪、多人协同更新。

## 这是什么

- **核心**：多任务追踪 + 多人协同更新
- **摄取**：邮件「接受关键词」自动建立任务（待确认草稿）；邮件「回复关键词」自动更新状态；Excel 导入
- **模板**：状态流水线 + 类型×处理者矩阵 + 接受/回复关键词，中英双语，界面语言跟随模板
- **商业化**：Paddle 订阅（免费 / 个人版 / 团队版）
- **后期**：WhatsApp / 照片追踪（第二增长曲线，暂缓）

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/01-prd.md](docs/01-prd.md) | 产品需求文档：背景、用户、核心概念、功能清单、用户故事、验收标准 |
| [docs/02-data-model.md](docs/02-data-model.md) | 数据模型：实体关系 + Postgres/Supabase 表结构 SQL |
| [docs/03-ingestion.md](docs/03-ingestion.md) | 邮件 + Excel 摄取技术方案（监测方式、关键词、线程归属、列映射） |
| [docs/04-backend.md](docs/04-backend.md) | 后端架构 + API 端点 + 认证授权 + 多人协作/实时 + 安全 |
| [docs/05-roadmap.md](docs/05-roadmap.md) | 分阶段里程碑 + 验收标准 + 收费标准 + AI 成本 |
| [docs/06-run-locally.md](docs/06-run-locally.md) | 本地跑起来 step-by-step（Supabase/Aurinko/Resend/Paddle/Next.js 配置） |

## 交互原型

`task-tracker.html` 是完整的高保真可点原型（单文件、自包含、无外部依赖），已实现全部交互逻辑与中英双语，是开发时的 **UX 规格参考**。

原型中已落地的、可直接照搬的规则：

- 模板 = 状态流水线 + 类型（categories）+ 处理者矩阵（handlerMatrix）+ 接受关键词 + 回复关键词
- 任务 = 标题/描述/来源/发布者/类型/处理者/重要性/截止/状态/NEW 标记/协同记录
- 状态转移时，处理者自动切换为 `handlerMatrix[类型][新状态]`
- 邮件「接受关键词」→ 建任务草稿待确认；「回复关键词」→ 命中回复邮件 → 更新对应任务状态

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js 14（App Router）+ React + TypeScript |
| 数据库 | Supabase（Postgres / Auth / Realtime / Storage） |
| 邮件接入 | Aurinko 统一邮箱 API（OAuth 连接 Outlook / Office365，**主**）+ Resend inbound（转发兜底） |
| 支付 | Paddle（订阅 + webhook） |
| 部署 | Vercel（前端）+ Supabase（后端） |
| AI | 可选第二层（规则优先，$0 起步） |

## 代码结构

### 数据库

| 文件 | 说明 |
|---|---|
| [db/schema.sql](db/schema.sql) | 建表 + RLS + 索引 + 触发器 + 预设模板 + `clone_presets` + `create_workspace` |
| [db/cleanup-workspaces.sql](db/cleanup-workspaces.sql) | 工作区清理脚本 |

### 服务端（Next.js API Routes，均在 `app/api/`）

| 文件 | 说明 |
|---|---|
| [app/api/email/inbound/route.ts](app/api/email/inbound/route.ts) | Resend 入站 webhook（Svix 验签）→ 关键词匹配 + 线程归属 |
| [app/api/email/aurinko/route.ts](app/api/email/aurinko/route.ts) | Aurinko「新邮件」webhook（订阅验证 + 验签 + 拉取邮件归一化） |
| [app/api/email/aurinko/callback/route.ts](app/api/email/aurinko/callback/route.ts) | Aurinko OAuth 回调：换 token → 存 email_accounts → 订阅 webhook |
| [app/api/import/excel/route.ts](app/api/import/excel/route.ts) | Excel 导入：SheetJS 解析 + 列别名映射 + 处理者解析 + 预览/导入 + 去重 |
| [app/api/inbox/route.ts](app/api/inbox/route.ts) | 收件箱：待确认草稿 + 回复识别，apply/ignore |
| [app/api/tasks/route.ts](app/api/tasks/route.ts) | 任务列表（筛选/搜索/排序）+ 创建 |
| [app/api/tasks/[id]/route.ts](app/api/tasks/[id]/route.ts) | 编辑任务字段 + 删除 |
| [app/api/tasks/[id]/status/route.ts](app/api/tasks/[id]/status/route.ts) | 状态转移（复用 `applyStatusTransition`） |
| [app/api/templates/[id]/route.ts](app/api/templates/[id]/route.ts) | 更新模板（状态/类型/矩阵/关键词）+ 同步钳制任务 |
| [app/api/workspaces/[id]/members/route.ts](app/api/workspaces/[id]/members/route.ts) | 成员列表 + 添加成员 |
| [app/api/workspaces/[id]/email/route.ts](app/api/workspaces/[id]/email/route.ts) | 查询/设置/断开收件邮箱 |
| [app/api/workspaces/[id]/email/connect/route.ts](app/api/workspaces/[id]/email/connect/route.ts) | 发起 Aurinko「连接邮箱」 |
| [app/api/paddle/webhook/route.ts](app/api/paddle/webhook/route.ts) | Paddle webhook（验签 + 订阅状态镜像） |

### 共享库（`lib/`）

| 文件 | 说明 |
|---|---|
| [lib/supabase.ts](lib/supabase.ts) | admin/browser client、`splitHandler`、`handlerFor`、`applyStatusTransition`、`createWorkspace`、`resolveMemberIdByName` |
| [lib/supabase-browser.ts](lib/supabase-browser.ts) | 浏览器 client（单例，走 RLS） |
| [lib/api-auth.ts](lib/api-auth.ts) | API 鉴权 `authorize()`：Bearer token 校验 + `memberships` 授权 |
| [lib/api.ts](lib/api.ts) | 浏览器端 `apiFetch`（自动带 Bearer token） |
| [lib/email-ingest.ts](lib/email-ingest.ts) | 邮件摄取核心（供应商无关）：关键词匹配 → 建草稿/回复更新 |
| [lib/aurinko.ts](lib/aurinko.ts) | Aurinko 客户端：authorizeUrl / exchangeCode / subscribeWebhook / fetchMessage / normalizeMessage / verifyWebhookSignature |
| [lib/i18n.ts](lib/i18n.ts) | 中英双语词典（界面语言跟随模板 `lang`） |

### 前端（Next.js App Router，均 `"use client"`）

| 文件 | 说明 |
|---|---|
| [app/login/page.tsx](app/login/page.tsx) | 登录/注册（邮箱+密码） |
| [app/onboarding/page.tsx](app/onboarding/page.tsx) | 建工作区（调 `create_workspace` RPC） |
| [app/board/page.tsx](app/board/page.tsx) | 看板/表格双视图 + 筛选/搜索/排序 + 实时刷新 + 任务弹窗 |
| [app/pricing/page.tsx](app/pricing/page.tsx) | 定价页（Paddle 订阅） |
| [app/layout.tsx](app/layout.tsx) | 根布局（标题/语言） |
| [components/TemplateEditor.tsx](components/TemplateEditor.tsx) | 模板编辑器（流水线/矩阵/关键词） |
| [components/InboxDrawer.tsx](components/InboxDrawer.tsx) | 收件箱抽屉（连接邮箱 + 草稿确认/忽略） |
| [components/MembersModal.tsx](components/MembersModal.tsx) | 成员管理弹窗 |
| [components/ExcelImportModal.tsx](components/ExcelImportModal.tsx) | Excel 导入弹窗 |
| [public/landing-page.html](public/landing-page.html) | 落地页（中英双语，静态） |
| public/{privacy-policy,terms-of-service,refund-policy}.html | 法务页 |

## 阅读顺序建议

1. [01-prd.md](docs/01-prd.md) —— 先对齐「做什么」
2. [02-data-model.md](docs/02-data-model.md) —— 再对齐「数据长什么样」
3. [03-ingestion.md](docs/03-ingestion.md) —— 先做护城河（邮件摄取）
4. [04-backend.md](docs/04-backend.md) —— 搭服务
5. [05-roadmap.md](docs/05-roadmap.md) —— 按里程碑推进
