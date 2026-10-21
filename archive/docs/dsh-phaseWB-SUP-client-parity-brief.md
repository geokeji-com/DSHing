# WB-SUP — 工作台客户项目 ↔ Support 知识/文章 一一对应

> 给 Codex：`gpt-6-astra` / xhigh / fast（**等泽辰确认后再开实现**）。  
> 日期：2026-09-29 · 仓库：优先 `geokeji-com/DSHing`（工作台）+ 必要处 `geokeji-com/dsh-cloud`（Support/发文台/分配）  
> 产品口径（泽辰 2026-09-29）：若宜被挂了哪些客户，工作台左侧就应按客户成「项目分组」；分组与 Support 同客户键下的知识库/文章库一一对应；某客户下会话写出的文章自然落到该客户 Support 文章库；发文台从该客户文章库挑待发稿。

## 背景（现状事实，勿当目标）

- **分配**：控制面 `dsh_clients` + `dsh_project_grants`（primary/deputy）；启用后若宜 `list_clients` 能看到（已验证华熙、猿编程）。
- **Support**：`dsh_support.alias` / `kb_docs` / `articles` 用同一 `client_key`（如 `CUS-KDUZ-2FH6` 猿编程）。树路径：`知识库/<display_name>/…`、`文章库/<display_name>/…`（draft 在 `草稿/`）。
- **工作台现网**：装配台「给谁写」是**下拉选客户**（MCP `list_clients`），不是左侧固定「客户=项目」树。会话在用户工作区，**不按客户强制分组**（原型 `workbench/原型v2暂定版` 已有客户组，现网未对齐）。
- **落库**：靠模型调 `write_article`；装配提示默认 `draft:true`。**没有**「会话绑定客户 → 生完自动入库」产品闭环。冒烟可显式 `write_article` 进 ready（猿编程 `article_6e4d23ef…`），证明 MCP 通路通，不等于产品已一一对应。
- **发文台** `/publish`：只列**已分配客户**下 `status=ready` 的文章库条目；不外发则看不到「待发」感。

## 目标体验（验收语言）

若宜登录正式站工作台：

1. **左侧**看到她被分配且 enabled 的客户，各成一组（显示名与 Support 一致，如「猿编程」「华熙生物」）。
2. 组下是该客户相关**会话**（新会话默认挂在当前选中客户组）。
3. 打开 **Support** `/support`：同一批客户名出现；知识库/文章树与左侧客户一一对应（同一 `client_key` ↔ `alias.display_name`）。
4. 在客户 A 的会话里生成并确认入库后：Support「文章库/A/…」出现该篇；若 ready，发文台选客户 A 的文章库也能看到。**无需**运营再手工选别的客户键。
5. 未分配客户：工作台左侧不出现；Support 管理端可仍见全量（admin），操作员视图与 grants 一致。

## Hard rules

1. **客户键唯一真源**：`client_key`（CUS-*）。显示名只来自 Support `alias.display_name`（缺则 catalog `display_name`）。禁止前端自造客户 id。
2. **不改 Noah / 若宜本机 dsh-sup 数据面**；正式站 Support 与工作台对正式站。
3. **不自动外发**：入库 ≠ 发文台投放。本 brief 的「自然落库」止于 Support `articles`（及发文台文章库列表）。
4. 实现可拆 PR；**先 DSHing 工作台左侧分组 + 会话绑客户**，再 **落库策略**，再必要时补 dsh-cloud。
5. 密钥不进 git；不永久开 cookie 虚拟登录。
6. 插件默认行为若与若宜点选设计冲突：正式席位用配置覆盖，改源码默认需她知情。

## 分阶段（建议）

### P0 — 身份与列表对齐（小、可当天验）

- 工作台 `list_clients` 与 Support 树客户集合对**同一 uid**：都是「enabled + 有 grant」的客户（已基本如此则写回归测）。
- Support `alias`：对每个 enabled+assigned 客户保证有 alias 行（缺则 seed `display_name`）；避免工作台有客户、Support 树无名。
- 验收：若宜可见客户集合 = Support 树 `clients[].name` 集合（admin 全量另议）。

### P1 — 左侧「客户=项目」分组（DSHing workbench）

对照原型 `workbench/原型v2暂定版`（客户组 + 组下会话）：

- 左栏：按客户分组；组标题 = display_name；可折叠。
- 新会话：归属当前客户（task-meta / session 元数据必须持久化 `client_key`，不能只靠首条 user 文案解析）。
- 切会话：装配台客户选择跟随会话绑定的 `client_key`（只读回填，勿丢绑）。
- 会话列表过滤：默认只显示当前用户工作区会话，按 `client_key` 挂组；无绑客户的历史会话进「未归类」组（可后续迁移，不阻断）。
- 验收：若宜有 N 个分配客户 → 左侧 N 组；在「猿编程」下开会话，meta 含 `CUS-KDUZ-2FH6`。

### P2 — 生文 → Support 文章库（自然落库）

产品二选一（**实现前泽辰拍板**，默认推荐 A）：

- **A. 确认入库（推荐，贴近现网「产物审核 / draft」）**  
  - 模型默认 `write_article(..., draft=true)` → Support `文章库/<客户>/草稿/`。  
  - 工作台「确认入库」→ 同篇改 `ready`（或再写一版 ready）。  
  - 会话已绑 `client_key` 时，write/confirm **禁止**写到其它客户；工具层校验 client。
- **B. 生成结束自动 ready**  
  - 会话结束或模型产出终稿后宿主自动 `write_article(draft=false)`。  
  - 风险：误入库；需强绑定客户 + 明确「仅生文不入库」开关。

不论 A/B：

- `write_article` 的 `client` 必须以会话/task-meta 的 `client_key` 为准，不信任模型自由填写（可仍传 display_name，服务端解析到 key）。
- 发文台继续只读 ready；草稿只在 Support/工作台草稿区。

验收：在猿编程会话生文 → Support 猿编程下出现新篇；华熙下不出现；发文台选猿编程可见 ready（若走 A 则确认后可见）。

### P3 — 发文台体感（薄）

- `/publish` 选客户后文章库列表与 Support 该客户 ready 一致（已接近，补回归）。
- 文案：「待发」= 该客户 ready 且未成功投放（若已有投放状态字段则用；没有则本阶段只保证「文章库可见」）。

## Out of scope（本 brief 不做）

- 全量再导 Noah、清北建客、改 THOR。
- 飞书 SSO / 永久虚拟登录。
- 自动外发到媒体渠道。
- 品线/服务期三级在左栏完整树（可后续；P1 先客户一级分组）。
- 改若宜 Noah 机上的 dsh-dev/dsh-sup。

## 建议仓库切分

| 阶段 | 仓库 | 主要触点 |
|------|------|----------|
| P0 | dsh-cloud | alias 保障、list 一致性测 |
| P1 | DSHing `workbench` / `workbench-app` | 左栏分组、session/task-meta `client_key` |
| P2 | DSHing + 必要时 support_api | 落库策略、client 强制校验 |
| P3 | dsh-cloud publish | 列表回归 |

## 验收清单（端到端）

1. 启用客户 X 并 primary=若宜；别名存在。  
2. 若宜工作台左侧出现 X 组；Support 有 X。  
3. 在 X 组会话生文并按选定策略入库。  
4. Support `文章库/X/…` 可见；ready 时 `/publish` 选 X 可见。  
5. 未分配客户 Y：若宜左侧无 Y。  
6. 不出现跨客户写库。


## 泽辰拍板（2026-09-29）

1. 落库策略：**A 确认入库**（默认 draft，确认后 ready）。不做 B 自动 ready。
2. 历史会话：进「未归类」；**仅新会话强制绑客户**，本迭代不做历史迁移。
3. 左栏：**只要客户一级**；品线/期数仍只在装配台下拉。

实现顺序：P0 → P1 → P2 → P3。下文「给泽辰拍板」三项已关闭。

## 给泽辰拍板（实现前）— 已关闭


1. 落库策略选 **A 确认入库** 还是 **B 自动 ready**？  
2. P1 是否必须本迭代做出「未归类」历史会话迁移，还是仅新会话强制绑客户？  
3. 左栏是否只要**客户一级**，品线/期数仍只在装配台下拉？

确认后按 P0→P1→P2 开 PR；本文件路径：`docs/dsh-phaseWB-SUP-client-parity-brief.md`。
