# skills/ —— 技能相关的一切

> **建立** 2026-09-23 ｜ **最后更新** 2026-09-24
> 本文件夹是**技能（skill）相关工作**的唯一去处：内容源、拆分稿、治理文档、实验记录。
> 以后跟技能有关的东西都往这里放，不要散在工作区根目录。

---

## ✅ 当前状态：已上线（2026-09-24）

技能内容治理**已经做完并上线**，线上跑的就是 `新版/` 这一套。

| 指标 | 旧 | 新 |
|---|---|---|
| 4 份 SKILL.md 总行数 | 1148 行 | **395 行** |
| 改一条通用规则 | 改 4 处、必漏 | **改 1 处** |
| 新增一个文章类型 | 复制 284 行 | **约 45 行** |
| `references/` 目录 | 4 份 md5 相同的副本 | **已取消** |
| 单次调用模型收到的量 | 12.5 KB | 11–27 KB（见下） |

### 关键设计：技能正文由服务端拼装

生文 Agent 的 preset **关掉了 bash / 文件读写 / 联网** —— 模型没有任何工具能去读附属文件。
所以「先读 SKILL.md，再按需读 references」这条渐进披露路线在那边走不通，
**必须一次给全**。技能服务现在取技能时自动拼成一份：

```
【公共写作规则 · 所有文章类型通用】   ← /srv/dsh-data/技能库/通用写作规则.md
【本类型规则】                        ← <技能>/SKILL.md（只写差异）
【附属文件 · prompts/topic.md】        ← 选题提示词
【附属文件 · prompts/article.md】      ← 正文提示词
```

| 技能 | 拼装后 |
|---|---|
| sora-single-brand | 11.4 K 字符 |
| sora-ranking | 23.6 K 字符 |
| sora-selection | 23.7 K 字符 |
| sora-review | 26.9 K 字符 |

单个文件仍可单独取（调试用）：`GET /skills/{name}/{path}`。

---

## 目录说明

```
skills/
  README.md                 ← 本文件：放什么、当前状态、相关位置
  技能内容治理清单.md          ← 4 个 SKILL.md 的逐节 A/B/C 分类 + 执行结果 + 待办
  新版/                       ← 拆分后的内容（= 线上现状的本地源）
    通用写作规则.md              213 行，所有文章类型共用的基座
    公共/<技能>/SKILL.md         各类型的差异条款，42–48 行
    公共/<技能>/prompts/         各类型的选题/正文提示词
```

---

## 怎么改、怎么发

**改内容**（推荐走控制台，不用 SSH）：

| 想改什么 | 在哪改 |
|---|---|
| 通用规则（所有类型共用） | 控制台 → 技能 → 顶部「所有技能共用 / 通用写作规则」 |
| 某个类型的规矩 | 控制台 → 技能 → 展开该类型 → `SKILL.md` |
| 某个类型的提示词 | 控制台 → 技能 → 展开该类型 → `prompts/*.md` |

控制台：https://dsh-sup.wanhuchangan.com ｜ **改完立刻生效**（技能服务不缓存正文，不用重启任何东西）

**改代码**：

| 改什么 | 怎么发 |
|---|---|
| 技能服务（拼装逻辑） | 改 `../dsh-code/services/skills/server.mjs` → 服务器跑 `bash /srv/dsh-services/skills/deploy.sh` |
| 控制台 | 改 `../dsh-code/services/console/` → 服务器 `cd /srv/dsh-services/console && docker compose up -d --build` |

**部署注意**：macOS 的 `tar` 会带出 `._*` 垃圾文件，传输时加 `COPYFILE_DISABLE=1`，落地后 `find . -name "._*" -delete`。

---

## 还没做的

| # | 事项 | 说明 |
|---|---|---|
| 1 | **`topic.md` 的重复** | ranking 和 selection 的选题提示词 96% 相同（约 17 KB） |
| 2 | **中间层 / 个人层测试** | 待上传两个技能验证分层 |
| 3 | **`modelInvocable` 还没关** | 插件已改成默认 `false`（技能目录不进模型上下文），但服务器仓库没拉、DSH 没重载 |
| 4 | **按人/按层拼装** | 现在只有一份基座、所有技能都继承。以后要「看人下菜」就得挪到 provider 层 |

---

## 相关但不在本文件夹

| 东西 | 位置 | 说明 |
|---|---|---|
| 旧版技能内容源 | `../技能库/` | 拆分前的自包含版本（保留备查） |
| Skill Provider 插件 | `../dsh-plugins/plugins/dsh-skill-remote/` | 属于 `DSHing` 仓库，**不能搬** |
| 技能服务代码 | `../dsh-code/services/skills/` | `server.mjs` + `deploy.sh` |
| 内容控制台代码 | `../dsh-code/services/console/` | 浏览器里看/改技能、知识库、文章 |
| 上下文拼装参考 | `../docs/` | 酒馆/AI Dungeon/Agnai 的拼装规则调研 |

---

## 线上位置

| 东西 | 地址 |
|---|---|
| 技能数据 | `/srv/dsh-data/技能库/{通用写作规则.md, 公共/中间层/个人/<技能>/}` |
| 备份 | `/srv/dsh-data/技能库.bak.20260924_151105`（拆分前的完整副本） |
| 技能服务 | `/srv/dsh-services/skills/`（容器 `dsh-skills`，端口 8792） |
| 控制台 | https://dsh-sup.wanhuchangan.com |
