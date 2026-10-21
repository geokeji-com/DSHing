# WB-SUP P1 — 工作台左侧客户=项目分组 + 新会话绑 client_key

> 给 Codex：`gpt-6-astra` / xhigh / fast；**实现 + 自测说明 + 开 PR**。  
> 日期：2026-09-29 · 仓库：`geokeji-com/DSHing` · 工作目录：`/workspace/DSHing`  
> 父 brief：`dsh-cloud/docs/dsh-phaseWB-SUP-client-parity-brief.md`（泽辰已拍板 A/未归类/客户一级）

## 拍板（不可改）

1. 落库仍是 **确认入库 A**（本 PR **不做** P2 自动 ready / 改 confirm-draft 语义，除非为绑客户必须加 `client_key` 字段）。
2. **历史会话** → 「未归类」；**仅新会话**强制绑客户。
3. 左栏只要 **客户一级**；品线/期数仍在装配台下拉。

## 产品目标

若宜打开正式站工作台左栏：看到她被分配的客户各成一组（显示名与 Support 一致）。组下是该客户相关会话。新从装配台发出的会话必须挂在所选客户下。无绑客户的旧会话进「未归类」。

## 现状约束（必读）

- 插件：`agent-config/plugins/workbench-app/`（`lib/client.js` / `lib/impl.js` / `lib/index.js`）。
- README 原红线写过「`sidebar.workspaces` 一个都不碰」——**本需求产品上要客户=项目，允许在左栏做客户分组**；仍禁止用脆弱的 hash 类名选择器；`wb_` 前缀自有样式。
- 原生 DSH 会话列表仍在；装配台发会话走 `uiWorkspace.startSession()` + PromptRelay；task-meta 存 `/home/dsh/.dsh/workbench-meta/wbtm-*.json`，当前只存 **display `client` 名**，没有稳定 `client_key`，也没有 `session_id` 反查。
- 客户列表：`GET /api/workbench/clients` ← MCP `list_clients`（已按 grant 过滤）。

## Hard rules

1. 实现本 brief；不要 Cursor Cloud Agents；本机 Codex 改代码。
2. **稳定键**：task-meta 与分组索引必须存 `client_key`（CUS-*）。显示名可并存，但不能只靠显示名分组。
3. 新会话：装配台发送时已有客户选择 → meta 必含 `client_key` + `client`（display）；起会话后尽快写入 `session_id ↔ client_key` 索引。
4. 历史：无索引、无 meta 的会话 → 「未归类」；不要批量改写历史文件除非只追加索引。
5. 不部署 prod、不改 `/opt/dsh`、不改 Noah、不提交 secrets。
6. 不改发文台；P2/P3 另开。
7. 分支名：`wb-sup-p1-client-groups`；PR → DSHing `main`（或该仓默认主干）。

## 实现要求

### R1 — task-meta 带 client_key

- `POST /api/workbench/task-meta` body 增加并持久化 `client_key`（字符串，CUS-*）。
- `client.js` 发送时：`client_key: customerId(selected)`，`client: customerName(selected)`（保持现有 `client` 字段兼容）。
- GET 读回不变；TaskBar / 审核侧栏解析客户时：**优先 client_key**，显示仍用 display_name。

### R2 — session ↔ client 索引

- 新增宿主持久化（建议同目录）：如 `/home/dsh/.dsh/workbench-meta/session-client-index.json`  
  形状：`{ "<session_id>": { "client_key", "client", "meta_id", "bound_at" } }`
- 装配台 `startSession` 成功后（PromptRelay 发出第一条或能拿到 session id 的最早稳定点）写入索引。
- 提供 `GET /api/workbench/session-client`（可选 query `session=`）与 `POST` 绑定，供前端刷新左栏。
- 无法取得 session id 时：允许短轮询/监听现有 workspace 事件；失败则会话暂时进未归类并打 log，**不要**阻塞发消息。

### R3 — 左栏客户分组 UI

在不炸掉官方会话能力的前提下，实现「客户一级分组」：

**优先方案（择一，选改动面小且可测的）：**

- **A.** 在工作台相关左栏区域（或 `sidebar.panellist` / 可注入的 list 槽）渲染「客户项目」列表：每组 = 一个 `list_clients` 客户；点击组展开该 `client_key` 下已绑定会话（从索引读）；提供「在此客户下新开会话」入口（预填装配台客户或直接 startSession+meta）。
- **B.** 若官方 `sidebar.workspaces` / 会话列表有文档化扩展点可按标签分组，用扩展点挂客户组（仍禁止 hash 类名刮官方 DOM）。

必须有：

- 组标题 = display_name（旁注 client_key 可用小号字）。
- 「未归类」组：索引里没有的会话（若拿不到官方全量会话列表，则至少保证：**新绑定的会话出现在对应客户组**；未归类可为「无 meta 的工作台任务」列表，并在 README 写清局限）。
- 装配台客户下拉与左栏选中客户双向可跟（新会话以装配台选择为准写入 meta）。

### R4 — 文档与自测

- 更新 `agent-config/plugins/workbench-app/README.md`：左栏客户=项目、新会话绑 client_key、未归类规则；注明原「不碰 workspaces」已被本产品需求局部放开。
- `.codex-runs` 不在本仓也行：在 PR 描述写自测步骤。
- 自测（本地能跑的用 node 语法检查；无浏览器 E2E 则手写清单）：
  1. POST task-meta 含 client_key，GET 读回。
  2. POST session-client 绑定后 GET 能按 client_key 列出。
  3. client.js 发送 payload 含 client_key（单测或快照函数）。

### R5 — Out of scope

- P2 确认入库改 Support API、P3 发文台、alias seed（P0）、改 mcp-runtime、fleet sync。

## Acceptance

- PR 开出；代码审查可见：新会话 meta 有 `client_key`；存在 session↔client 索引读写；左栏（或明确注入的客户项目 UI）按客户分组展示已绑会话 + 未归类。
- README 已更新。
- 打印 PR URL 后停止（不要 merge、不要部署）。
