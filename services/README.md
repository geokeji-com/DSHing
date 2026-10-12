# 云上服务源码档案

服务器 `/srv/dsh-services/*` 里各 MCP 服务的**源码镜像**（那些服务是 docker run 起的，源码在服务器上，不在此前的插件仓库里）。1.0 起收进仓库存档。

- `articles/` —— 文章库服务（sora-articles，:8791）。**write_article 带 draft 参数**：缺省 `draft:true` 落「文章库/<客户>/草稿/」，`draft:false` 才写正式库 —— 这是"写完必须人审"的结构性门禁（2026-10-10 加）。
- 部署方式：`scp server.mjs root@服务器:/srv/dsh-services/<服务>/` → `docker build` + 按原参数 `docker run`（数据卷挂 `/srv/dsh-data/...`，重建容器不丢数据）。
- 服务器是共享生产机器，改前先备份原文件（`.bak-日期`）。
