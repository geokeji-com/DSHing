# DSH 插件仓库

我自己的 DSH 插件 / 工具 / 脚本。**一个目录一个东西**，互相独立，各装各的。

仓库分两个区：

- **`plugins/`** —— 能被 `dsh plugin add` 装的插件。`安装全部.sh` 扫的就是这里（认 `package.json`）
- **其余目录** —— 不是插件的（工作台原型、文章硬检脚本），装了也没用，别往 `plugins/` 里放

## 给同事：一条命令全装

```sh
git clone git@github.com:Zoeoetheroad/DSH.git ~/dsh-plugins && bash ~/dsh-plugins/安装全部.sh
```

前提：这台机器**有权限访问这个仓库**（私有仓库需要配好 GitHub SSH key）。

装完**必须重启 DSH**：`dsh web`

重启后：
- **设置** 里会多出 **MCP** 页
- 想要侧边栏毛玻璃：**设置 → 通用设置 → 自定义背景** 传一张壁纸
  （**壁纸关着侧边栏就不是毛玻璃**，这是设计如此）

第一个参数可以指定 profile，默认 `web`：`bash 安装全部.sh tui`

## 只装其中一个

```sh
dsh plugin --profile web add "git+ssh://git@github.com/Zoeoetheroad/DSH.git#path:plugins/mcp-console"
```

`#path:plugins/<目录名>` 指定装哪个 —— 所以**一个仓库能放很多个插件**，各装各的。

## 里面有什么

| 路径 | 作用 | 依赖 |
|---|---|---|
| `plugins/mcp-console` | **设置 → MCP 控制台**（当前版本）：列出已配的 MCP 服务器、它们**真正注册了哪些工具**、连接状态，还能逐个开关工具、改地址和请求头 | 无（自带 js-yaml） |
| `plugins/dsh-skill-remote` | 远程技能 provider：技能放服务端，本地不落文件 | 无 |
| `plugins/sidebar-glass` | 侧边栏毛玻璃 + 工作区行底色/标题加粗居中 | **需要 `deepseek-harness-background`，并开启壁纸** |
| `workbench/` | 云上生文 Agent 的工作台（**交互原型，不是插件**），入口看 `workbench/README.md` | 无 |
| `agent-config/` | Agent 的配置：工作台插件 + 配置片段 + 安装脚本 + 截图工具 + `TASKS.md`。自成一体，看它自己的 README | 无 |
| `文章硬检/` | 文章发出去前的**硬检脚本**（**不是插件**）：查工程痕迹暴露 / 广告法合规 / Markdown 结构坏没坏。纯正则不花 token，`node 硬检.mjs --规则` 看它查什么 | 无（只要 Node） |

## 加新东西（我自己用）

```sh
mkdir -p plugins/新东西/lib
# 写 package.json（客户端插件必须有 dsh.client.platform = "web"）和 lib/client.js
git add -A && git commit -m "加个新东西" && git push
```

同事重跑 `安装全部.sh` 就有了。不用再发文件。

## 红线

**任何凭据、密钥、`settings.yaml` 都不要进这个仓库。** 仓库里只放代码。

## 前提

- **DSH ≥ 0.1.2-rc.1**
- **pnpm 可用**（`dsh plugin` 内部转发给它）
- 装完**重启** DSH：插件是启动时挂载的，刷新页面不够
