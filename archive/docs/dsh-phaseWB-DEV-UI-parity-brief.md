# WB-DEV-UI：正式站工作台 1:1 对齐若宜 dsh-dev「生文 Agent」

日期：2026-09-29
仓库：`geokeji-com/DSHing`（插件）
对照源：Noah `/home/dsh/DSHing` @ `b637657`（dsh-dev.wanhuchangan.com:3081）
正式站现状：舰队 tip 含 WB-SUP P1/P2，但**未挂** Noah 的左栏 overlay。

## 用户意图

正式站「生文 Agent」工作台在界面与交互上 **1:1 复刻** 若宜 dsh-dev：左栏客户分组会话、＋新建任务、装配台、右侧文章审核（已审完 / 已入库 / 确认入库 / 全部确认）、任务进程等；页面可见元素与逻辑都要同步。
（入库仍 ≠ 外发；发文台投放不在本 brief。）

## 现状差距（已核对 md5 / 注册点）

| 能力 | 若宜 dsh-dev (Noah) | 正式站舰队 |
|---|---|---|
| `shell.overlay` → `SidebarNav`（生文 Agent / 新建任务 / 搜索 / 客户分组会话树） | ✅ 有 | ❌ **未注册**（最大体感差距） |
| 右栏「文章审核」+ 确认入库 / 全部确认 | ✅ | ✅ 有，细节弱于 Noah（缺「已审完」等文案/态） |
| 输入区 `PickBar`（改哪几篇） | ✅ | ❌ 未见同级挂载 |
| 装配台 main + PromptRelay | ✅ | ✅ |
| WB-SUP P1 `session-client` +「客户项目」面板 | ❌ Noah 用自绘映射表 | ✅ 正式站有（与 Noah 左栏是两套壳） |
| WB-SUP P2 confirm-draft 绑死 `client_key` | 弱/无 | ✅ 保留 |

结论：不是「审核按钮没有」，而是正式站少了 Noah 那层 **覆盖原生侧栏的生文 Agent 壳**；P1 另开了「客户项目」面板，所以你在正式站看不到截图里那种左栏。

## 方案（建议）

**以 Noah UI 壳为准，并入正式站已有 P1/P2 绑定语义。**

### R1 — 左栏与新建任务（必做）
1. 从 Noah `client.js` 迁入 `SidebarNav` + `wb_nv*` 样式 + `shell.overlay` 注册。
2. 分组数据优先：`session-client` 索引 ∪ 装配台登记表；客户名来自 `list_clients`。
3. 「＋ 新建任务」→ `layout.selectPanel(workbench)`（装配台）。
4. 点会话 → `uiWorkspace.openSession` / `sessions.open`（与 Noah 相同）。
5. 隐藏/让位官方原生侧栏（Noah 已用 overlay 盖住；保持同一套 `wbNavTakeFrame`）。
6. 正式站现有「客户项目」独立 main 面板：R1 后改为次要或下线，避免双左栏。

### R2 — 审核区与确认逻辑对齐 Noah（必做）
1. 对齐 ReviewTab：已审完 / 已通过 x/y / 已入库列表 / 确认入库 / 全部确认。
2. 保留正式站 P2：`confirm-draft` 必须用绑定 `client_key`；错客户 400。
3. 挂上 Noah `PickBar`（input.dock）。
4. 任务进程 / TaskBar 文案与 Noah 行为对齐（只看本任务产出）。

### R3 — 数据与验收
1. 不搬 Noah 私有会话数据；正式站用自己席位会话。
2. 验收：虚拟登录若宜 → 左栏见「生文 Agent / 新建任务 / 客户（n）」→ 猿编程下真开局生文 → 右栏审核 → 确认入库 → Support ready → 发文台可见；**不外发**。
3. 左栏能点进该真实会话（解决「工作区里看不见测试会话」——会话在生文左栏，不在 `/workspaces` 目录页）。

## 不做
- 不改 Noah dsh-dev / dsh-sup。
- 不自动外发。
- 不把正式站 Support 数据倒回 Noah。

## 验收故事
作为若宜，打开正式站工作台，看到与 dsh-dev 同构的生文 Agent 左栏与审核区；在客户下新建任务并完成确认入库后，该会话留在对应客户分组下，文章进 Support ready。

## 实现分工
Grok 本 brief；Codex CLI（gpt-6-astra / xhigh / fast）改 `agent-config/plugins/workbench-app/lib/client.js`（必要时 `impl.js`）+ 测；PR → 舰队 sync → 回收席位冒烟。

## 补充（泽辰 2026-09-29 11:33）

1. **Skill 使用效果**：若宜 dsh-dev 侧已高度可用的 skill（含调用/展示/任务进程里的 skill 链路）使用效果要一并迁到正式站，不只迁壳。
2. **确认入库对接发文台**：`确认入库` / `全部确认` 成功后，文章不仅进 Support `ready`，还要让**发文台**同客户立刻可选用（正式站已有 P3 list∪Support ready；若仍缺 library 双写则本阶段补到「确认即可见于发文台」）。入库仍 ≠ 自动外发/投放。


## Implemented

日期：2026-09-29

- 从 Noah 正式移植 `SidebarNav`、`wb_nv*` 样式、`wbNavTakeFrame` / `wbNavHideOfficial`，并注册 `shell.overlay` 的 `workbench-sidebar-nav`；左树优先合并正式 `session-client` 索引与 `list_clients` 显示名，再合并 Noah 兼容的 topic 登记映射。
- 「＋ 新建任务」继续进入 `workbench` 装配台；保留 `PromptRelay`、`wb-pending-bind`、`bindSessionClient` 与 P1/P2 会话绑定链路。
- 挂载 Noah `PickBar`（`conversation.input.dock` order 85）和共享 `WB_PICK`；ReviewTab 对齐已审完、已入库锁定段、确认入库（n 篇）与全部确认，并继续把 bound `client_key` / `session_id` / `meta_id` 传入 `confirm-draft`。
- TaskBar 改为按本会话成功的 `mcp__sora-articles__write_article` 结果计数，展示 skill 链路进度，镜像最后一次成功 `todo_write`，并用本会话写作标题与 library 清单交集计算入库命中。
- 补齐 `client-map` / `assign-client-group` 兼容路由，用于保留 Noah 左树 topic 标签；Support MCP 路由与正式 P1/P2 处理器保持不变。
- **确认入库语义**：工作台确认调用 Support `write_article(draft:false)` 写入 `ready`；dsh-cloud P3 将 Support ready 合并进发文台列表，因此确认后同客户可见于发文台，仍不会自动外发/投放。

残留风险：本次完成静态合并和 Node 语法/契约自检，尚未在正式席位做浏览器冒烟；官方 frame class 或宿主 slot 契约若上游变化，需按 Noah 的 DOM/slot 约定复核。P3 发布列表依赖 dsh-cloud 已合入的 Support ready 合并。
