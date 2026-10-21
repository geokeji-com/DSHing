# DSHing —— 云上生文的代码仓库

云上生文由三块组成：**写字台**（写文章）、**资料台**（管写文章要读的资料）、**投放台**（发出去）。

| 目录 | 是什么 |
|---|---|
| `agent-config/` | **写字台**：DSH 里的工作台插件 + 配置 + 安装脚本。见 `agent-config/README.md` |
| `services/console/` + `services/console-web/` | **资料台**。见 `services/console/README.md` |
| `services/articles/` | 文章库服务（写字台写进去、投放台读出来） |
| `文章硬检/` | 文章发出去前的检查脚本（广告法、工程痕迹、格式），写字台会调用 |
| `skills/` | 技能（写作 prompt）的内容源与治理文档 |
| `plugins/` | 几个 DSH 小插件（MCP 设置页、远程技能、侧边栏毛玻璃） |
| `tests/` | 写字台的离线测试 |
| `archive/` | 不再用的旧原型和记录，只作参考 |

投放台在另一个仓库，不在这里。

## 线上怎么用到这个仓库

- **写字台**：服务器上 `/home/dsh/DSHing` 是这个仓库的 clone，DSH 直接从 `agent-config/plugins/workbench-app`、`plugins/mcp-console`、`plugins/dsh-skill-remote` 加载，`文章硬检/硬检.mjs` 也按这个路径调用。**这几个目录不要改名或挪走。**
- **资料台 / 文章库服务**：跑在 Docker 里，服务器不从仓库拉代码，改完按各自 README 手动发布。

## 改东西

- 一律开分支 + PR 合进 `main`，不要直接推 `main`。
- 合进 `main` 后，写字台要到服务器 `/home/dsh/DSHing` 里 `git pull` 才生效。

## 装 DSH 小插件（同事本机用）

```sh
git clone git@github.com:geokeji-com/DSHing.git ~/DSHing && bash ~/DSHing/安装全部.sh
```

装完重启 `dsh web`。只装一个：`dsh plugin --profile web add "git+ssh://git@github.com/geokeji-com/DSHing.git#path:plugins/mcp-console"`。

## 红线

**任何凭据、密钥、`settings.yaml`、`.env` 都不要进这个仓库。**
