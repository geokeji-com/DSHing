# WB-SUP P2 — 确认入库落到 Support 同客户文章库（绑死 client_key）

> 给 Codex：`gpt-6-astra` / xhigh / fast；**实现 + 测试 + 开 PR**（满载则 executor 顶上）。  
> 日期：2026-09-29 · 主仓：`geokeji-com/DSHing`（workbench）；必要时薄补 `geokeji-com/dsh-cloud`（support_api）。  
> 依赖：P1 已合并（`746f58b`）—— task-meta / session 索引含 `client_key`。  
> 拍板：落库策略 **A 确认入库**；禁止串客户；不自动外发。

## Goal

在客户 A 的会话里生成草稿并点「确认入库」后：Support `articles` 只出现在客户 A（`client_key`）；`status=ready`；发文台选 A 可见。模型 `write_article` 若带错客户，宿主/服务端以会话绑定的 `client_key` 为准拒绝或覆盖。

## Hard rules

1. 默认写作仍 `draft:true`；确认入库才变 ready（或 write draft:false 仅在用户明确「直接入库」——保持现网提示词口径）。
2. **强制客户**：confirm-draft / write_article 路径必须使用会话索引或 task-meta 的 `client_key`；禁止只信模型自由填写的 client 名（可用 display_name 解析，但最终 key 必须 = bound key）。
3. 不部署 prod（编排器部署）；不改 Noah；不提交 secrets。
4. 分支建议：DSHing `wb-sup-p2-confirm-ingest`；若需 dsh-cloud 校验则另开 PR，同一验收故事。

## R1 — workbench confirm 绑死 client_key（DSHing）

- `POST /api/workbench/confirm-draft`：body 已有 `client`（显示名）。改为同时接受/要求 `client_key`；若缺则用 session-client 索引按当前 session 补全。
- 调用 MCP `write_article`（或现有搬文件 + MCP）时：`client` 参数解析到 bound `client_key`；`draft:false`。
- 若 body.client / client_key 与 bound 不一致 → 400 `{ok:false,error:'client-mismatch'}`，不写库。
- 审核 UI：确认时带上解析到的 `client_key`。

## R2 — Support write_article 防御（dsh-cloud，可选但推荐）

- `support_api.write_article`：当请求头带 `X-DSH-Bound-Client-Key`（workbench 代理可加）时，与解析后的 client_key 必须一致，否则 403。
- 无该头时保持现状（兼容其它调用方）。
- pytest：mismatch → 403；match → ready 行出现。

## R3 — 文档与验收

- 更新 workbench README：确认入库 = 绑死 client_key → Support 同客户 ready。
- 验收脚本/手测：
  1. 猿编程会话 confirm → Support 猿编程多一篇 ready；华熙 count 不变。
  2. 故意 POST confirm 带错误 client_key → 400/403。
  3. 不点发文台投放。

## Out of scope

P3 发文台文案、左栏 UI（P1）、外发渠道、自动 ready（B）。

## Acceptance

- PR 开出；确认入库路径强制 client_key；跨客户写入失败。
- 打印 PR URL 停止（不 merge 除非编排器要求；本迭代由 dsh agent 合并部署）。
