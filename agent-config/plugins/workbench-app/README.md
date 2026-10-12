# dsh-workbench · 云上生文 Agent 工作台

把 DSH 的 web 界面按 `workbench/原型v2暂定版/` 做成产品界面。**不是皮肤**：工作台是 DSH 里的一个新主面板，用 DSH 自己的扩展点长出来，原有流程一行不动。

## 它做了什么

| 半边 | 干什么 |
|---|---|
| `lib/index.js`（宿主） | 浏览器做不到的事：调 MCP。**不自己配地址、不碰 bearer** —— 通过 `ctx.tools.execute()` 调你已经在「设置 → MCP」里挂好的服务器（默认 `sora-knowledge` / `sora-articles`）。你在设置里换地址/换服务器，工作台自动跟着走。路由 `GET /api/workbench/clients`（**不缓存**）、`GET /api/workbench/mcp`（诊断：这台 Host 上挂了哪些 MCP、各有哪些工具）。 |
| `lib/client.js`（浏览器） | 全部界面。注册 `main` 面板（key `workbench`）+ `sidebar.panellist` 一行，令牌层从原型 `styles.css:8-80` 原样搬过来。 |

## 为什么是「新面板」而不是「换外壳」

原型的左栏在标注里是唯一标 `.is-old`（DSH 现成）的东西，其余全是新增。DSH 的槽位正好够：

| 原型 | DSH 槽位 |
|---|---|
| 装配台 A1–A7 | `main`(key `workbench`) + `sidebar.panellist` |
| C1 顶部任务条 | `conversation.session.header` |
| C2/C3/C4 思考链·工具链·产物卡 | `conversation.chat.node`（自定义消息节点） |
| C5/C6 用量行·输入框 | `conversation.composer.*` |
| R1–R5 右栏审核 | `sidebar.right.pane.tab` + `ctx.sidebarRight.openTab` |
| S1/S5 左栏品牌行·底部入口 | `sidebar.brand.*` / `sidebar.footer.action` |

所以 `root`、`conversation`、`main.conversation`、composer、`sidebar.workspaces`（项目管理）**一个都不碰** —— 标准新会话 / 常规会话 / 项目管理永远一键可达。

**红线**：不写针对别人 hash 类名的选择器。`sidebar-glass` 里那些 `.hHd-Xa_root` 在当前构建里已经全部失效（现在是 `PcsDIq_root` 之类），这类选择器会在每次上游重建后静默失效。这里的类名全是自己的 `wb_` 前缀。

## 什么要重启，什么不用

| 改哪儿 | 生效方式 |
|---|---|
| `lib/client.js`（界面） | ~500ms 热替换，**不用刷新、不用重启** |
| `lib/impl.js`（宿主逻辑：路由、MCP 调用、归一化） | **下一个请求就是新逻辑，不用重启** |
| `lib/index.js`（宿主壳：注册路由那层） | 要重启一次 `dsh web` |
| 装新插件 / 改 loader 行 | 要重启一次 |

`impl.js` 为什么不直接写在 `index.js` 里：**宿主插件的代码改了 DSH 要重启才生效**
（模块已被 import 缓存；把 loader 行禁用再启用也没用，实测过），而客户端半边是热的。
所以壳只负责"把路由注册一次"，每个请求按 `impl.js` 的 mtime 决定要不要重新 import ——
宿主逻辑于是也跟着热了。壳刻意写到最少，一年也改不了几次。

## 装

```sh
# 依赖 + 行都要（包里有 dsh.bundle.patch，行会自己插）
dsh plugin --profile web add /path/to/plugins/dsh-workbench
```

装完刷新页面即可 —— 客户端半边走 HMR（改 `lib/client.js` 约 500ms 热替换，不用刷新、不用重启）。

`cordis.patch.yml` 里的 `knowledgeUid` 填**有客户授权**的 uid；留空则退回 `DSH_KB_MCP_UID` 或端点默认服务身份（后者通常没有任何客户，会报 `no-grant`）。

## 现在到哪了

- [x] 令牌层 + 面板 + 侧栏入口
- [x] A1 给谁写：**接真数据**（客户 / 业务线 / 服务期，全部来自 knowledge MCP）
- [ ] A2 主题：只有两个标签的壳；A3 薄弱问句表（数据源未定，先留空）
- [ ] A4 拖杆 / A5 怎么写 / A7 放大编辑
- [ ] C 区：会话页渲染形态
- [ ] R 区：右栏审核（依赖后端：产物目录、硬规则检查脚本、入库 MCP 工具 —— 都还没写）

## 不能忘的三条（来自原型说明.md）

1. **客户 = 知识库**，客户列表不本地缓存，打开时查一次、本次会话内复用。
2. 工作区里的产物先落盘，**只有确认了才调工具入库**；入库顺序是「先写远端拿回执 → 再动工作区」，失败不回滚远端。
3. 正文一改，那一篇的机器检查结论**当场作废**（退回无色）；重跑检查是可选，不是必经。
