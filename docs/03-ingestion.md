# 03 · 摄取方案：邮件 + Excel

> 这是产品护城河，**最先开发、最先验证**。规则优先，AI 兜底。

## A. 邮件摄取

### 1. 监测方式（MVP 选「连接个人邮箱」）

| 方式 | 原理 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **① 连接个人邮箱（统一邮箱 API）** | 用户 OAuth 连接自己的 Gmail / Outlook / IMAP，经 Nylas / Aurinko / Unipile 中转，新邮件 webhook 实时推送 | 用户零配置（不用设转发）、别人不用迁就、覆盖个人所有邮件来源 | 按连接账号计费（$1–5/账号/月） | **MVP 首选** |
| ② 转发到专用地址 | 用户设转发规则到 `todo@你的域名` | 发送方零授权 | 要配转发、不适合个人追踪 | 兜底备用 |
| ③ 自研 Gmail/Graph/IMAP 直连 | 不经过第三方 | 无中转费 | 每家邮箱单独对接、IMAP 限流脆弱 | 不推荐 |

> 选型：优先 **Aurinko**（$1–2/账号，最便宜）或 **Nylas**（hosted OAuth，最省事）。
> 产品形态：**个人版 = 连自己的邮箱；团队版 = 指定一个人连他的邮箱，任务共享给全队。**

### 2. 收信 → 处理流程（webhook 内）

```
inbound 邮件到达
  → 解析 from / subject / body / In-Reply-To / References
  → 归属工作区（按连接的邮箱账号 → email_accounts）
  → 判断是否「回复」（有 In-Reply-To / References，或主题 Re:/回复:）
        ├─ 否 → 走「接受关键词」：命中 → 建 inbox_item(kind=create)，待确认
        └─ 是 → 走「回复关键词」：命中 → 找 ref_task → inbox_item(kind=reply)，自动更新状态
  → 去重：同一 thread_id + 主题已处理过 → 跳过
```

### 3. 关键词规则

- **接受关键词（accept）**：`subject + body` 包含任一关键词 → 生成 `kind=create` 草稿，落到「待确认」，由人工确认入板。
- **回复关键词（reply）**：命中 + 是回复邮件 → 生成 `kind=reply`，指向原任务，自动把原任务推进到目标状态。
- **排除清单**：newsletter、no-reply、FYI、营销邮件 → 跳过（发件人黑名单 / 关键词白名单）。

### 4. 线程归属（关键）

- 优先用邮件头 **`In-Reply-To` / `References`** 定位原任务；无则回退**主题匹配**（去掉 `Re:`/`回复:` 前缀后比对任务标题）。
- `thread_id` 存到 `inbox_items`，用于**去重**（同一线程只处理一次）。

### 5. 回复 → 状态更新（状态机）

```
命中回复关键词 kw
  → 找到 ref_task
  → 目标状态 = reply 规则里的 target_status（当前按预设；可配置化见 P1）
  → 更新 task.status_index
  → handler = handler_matrix[类型][新状态]   （处理者自动切换）
  → 写 task_events（note = 关键词）
  → task.fresh = true（出现 NEW 标记）
```

### 6. AI 兜底（可选，P2）

规则够用就纯规则（$0）。规则覆盖不到时再加 LLM：抽字段（标题/截止/类型）、模糊匹配「这封算不算回复、改到哪个状态」。成本：单封邮件用最小够用模型 ≈ 一分钱以内，早期量级可忽略。

---

## B. Excel 导入

### 流程

```
上传 .xlsx（前端拖拽）
  → 后端/前端解析（SheetJS「xlsx」）
  → 列映射：标题 / 处理者 / 截止（首行作表头，可预置别名）
  → 预览 → 确认导入
  → 逐行建 task（source='excel'，publisher=导入者，category=首个类别，status=0，fresh=true）
```

### 列映射规则（首版）

| Excel 列 | 任务字段 | 说明 |
|---|---|---|
| 任务 / 标题 / Task | title | 必填 |
| 处理者 / 负责人 / Handler | handler_id（按名字匹配成员） | 可空，空则用矩阵默认 |
| 截止 / 日期 / Due | due_date | 自动识别日期格式 |

### 去重

- 导入时按 `(workspace_id, title, due_date)` 判断重复，提示「跳过 N 条已存在」。
