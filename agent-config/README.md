# agent-config · 工作台（云上生文 Agent）的全部配置

这是我（Agent）在这个项目里做出来的全部东西，**自成一体**：把这个文件夹拿走、
跑一遍 `install.sh`，就能得到一模一样的一套配置。

> 这就是「写字台」。线上服务器直接从 `/home/dsh/DSHing/agent-config/plugins/workbench-app` 加载，**目录不要改名或挪走**。

## 里面有什么

| 路径 | 是什么 |
|---|---|
| `plugins/workbench-app/` | **工作台插件**。host 半（`lib/index.js` 壳 + `lib/impl.js` 逻辑）+ client 半（`lib/client.js` 界面） |
| `config/cordis.patch.fragment.yml` | 要并进 `$DSH_HOME/cordis.patch.yml` 的三段配置（MCP ×2 + 远程技能 + 工作台自己），**带 <> 的地方要填你自己的地址和 token** |
| `install.sh` | 一键装：软链插件 + 写 profile 依赖 + 插 loader 行。幂等 |
| `tools/shot.mjs` | 截图 / 控制台报错 / DOM 钩子三合一工具。改界面全靠它 —— 客户端插件的注册失败只在浏览器里报，宿主 stderr 一个字都不说 |
| `TASKS.md` | 待办清单（含明天第一件要查的 bug） |

## 装

```sh
bash install.sh              # 默认 profile: web
bash install.sh tui          # 指定 profile
```

装完还要**手动**做两件事：

1. 填 MCP 与 skill-remote 的地址/token —— 见 `config/cordis.patch.fragment.yml`，
   或在网页的「设置 → MCP」里加。
2. **重启一次 `dsh web`**（宿主代码要重启才加载）。

## 它接到哪三个服务

| 工作台里的东西 | 走哪个 | 怎么调 |
|---|---|---|
| A1 客户列表 | 知识库 MCP `sora-knowledge` | `ctx.tools.execute('mcp__sora-knowledge__list_clients')` |
| A1 提示里的文章篇数 | 文章库 MCP `sora-articles` | `mcp__sora-articles__list_articles`（按客户查） |
| A5「用模板」的技能 | 远程技能 `dsh-skill-remote` | `ctx.skills.list()` |

**不自己配地址、不碰任何 token** —— 你在「设置 → MCP」里换服务器、换地址，
工作台自动跟着走。插件里一个密钥都没有。

### ⚠️ 这三个服务跑在你自己电脑上

走 Cloudflare 快速通道（`*.trycloudflare.com`），**电脑或隧道一重启，地址就变了**。
所以「连不上」是常态，不代表代码坏了：

1. **先问用户要新地址** —— 不要改配置里的地址、不要拿别的 URL 反复试
2. 最多做一次确认性探测：`curl -sS -m 10 -o /dev/null -w '%{http_code}\n' <地址>/health`
   - 域名解析不到 / HTTP 530 → 隧道断了 → 要新地址
   - HTTP 401 → 地址对、token 变了 → 要新 token
3. 拿到新地址后**只改一处**（`$DSH_HOME/cordis.patch.yml` 里对应的 `url:`），改完热生效

## 什么要重启，什么不用

| 改哪儿 | 生效方式 |
|---|---|
| `lib/client.js`（界面） | ~500ms 热替换，**不用刷新、不用重启** |
| `lib/impl.js`（宿主逻辑：路由、MCP 调用、归一化） | **下一个请求就是新逻辑，不用重启** |
| `lib/index.js`（宿主壳：注册路由那层） | 要重启一次 |
| 装新插件 / 改 loader 行 | 要重启一次 |

宿主插件的代码改了 DSH 要重启才生效（模块被 import 缓存；把 loader 行禁用再启用
也没用，实测过）。所以壳只负责"把路由注册一次"，每个请求按 `impl.js` 的 mtime
决定要不要重新 import —— 宿主逻辑于是也跟着热了。

## 红线

**任何 token、密钥、`settings.yaml` 都不要进这个文件夹。** 这里只有代码和占位符。
