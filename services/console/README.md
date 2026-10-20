# 资料台（原「内容控制台」，console）

> **是什么** 看 / 改写手要读的东西：客户资产（知识库、文章、客户档案）+ 技能库；知识库可以分享给客户一起改。
> 和「写文台」「投放台」并列。线上 https://dsh-sup.wanhuchangan.com （nginx 反代 127.0.0.1:8793，支持 WebSocket）。
> 服务器目录 `/srv/dsh-services/console/`，Docker 独立 compose 项目；数据 `/srv/dsh-data`（DATA_DIR）。

## 目录

```
console/       服务端（node:http；依赖只有实时协同用的 yjs / @hocuspocus/server / ws）
  server.mjs     路由、文件读写、登录
  kbstore.mjs    知识库 编辑区 → 确认 → 正式区 + Git 历史
  shares.mjs     客户分享：链接、密码、会话、每一轮编辑的状态
  collab.mjs     实时协同（Hocuspocus，挂在同一端口的 /collab）
  merge3.mjs     非协同保存时的三方合并
console-web/   前端（React 18 + antd 5 + Vite + Tiptap 编辑器）
  KbEditor.jsx   编辑器（内部、客户共用）：目录、搜索替换、表格、纯文本粘贴
  trackchanges.js 修订痕迹（按人上色：新增 / 删除线 / 改格式 / 改段落样式）
  htmlmd.js / md.js  Markdown ⇄ 编辑器，没改的行原样保留
```

## 数据目录（DATA_DIR）

```
知识库/<客户>[/<品线>]/*.md     正式区：写手（知识库 MCP）只读这里
知识库-编辑区/<客户>/…          资料台里的编辑、上传只落这里
.kb-history/                   Git 历史（--git-dir，工作树 = 知识库/）
.kb-renames.json               改名记录（新名 → 旧名，让旧版本跟着新名字走）
.shares.json / .share-sessions.json   分享记录 / 客户登录会话
.collab/  .collab-staff-key    协同草稿（每轮一个） / 内部连协同用的钥匙
文章库/<客户>/*.md   客户档案/<客户>/*.md   技能库/…
```

## 规则

- **编辑区里的内容修改要确认**：点「确认版本」→ 复制进正式区 + 记一次 Git 提交（内容没变也记，比如续约）。写手只看确认过的，由目录位置保证。
- **编辑区外的操作不用确认、不进历史**：改名（点标题）、删除（编辑区和正式区一起删，弹一次确认）。
- 不经资料台直接改 `知识库/` 不会进历史，下次确认会被覆盖 —— **改知识库只走资料台**。
- 每个提交带 `Kb-File: <客户>/<文件>` 行，文件历史按它过滤（`*` = 初始版本）。

## 客户分享（`SHARES=1` 才开）

一份资料一个长期链接 `/s/<id>` + 6 位密码，客户只看得到这一份；竞品资料不能分享。

1. **开放编辑**：客户从最新确认版开始改（内部有未确认改动时不能开）。多人实时协同，每人一种颜色；删除变删除线，删自己刚加的才真删；客户页没有删除线格式按钮。
2. **提交**：任意一人提交一次，提交后锁住，服务端拒写。
3. **内部审阅**：客户编辑时内部只读；提交后内部带着痕迹正常编辑，逐处「保留 / 撤销」。「确认版本」= 按当前状态定稿（还有痕迹先弹窗）。
4. **链接**：分享过的资料「分享」按钮变「链接」（复制 / 开放编辑 / 收回 / 关闭链接）。客户随时能看所有确认过的版本。删除分享中的资料会一并关链接；分享中不能改名。

已有防护：连错 5 次锁 10 分钟、HttpOnly Cookie、协同连接在握手时认身份、后台接口不认分享 Cookie。

## 交给技术同事的（原型级，未做）

- 分享密码明文存；没有 CSRF 防护；客户填的称呼不核实
- 没接飞书登录 / 每个人的客户权限范围（内部共用一个 Basic Auth 账号）
- 没有服务器以外的备份（计划：确认版本时推到 GitHub 私有仓库 geokeji-com/knowledge-base，需在服务器配 deploy key）
- 没有自动化测试

## 发布

```bash
cd dsh-plugins/services/console-web && npm install && npm run build
scp -r dist/* root@服务器:/srv/dsh-services/console/public/
scp ../console/*.mjs ../console/package*.json ../console/Dockerfile root@服务器:/srv/dsh-services/console/
# 服务器上
cd /srv/dsh-services/console && docker compose build && docker compose up -d
```

改服务器上的文件前先备份成 `.bak-日期`（共享机器，规矩见 `docs/运维与管理/服务器现状与规矩.md`）。

## 登录

内部：HTTP Basic Auth（AUTH_USER / AUTH_PASS 在服务器 `.env`，不进仓库）。客户：分享链接 + 密码。
