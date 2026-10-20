# DSH 内容控制台（console）

> **是什么** 内容控制台：看 / 改三个库（知识库、文章库、技能库）+ 客户档案。部署在服务器 `/srv/dsh-services/console/`，Docker 独立 compose 项目，端口 127.0.0.1:8793（SSH 隧道访问）。

## 目录

```
console/       本文件 + server.mjs（服务端，零依赖 node:http）
console-web/   前端源码（React 18 + antd 5 + Vite）
```

## 界面框架

- **客户区**：顶栏选客户 → 知识库 / 文章 / 客户档案 三个页签，切页签客户不变
- **全局区**：技能库（公共 / 中间层 / 个人 三层 + 根目录基座文件）

## 数据目录（服务器 DATA_DIR，见 .env）

```
知识库/<客户>[/<业务线>]/*.md            ← 正式区：写手（知识库 MCP）只读这里
知识库-编辑区/<客户>/…                   ← 控制台的编辑/上传/删除只落这里
.kb-history/                            ← Git 历史（--git-dir，工作树 = 知识库/）
文章库/<客户>/*.md
客户档案/<客户>/*.md     ← 客户特有偏好（如：正文必须带某奖项）
技能库/<层>/<技能>/**    + 技能库根/*.md（公共基座）
```

## 知识库版本（10-16 上线，代码在 kbstore.mjs）

编辑区 → 点「确认版本」→ 复制进正式区 + 记一次 Git 提交（名称/备注可空，内容不变也记）。
写手只读正式区，所以「没确认的内容写手看不到」由目录位置保证，知识库 MCP 不用改。
- 不经控制台直接改 `知识库/` 的文件不会进历史，下次确认会把编辑区的内容覆盖过去 —— **改知识库只走控制台**
- 每个提交带 `Kb-File: <客户>/<文件>` 行，文件历史按它过滤（`*` = 初始版本）
- 上线前全量备份：`/srv/dsh-services/backups/知识库-全量-20261016-版本管理上线前.tgz`
- 云端备份（geokeji-com/knowledge-base，私有）尚未接：需在服务器生成 deploy key

## 客户分享页（10-19 上线，原型级，代码在 shares.mjs）

`SHARES=1`（docker-compose 里）才开。阅读区「分享」→ 一份文件一个链接 `/s/<id>` + 6 位密码；
客户只能看/改这一份，按段编辑（所见即所得，保存转回 Markdown，没改的行原样保留），改动进编辑区等确认。
竞品文件不能分享。分享记录 `.shares.json`、登录会话 `.share-sessions.json` 都在 DATA_DIR 下。
已有防护：连错 5 次锁 10 分钟、HttpOnly Cookie、后台接口不认分享 Cookie。
**未做（交技术同事）**：密码明文存、无 CSRF 防护、在线状态靠 3 秒轮询、称呼不核实。

## 改前端怎么发

前端是构建产物，不是手写 HTML：

```bash
cd dsh-plugins/services/console-web
npm install        # 首次
npm run build      # 产出 dist/
scp -r dist/* root@服务器:/srv/dsh-services/console/public/
cd /srv/dsh-services/console && docker compose build && docker compose up -d
```

server.mjs 有静态资源接口（/assets/*），改它则直接 scp + 重建容器。

## 备份约定

改服务器文件前先 `.bak-日期` 备份（现有：server.mjs.bak-20261012 / -20261015 / -20261016 / -20261016b/d/e；
public/index.html.bak-20261016b + public/assets.bak-20261016b/ = 两模块改版（客户资产 / 技能库卡片）之前的 React 版；
backup-index-hand-20261016.html = 换 React+antd 之前的手写单页版，留作参考）。

## 登录

HTTP Basic Auth（AUTH_USER / AUTH_PASS 在服务器 .env）。
