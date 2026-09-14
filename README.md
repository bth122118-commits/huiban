# 汇办（Huiban）· 任务追踪 SaaS

把散在**邮件**和 **Excel** 里的杂事，自动收进一个团队共享的进度面板——多任务追踪、多人协同更新。

## 这是什么

- **核心**：多任务追踪 + 多人协同更新
- **摄取**：邮件「接受关键词」自动建立任务；邮件「回复关键词」自动更新状态；Excel 导入
- **模板**：通用模板三件套（状态流水线 + 类型×处理者矩阵 + 关键词），中英双语，界面语言跟随模板
- **后期**：WhatsApp / 照片追踪（第二增长曲线，暂缓）

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/01-prd.md](docs/01-prd.md) | 产品需求文档：背景、用户、核心概念、功能清单、用户故事、验收标准 |
| [docs/02-data-model.md](docs/02-data-model.md) | 数据模型：实体关系 + Postgres/Supabase 表结构 SQL |
| [docs/03-ingestion.md](docs/03-ingestion.md) | 邮件 + Excel 摄取技术方案（监测方式、关键词、线程归属、列映射） |
| [docs/04-backend.md](docs/04-backend.md) | 后端架构 + API 端点 + 认证授权 + 多人协作/实时 + 安全 |
| [docs/05-roadmap.md](docs/05-roadmap.md) | 分阶段里程碑 + 验收标准 + 收费标准 + AI 成本 |
| [docs/06-run-locally.md](docs/06-run-locally.md) | 本地跑起来 step-by-step（Supabase/Resend/Next.js 配置） |

## 交互原型

`task-tracker.html` 是完整的高保真可点原型（单文件、自包含、无外部依赖），已实现全部交互逻辑与中英双语，是开发时的 **UX 规格参考**。

原型中已落地的、可直接照搬的规则：

- 模板 = 状态流水线 + 类型（categories）+ 处理者矩阵（handlerMatrix）+ 接受关键词 + 回复关键词
- 任务 = 标题/描述/来源/发布者/类型/处理者/重要性/截止/状态/NEW 标记/协同记录
- 状态转移时，处理者自动切换为 `handlerMatrix[类型][新状态]`
- 邮件「接受关键词」→ 建任务草稿待确认；「回复关键词」→ 命中回复邮件 → 更新对应任务状态

## 技术栈（一句话）

**Next.js + Supabase（Postgres / Auth / Realtime / Storage）+ Vercel + 邮件入站（Mailgun / Resend / Postmark）**，AI 为可选第二层（规则优先）。详见 [docs/04-backend.md](docs/04-backend.md)。

## 代码文件（阶段 0 起步，可直接粘贴）

| 文件 | 说明 |
|---|---|
| [db/schema.sql](db/schema.sql) | 完整建表 SQL：表 + RLS + 索引 + 触发器 + 预设模板 + create_workspace |
| [api/email/inbound.ts](api/email/inbound.ts) | 邮件入站 webhook（Resend inbound）：关键词匹配 + 线程归属 + 建草稿/回复更新 |
| [lib/supabase.ts](lib/supabase.ts) | 共享工具库：admin/browser client、createWorkspace、applyStatusTransition、handlerFor |
| [api/import/excel.ts](api/import/excel.ts) | Excel 导入：SheetJS 解析 + 列映射 + 处理者解析 + 预览/导入 + 去重 |
| [api/tasks/index.ts](api/tasks/index.ts) | 任务列表（筛选/搜索/排序）+ 创建 |
| [`api/tasks/[id]/status.ts`](api/tasks/[id]/status.ts) | 状态转移（复用 applyStatusTransition） |
| [api/inbox/index.ts](api/inbox/index.ts) | 收件箱：待确认草稿 + 回复识别，apply/ignore |

**前端（骨架，Next.js App Router）：**

- `lib/supabase-browser.ts` — 浏览器 client（单例）
- `app/login/page.tsx` — 登录/注册
- `app/onboarding/page.tsx` — 建工作区（调 create_workspace RPC）
- `app/board/page.tsx` — 看板（读模板/任务 + 改状态 + 实时刷新）

## 阅读顺序建议

1. [01-prd.md](docs/01-prd.md) —— 先对齐「做什么」
2. [02-data-model.md](docs/02-data-model.md) —— 再对齐「数据长什么样」
3. [03-ingestion.md](docs/03-ingestion.md) —— 先做护城河（邮件摄取）
4. [04-backend.md](docs/04-backend.md) —— 搭服务
5. [05-roadmap.md](docs/05-roadmap.md) —— 按里程碑推进
