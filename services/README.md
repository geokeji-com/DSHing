# services/ —— 服务器上跑的服务的源码

服务器 `/srv/dsh-services/*` 里各服务的源码。服务器不从这个仓库拉代码，改完要手动 scp 上去再重建容器（各自 README 里有命令）。

| 目录 | 是什么 |
|---|---|
| `console/` + `console-web/` | **资料台**（dsh-sup.wanhuchangan.com）：知识库 / 文章 / 客户档案 / 技能库的查看与编辑、知识库版本、客户分享协同编辑。说明见 `console/README.md` |
| `articles/` | 文章库服务（sora-articles，:8791）。`write_article` 默认 `draft:true` 落「文章库/<客户>/草稿/」，`draft:false` 才写正式库 —— "写完必须人审"的门禁 |

服务器是共享生产机器，改前先备份原文件（`.bak-日期`），规矩见工作区 `docs/运维与管理/服务器现状与规矩.md`。
