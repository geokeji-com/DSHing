# WB-NAV-whoami — 左栏底部显示当前登录身份

## 背景
正式站生文 Agent 自绘左栏（`SidebarNav` / `.wb_nv`）压掉了官方侧栏后，官方脚部的账号信息一起消失。用户（泽辰）要求在**左下角**一眼看出当前登录是谁（含虚拟登录目标）。

## 目标
在 `SidebarNav` 左栏**底部固定**展示当前登录人：
- 主行：`display_name`（没有则 `email`，再没有则 `uid` 前 8 位）
- 副行（可选、更淡）：`email`（若主行已是 email 则省略；或短 uid）
- 数据：同域 `GET /api/me`（credentials include），网关已有，返回 `{ uid, display_name, email, roles, ... }`
- 虚拟登录时 `/api/me` 应是被冒充用户 —— 以网关现行为准，本刀不改网关
- 拉取失败：脚部显示「未识别登录」或隐藏副行，**不得**挡会话树

## 非目标
- 不做登出按钮（本刀）
- 不改官方 `sidebar.footer` 插槽
- 不改发文台 / Support

## 改动点（仅 DSHing workbench client）
文件：`agent-config/plugins/workbench-app/lib/client.js`

1. CSS（紧挨现有 `.wb_nv*`）：
   - `.wb_nvFoot`：`margin-top:auto; padding:8px 6px 4px; border-top:1px solid #e5e7eb; display:flex; flex-direction:column; gap:2px;`
   - `.wb_nvFootName`：13px / 600 / `#111827`；ellipsis
   - `.wb_nvFootSub`：11px / `#9ca3af`；ellipsis

2. `SidebarNav`：
   - `useState` 存 `{ label, sub }`，初始 `{ label: "…", sub: "" }`
   - `useEffect` 一次 `fetch("/api/me", { credentials: "same-origin" })` → 解析 label/sub
   - 在 `wb_nvTree` **之后**追加 `h("div", { className: "wb_nvFoot", title: uid }, …)`

## 验收
1. 硬刷新正式站工作台，左栏**左下角**可见当前用户显示名（若宜 / 泽辰各自登录或虚拟登录目标）
2. `/api/workbench/skills` 等既有能力不受影响
3. 网络失败时左树仍可用

## 部署
合并后 `dsh-sync-zoe-fleet --apply-homes` + recycle 相关席位（至少若宜、泽辰）。
