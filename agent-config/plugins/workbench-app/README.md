# dsh-workbench · 云上生文 Agent 工作台

把 DSH 的 web 界面按 `archive/workbench/原型v2暂定版/` 做成产品界面。**不是皮肤**：工作台是 DSH 里的一个新主面板，用 DSH 自己的扩展点长出来，原有流程一行不动。

## 它做了什么

| 半边 | 干什么 |
|---|---|
| `lib/index.js`（宿主） | 浏览器做不到的事：调 MCP。**不自己配地址、不碰 bearer** —— 通过 `ctx.tools.execute()` 调你已经在「设置 → MCP」里挂好的服务器（默认 `knowledge` / `articles`，兼容 `sora-knowledge` / `sora-articles`）。你在设置里换地址/换服务器，工作台自动跟着走。路由含 `GET /api/workbench/clients`（**不缓存**）、`POST/GET /api/workbench/task-meta`（含 `client_key`）、`GET/POST /api/workbench/session-client`（会话↔客户索引）、`GET /api/workbench/client-map` + `POST /api/workbench/assign-client-group`（Noah 左树兼容 topic 映射）、`POST /api/workbench/confirm-draft`（**绑死 `client_key`** → Support `write_article(draft:false)`）、`GET /api/workbench/mcp`（诊断）。 |
| `lib/client.js`（浏览器） | 全部界面。注册 `main` 面板（key `workbench` 装配台）+ Noah 同构 `shell.overlay` 左栏；客户项目旧面板源码保留但不再注册为默认入口，令牌层从原型 `styles.css:8-80` 原样搬过来。 |

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

所以 `root`、`conversation`、`main.conversation`、composer **不改原生行为** —— 标准新会话 / 常规会话永远一键可达。

**WB-DEV-UI parity（2026-09-29）**：正式左栏由 Noah 同构 `SidebarNav` 通过 `shell.overlay` 提供，分组数据优先使用 P1 `session-client` + `list_clients`，再合并兼容 topic map；旧 `workbench-clients` 面板源码保留但不再显示，避免重复左树。

**默认边界**：不写针对别人具体 hash 类名的选择器（已批准的 PR-2 手机适配例外见文末）。`sidebar-glass` 里那些 `.hHd-Xa_root` 在当前构建里已经全部失效（现在是 `PcsDIq_root` 之类），这类选择器会在每次上游重建后静默失效。这里的类名全是自己的 `wb_` 前缀。

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

## 新会话的个人工作区

新会话默认使用当前 Harness 的 `${DSH_HOME}/workspaces/default`。`index.js` 启动时只补建该目录、按 canonical path 查重注册；已有标题保留，新记录使用「我的工作区」。未设置 `DSH_HOME` 时记日志并跳过。旧 `/home/dsh/生文` 的目录、注册记录和历史会话保留，已有会话仍按原 cwd 打开和继续。

运行中的进程无需等 `index.js` 重启：热加载的 `impl.js` 在现有 `GET /api/workbench/clients` 响应中补充 `workspace: { personal: { id, path }, legacySharedIds: [...] }`，并幂等确保个人工作区。客户 MCP 不可用时仍可返回工作区信息；工作区初始化失败时返回 `workspace: null`，客户结果与 ACL 过滤照常执行。没有新增路由。

浏览器复用客户请求缓存工作区信息，缺失时按需请求并重试一次；仍不可用则提示「个人工作区暂不可用，请稍后重试」。装配台通过 `openWorkspace(personalId)` 打开目标空白会话，提示词仅交给该目标 session id。原生 `startSession()` 的无参调用与 `legacySharedIds` 中的 ID 转向个人工作区，其他显式 ID 保持原样；首次信息尚未加载时先查询，查询失败不创建会话。包装仅安装一次，插件卸载时恢复原方法。若宿主服务冻结或代理阻止包装，会记录浏览器警告；此时装配台仍显式选择个人工作区，原生入口的保护无法安装。

| 环境变量 | 用途 |
|---|---|
| `DSH_WORKBENCH_PERSONAL_WORKSPACE` | 覆盖运行时个人工作区路径；未设置则使用 `DSH_HOME` 下的默认目录 |
| `DSH_WORKBENCH_LEGACY_SHARED_ROOT` | 覆盖 legacy ID 检测路径，默认 `/home/dsh/生文`；包含 canonical path 相同的符号链接别名 |
| `DSH_WORKBENCH_WORKSPACE_ROOT` | 保留任务状态探测路径覆盖；默认跟随个人工作区路径 |

未配置个人路径且无 `DSH_HOME` 时，新会话显示上述错误，任务状态不探测其他工作目录。工作区测试使用隔离的文件系统、`workspaceRegistry` 和 `uiWorkspace` fakes，覆盖启动、热加载、ACL、重试、卸载和旧会话接力竞态；不会操作真实用户目录。

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
- [x] WB-SUP P1：左栏客户=项目分组 + 新会话绑 `client_key`（见下）
- [x] WB-SUP P2：确认入库绑死 `client_key` → Support 同客户 `ready`（见下）
- [ ] A2 主题：只有两个标签的壳；A3 薄弱问句表（数据源未定，先留空）
- [ ] A4 拖杆 / A5 怎么写 / A7 放大编辑（拖杆/怎么写已有壳）
- [ ] C 区：会话页渲染形态
- [ ] R 区：右栏硬规则检查脚本还没写（草稿审核 tab / 确认入库已接 P2）

## 左栏客户分组（WB-DEV-UI / WB-SUP P1）

| 项 | 行为 |
|---|---|
| 稳定键 | task-meta 与 session 索引存 `client_key`（CUS-*）；显示名并存于 `client` |
| 新会话 | 装配台确认个人工作区 → `POST /api/workbench/task-meta` → `openWorkspace(personalId)` → PromptRelay 在目标 session id 写 `session-client`，并登记 Noah 兼容 topic map |
| 左栏 | `shell.overlay` 的 `SidebarNav` 显示「生文 Agent / ＋ 新建任务 / 搜索 / 客户分组会话树」；客户名优先来自 `list_clients` |
| 未归类 | 空或未知 `client_key` 的绑定进入「其他」；没有索引的历史原生会话仍留在官方会话系统 |
| 入口 | 点「＋ 新建任务」调用 `layout.selectPanel(workbench)`，点会话调用 `uiWorkspace.openSession` / `sessions.open` |


## 确认入库绑死客户（WB-SUP P2）

| 项 | 行为 |
|---|---|
| 策略 | **A 确认入库**：默认写作仍 `draft:true`；人点「确认入库」才变 Support `ready`；**不**自动外发 |
| 强制键 | `POST /api/workbench/confirm-draft` 使用会话索引 / task-meta 的 `client_key`；审核 UI 带上解析到的 `client_key` |
| 跨客户 | body `client` / `client_key` 与绑定不一致 → **400** `{ok:false,error:'client-mismatch'}`，不写库 |
| Support | 确认时调 MCP `write_article`，参数 `client=<bound client_key>`、`draft:false`；文章落在该客户下且 `status=ready` |
| 兼容 | 无 `write_article` 工具时退回本地 rename（打 stderr 警告）；有工具时先远端再挪本地草稿 |

## 不能忘的三条（来自原型说明.md）

1. **客户 = 知识库**，客户列表不本地缓存，打开时查一次、本次会话内复用。
2. 工作区里的产物先落盘，**只有确认了才调工具入库**；入库顺序是「先写远端拿回执 → 再动工作区」，失败不回滚远端。
3. 正文一改，那一篇的机器检查结论**当场作废**（退回无色）；重跑检查是可选，不是必经。


## 确认后的发文台可见性（P3）

工作台「确认入库」调用 Support `write_article(draft:false)`，文章进入该 `client_key` 的 `ready`；dsh-cloud P3 的发文台列表读取 `Support ready ∪ library`，所以确认后同客户可选用。这个链路只改变可见性，不自动外发或投放。

## 移动工作台（PR-2）

断点为 `matchMedia('(max-width: 767px)')`；变化会重新渲染。手机使用 328px 会话抽屉、写给谁 sheet、分段主题/写法、可换行 chip、全屏补充要求和吸底「开始生文」。客户、产品线、期数、模板、会话、文章及账号均来自原接口；发送仍调用原 `dispatch()`，审核仍调用 `confirmTargets()` / `confirmOne()`。文本参考文件只在浏览器读取 `.txt/.md`（上限 1 MB），合并到原来的参考正文，通用二进制附件仍由会话的原生附件入口处理。

dsh-cloud PR-1 注入共享 `tokens.css` 和唯一的 `<dsh-tabbar>`。插件通过 `dshMobile.setClients/setClient` 与 `dsh:client` 接入按 uid 隔离的 `dsh.ctx.client:<uid>`（值为客户显示名）。仅接受授权列表中的键/名称。聊天/审核设置 `data-dsh-chrome="flow"`，返回或跨回桌面清除。`visualViewport.resize/scroll` 更新键盘偏移和编辑器可见高度；pinch zoom 不视为键盘。工作台独立检测 contenteditable 的键盘偏移，也接受共享壳的 `data-dsh-keyboard="open"`。虚拟登录提示条沿用原有位置。

Round 1：聊天进度与待审/已入库入口合为 56px 行，48px 的原生 `summary` 展开最高为可视视口 40% 的滚动浮层。键盘打开时整行和快捷按钮隐藏；通过公开的 `data-conversation-scroll` / `data-composer-seat` 测量消息区实际可用高度，删除原先 `174px + 键盘高度` 的底部空白。打开键盘时定位最新消息，其后保持贴底或保留用户向上阅读的位置。写给上下文去重并最多显示两行；主题框自动增高至 40vh；手机文章预览仅去掉与页面标题相同的开头 H1，原正文和入库路径不变。

手机审核使用同一 `ReviewTabBody` 的列表 → 正文视图；不会自动打开桌面右栏。进度镜像最后一次成功 `todo_write`，没有清单时按唯一文章标题计算实际产物/运行状态，模板数量不当作目标篇数。抽屉索引没有文章状态，只有已加载会话才能按消息中 `write_article` 的标题与正式库交集得出入库数；未知显示灰点「状态未同步」，不会伪装成已停止或已入库。文章已入库显示绿色，待审显示橙色。「再写 1 篇 / 换个语气」只填入原生草稿，仍需用户发送；运行时停止沿用原生停止按钮。「在电脑上打开」提示在同账号的会话列表继续，未构造不存在的 deep link。

**上游选择器例外**：本次批准的手机适配需要覆盖 harness frame / composer。所有新增 suffix 选择器集中在 `lib/client.js` 的 `Upstream compatibility boundary` 注释下，并限定于 `html[data-wb-mobile]`；没有写死构建 hash。优先使用 `data-slot`、`data-composer-seat` 等公开属性。移动浮层用 React portal 到 body，避免上游 overlay stacking context 遮挡。桌面 JSX、侧栏宽度、右栏审核和写入路径保留；颜色固定使用浅色 token。

## Theme behavior

工作台固定使用浅色。浏览器端把 `html[data-dsh-theme]` 解析为 `light`、设置 `color-scheme: light`，并持续清理 Harness 的暗色属性/类名，因此不会跟随 OS 或保存的 Appearance 偏好。桌面左栏使用原生 `--dsw-*` 侧栏色；挑篇条、进度和审核面板使用 `--wb-*`。手机使用共享壳的 `--dsh-*`。

`test/theme.test.js` 检查浅色 token、force-light resolver、Harness 清理和手机卡片样式。离线 fixture 通过内存路由提供页面（不启动 HTTP 服务、不联系网络），保留旧桌面基线，另以 `WB_LIGHT_REF` 指定的来源比较浅色手机与桌面审核的 DOM、computed styles 和矩形。浏览器测试在 dark emulation 下验证仍回到浅色，并生成 `light-forced-desktop-*.png`、`light-forced-mobile-*.png` 和 `light-theme.json`。该审计计算 CSS 颜色及透明叠加，不覆盖图像或 emoji 的像素。启动/断言失败写入 `run-status.json`。

测试：

```sh
cd agent-config/plugins/workbench-app
npm test
# 可选浏览器依赖（仅本地测试，不进入插件运行依赖）：
npm install --no-save playwright esbuild react react-dom
npx playwright install chromium
npm run test:mobile -- /tmp/workbench-mobile-screens
```

本工作区已有测试依赖时，从仓库根目录运行：

```sh
NODE_PATH=/workspace/mobile-audit/tool/node_modules:/workspace/dsh-cloud/publish-web/node_modules \
  node agent-config/plugins/workbench-app/test/mobile-screens.mjs /tmp/wb-polish-r1
```

`npm test` 包括宿主既有用例与移动端纯函数用例（标题匹配/不匹配、空字段和重复上下文、键盘状态等）。`test/mobile-screens.mjs` 使用离线 harness 契约 fixture，禁止写请求，含真实滚动容器和消息节点。375×667、393×852、430×932 均使用 DPR 3 / touch，断言固定状态行 ≤56px、键盘隐藏状态行、最新消息在顶栏和 composer 之间可命中、视口偏移及键盘收起后滚动正确、无横向溢出；同时覆盖写给行高/圆形勾选、主题框增高、抽屉、操作 sheet、审核标题、长名和空客户。

桌面 768/1024/1440 的装配台与聊天 DOM、全部标准 computed styles、逐元素矩形与 Round 1 起点 `cc166cbc8c179cf598ccac03ac87eb4f3966fdb7` 比较；相同滚动位置下比较 DOM，忽略空 style 属性及 CSS 声明顺序，另测手机键盘→桌面往返。基线 commit 必须在本地 git 历史中；未来有批准的桌面变更时可用 `WB_BASELINE_REF=<commit>` 指定新的比较基线。截图、`results.json`（检查名/几何/计数）、`desktop-*.json` 保存到输出目录。脚本也验证旧基线能复现 W2，避免回归测试仅检查 composer 坐标。

fixture 只能验证所模拟的上游结构，键盘为 visualViewport 模拟，safe-area 在 headless 中为 0；正式发布仍需真实 harness 与实体 iOS Safari 复验。W1 的 document 双滚动由 dsh-cloud tokens.css 另行修复，本插件不增加底栏占位；W11 上游消息操作按钮不在本轮范围。

部署沿用 dsh-cloud `docs/dsh-ops-surface-lockdown-v0.md` §ZF0：备份、vendor ff-only 到已合并 main、`bin/dsh-sync-zoe-fleet --apply-homes --dry-run`、检查候选差异，再 `--apply-homes`。同步生成 prod 快照并更新 home，不重启（`recycle=False`）。正式 harness 的 client-hmr 以 500ms stat 轮询 bundle，module host 重新读取字节并发布新 revision；旧进程可在刷新后收到新版本。勿修改 `lib/index.js`、loader 配置或回收在线用户进程来交付纯客户端变更。

## 文章 → 问句关联

装配台会把实际选中的 qid、问句、client_key、采集期及 task/date 快照随
session-client POST 传给云端，等待绑定响应后才提交初始任务。云端响应
`article_question_links.version=1` 时，任务说明要求把选题分配表复制为
`write_article.question_context` 的结构化 `article_no` / `assignment` 行；
没有分配行时只传 session_id，由云端保存 `source=session` 的关联。
不从标题、正文或共享 ticks 的后续状态猜测逐篇覆盖。

确认入库仅在该会话已有 questions 元数据、且工具 schema 显式支持
question_context 时追加 session_id；云端保留草稿已有 assignment 链接。
旧云端无能力标记/无参数 schema 时仍用原工具参数；旧插件亦可继续调用新云端。
云端 `DSH_ARTICLE_QUESTION_LINKS=0` 可关闭新关联。MCP keys、地址、配置、插件
入口和路由无变化。部署时只需更新各目标 home 中的 `lib/client.js`、`lib/impl.js`；
本次只改仓库工作树，未复制至实际 homes。

## M6：文章库目录按 client_key 组织

`lib/impl.js` 的 `clientLibraryDir(client_key, display_name)` 统一解析草稿、
正式库、审核读取、硬检和确认入库目标：先用已存在的 `<root>/<client_key>`
目录或目录软链，再兼容 `<root>/<display_name>`；新建目录只使用绑定的 key。
读取不会创建目录，个人工作区文件布局不变，Support 仍为文章权威源。

审核请求携带 `session_id` / `meta_id`，宿主从已保存的绑定解析 key 并验证原有
ACL（含 owner 和实时 grants）。确认不再接受仅 body 中的 `client_key`。
旧版只传名字的读取请求，优先从唯一可见会话绑定取 key，无绑定时保留授权的
旧名字目录读取。旧名字目录仍需对应可信 ACL 名称；完成迁移后，即使绑定里的
显示名过期，也按 key 读取。改名之前应先迁移原显示名目录。

运维从 `dsh_clients` 导出 `[{"client_key":"CUS-…","display_name":"客户显示名"}]`
到 JSON。脚本只读映射文件，不连接数据库或网关。根目录默认
`DSH_WORKBENCH_LIBRARY_ROOT`，未设置时为 `/srv/dsh-data/文章库`。

```sh
# 默认只检查、输出计划；整份映射有冲突就拒绝，不移动任何目录。
node scripts/migrate-library-dirs.mjs --mapping /path/to/clients.json
# 迁前备份文章库并暂停目录写入；apply / rollback 期间保持暂停，避免并发改目录。
# manifest 的父目录须已存在，文件必须在文章库外，且不能覆盖已有文件。
node scripts/migrate-library-dirs.mjs --mapping /path/to/clients.json \
  --apply --manifest /path/to/backups/library-m6.json
# 回滚也可先预览；不加 --dry-run 的 --rollback 会直接执行。
node scripts/migrate-library-dirs.mjs --rollback /path/to/backups/library-m6.json --dry-run
node scripts/migrate-library-dirs.mjs --rollback /path/to/backups/library-m6.json
```

Apply 只把真实显示名目录 rename 成 key，再创建相对软链 `显示名 -> client_key`。
已有正确软链、只有 key 的目录和不存在的客户会跳过；两个真实目录并存、文件占位、
悬空或错误软链、重复或重叠映射均拒绝。不会合并目录、重写或删除文章。
Manifest 在首次 rename 前记录目录身份，每个客户完成后原子更新。
Rollback 先校验全部目录和软链，再只移除名字软链、rename 回原名；支持中断后
仅完成 rename 的状态，保留迁移后新增的文章。目录或软链被替换时拒绝回滚，需运维核对。

离线验证（全部使用临时目录和模拟 Support）：

```sh
node --test agent-config/plugins/workbench-app/test/*.test.js  # 仓库根目录
PYTHONPATH=. python3 -m pytest -q
```
