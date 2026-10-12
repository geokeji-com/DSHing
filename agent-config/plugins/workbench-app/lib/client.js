window.__ModuleLoader__.load({
	id: "dsh-workbench",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");
		var h = React.createElement;

		/* ==================================================================
		 * dsh-workbench — browser half.
		 *
		 * 装配台（原型的 Landing 页）：A1 给谁写 / A2 主题 / A3 工作区 /
		 * A4 拖杆 / A5 怎么写 / A6 底座 / A7 放大编辑。
		 *
		 * 两条硬规矩
		 * ----------
		 * 1. **没接的一律留空，不塞假数据。** 薄弱问句库、skill 列表现在都没接，
		 *    就渲染原型里那块表格/那排标签的**壳**加一句空态说明，不放编造的行。
		 *    假数据会让人误以为接了，然后照着假形状去写后端。
		 * 2. **只落在 DSH 的扩展点上。** 新的 `main` 面板 + `sidebar.panellist`
		 *    一行 + 一个会话域的接力挂件。root / conversation / composer /
		 *    sidebar.workspaces 一个都不碰，标准流程永远一点即达。
		 *
		 * 类名全是自己的 `wb_` 前缀：CSS 是手写的（本包没有 tsdown 构建，
		 * 没有 class-name hashing 可依赖），所以也绝不写指向别人 hash 类名的选择器。
		 *
		 * 令牌照搬 workbench/原型v2暂定版/styles.css:8-80。
		 *
		 * 文件地图（单文件分区，按这份顺序读）：
		 *   CSS 常量        tokens / C 区皮肤 / 工作台壳 / 左侧栏 / R 区样式
		 *   工具与状态      WB_API / WB_KEY / 会话挑篇 store（WB_PICK）
		 *   侧栏            wbNavState / 分组树 / 拖宽 / 官方栏隐藏
		 *   装配台          客户-产品线-期数 / 主题 / 怎么写 / dispatch 发送
		 *   会话页          PromptRelay 接力 / C1 任务条 / 改哪几篇
		 *   面板与 R 区     面板接线 / 文章审核 tab / 机器检查占位
		 * ================================================================== */

		var CSS = [
			/* ---- tokens (原型 styles.css:8-80) ------------------------------
			 * On `body`, not on our own root: this is the product palette, and
			 * the conversation skin needs it too. Dark hangs off the attribute
			 * DSH's own ThemePresenter writes, so it follows the user's
			 * light/dark choice instead of inventing a second switch. */
			"body{",
			"  --wb-bg:#ffffff; --wb-side:#f6f7f9; --wb-elev:#ffffff; --wb-elev2:#eef1f5;",
			"  --wb-line:#e2e5ea; --wb-line-soft:#edeff3;",
			"  --wb-text:#1d2129; --wb-strong:#000000; --wb-dim:#5b626e; --wb-dim2:#98a0ac;",
			"  --wb-accent:#3b6df6; --wb-accent-bg:#eef3ff; --wb-accent-line:#cfdcff;",
			"  --wb-accent-glow:rgba(59,109,246,.16);",
			"  --wb-ok:#12a06a; --wb-ok-bg:#e8f7f0; --wb-warn:#c98200; --wb-bad:#d64545; --wb-bad-bg:#fdeceb;",
			"  --wb-r:10px; --wb-content:940px;",
			"  --wb-shadow:0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06);",
			"  --wb-pop:0 8px 24px rgba(16,24,40,.14);",
			"  --wb-font:-apple-system,\"PingFang SC\",\"Hiragino Sans GB\",\"Microsoft YaHei\",sans-serif;",
			"  --wb-mono:ui-monospace,SFMono-Regular,Menlo,monospace;",
			"body[data-ds-dark-theme]{",
			"  --wb-bg:#14161b; --wb-side:#171a20; --wb-elev:#1c2028; --wb-elev2:#232833;",
			"  --wb-line:#2b3140; --wb-line-soft:#232836;",
			"  --wb-text:#e7e9ef; --wb-strong:#ffffff; --wb-dim:#9aa2b4; --wb-dim2:#6b7385;",
			"  --wb-accent:#4d7cfe; --wb-accent-bg:#141d2e; --wb-accent-line:#26364f;",
			"  --wb-accent-glow:rgba(77,124,254,.15);",
			"  --wb-ok:#3ecf8e; --wb-ok-bg:#12241d; --wb-warn:#f0b429; --wb-bad:#ff7b7b; --wb-bad-bg:#3a1f1f;",
			"  --wb-shadow:none; --wb-pop:0 8px 24px rgba(0,0,0,.55);",
			"}",

			/* ---- C 区皮肤（会话页）------------------------------------------
			 * 只瞄 [data-slot="..."]：槽位名是公开契约，hash 类名每次上游重建都变。 */
			"[data-slot='main.conversation']{",
			"  background:var(--wb-bg); color:var(--wb-text); font-family:var(--wb-font);",
			"}",
			/* DSH 官方的「聊天内容宽度把手」：内容区左右各一条半透明渐变竖条，
			 * 拖它改的是内容列宽，看着却像分栏把手，跟右栏拖宽抢鼠标 —— 藏掉。
			 * 内容宽度也不再写死，交回 DSH 默认 clamp 自适应（跟着栏宽走）。 */
			"[class*='widthHandle']{display:none !important;}",
			/* 右栏把手的提示线：官方把手本身完全隐形（只有光标变 ↔），
			 * 鼠标靠近时浮出一条细线，平时不出现。 */
			"[data-side='rightbar']{cursor:col-resize;}",
			"[data-side='rightbar']::after{content:'';position:absolute;top:10px;bottom:10px;left:50%;margin-left:-2px;width:4px;border-radius:3px;background:var(--wb-accent);opacity:0;transition:opacity .15s;}",
			"[data-side='rightbar']:hover::after{opacity:1;}",
			/* 中栏滚动条：视觉上收起来（滚轮/触控板照常滚），把那条位置让给
			 * 右栏拖宽把手 —— 让「看得见的那条线」和「能拖的手」是同一个东西。 */
			"[class*='scrollBody']{scrollbar-width:none;}",
			"[class*='scrollBody']::-webkit-scrollbar{width:0;height:0;}",
			/* 右栏拖宽把手的那条可见细线：平时淡灰，鼠标上去变主题蓝。 */
			".wb_grip{cursor:col-resize;z-index:60;}",
			".wb_grip::after{content:'';position:absolute;top:10px;bottom:10px;left:50%;margin-left:-2px;width:4px;border-radius:3px;background:var(--wb-accent);opacity:0;transition:opacity .15s;}",
			".wb_grip:hover::after{opacity:1;}",
			"[data-slot='conversation.session.header']{",
			"  border-bottom:1px solid var(--wb-line-soft); background:var(--wb-bg);",
			"}",
			"[data-slot='conversation.composer.bar']{ --dsw-specific-input-major:var(--wb-elev); }",

			/* ---- 工作台自己的壳 ---------------------------------------------- */
			".wb_root{",
			"  box-sizing:border-box; display:flex; flex-direction:column; height:100%; min-height:0;",
			"  background:var(--wb-bg); color:var(--wb-text); font:14px/1.6 var(--wb-font);",
			"}",
			".wb_root *{box-sizing:border-box;}",
			".wb_root button{font:inherit; cursor:pointer; color:inherit;}",
			".wb_root textarea{font:inherit; color:inherit;}",
			".wb_root select{font:inherit; color:inherit;}",
			".wb_asm{",
			"  flex:1; min-height:0; display:flex; flex-direction:column; gap:10px;",
			"  width:100%; max-width:976px; margin:0 auto; padding:16px 18px 14px;",
			"}",

			/* A1 给谁写 */
			".wb_head{",
			"  flex:0 0 auto; display:flex; align-items:center; gap:6px;",
			"  padding:10px 12px; border:1px solid var(--wb-line); border-radius:var(--wb-r);",
			"  background:var(--wb-elev); box-shadow:var(--wb-shadow);",
			"}",
			".wb_headT{color:var(--wb-dim); font-size:13px; flex:0 0 auto;}",
			".wb_sel{position:relative; display:inline-flex; align-items:center; min-width:0;}",
			".wb_sel select{",
			"  appearance:none; -webkit-appearance:none; cursor:pointer; max-width:15em;",
			"  padding:4px 24px 4px 10px; border:1px solid transparent; border-radius:8px;",
			"  background:var(--wb-elev2); font-size:15px; font-weight:600; text-overflow:ellipsis;",
			"}",
			".wb_sel select:hover{border-color:var(--wb-accent-line);}",
			".wb_sel select:focus-visible{outline:2px solid var(--wb-accent); outline-offset:1px;}",
			".wb_sel select:disabled{color:var(--wb-dim2); cursor:default; font-weight:400;}",
			/* 三级递进：客户 → 产品线 → 期数。字号字重一层层降下来，
			 * 分隔符是 ›，不是 ·（· 读起来像并列清单，这是之前的错）。 */
			".wb_lv1 select{font-size:15px; font-weight:600; background:var(--wb-elev2);}",
			".wb_lv2 select{font-size:14px; font-weight:500; background:transparent; color:var(--wb-text);}",
			".wb_lv3 select{font-size:13px; font-weight:400; background:transparent; color:var(--wb-dim);}",
			".wb_lv2 select:hover, .wb_lv3 select:hover{background:var(--wb-elev2);}",
			".wb_sel::after{content:'▾'; position:absolute; right:8px; color:var(--wb-dim2); font-size:11px; pointer-events:none;}",
			".wb_dot{color:var(--wb-dim2);}",
			".wb_hint{margin-left:auto; font-size:10.5px; color:var(--wb-dim2); white-space:nowrap;}",
			".wb_mini{",
			"  flex:0 0 auto; padding:4px 9px; border:1px solid var(--wb-line); border-radius:7px;",
			"  background:var(--wb-elev); color:var(--wb-dim); font-size:12px;",
			"}",
			".wb_mini:hover:not(:disabled){border-color:var(--wb-accent-line); color:var(--wb-accent);}",
			".wb_mini:disabled{opacity:.45; cursor:default;}",
			".wb_miniSoft{border-color:var(--wb-accent-line); background:var(--wb-accent-bg); color:var(--wb-accent);}",

			/* A2 主题 */
			".wb_row{flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:0 2px;}",
			".wb_cap{font-size:12.5px; color:var(--wb-dim); flex:0 0 auto;}",
			".wb_tabs{display:inline-flex; gap:2px; padding:2px; border-radius:9px; background:var(--wb-elev2);}",
			".wb_tab{",
			"  padding:4px 14px; border:1px solid transparent; border-radius:7px;",
			"  background:transparent; color:var(--wb-dim); font-size:13px;",
			"}",
			".wb_tab[data-on='1']{background:var(--wb-accent-bg); border-color:var(--wb-accent-line); color:var(--wb-accent); font-weight:600;}",

			/* A3 工作区（不能 overflow:hidden —— 会把平台下拉裁掉半截） */
			".wb_work{",
			"  flex:1 1 0; min-height:120px; display:flex; flex-direction:column;",
			"  border:1px solid var(--wb-line); border-radius:var(--wb-r); background:var(--wb-elev);",
			"  box-shadow:var(--wb-shadow);",
			"}",
			".wb_workBar{",
			"  flex:0 0 auto; display:flex; align-items:center; gap:8px; padding:8px 10px;",
			"  border-bottom:1px solid var(--wb-line-soft); background:var(--wb-side);",
			"  border-radius:calc(var(--wb-r) - 1px) calc(var(--wb-r) - 1px) 0 0;",
			"}",
			".wb_meta{font-size:11.5px; color:var(--wb-dim2);}",
			".wb_workBody{flex:1; min-height:0; overflow:auto; padding:0;}",
			".wb_free{",
			"  width:100%; height:100%; min-height:0; padding:14px; resize:none;",
			"  border:none; outline:none; background:transparent; font:14px/1.7 var(--wb-font);",
			"}",

			/* A3 表格（结构照原型，行留空 —— 数据没接就不放行） */
			".wb_tbl{width:100%; border-collapse:collapse; table-layout:fixed;}",
			".wb_tbl th{",
			"  position:sticky; top:0; z-index:1; text-align:left; font-size:11px; font-weight:500;",
			"  color:var(--wb-dim); background:var(--wb-side); padding:8px 14px;",
			"  border-bottom:1px solid var(--wb-line);",
			"}",
			".wb_tbl th:first-child{width:38px;}",
			".wb_tbl td{padding:9px 14px; border-bottom:1px solid var(--wb-line-soft); font-size:13px;}",

			/* A3 薄弱问句表（2026-10-10 接真数据）
			 * 列：勾选 / 问句 / 差额 / 缺口平台。差额正数=差(红)、负数=高(绿)、0=持平(灰)、
			 * 空=未采集(更淡)。**表里所有数值都来自接口，前端一个字都不编。** */
			".wb_gapQ{line-height:1.5; word-break:break-word;}",
			".wb_gapNum{font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap;}",
			".wb_gapNum[data-sign='bad']{color:var(--wb-bad,#d9483b);}",
			".wb_gapNum[data-sign='good']{color:var(--wb-good,#1a9e63);}",
			/* 0 和「没采集」都显示浅灰的 −，靠 tooltip 区分。 */
			".wb_gapNum[data-sign='flat']{color:var(--wb-dim2); font-weight:400;}",
			".wb_gapNum[data-sign='none']{color:var(--wb-dim2); font-weight:400;}",
			/* 勾中的行：蓝底 + 左侧蓝条（原型同款）。 */
			".wb_tbl tbody tr.on td{background:var(--wb-accent-bg); color:var(--wb-text);}",
			".wb_tbl tbody tr.on:hover td{background:var(--wb-accent-bg);}",
			".wb_tbl tbody tr.on td:first-child{box-shadow:inset 3px 0 0 var(--wb-accent);}",
			".wb_tbl input[type=checkbox]{accent-color:var(--wb-accent); margin:0; cursor:pointer;}",
			".wb_gapMeta{display:flex; align-items:center; gap:8px; flex-wrap:wrap;}",
			/* 顶部筛选条：日期 / 词根 / 平台列开关 / 刷新，一行装下。 */
			".wb_filters{display:flex; align-items:center; gap:10px; flex-wrap:wrap; min-width:0;}",
			/* 平台/词根筛选：原型 fsel 样式，两种下拉同一个壳，风格统一。 */
			".wb_fsel{position:relative; display:inline-flex;}",
			".wb_fsel > select, .wb_fsel > button{",
			"  appearance:none; -webkit-appearance:none; cursor:pointer; outline:none;",
			"  background:var(--wb-elev2); border:1px solid var(--wb-line); border-radius:7px;",
			"  color:var(--wb-text); font:12.5px var(--wb-font); padding:4px 22px 4px 9px; max-width:150px;",
			"}",
			".wb_fsel > select:hover, .wb_fsel > button:hover{border-color:var(--wb-accent-line);}",
			".wb_fsel::after{",
			"  content:'▾'; position:absolute; right:8px; top:50%; transform:translateY(-50%);",
			"  font-size:9px; color:var(--wb-dim2); pointer-events:none;",
			"}",
			/* 平台多选下拉：勾几个平台，表里就显示几列；一个不勾就只剩「综合」。 */
			".wb_platShield{position:fixed; inset:0; z-index:29;}",
			".wb_platMenu{",
			"  position:absolute; top:calc(100% + 4px); left:0; z-index:30; min-width:104px;",
			"  background:var(--wb-elev); border:1px solid var(--wb-line); border-radius:8px;",
			"  box-shadow:var(--wb-pop); padding:4px; display:flex; flex-direction:column; gap:3px;",
			"}",
			/* 下拉里的卡片（平台/词根共用）：点一下选中（主题色），再点取消。
			 * 字号必须 !important —— 宿主全局有更高权重的 button 字号规则，之前一直被压成 14px。 */
			".wb_platCard{",
			"  border:1px solid var(--wb-line); background:var(--wb-elev); color:var(--wb-dim);",
			"  font-family:var(--wb-font); font-size:12.5px !important; line-height:1.4;",
			"  padding:2px 8px; border-radius:6px; cursor:pointer; text-align:left;",
			"}",
			".wb_platCard[data-on='1']{background:var(--wb-accent-bg); border-color:var(--wb-accent-line); color:var(--wb-accent);}",
			".wb_platCard:hover{border-color:var(--wb-accent-line);}",
			/* 「选前10」：小实体按钮，比右侧统计再小一号（字号 !important，压过宿主全局规则）。 */
			".wb_miniBtn{",
			"  border:1px solid var(--wb-line); background:var(--wb-elev2); color:var(--wb-dim); cursor:pointer;",
			"  font-family:var(--wb-font); font-size:10px !important; line-height:1.3;",
			"  padding:1px 6px; border-radius:5px; white-space:nowrap;",
			"}",
			".wb_miniBtn:hover{color:var(--wb-accent); border-color:var(--wb-accent-line);}",
			/* 工作条：小日期 + 右侧统计 + 小图标（⟳ / ⤢）。 */
			".wb_weakDate{font-size:11px; color:var(--wb-dim2); display:flex; align-items:center; gap:8px;}",
			".wb_weakStat{margin-left:auto; font-size:11px; color:var(--wb-dim); white-space:nowrap;}",
			".wb_weakIcons{display:inline-flex; gap:2px;}",
			".wb_weakIcons .wb_iconBtn{margin-left:0;}",
			".wb_iconBtn{",
			"  border:none; background:transparent; color:var(--wb-dim2); cursor:pointer;",
			"  font-size:13px; line-height:1; padding:2px 4px; border-radius:4px;",
			"}",
			".wb_iconBtn:hover{color:var(--wb-accent); background:var(--wb-side);}",
			/* 薄弱问句表：勾选 | 问句 | 平台若干 | 综合。密度照原型（9/14、12.5px）。 */
			".wb_tblGap{table-layout:auto; user-select:none; -webkit-user-select:none;}",
			".wb_tblGap th, .wb_tblGap td{white-space:nowrap; padding:9px 14px; font-size:12.5px;}",
			".wb_tblGap th{font-weight:500; color:var(--wb-dim);}",
			".wb_tblGap th:nth-child(3), .wb_tblGap td:nth-child(3){white-space:normal; min-width:260px;}",
			".wb_tblGap th:first-child, .wb_tblGap td:first-child{width:38px; padding-right:0;}",
			".wb_gapRoot{color:var(--wb-text); font-size:11.5px; white-space:nowrap;}",
			".wb_tblGap tbody tr{cursor:pointer;}",
			".wb_tblGap tbody tr:hover{background:var(--wb-side);}",
			".wb_gapQ{line-height:1.6; color:var(--wb-text);}",
			".wb_gapMeta .wb_warn{color:var(--wb-bad,#d9483b);}",
			".wb_gapEmpty{padding:14px; color:var(--wb-dim); font-size:12px;}",
			/* 放大看（⤢）：全屏浮层，表格铺开。 */
			".wb_zoomMask{",
			"  position:fixed; inset:0; z-index:400; padding:24px;",
			"  background:rgba(16,24,40,.42); display:grid; place-items:center;",
			"}",
			".wb_zoomSheet{",
			"  width:min(1180px,100%); height:88vh; background:var(--wb-bg);",
			"  border:1px solid var(--wb-line); border-radius:14px; box-shadow:var(--wb-pop);",
			"  display:flex; flex-direction:column; overflow:hidden;",
			"}",
			".wb_zoomSheet .wb_workBar{background:var(--wb-side);}",
			/* 发送前确认卡：发出去改起来贵，先看一眼再走。 */
			".wb_confirmMask{",
			"  position:fixed; inset:0; z-index:380; padding:24px;",
			"  background:rgba(16,24,40,.42); display:grid; place-items:center;",
			"}",
			".wb_confirmCard{",
			"  width:min(560px,100%); background:var(--wb-bg); border:1px solid var(--wb-line);",
			"  border-radius:14px; box-shadow:var(--wb-pop); overflow:hidden;",
			"}",
			".wb_cardHd{padding:14px 18px 10px; font-size:14px; font-weight:600;}",
			".wb_cardBody{padding:4px 18px 2px;}",
			".wb_cRow{display:flex; gap:12px; padding:8px 0; border-bottom:1px dashed var(--wb-line-soft); font-size:12.5px;}",
			".wb_cRow:last-child{border-bottom:none;}",
			".wb_cKey{flex:0 0 56px; color:var(--wb-dim2); line-height:1.6;}",
			".wb_cVal{flex:1; color:var(--wb-text); line-height:1.6; word-break:break-word;}",
			".wb_cardFt{display:flex; justify-content:flex-end; gap:8px; padding:12px 18px 16px;}",

			/* A4 拖杆 */
			".wb_split{",
			"  flex:0 0 auto; height:8px; margin:-5px 0; display:flex; align-items:center;",
			"  justify-content:center; cursor:row-resize; position:relative;",
			"}",
			".wb_split::before{content:''; width:46px; height:3px; border-radius:2px; background:var(--wb-line);}",
			".wb_split:hover::before, .wb_split[data-drag='1']::before{background:var(--wb-accent-line);}",
			"body[data-wb-drag]{cursor:row-resize; user-select:none;}",

			/* A5 怎么写 */
			".wb_ref{",
			"  flex:0 0 auto; min-height:120px; display:flex; flex-direction:column;",
			"  border:1px solid var(--wb-line); border-radius:var(--wb-r); background:var(--wb-elev);",
			"  box-shadow:var(--wb-shadow); overflow:hidden;",
			"}",
			".wb_ref[data-open='1']{flex:0 0 auto;}",
			".wb_refHd{",
			"  flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:8px 12px; cursor:pointer;",
			"}",
			".wb_chev{color:var(--wb-dim2); font-size:11px; width:10px;}",
			".wb_refTabs{display:inline-flex; gap:2px;}",
			".wb_refTab{",
			"  padding:3px 12px; border:1px solid transparent; border-radius:7px;",
			"  background:transparent; color:var(--wb-dim); font-size:12.5px;",
			"}",
			".wb_refTab[data-on='1']{background:var(--wb-accent-bg); border-color:var(--wb-accent-line); color:var(--wb-accent);}",
			".wb_refSum{margin-left:auto; font-size:11.5px; color:var(--wb-dim2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}",
			".wb_refBd{flex:1; min-height:0; overflow:auto; padding:0 12px 12px; display:flex; flex-direction:column; gap:10px;}",
			".wb_refBox{",
			"  position:relative; display:flex; flex-direction:column; gap:6px; padding:8px 10px;",
			"  border:1px solid var(--wb-line); border-radius:9px; background:var(--wb-bg);",
			"}",
			".wb_refBox textarea{",
			"  width:100%; min-height:64px; max-height:180px; resize:none;",
			"  border:none; outline:none; background:transparent; font:13px/1.7 var(--wb-font);",
			"}",
			".wb_ribBar{display:flex; align-items:center; gap:8px;}",
			".wb_seg{display:inline-flex; gap:2px; padding:2px; border-radius:9px; background:var(--wb-elev2);}",
			".wb_segB{padding:3px 14px; border:1px solid transparent; border-radius:7px; background:transparent; color:var(--wb-dim); font-size:12.5px;}",
			".wb_segB[data-on='1']{background:var(--wb-accent-bg); border-color:var(--wb-accent-line); color:var(--wb-accent); font-weight:600;}",
			".wb_refList{display:flex; flex-direction:column; gap:4px;}",
			".wb_refItem{display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:7px; background:var(--wb-elev2); font-size:12px;}",
			".wb_refK{color:var(--wb-dim2);}",
			".wb_refV{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--wb-mono); font-size:11px;}",
			".wb_refX{border:none; background:transparent; color:var(--wb-dim2); padding:0 4px; font-size:14px; line-height:1;}",
			".wb_refX:hover{color:var(--wb-bad);}",

			/* 自绘左侧栏 */
			".wb_nv{position:fixed;left:0;top:0;bottom:0;width:" + WB_NAV_W + "px;background:#f9fafb;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;padding:12px 10px;gap:8px;z-index:40;}",
			".wb_nvSplit{position:absolute;top:0;bottom:0;right:-4px;width:8px;cursor:col-resize;z-index:61;}",
			".wb_nvSplit:hover{background:var(--wb-accent);opacity:.18;}",
			".wb_nvBrand{padding:2px 6px 6px;}",
			".wb_nvBrandT{font-size:15px;font-weight:700;color:#111827;}",
			".wb_nvNew{border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:8px 10px;font-size:13px;color:#111827;cursor:pointer;text-align:left;}",
			".wb_nvNew{background:#2563eb;border-color:#2563eb;color:#fff;font-weight:600;}",
			".wb_nvSearch{border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;font-size:12.5px;outline:none;background:#fff;}",
			".wb_nvTree{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px;}",
			".wb_nvHint{padding:10px 6px;font-size:12px;color:#9ca3af;}",
			".wb_nvGroupName{width:100%;border:none;background:none;text-align:left;font-size:12.5px;font-weight:600;color:#374151;cursor:pointer;padding:6px 6px;border-radius:6px;}",
			".wb_nvGroupName:hover{background:#eef2f7;}",
			".wb_nvItem{width:100%;border:none;background:none;text-align:left;font-size:12.5px;color:#4b5563;cursor:pointer;padding:6px 6px 6px 18px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
			".wb_nvItem:hover{background:#eef2f7;color:#111827;}",
			".wb_nvCur,.wb_nvItem.wb_nvCur{background:#e8f0fe;color:#1d4ed8;}",

			/* 挑篇条（原型 pick-row）：改哪几篇 + 编号格子 + 全选 + 红绿点（机器检查未接，置灰） */
			".wb_pkRow{display:flex;align-items:center;gap:8px;margin:0 0 -7px;padding:8px 12px 10px 24px;border:1px solid #e5e7eb;border-bottom:none;border-radius:14px 14px 0 0;background:#fff;position:relative;z-index:1;min-width:0;overflow:hidden;box-shadow:0 -1px 2px rgba(16,24,40,.03);}",
			".wb_pkRow .wb_pkK{flex:0 0 auto;}",
			".wb_pkK{flex:0 0 auto;font-size:11.5px;color:#6b7280;}",
			".wb_pkChips{flex:1 1 auto;min-width:0;display:flex;gap:4px;flex-wrap:wrap;}",
			".wb_pkChip{flex:0 0 auto;min-width:26px;height:24px;border:1px solid #e5e7eb;border-radius:7px;background:#fff;font-size:11.5px;color:#6b7280;cursor:pointer;padding:0 6px;}",
			".wb_pkChip.is-on{border-color:#2563eb;background:#eff6ff;color:#2563eb;font-weight:600;}",
			".wb_pkAll{flex:0 0 auto;border:1px solid #e5e7eb;background:#fff;border-radius:7px;padding:3px 10px;font-size:11.5px;color:#374151;cursor:pointer;}",
			".wb_pkDot{flex:0 0 auto;width:26px;height:24px;border-radius:7px;border:1px solid #e5e7eb;cursor:pointer;position:relative;padding:0;}",
			".wb_pkDot::after{content:\"\";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:9px;height:9px;border-radius:50%;}",
			".wb_pkDot.red{background:#fdecec;}",
			".wb_pkDot.red::after{background:#e5484d;}",
			".wb_pkDot.green{background:#e8f6ee;}",
			".wb_pkDot.green::after{background:#22a06b;}",
			".wb_pkDot:disabled{opacity:.4;cursor:default;}",

			/* 输入区精简：收掉 附件/访问模式/模型选择（生文工作台用不到，防误触） */
			"button[aria-label='添加附件'],button[aria-label^='访问模式'],button[aria-label^='选择模型'],button[aria-label='指令']{display:none !important;}",

			/* C1 顶部任务条 */
			".wb_task{padding:8px 20px 6px;border-bottom:1px solid var(--wb-line-soft);display:flex;flex-direction:column;gap:2px;background:var(--wb-bg);}",
			".wb_taskRow{display:flex;align-items:baseline;gap:10px;min-width:0;}",
			".wb_taskRow2{display:flex;gap:12px;font-size:12px;color:var(--wb-dim);min-width:0;overflow:hidden;}",
			".wb_taskHead{display:inline-flex;gap:6px;align-items:baseline;min-width:0;}",
			".wb_taskClient{font-weight:600;font-size:13.5px;color:var(--wb-strong);}",
			".wb_taskDim{color:var(--wb-dim2);font-size:12px;}",
			".wb_taskTopic{margin-left:auto;font-size:12.5px;color:var(--wb-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".wb_taskTitle{font-weight:600;font-size:13.5px;}",
			".wb_taskSkills,.wb_taskBase{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".wb_taskbarWrap{padding:10px 20px 4px;background:var(--wb-bg);border-bottom:1px solid var(--wb-line-soft);}",
			".wb_taskbar{display:flex;background:var(--wb-elev);border:1px solid var(--wb-line-soft);border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.06);overflow:hidden;}",
			".wb_col{flex:1;padding:10px 14px;min-width:0;}",
			".wb_colDiv{border-left:1px solid var(--wb-line-soft);}",
			".wb_colTitle{font-size:12px;color:var(--wb-dim);margin-bottom:4px;font-weight:600;}",
			".wb_row{display:flex;gap:8px;font-size:12.5px;line-height:1.9;min-width:0;}",
			".wb_label{color:var(--wb-dim2);flex:0 0 3.5em;}",
			".wb_value{color:var(--wb-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".wb_gate{font-size:12px;color:var(--wb-dim);line-height:1.9;}",
			".wb_tstat{margin-left:8px;font-weight:400;color:var(--wb-dim);}",
			".wb_trow{display:flex;gap:8px;align-items:center;font-size:12.5px;line-height:2;min-width:0;}",
			".wb_ticon{flex:0 0 auto;width:15px;height:15px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;line-height:1;}",
			'.wb_ticon[data-s="done"]{background:#16a34a;color:#fff;}',
			'.wb_ticon[data-s="run"]{background:#fff;color:#d97706;border:1.5px solid #d97706;}',
			'.wb_ticon[data-s="wait"]{background:#fff;color:#9ca3af;border:1.5px solid #d1d5db;}',
			".wb_ttext{color:var(--wb-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".wb_rt{display:flex;flex-direction:column;height:100%;min-height:0;}",
			".wb_rtSub{font-size:12px;color:#9ca3af;padding:10px 12px 6px;}",
			".wb_rtCols{flex:1;display:flex;min-height:0;border-top:1px solid #eef0f3;}",
			".wb_rtEmpty{padding:14px;color:#9ca3af;font-size:12.5px;}",
			".wb_rv{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;}",
			".wb_rvHead{display:flex;align-items:center;gap:10px;padding:12px 14px 8px;}",
			".wb_rvDot{color:#e5484d;font-size:10px;}",
			".wb_rvDot.is-ok{color:#16a34a;}",
			".wb_rvChev{margin-left:auto;color:#9ca3af;font-size:11px;}",
			".wb_rvState{font-size:12.5px;font-weight:600;color:#111827;}",
			".wb_rvSel{font-size:12px;color:#374151;background:#f3f4f6;border-radius:7px;padding:3px 10px;}",
			".wb_rvCheck{margin-left:10px;border:1px solid #e5e7eb;background:#fff;border-radius:7px;padding:3px 10px;font-size:11px;cursor:pointer;}",
			".wb_rvCheck:disabled{opacity:.5;cursor:default;}",
			".wb_rvProg{display:flex;justify-content:space-between;align-items:center;padding:5px 12px;font-size:11px;color:#6b7280;border-bottom:1px solid #eef0f3;}",
			".wb_rvCount{color:#374151;font-weight:600;}",
			".wb_rv .wb_reviewMain{flex:1 1 0;min-width:0;min-height:0;overflow-y:auto;display:flex;flex-direction:column;padding:0 14px;background:#fff;}",
			".wb_rvHint{color:#9ca3af;}",
			".wb_rvHead{cursor:pointer;user-select:none;}",
			".wb_rvHead:hover .wb_rvSel{color:#2563eb;}",
			".wb_rvChev.is-open{color:#2563eb;}",
			".wb_pkChip.is-view{border-color:#2563eb;color:#2563eb;font-weight:700;background:#eff6ff;}",
			".wb_hc{display:flex;flex-direction:column;gap:4px;padding:8px 14px;border-bottom:1px solid #eef0f3;background:#fcfcfd;}",
			".wb_hcRow{display:flex;align-items:center;gap:8px;font-size:12px;}",
			".wb_hcRow.bad{color:#b42318;}",
			".wb_hcV{width:14px;text-align:center;font-weight:700;flex:none;}",
			".wb_hcV.fail{color:#d92d20;}.wb_hcV.pass{color:#12805c;}.wb_hcV.warn{color:#b54708;}",
			".wb_hcT{font-weight:600;}",
			".wb_hcC{color:#667085;}",
			".wb_hcM{margin-left:auto;color:#98a2b3;font-size:11px;}",
			".wb_hcHead{cursor:pointer;font-size:11px;color:#667085;user-select:none;}",
			".wb_hcHead:hover{color:#2563eb;}",
			".wb_hcFile{margin-top:2px;}",
			".wb_hcFileT{font-size:11px;font-weight:600;color:#374151;margin:4px 0 2px;}",
			".wb_hcIssue{display:flex;gap:6px;font-size:11px;color:#475467;padding:1px 0 1px 18px;align-items:baseline;}",
			".wb_hcLv{flex:none;font-weight:700;}",
			".wb_hcLv.fail{color:#d92d20;}.wb_hcLv.proof{color:#0e7090;}.wb_hcLv.warn{color:#b54708;}",
			".wb_hcFoot{font-size:10px;color:#98a2b3;margin-top:4px;}",
			".wb_pkHc{display:inline-flex;align-items:center;gap:4px;margin-left:auto;}",
			".wb_pkHcT{font-size:11px;color:#667085;}",
			".wb_pkDot.warn{background:#f59e0b;}",
			".wb_hcIntro{padding:2px 0;}",
			".wb_hcIntroT{font-size:11px;font-weight:700;color:#374151;margin-bottom:2px;}",
			".wb_hcIntroRow{font-size:11px;color:#475467;padding:1px 0;}",
			".wb_hcGrid{border-collapse:collapse;width:100%;font-size:11px;}",
			".wb_hcGrid th{text-align:left;font-weight:600;color:#667085;padding:3px 8px 3px 0;border-bottom:1px solid #eef0f3;white-space:nowrap;}",
			".wb_hcGrid td{padding:3px 8px 3px 0;border-bottom:1px solid #f4f6f8;}",
			".wb_hcGridT{color:#374151;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".wb_hcCell{border:none;background:none;cursor:pointer;font-size:11px;font-weight:700;padding:1px 6px;border-radius:8px;}",
			".wb_hcCell.fail{color:#d92d20;background:#fef3f2;}",
			".wb_hcCell.proof{color:#0e7090;background:#f0f9ff;}",
			".wb_hcCell.warn{color:#ea580c;background:#fff4ed;}",
			".wb_hcCommon{margin:2px 0 6px;}",
			".wb_hcCommonT,.wb_hcCommon{font-size:11px;}",
			".wb_hcCommonRow{display:flex;align-items:center;gap:8px;padding:2px 0;font-size:11px;}",
			".wb_hcCommonW{font-weight:700;color:#374151;}",
			".wb_hcCommonC{color:#475467;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".wb_hcIgnBtn{border:1px solid #d0d5dd;background:#fff;border-radius:6px;font-size:10.5px;padding:1px 8px;cursor:pointer;color:#475467;}",
			".wb_hcIgnBtn:hover{border-color:#2563eb;color:#2563eb;}",
			".wb_hcIgnored{margin:0 0 6px;color:#98a2b3;}",
			".wb_rvMd .wb-md-p.wbMdFlash{animation:wbMdFlash 1.8s ease;}",
			"@keyframes wbMdFlash{0%,55%{background:#fee4e2;}100%{background:transparent;}}",
			".wb_hcCell.is-open{outline:2px solid #2563eb33;}",
			".wb_hcCell0{color:#d0d5dd;}",
			".wb_hcIssue.is-link{cursor:pointer;}",
			".wb_hcIgnOne{flex:none;border:1px solid transparent;background:transparent;color:#98a2b3;font-size:10.5px;padding:0 5px;border-radius:6px;cursor:pointer;}",
			".wb_hcIgnOne:hover{border-color:#d0d5dd;color:#2563eb;background:#fff;}",
			".wb_hcItem{padding:1px 0;}",
			".wb_hcSnip{color:#98a2b3;font-size:10.5px;}",
			".wb_hcFileT{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:#374151;padding:6px 0;}",
			".wb_hcAll{flex:none;border:1px solid #e5e7eb;background:#fff;border-radius:7px;padding:2px 10px;font-size:11.5px;cursor:pointer;color:#475467;}",
			".wb_hcAll:hover{border-color:#2563eb;color:#2563eb;}",
			".wb_hcIssue.is-link:hover{background:#f8f9fb;}",
			".wb_hcWhy{color:#98a2b3;font-size:10.5px;}",
			".wb_rvMd mark.wbHcMk{background:#fee4e2;color:#d92d20;font-weight:700;padding:0 2px;border-radius:2px;}",
			".wb_rvMd mark.wbHcMk.flash{animation:wbHcFlash 1.6s ease;}",
			"@keyframes wbHcFlash{0%,60%{background:#fda29b;}100%{background:#fee4e2;}}",
			".wb_rvEmpty2{padding:20px 14px;color:#9ca3af;font-size:12.5px;}",
			".wb_rvCols{flex:1;display:flex;min-height:0;border-top:1px solid #eef0f3;}",
			".wb_rv .wb_reviewList{flex:0 0 152px;width:152px;max-width:152px;min-height:0;overflow-y:auto;padding:0;gap:0;border-right:1px solid #eef0f3;background:#fafbfc;}",
			".wb_rv .wb_reviewItem{display:none;}",
			".wb_ri{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:6px 8px;font-size:11.5px;color:#4b5563;cursor:pointer;border-bottom:1px solid #f1f2f4;}",
			".wb_ri:hover{background:#f3f4f6;color:#111827;}",
			".wb_ri.picked{background:#eff6ff;}",
			".wb_ri.is-on{background:#eef1f5;color:#111827;box-shadow:inset 2px 0 0 #2563eb;}",
			".wb_riNo{flex:0 0 auto;color:#9ca3af;font-variant-numeric:tabular-nums;}",
			".wb_riT{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}",
			".wb_ri.done{background:#eaf7f0;color:#15803d;}",
			".wb_ri.done .wb_riNo{color:#15803d;font-weight:700;}",
			".wb_ri.done .wb_riT{color:#15803d;}",
			".wb_rvDoneSeg{flex:0 0 auto;max-height:38%;overflow-y:auto;border-top:1px solid #eef0f3;}",
			".wb_rvSep{display:flex;align-items:center;gap:6px;padding:5px 8px;font-size:10.5px;color:#9ca3af;background:#fafbfc;border-bottom:1px solid #f1f2f4;}",
			".wb_rv .wb_reviewItem[data-on='1']{border-color:#2563eb;background:#eff6ff;}",
			".wb_rvItemBody{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto;}",
			".wb_rvNum{display:inline-block;min-width:18px;margin-right:6px;color:#9ca3af;font-variant-numeric:tabular-nums;}",
			".wb_rv .wb_reviewItem{flex-direction:row;align-items:center;gap:8px;}",
			".wb_rvIdx{font-size:12.5px;font-weight:600;color:#111827;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".wb_rv .wb_reviewItemMeta{font-size:11px;color:#9ca3af;}",
			".wb_rvFoot{display:flex;gap:8px;padding:10px;border-top:1px solid #eef0f3;flex-wrap:wrap;}",
			".wb_editBar{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:8px 0 6px;}",
			".wb_editBarT{font-size:12.5px;font-weight:600;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:56%;}",
			".wb_editMsg{margin-left:auto;font-size:11px;color:#d92d20;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".wb_editOps{margin-left:auto;display:inline-flex;gap:6px;flex:none;}",
			".wb_editBtn,.wb_editSave,.wb_editCancel{border:1px solid #e5e7eb;background:#fff;border-radius:7px;padding:3px 12px;font-size:12px;cursor:pointer;color:#374151;}",
			".wb_editBtn{margin-left:auto;flex:none;}",
			".wb_editBtn:hover,.wb_editCancel:hover{border-color:#2563eb;color:#2563eb;}",
			".wb_editSave{background:#2563eb;border-color:#2563eb;color:#fff;}",
			".wb_editSave:disabled{opacity:.6;cursor:default;}",
			".wb_editArea{flex:1 1 0;min-height:0;width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;font:12.5px/1.7 ui-monospace,Menlo,Consolas,monospace;resize:none;outline:none;color:#111827;background:#fff;}",
			".wb_rfHint{flex:1 1 100%;font-size:11px;color:#9ca3af;text-align:center;padding-bottom:2px;}",
			".wb_rvFoot .wb_rvConfirm,.wb_rvFoot .wb_rvConfirmAll{padding:6px 0;font-size:12.5px;}",
			".wb_rvConfirm{flex:1;padding:10px 0;border:1px solid #e5e7eb;background:#fff;color:#111827;border-radius:9px;font-size:13.5px;font-weight:600;cursor:pointer;}",
			".wb_rvConfirm:disabled{opacity:.45;cursor:default;}",
			".wb_rvConfirmAll{flex:1;padding:10px 0;border:none;background:#2563eb;color:#fff;border-radius:9px;font-size:13.5px;font-weight:600;cursor:pointer;}",

			/* A5 用模板（skill 没接 → 只有分组和空态） */
			".wb_skGroup{display:flex; flex-direction:column; gap:6px;}",
			".wb_skCap{font-size:11px; color:var(--wb-dim2);}",
			".wb_skEmpty{",
			"  padding:10px 12px; border:1px dashed var(--wb-line); border-radius:9px;",
			"  font-size:12px; color:var(--wb-dim2); text-align:center;",
			"}",
			".wb_chipBtn{",
			"  padding:4px 11px; border:1px solid var(--wb-line); border-radius:999px;",
			"  background:var(--wb-elev); color:var(--wb-dim); font-size:12.5px;",
			"}",
			".wb_chipBtn:hover{border-color:var(--wb-accent-line); color:var(--wb-accent);}",
			".wb_chipBtn[data-on='1']{background:var(--wb-accent-bg); border-color:var(--wb-accent-line); color:var(--wb-accent); font-weight:600;}",

			/* A6 底座 + A7 放大 */
			".wb_base{flex:0 0 auto; position:relative; display:flex; flex-direction:column; gap:6px;}",
			".wb_box{",
			"  position:relative; display:flex; flex-direction:column; gap:6px; padding:8px 10px;",
			"  border:1px solid var(--wb-line); border-radius:var(--wb-r); background:var(--wb-elev);",
			"  box-shadow:var(--wb-shadow);",
			"}",
			".wb_base[data-zoom='1'] .wb_box{",
			"  position:absolute; left:0; right:0; bottom:0; z-index:30; box-shadow:var(--wb-pop);",
			"}",
			".wb_input{",
			"  width:100%; min-height:26px; max-height:168px; resize:none; overflow-y:auto;",
			"  border:none; outline:none; background:transparent; font:14px/1.6 var(--wb-font);",
			"  padding:2px 78px 2px 0;",
			"}",
			".wb_base[data-zoom='1'] .wb_input{min-height:240px; max-height:520px;}",
			".wb_zoom{",
			"  position:absolute; top:6px; right:8px; display:inline-flex; align-items:center; gap:4px;",
			"  padding:2px 7px; border:1px solid var(--wb-line); border-radius:7px;",
			"  background:var(--wb-elev); color:var(--wb-dim2); font-size:11px;",
			"}",
			".wb_zoom:hover{border-color:var(--wb-accent-line); color:var(--wb-accent);}",
			".wb_actions{display:flex; align-items:center; gap:8px;}",
			/* 模型选择（装配台右下角）：无边框轻样式，对齐会话页 composer 的模型位。 */
			".wb_modelSel{border:none; background:transparent; color:var(--wb-dim); font-family:var(--wb-font); font-size:12.5px !important; padding:6px 8px; border-radius:8px; cursor:pointer; max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}",
			".wb_modelSel:hover{background:var(--wb-accent-bg);}",
			".wb_modelSel[data-on='1']{color:var(--wb-accent);}",
			/* 模型菜单：页面底部，**向上弹**（向下会被发送行截住）。 */
			".wb_modelMenu{position:absolute; bottom:calc(100% + 6px); top:auto; left:0; z-index:30; min-width:220px; max-height:320px; overflow:auto; background:var(--wb-elev); border:1px solid var(--wb-line); border-radius:10px; box-shadow:var(--wb-pop); padding:6px; display:flex; flex-direction:column; gap:2px;}",
			".wb_modelGroup{font-family:var(--wb-font); font-size:11px !important; color:var(--wb-dim2); padding:5px 10px 2px;}",
			".wb_modelItem{border:none; background:var(--wb-elev); color:var(--wb-dim); font-family:var(--wb-font); font-size:12.5px !important; line-height:1.4; padding:6px 10px; border-radius:6px; cursor:pointer; text-align:left; display:flex; align-items:center; justify-content:space-between; gap:12px;}",
			".wb_modelItem:hover{background:var(--wb-accent-bg);}",
			".wb_modelItem[data-on='1']{color:var(--wb-accent); font-weight:600;}",
			".wb_modelItem .wb_mk{color:var(--wb-accent);}",
			".wb_chip{",
			"  display:inline-flex; align-items:center; gap:6px; min-width:0; max-width:44em;",
			"  padding:2px 7px; border:1px solid var(--wb-accent-line); border-radius:6px;",
			"  background:var(--wb-accent-bg); color:var(--wb-accent); font-size:11.5px;",
			"  overflow:hidden; white-space:nowrap;",
			"}",
			".wb_chipX{border:none; background:transparent; color:inherit; padding:0; font-size:13px; line-height:1;}",
			".wb_send{",
			"  margin-left:auto; flex:0 0 auto; padding:6px 18px; border:1px solid transparent; border-radius:7px;",
			"  background:var(--wb-accent); color:#fff !important; font-size:13px; font-weight:600;",
			"}",
			".wb_send:disabled{opacity:.45; cursor:default;}",
			/* 装配台发送钮：小圆 ↑（对齐会话页 composer 的发送，不再是大长条）。 */
			".wb_go{width:36px;height:36px;border-radius:50%;border:none;background:var(--wb-accent);color:#fff;font-size:16px;line-height:1;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;}",
			".wb_go:hover{filter:brightness(1.08);}",
			".wb_go:disabled{opacity:.4;cursor:default;}",

			/* 空态 */
			".wb_empty{",
			"  height:100%; min-height:110px; display:flex; flex-direction:column;",
			"  align-items:center; justify-content:center; gap:6px; text-align:center; padding:18px;",
			"}",
			".wb_emptyT{font-size:13px;}",
			".wb_emptyS{font-size:11.5px; color:var(--wb-dim2); line-height:1.7; max-width:46em;}",
			".wb_bad{color:var(--wb-bad);}",
		].join("\n");

		/* The official client-package CSS pattern: one tag, keyed by
		 * data-plugin-css, injected from apply() — HMR removes
		 * <style data-plugin=...> tags on a reload, so a top-level injection
		 * would simply vanish. */
		var TAG_ID = "dsh-workbench/workbench.css";

		function injectStyles() {
			if (typeof document === "undefined") return null;
			var existing = document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG_ID) + "]");
			if (existing !== null) return existing;
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-workbench";
			tag.dataset.pluginCss = TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return tag;
		}

		var WORKBENCH_KEY = "workbench";

		/* ---- 工作台后端 API（路径收口，别再散写魔法串）---------------- */
		var WB_API = {
			clients: "/api/workbench/clients",
			skills: "/api/workbench/skills",
			articles: "/api/workbench/articles",
			clientMap: "/api/workbench/client-map",
			assignGroup: "/api/workbench/assign-client-group",
			taskMeta: "/api/workbench/task-meta",
			taskStatus: "/api/workbench/task-status",
			drafts: "/api/workbench/drafts",
			draft: "/api/workbench/draft",
			confirmDraft: "/api/workbench/confirm-draft",
			check: "/api/workbench/check",
			/* 薄弱问句（2026-10-10）：宿主带密钥调外部接口，这里只拿结果。 */
			weakDir: "/api/workbench/weak-dir",
			weakGaps: "/api/workbench/weak-gaps",
			/* 会话创建（2026-10-12）：绕开 Session Intent 向导页。 */
			sessionCreate: "/api/workbench/session-create",
		};

		/* ---- sessionStorage 键收口（登记链路 / 布局记忆共用）----------- */
		var WB_KEY = {
			pendingMeta: "wb-pending-meta",       // 装配台 → PromptRelay：任务编号
			pendingClient: "wb-pending-client",   // 装配台 → PromptRelay：客户
			pendingTopic: "wb-pending-topic",     // 装配台 → PromptRelay：主题
			taskMetaId: "wb-task-meta-id",
			metaFor: "wb-meta-for-",              // 前缀 + sessionId
			navW: "wb-nav-w",                     // 自绘侧栏宽度
			rightbarW: "wb-rightbar-w",           // 右栏宽度
			weakPicked: "wb-weak-picked",         // 薄弱问句已选清单（换客户/换筛选/刷新都不丢）
			modelLast: "wb-model-last",           // 上次用的模型（装配台下拉的默认值）
			modelPending: "wb-model-pending",     // 装配台 → PromptRelay：本次任务选的模型
			effortLast: "wb-effort-last",         // 上次的思考强度（装配台下拉的默认值）
		};

		/* ---- 模型清单（2026-10-10 定）--------------------------------------
		 * Key 永远在服务端（.credentials.yaml 的 refs），前台只选名字。
		 * provider 键必须与 /home/dsh/.dsh/settings.yaml 的
		 * llm-pi-ai.providers.<key> 一致，selectModel 才路由得到。
		 * 加模型 = 服务器 settings.yaml 加一行 + 这里同步一行。 */
		var WB_MODELS = [
			{ provider: "yishan", model: "DeepSeek-V4.1-Flash" },
			{ provider: "yishan", model: "deepseek-flash" },
			{ provider: "yishan", model: "glm-5.3-flash" },
			{ provider: "yishan", model: "claude-sonnet-4-6" },
			{ provider: "yishan", model: "claude-opus-5" },
			{ provider: "yishan", model: "claude-fable-5" },
			{ provider: "yishan", model: "gpt-5.6" },
			{ provider: "yishan", model: "gpt-5.6-luna" },
			{ provider: "yishan", model: "gpt-5.6-sol" },
			{ provider: "yishan", model: "gpt-5.6-terra" },
			{ provider: "yishan", model: "gpt-6-astra" },
		];

		/* 思考强度（reasoning effort）：离散档位，传给 selectModel 的 reasoningEffort。
		 * 「默认」= 跟随模型自己的默认强度；模型不支持时宿主会自行兜底，不会报错。 */
		var WB_EFFORTS = [
			{ v: "low", label: "低（快）" },
			{ v: "medium", label: "中" },
			{ v: "high", label: "高（细）" },
		];

		/* ---- 侧栏那一行的图标 -------------------------------------------- */
		function WorkbenchIcon(props) {
			var size = Number(props && props.size) || 16;
			return h("svg", {
				width: size, height: size, viewBox: "0 0 16 16", fill: "none",
				"aria-hidden": "true", focusable: "false",
			},
				h("rect", { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2, stroke: "currentColor", strokeWidth: 1.2 }),
				h("path", { d: "M1.5 6h13", stroke: "currentColor", strokeWidth: 1.2 }),
				h("path", { d: "M5.5 6v7.5", stroke: "currentColor", strokeWidth: 1.2 }));
		}

		/* 客户 = 知识库。打开查一次，本次会话内复用；权限在服务端过滤，
		 * 前端不判权限、也拿不到别人客户的名单。
		 *
		 * 为什么带重试：知识库服务的 MCP 会话在容器重启/并发时偶发超时
		 * （2026-10-10 实测到 `MCP error -32001: TimeoutError`）。它一失败，
		 * 客户下拉就空了 —— 整个装配台等于不能用。所以这里失败自动重试，
		 * 最后一次失败才报错（报错文案里给「重试」按钮）。 */
		var CLIENTS_PATH = WB_API.clients;
		var CLIENTS_RETRY_DELAYS = [1200, 3000];

		function useClients() {
			var state = React.useState({ status: "loading", customers: [], error: "", detail: "", uid: "" });
			var setValue = state[1];
			/* 手动重试：改这个数就重新跑一次 effect。 */
			var retryS = React.useState(0);
			var retry = retryS[0], setRetry = retryS[1];
			React.useEffect(function () {
				var alive = true;
				setValue({ status: "loading", customers: [], error: "", detail: "", uid: "" });
				function attempt(index) {
					if (!alive) return;
					fetch(CLIENTS_PATH, { headers: { accept: "application/json" } })
						.then(readJson)
						.then(function (body) {
							if (!alive) return;
							if (body && body.ok === true) {
								setValue({ status: "ready", customers: body.customers || [], error: "", detail: "", uid: body.uid || "" });
								return;
							}
							var error = (body && body.error) || "unknown";
							var detail = (body && body.detail) || "";
							/* 只有"宿主说它连不上知识库"才值得重试；形状不认识之类重试也没用。 */
							if ((error === "mcp-error" || error === "unreachable") && index < CLIENTS_RETRY_DELAYS.length) {
								setTimeout(function () { attempt(index + 1); }, CLIENTS_RETRY_DELAYS[index]);
								return;
							}
							setValue({ status: "error", customers: [], error: error, detail: detail, uid: "" });
						})
						.catch(function (e) {
							if (!alive) return;
							var detail = String(e && e.message ? e.message : e);
							if (index < CLIENTS_RETRY_DELAYS.length) {
								setTimeout(function () { attempt(index + 1); }, CLIENTS_RETRY_DELAYS[index]);
								return;
							}
							setValue({ status: "error", customers: [], error: "unreachable", detail: detail, uid: "" });
						});
				}
				attempt(0);
				return function () { alive = false; };
			}, [retry]);
			state[0].retry = function () { setRetry(retry + 1); };
			return state[0];
		}

		/* 宿主路由没挂上时（宿主代码改了要重启 DSH 才生效），fetch 回来的是
		 * 纯文本 "unauthorized"/"not found"，`r.json()` 会抛 "Unexpected token"。
		 * 那种话对用户毫无意义 —— 这里统一成一句能指方向的说明。 */
		function readJson(response) {
			if (!response.ok) {
				return { ok: false, error: "route-missing", detail: "HTTP " + response.status };
			}
			return response.json().catch(function () {
				return { ok: false, error: "route-missing", detail: "HTTP " + response.status + " · 不是 JSON" };
			});
		}

		/* 技能目录：dsh-skill-remote 注册的 provider，宿主用 ctx.skills.list() 读。 */
		function useSkills() {
			var state = React.useState({ status: "loading", skills: [], error: "", detail: "" });
			var setValue = state[1];
			React.useEffect(function () {
				var alive = true;
				fetch(WB_API.skills, { headers: { accept: "application/json" } })
					.then(readJson)
					.then(function (body) {
						if (!alive) return;
						if (body && body.ok === true) setValue({ status: "ready", skills: body.skills || [], error: "", detail: "" });
						else setValue({ status: "error", skills: [], error: (body && body.error) || "unknown", detail: (body && body.detail) || "" });
					})
					.catch(function (e) {
						if (alive) setValue({ status: "error", skills: [], error: "unreachable", detail: String(e && e.message ? e.message : e) });
					});
				return function () { alive = false; };
			}, []);
			return state[0];
		}

		/* 文章库：看这个客户在文章库里已经有多少篇。client 为空就不查。 */
		function useArticles(client) {
			var state = React.useState({ status: "idle", articles: [], error: "", detail: "" });
			var setValue = state[1];
			React.useEffect(function () {
				if (client === "") { setValue({ status: "idle", articles: [], error: "", detail: "" }); return undefined; }
				var alive = true;
				setValue({ status: "loading", articles: [], error: "", detail: "" });
				fetch(WB_API.articles + "?client=" + encodeURIComponent(client), { headers: { accept: "application/json" } })
					.then(readJson)
					.then(function (body) {
						if (!alive) return;
						if (body && body.ok === true) setValue({ status: "ready", articles: body.articles || [], error: "", detail: "" });
						else setValue({ status: "error", articles: [], error: (body && body.error) || "unknown", detail: (body && body.detail) || "" });
					})
					.catch(function (e) {
						if (alive) setValue({ status: "error", articles: [], error: "unreachable", detail: String(e && e.message ? e.message : e) });
					});
				return function () { alive = false; };
			}, [client]);
			return state[0];
		}

		/* ---- 薄弱问句：可查客户目录（知识库客户 → 万湖 ID + 采集日）------
		 * 打开装配台查一次，本次会话内复用；目录本身在宿主侧缓存 180 秒。
		 * 对不上的客户（没配映射、或不在 45 天窗口内）照样返回，前端自己置灰。 */
		function useWeakDir() {
			var state = React.useState({ status: "loading", customers: [], unmapped: [], error: "", detail: "" });
			var setValue = state[1];
			React.useEffect(function () {
				var alive = true;
				fetch(WB_API.weakDir, { headers: { accept: "application/json" } })
					.then(readJson)
					.then(function (body) {
						if (!alive) return;
						if (body && body.ok === true) {
							setValue({ status: "ready", customers: body.customers || [], unmapped: body.unmapped || [], error: "", detail: "" });
						} else {
							setValue({ status: "error", customers: [], unmapped: [], error: (body && body.error) || "unknown", detail: (body && body.detail) || "" });
						}
					})
					.catch(function (e) {
						if (alive) setValue({ status: "error", customers: [], unmapped: [], error: "unreachable", detail: String(e && e.message ? e.message : e) });
					});
				return function () { alive = false; };
			}, []);
			return state[0];
		}

		/* ---- 薄弱问句：某个客户本期全部问句 ----------------------------
		 * 只在「薄弱问句」模式下、且这个客户真的可查时才请求。
		 * `error === "no-data"` 是正常业务态（这个客户最近没采集），不是故障。 */
		function useWeakGaps(clientId, enabled) {
			var state = React.useState({ status: "idle", collectedAt: "", taskId: "", excluded: null, questions: [], error: "", detail: "" });
			var setValue = state[1];
			var tickS = React.useState(0);
			var tick = tickS[0], setTick = tickS[1];
			/* 「刷新」按下后这一次请求带 fresh=1，绕过宿主 5 分钟缓存，直接从数据服务取。 */
			var freshRef = React.useRef(false);
			React.useEffect(function () {
				var blank = { status: "idle", collectedAt: "", taskId: "", excluded: null, questions: [], error: "", detail: "" };
				if (!enabled || clientId === "") { setValue(blank); return undefined; }
				var alive = true;
				var query = WB_API.weakGaps + "?client_id=" + encodeURIComponent(clientId) + (freshRef.current ? "&fresh=1" : "");
				freshRef.current = false;
				setValue({ status: "loading", collectedAt: "", taskId: "", excluded: null, questions: [], error: "", detail: "" });
				fetch(query, { headers: { accept: "application/json" } })
					.then(readJson)
					.then(function (body) {
						if (!alive) return;
						if (body && body.ok === true) {
							setValue({
								status: "ready",
								collectedAt: body.collectedAt || "",
								taskId: body.taskId || "",
								excluded: (typeof body.excluded === "number" ? body.excluded : null),
								questions: body.questions || [],
								error: "", detail: "",
							});
						} else {
							setValue({
								status: "error", collectedAt: "", taskId: "", excluded: null, questions: [],
								error: (body && body.error) || "unknown", detail: (body && body.detail) || "",
							});
						}
					})
					.catch(function (e) {
						if (alive) setValue({ status: "error", collectedAt: "", taskId: "", excluded: null, questions: [], error: "unreachable", detail: String(e && e.message ? e.message : e) });
					});
				return function () { alive = false; };
			}, [clientId, enabled, tick]);
			state[0].refresh = function () { freshRef.current = true; setTick(tick + 1); };
			return state[0];
		}

		/** 薄弱问句那两条路由的人话报错。 */
		function weakErrorText(error, detail) {
			if (error === "no-data") return detail || "这个客户最近没有可用的采集数据。";
			if (error === "not-allowed") return detail || "这个客户不在当前可查名单里。";
			if (error === "timeout") return "取数超时，稍后再试。";
			if (error === "network") return "连不上数据服务：" + detail;
			if (error === "unreachable") return "连不上宿主路由：" + detail;
			if (error === "insights-failed") return "数据服务返回：" + (detail || error);
			if (error === "route-missing") return "宿主路由还没挂上 —— 宿主代码改了要重启一次 DSH 才生效。";
			return "取薄弱问句失败：" + (detail || error);
		}

		/** 差额显示：正数=客户落后（红），负数=客户领先（绿），0=持平，null=未采集。 */
		/* 差额显示：
		 *   正数（我们落后）→ 减号，红：−40%
		 *   负数（我们领先）→ 加号，绿：+40%
		 *   0              → 浅灰的 −
		 *   没采集          → 浅灰的 −（和 0 一样，靠 tooltip 区分）
		 * 单位是百分点，直接跟 %。 */
		function gapText(gap) {
			if (gap === null || gap === undefined) return "−";
			if (gap === 0) return "−";
			var shown = String(Math.round(Math.abs(gap) * 100) / 100);
			return (gap > 0 ? "-" : "+") + shown + "%";
		}
		/* 差额 > 0 = 我们落后 → 红；< 0 = 我们领先 → 绿；0 / 没采集 → 浅灰 −。 */
		function gapSign(gap) {
			if (gap === null || gap === undefined) return "none";
			if (gap > 0) return "bad";
			if (gap < 0) return "good";
			return "flat";
		}
		/** 鼠标悬停时的完整解释（表里显示的是简写）。 */
		function gapTitle(platformName, gap) {
			if (gap === null || gap === undefined) return platformName + "：未采集";
			if (gap === 0) return platformName + "：持平";
			return platformName + "：" + (gap > 0 ? "我们落后 " : "我们领先 ") + String(Math.round(Math.abs(gap) * 100) / 100) + " 个百分点";
		}
		/** 采集时间（ISO，UTC）→ 北京时间的 YYYY-MM-DD。 */
		function collectedDay(iso) {
			if (!iso) return "";
			var d = new Date(iso);
			if (isNaN(d.getTime())) return String(iso).slice(0, 10);
			var beijing = new Date(d.getTime() + 8 * 3600 * 1000);
			return beijing.toISOString().slice(0, 10);
		}

		function clientsErrorText(error, detail) {
			if (error === "mcp-missing") return detail || "没找到知识库 MCP 的客户列表工具。";
			if (error === "mcp-error") return "知识库 MCP 报错：" + detail;
			if (error === "bad-reply") return "知识库 MCP 回来了，但形状不认识：" + detail;
			if (error === "unreachable") return "连不上宿主路由：" + detail;
			if (error === "route-missing") {
				return "宿主路由还没挂上（" + detail + "）—— 宿主代码改了要重启一次 DSH 才生效。";
			}
			return "读客户列表失败：" + (detail || error);
		}

		function skillsErrorText(error, detail) {
			if (error === "route-missing") return "技能服务的宿主路由还没挂上 —— 宿主代码改了要重启一次 DSH 才生效。";
			if (error === "skills-unavailable") return "技能目录读不到：" + detail;
			if (error === "unreachable") return "连不上宿主路由：" + detail;
			return "读技能目录失败：" + (detail || error);
		}

		/* 宿主那半边负责归一化，但线上可能同时跑着两个版本的宿主代码
		 * （改宿主代码要重启才生效，客户端却立刻热重载）。所以这里对两种形状
		 * 都容错：归一化后的 {id,name,meta} 和原始的生产形状 {client_key,
		 * display_name,files,chars} 都能读。 */
		function customerId(c) { return String(c.id || c.client_key || c.name || ""); }
		function customerName(c) { return String(c.name || c.display_name || c.client_key || c.id || ""); }
		function customerMeta(c) {
			if (typeof c.meta === "string" && c.meta !== "") return c.meta;
			var bits = [];
			if (typeof c.files === "number") bits.push(c.files + " 个文件");
			if (typeof c.chars === "number") bits.push(Math.round(c.chars / 1000) + "k 字");
			return bits.join(" · ");
		}

		function Empty(props) {
			return h("div", { className: "wb_empty" },
				h("div", { className: "wb_emptyT" + (props.bad ? " wb_bad" : "") }, props.title),
				props.sub ? h("div", { className: "wb_emptyS" }, props.sub) : null);
		}

		/* 会话域接力：装配台（root 域）拿不到 inputActions，发不了消息。
		 * 这里挂在会话的 composer dock 上，把装配台留下的提示词塞进草稿并提交。
		 * 一次性：取走即清，避免重开渲染时重复发送。
		 *
		 * P0 修复（串台）：以前这里的 effect 只看 actions，凡挂着一个 dock
		 * 就消费 —— 于是提示词落进了「当时打开的那条会话」。现在加两条守卫：
		 *   1. 只在**空白会话**里消费：startSession() 会复用/新建空白会话，
		 *      目标会话必然没有消息节点；非空白的一律跳过，留给目标。
		 *      （旧会话若本身就是空白，它就是 startSession 复用的目标，消费正确。）
		 *   2. dispatch() 派发 `wb-prompt-set` 事件：当前打开的会话如果恰好
		 *      是空白目标（actions/isEmpty 都没变，effect 不会重跑），靠事件
		 *      触发一次检查，提示词不会卡住。 */
		var pendingPrompt = null;

		function PromptRelay(props) {
			var actions = props.inputActions;
			var useChat = props.useChat;

			/* 当前会话的消息节点数：0 = 空白。selector 返回数字，
			 * snapshot 相等性比较才稳定，不会引发多余的 effect。 */
			var nodeCount = 0;
			if (typeof useChat === "function") {
				nodeCount = useChat(function (snapshot) {
					var nodes = snapshot && snapshot.legacy && snapshot.legacy.nodes;
					if (Array.isArray(nodes)) return nodes.length;
					if (nodes !== null && typeof nodes === "object") return Object.keys(nodes).length;
					return 0;
				});
				if (typeof nodeCount !== "number" || isNaN(nodeCount)) nodeCount = 1; // 认不出就当非空白，宁可不发不串台
			} else {
				nodeCount = -1; // 拿不到 useChat —— 退回旧行为（没有判断依据）
			}
			var isEmpty = nodeCount === 0 || nodeCount === -1;

			var consumeRef = React.useRef(null);
			consumeRef.current = function () {
				if (pendingPrompt === null) return;
				if (actions === undefined || actions === null) {
					/* 真有提示词要发却拿不到 inputActions —— 说出来，别静默吞掉。 */
					console.warn("[dsh-workbench] 接力挂件拿不到 inputActions，提示词没发出去");
					return;
				}
				if (!isEmpty) {
					/* 非空白会话：不是目标，跳过 —— 提示词留给空白目标会话。 */
					return;
				}
				var text = pendingPrompt;
				pendingPrompt = null;
				/* 模型偏好（装配台选的）：先绑给这个会话再发第一条消息 ——
				 * Host 在下一次提示词组装时对选择做快照，绑完再发才能用上。
				 * 绑失败不挡发送：console 说话，照常按默认模型发。 */
				/* 把任务参数编号绑定到这个会话 —— C1 任务条按 sessionId 取。
				 * （多设备/刷新后不跨会话残留。） */
				try {
					var pendingId = sessionStorage.getItem(WB_KEY.pendingMeta) || "";
					if (pendingId !== "" && typeof props.sessionId === "string" && props.sessionId !== "") {
						sessionStorage.setItem(WB_KEY.metaFor + props.sessionId, pendingId);
						sessionStorage.removeItem(WB_KEY.pendingMeta);
					}
					/* 自绘侧栏分组登记：会话 → 客户（+主题），宿主存映射表 */
					var pendingClient = sessionStorage.getItem(WB_KEY.pendingClient) || "";
					var pendingTopic = sessionStorage.getItem(WB_KEY.pendingTopic) || "";
					if (pendingClient !== "" && typeof props.sessionId === "string" && props.sessionId !== "") {
						sessionStorage.removeItem(WB_KEY.pendingClient);
						sessionStorage.removeItem(WB_KEY.pendingTopic);
						fetch(WB_API.assignGroup, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ session: props.sessionId, client: pendingClient, topic: pendingTopic }),
						}).then(function (r) { return r.json(); })
							.then(function (b) { if (!b || b.ok !== true) console.warn("[dsh-workbench] 分组登记失败：", b && b.error, b && b.detail); })
							.catch(function (e) { console.warn("[dsh-workbench] 分组登记失败：", String(e)); });
					}
				} catch (error) { /* 无 sessionStorage 就没有任务条，不影响发消息 */ }
				/* 模型偏好（装配台选的）：先绑给这个会话再发第一条消息 ——
				 * Host 在下一次提示词组装时对选择做快照，绑完再发才能用上。
				 * 绑失败不挡发送：console 说话，照常按默认模型发。 */
				var pendingModel = null;
				try {
					var mpRaw = sessionStorage.getItem(WB_KEY.modelPending);
					if (mpRaw !== null && mpRaw !== "") {
						sessionStorage.removeItem(WB_KEY.modelPending);
						pendingModel = JSON.parse(mpRaw);
					}
				} catch (error) { /* 没有偏好就发默认 */ }
				function submitDraft() {
					actions.setDraft(text);
					actions.submit();
				}
				var canBind = pendingModel !== null && pendingModel !== undefined
					&& typeof props.sessionId === "string" && props.sessionId !== ""
					&& props.wbCtx && props.wbCtx.sessions && typeof props.wbCtx.sessions.selectModel === "function";
				if (canBind) {
					var selReq = {
						sessionId: props.sessionId,
						provider: String(pendingModel.provider || ""),
						model: String(pendingModel.model || ""),
					};
					if (pendingModel.effort !== undefined && pendingModel.effort !== null && pendingModel.effort !== "") {
						selReq.reasoningEffort = String(pendingModel.effort);
					}
					props.wbCtx.sessions.selectModel(selReq).then(submitDraft, function (error) {
						console.warn("[dsh-workbench] 模型没绑上，用默认发：", String(error));
						submitDraft();
					});
					return;
				}
				submitDraft();
			};

			React.useEffect(function () {
				consumeRef.current();
			}, [actions, isEmpty]);

			/* dispatch() 设好 pendingPrompt 后派发的事件：让"当前已挂着的
			 * 空白会话"（deps 都没变的那种）也能立刻消费，不等下一次渲染。 */
			React.useEffect(function () {
				var onSet = function () { consumeRef.current(); };
				window.addEventListener("wb-prompt-set", onSet);
				return function () { window.removeEventListener("wb-prompt-set", onSet); };
			}, []);
			return null;
		}

			/* ---- C1 顶部任务条（2026-09-23）-------------------------------------
			 * 装配台发起时参数已登记宿主（编号经 sessionStorage 绑到会话），
			 * 这里读回展示：客户 / 业务线 / 期数 / 主题 / 技能 / 补充要求。
			 * 没登记过的会话显示标题兜底 —— 槽位是全局替换，不能开天窗。 */
			/* 审核浮层（原型 R 区的浮层版）：原生 DOM 挂 document.body ——
			 * header 槽上游有 backdrop-filter/transform 会劫持 position:fixed，
			 * body 下没有这层，浮层定位稳定。左=草稿列表，右=正文 + 确认入库。 */
			var WbCtx = null; /* apply 时赋值：TaskBar 自动弹侧栏用 */

			function wbOpenReview(client, onChanged) {
				var old = document.getElementById("wb-review-overlay");
				if (old) old.remove();
				var wrap = document.createElement("div");
				wrap.id = "wb-review-overlay";
				wrap.className = "wb_reviewWrap";
				var card = document.createElement("div");
				card.className = "wb_review";
				var head = document.createElement("div");
				head.className = "wb_reviewHead";
				head.innerHTML = '<div><div class="wb_reviewTitle">产物审核</div><div class="wb_reviewSub">客户「' + client + '」 · 确认后才正式入库</div></div>';
				var closeBtn = document.createElement("button");
				closeBtn.type = "button"; closeBtn.className = "wb_reviewClose"; closeBtn.textContent = "关闭";
				closeBtn.onclick = function () { wrap.remove(); };
				head.appendChild(closeBtn);
				var bodyEl = document.createElement("div");
				bodyEl.className = "wb_reviewBody";
				var listEl = document.createElement("div");
				listEl.className = "wb_reviewList";
				var mainEl = document.createElement("div");
				mainEl.className = "wb_reviewMain";
				bodyEl.appendChild(listEl); bodyEl.appendChild(mainEl);
				card.appendChild(head); card.appendChild(bodyEl);
				wrap.appendChild(card);
				wrap.addEventListener("click", function (e) { if (e.target === wrap) wrap.remove(); });
				document.body.appendChild(wrap);

				var mainTitle = null, mainText = null, mainFoot = null, msgEl = null, currentTitle = "";
				function ensureMain() {
					if (mainTitle) return;
					mainTitle = document.createElement("div"); mainTitle.className = "wb_reviewMainTitle";
					mainText = document.createElement("div"); mainText.className = "wb_reviewText"; mainText.textContent = "";
					mainFoot = document.createElement("div"); mainFoot.className = "wb_reviewFoot"; mainFoot.style.display = "none";
					msgEl = document.createElement("span"); msgEl.className = "wb_reviewMsg";
					var ok = document.createElement("button"); ok.type = "button"; ok.className = "wb_confirmBtn"; ok.textContent = "确认入库";
					ok.onclick = function () { confirmDraft(currentTitle); };
					mainFoot.appendChild(msgEl); mainFoot.appendChild(ok);
					mainEl.appendChild(mainTitle); mainEl.appendChild(mainText); mainEl.appendChild(mainFoot);
				}
				function loadDrafts() {
					fetch(WB_API.drafts + "?client=" + encodeURIComponent(client), { headers: { accept: "application/json" } })
						.then(function (r) { return r.json(); })
						.then(function (b) {
							listEl.innerHTML = "";
							var drafts = (b && b.ok === true && b.drafts) ? b.drafts : [];
							if (drafts.length === 0) { listEl.innerHTML = '<div class="wb_reviewEmpty">草稿区是空的</div>'; return; }
							drafts.forEach(function (d) {
								var item = document.createElement("button");
								item.type = "button"; item.className = "wb_reviewItem";
								if (d.title === currentTitle) item.setAttribute("data-on", "1");
								var t1 = document.createElement("span"); t1.className = "wb_reviewItemTitle"; t1.textContent = d.title;
								var t2 = document.createElement("span"); t2.className = "wb_reviewItemMeta"; t2.textContent = Math.round(d.chars / 100) / 10 + "k 字 · " + (d.updatedAt || "").slice(5, 16).replace("T", " ");
								item.appendChild(t1); item.appendChild(t2);
								item.onclick = function () { openBody(d.title); loadDrafts(); };
								listEl.appendChild(item);
							});
						})
						.catch(function () { listEl.innerHTML = '<div class="wb_reviewEmpty">草稿列表读取失败</div>'; });
				}
				function openBody(title) {
					currentTitle = title; ensureMain();
					mainTitle.textContent = title;
					mainText.textContent = "加载中…"; mainFoot.style.display = "none";
					fetch(WB_API.draft + "?client=" + encodeURIComponent(client) + "&title=" + encodeURIComponent(title), { headers: { accept: "text/markdown" } })
						.then(function (r) { return r.text(); })
						.then(function (text) { mainText.textContent = text; mainFoot.style.display = "flex"; })
						.catch(function (e) { mainText.textContent = "读取失败：" + String(e); });
				}
				function confirmDraft(title) {
					if (!title) return;
					fetch(WB_API.confirmDraft, {
						method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
						body: JSON.stringify({ client: client, title: title }),
					})
						.then(function (r) { return r.json().then(function (b) { return { code: r.status, body: b }; }); })
						.then(function (res) {
							var okTitle = (res.body && res.body.finalTitle) || title;
							var msg = res.body && res.body.ok === true ? "已入库 ✓（" + okTitle + "）"
								: res.code === 409 ? "未入库：正式库已有同名文章"
								: "失败：" + ((res.body && (res.body.error || res.body.detail)) || res.code);
							msgEl.textContent = msg;
							if (typeof onChanged === "function") { try { onChanged(); } catch (e2) { } }
							loadDrafts();
						})
						.catch(function (e) { msgEl.textContent = "失败：" + String(e); });
				}
				loadDrafts();
			}

			/* ---- 自绘左侧栏（2026-09-26 定稿：官方栏整体藏掉）------------
			 * "客户"只是前端分组：会话清单来自官方 ctx.sessions 服务，
			 * "会话→客户"来自我们自己的映射表；新客户在装配台勾选即出现，
			 * 不需要预先建任何组。绝不改动官方组件内部（历史教训：一改就崩）。 */
			var WB_NAV_W = 330;
			var wbNavState = { sessions: null, map: {}, q: "", open: {}, current: "", navW: 330 };
			try {
				var savedW = parseInt(localStorage.getItem(WB_KEY.navW) || "0", 10);
				if (savedW >= 200 && savedW <= 480) wbNavState.navW = savedW;
			} catch (e) { }
			/* 官方会重设 frame 列宽（开右栏/resize 时写回），tick 里持续校正第一列 */
			function wbNavTakeFrame() {
				try {
					var fr = document.querySelector('[class*="frame"]');
					if (fr === null || fr.style.gridTemplateColumns === "") return;
					var cols = fr.style.gridTemplateColumns.split(/\s+/);
					var want = wbNavState.navW + "px";
					if (cols[0] !== want) { cols[0] = want; fr.style.gridTemplateColumns = cols.join(" "); }
				} catch (e) { }
			}
			var wbNavSubs = [];
			var wbFrameMo = null;
			function wbNavEmit() { wbNavSubs.forEach(function (f) { try { f(); } catch (e) { } }); }
			function wbNavRefresh() {
				/* 清单=登记表本身（装配台发起的每个会话都在）：id→{client,topic,at}。
				 * 点开会话走官方 ctx.sessions.open；登记即出现，新客户零成本。 */
				fetch(WB_API.clientMap, { headers: { accept: "application/json" } })
					.then(function (r) { return r.json(); })
					.then(function (b) { if (b && b.ok === true) { wbNavState.map = b.map || {}; wbNavEmit(); } })
					.catch(function () { });
			}
			var wbNavCtx = null;
			var wbNavHideDone = false;
			function wbNavHideOfficial() {
				var doc = typeof document === "undefined" ? null : document;
				if (doc === null) return;
				/* 定位：官方侧栏容器 class 确实含 "sidebar"，排除右栏。
				 * 官方 frame 是 grid（sidebarCol|centerCol|rightbarCol）。
				 * 千万不能 display:none —— grid item 消失后 centerCol 会前移
				 * 挤进侧栏列（实测踩坑）。做法：侧栏 DOM 宽压 0 但留在第一列，
				 * 第一列 = 自绘栏宽度 —— 主区正好从自绘栏右侧开始，贴左的
				 * 内容（任务卡）不被盖。官方会重设列宽，tick 持续校正。 */
				var cand = doc.querySelectorAll('div[class*="sidebar"]:not([class*="right"])');
				for (var i = 0; i < cand.length; i++) {
					var el = cand[i];
					if (el.style.width === "0") continue;   /* 已压过，offsetWidth 也会变 0 */
					var w = el.offsetWidth;
					if (w > 150 && w < 460) {
						el.style.width = "0";
						el.style.minWidth = "0";
						el.style.overflow = "hidden";
						el.style.flexBasis = "0";
						el.style.margin = "0";
						el.style.padding = "0";
						el.style.border = "none";
					}
				}
				/* 官方的两个列把手都藏掉：侧栏那个是幽灵（官方侧栏已被压 0 宽，
				 * 把手却留在官方记忆的列宽位置上）；右栏那个压在中栏滚动条上
				 * （DSH 消息区 scrollbar-gutter:stable，滚动条常驻），拖滚动条
				 * 会误命中它变成改宽度。宽度改由我们自己的 .wb_grip 接管。 */
				var hs = doc.querySelectorAll('[data-side="sidebar"]');
				for (var j = 0; j < hs.length; j++) {
					if (hs[j].style.display !== "none") hs[j].style.display = "none";
				}
				wbNavTakeFrame();
			}

			function SidebarNav(props) {
				var st = React.useState(0);
				React.useEffect(function () {
					wbNavSubs.push(function () { st[1](function (x) { return x + 1; }); });
					return function () { wbNavSubs = wbNavSubs.filter(function (x) { return x !== undefined; }); };
				}, []);
				/* shell.overlay 的 props 里没有 ctx —— 注册时用闭包把插件 ctx 传进来 */
				var ctx = (props && props.wbCtx) ? props.wbCtx : (props && props.ctx ? props.ctx : null);
				wbNavCtx = ctx;
				/* 全页只保留这一个拖宽把手（原型 R1/R4）：贴在右栏列左缘**内侧**，
				 * 改官方 frame 的最后一列宽；宽度记 sessionStorage，下次恢复。
				 * 官方重渲染会清掉注入节点 —— tick 里定期补挂。
				 * 位置跨在交界线上（-5px 起、10px 宽）：中栏右缘是常驻滚动条
				 * （scrollbar-gutter:stable），贴边内缩会让鼠标落在滚动条上
				 * 够不到把手 —— 宁可压住滚动条最右几像素，也要保证拖得到。 */
				/* 官方重渲染会用它的 state 重设列宽，把用户拖好的宽度冲掉；
				 * tick 里按记忆值纠回来（差 8px 以上才动手）。 */
				/* 把手被官方重渲染删掉时立刻补挂（4 秒一轮的 tick 太慢，
				 * 用户连着拖第二次就会落空）。frame 可能还没渲染出来，
				 * 所以每 tick 都幂等尝试建立，不能只在挂载时建一次。 */
				function wbWatchFrame() {
					try {
						if (wbFrameMo !== null) return;
						var fr = document.querySelector('[class*="frame"]');
						if (fr === null) return;
						wbFrameMo = new MutationObserver(function () { ensureGrip(); });
						wbFrameMo.observe(fr, { childList: true, subtree: true });
					} catch (e) { }
				}
				function wbNavKeepRightW() {
					try {
						var saved = parseInt(localStorage.getItem(WB_KEY.rightbarW) || "0", 10);
						if (!(saved >= 320)) return;
						var c = document.querySelector('[class*="rightbarCol"]');
						var fr = c ? c.closest('[class*="frame"]') : null;
						if (fr === null) return;
						var cur = fr.style.gridTemplateColumns || "";
						var mm = /minmax\(\s*0px\s*,\s*([\d.]+)px\s*\)\s*$/.exec(cur);
						if (mm === null) return;
						if (Math.abs(parseFloat(mm[1]) - saved) < 8) return;
						fr.style.gridTemplateColumns = cur.replace(/minmax\(\s*0px\s*,[^)]*\)\s*$/, "minmax(0px, " + saved + "px)");
					} catch (e) { }
				}
				function ensureGrip() {
					try {
						var col = document.querySelector('[class*="rightbarCol"]');
						if (col === null) return;
						/* 官方右栏收起中（装配台页无占用方，末列≈0）就别动它 ——
						 * 否则首屏落在装配台时，恢复记忆宽度会把空右轨撑出大片空白。 */
						var fr0 = col.closest('[class*="frame"]');
						var cols0 = fr0 ? (fr0.style.gridTemplateColumns || "").split(/\s+/) : [];
						var curW = cols0.length >= 3 ? (parseInt(cols0[cols0.length - 1], 10) || 0) : 0;
						if (curW < 50) return;
						if (col.querySelector(".wb_grip") !== null) return;
						var g = document.createElement("div");
						g.className = "wb_grip";
						g.title = "拖动调宽";
						g.style.cssText = "position:absolute;left:-4px;top:0;bottom:0;width:8px;";
						g.addEventListener("mousedown", function (ev) {
							ev.preventDefault();
							function mv(e) {
								/* 每次都重新查 frame：闭包里的元素可能已被官方重渲染换掉。
								 * 也绝不解析 gridTemplateColumns —— minmax(400px, 1fr) 里有空格，
								 * 拆开再拼会丢右括号、整条 CSS 失效（这就是拖不动的老 bug）。 */
								var c2 = document.querySelector('[class*="rightbarCol"]');
								var fr2 = c2 ? c2.closest('[class*="frame"]') : null;
								if (fr2 === null) return;
								var w = Math.max(320, Math.min(window.innerWidth - wbNavState.navW - 412, window.innerWidth - e.clientX));
								fr2.style.gridTemplateColumns = wbNavState.navW + "px minmax(400px, 1fr) " + w + "px";
								try { localStorage.setItem(WB_KEY.rightbarW, String(w)); } catch (er) { }
							}
							function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
							window.addEventListener("mousemove", mv);
							window.addEventListener("mouseup", up);
						});
						col.appendChild(g);
						if (!ensureGrip.restored) {
							ensureGrip.restored = true;
							var fr = col.closest('[class*="frame"]');
							var saved = 0;
							try { saved = parseInt(localStorage.getItem(WB_KEY.rightbarW) || "0", 10); } catch (er) { }
							if (saved >= 320 && fr !== null) {
								var cols = (fr.style.gridTemplateColumns || "").split(/\s+/);
								fr.style.gridTemplateColumns = wbNavState.navW + "px minmax(400px, 1fr) " + saved + "px";
							}
						}
					} catch (e) { }
				}
				React.useEffect(function () {
					wbNavRefresh();
					var stop = false;
					function tick() { if (!stop) { wbNavRefresh(); wbNavHideOfficial(); } }
					var timerId = setInterval(tick, 4000);
					wbNavHideOfficial();
					return function () { stop = true; clearInterval(timerId); };
				}, []);
				var q = wbNavState.q;
				var map = wbNavState.map;
				/* 组装：客户 → [{id,title,at}]，按登记时间倒序 */
				var groups = {};
				Object.keys(map).forEach(function (id) {
					var rec = map[id];
					var m = rec && rec.client ? rec.client : "其他";
					var title = rec && rec.topic ? rec.topic : "未命名会话";
					if (q !== "" && title.indexOf(q) < 0 && m.indexOf(q) < 0) return;
					if (groups[m] === undefined) groups[m] = [];
					groups[m].push({ id: id, title: title, at: rec && rec.at ? rec.at : "" });
				});
				Object.keys(groups).forEach(function (n) {
					groups[n].sort(function (a, b) { return (a.at < b.at) - (a.at > b.at); });
				});
				var names = Object.keys(groups).sort(function (a, b) {
					return (b === "其他") - (a === "其他") || a.localeCompare(b, "zh");
				});
				/* cordis 规矩：服务必须 ctx.get() 读，不能 ctx.xxx 直取 */
				function openSession(id) {
					/* 服务器重启后运行时会话清空，裸 select 会 unknown ——
					 * 优先 uiWorkspace.openSession（内部处理挂载），传登记时的原样 id。 */
					try {
						var raw = String(id);
						wbNavState.current = raw; wbNavEmit();   // 树里高亮当前位置
						var w = ctx && typeof ctx.get === "function" ? ctx.get("uiWorkspace") : null;
						if (w && typeof w.openSession === "function") { w.openSession(raw); return; }
						var s = ctx && typeof ctx.get === "function" ? ctx.get("sessions") : null;
						if (s && typeof s.open === "function") s.open(raw);
					} catch (e) { console.warn("[dsh-workbench] 打开会话失败：", String(e)); }
				}
				function goCompose() {
					try {
						var l = ctx && typeof ctx.get === "function" ? ctx.get("layout") : null;
						if (l && typeof l.selectPanel === "function") l.selectPanel(WORKBENCH_KEY);
					} catch (e) { console.warn("[dsh-workbench] 打开新建任务失败：", String(e)); }
				}
				return h("div", { className: "wb_nv", style: { width: String(wbNavState.navW) + "px" } },
					h("div", { className: "wb_nvBrand" }, h("span", { className: "wb_nvBrandT" }, "生文 Agent")),
					h("div", {
						className: "wb_nvSplit", title: "拖动调整宽度",
						onPointerDown: function (ev) {
							ev.preventDefault();
							var startX = ev.clientX, startW = wbNavState.navW;
							function mv(e2) {
								wbNavState.navW = Math.max(200, Math.min(480, startW + (e2.clientX - startX)));
								try { localStorage.setItem(WB_KEY.navW, String(wbNavState.navW)); } catch (er) { }
								wbNavTakeFrame();
								wbNavEmit();
							}
							function up() { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }
							window.addEventListener("pointermove", mv);
							window.addEventListener("pointerup", up);
						},
					}),
					h("button", { type: "button", className: "wb_nvNew", onClick: goCompose }, "＋ 新建任务"),
					h("input", {
						className: "wb_nvSearch", type: "search", placeholder: "搜索会话…",
						value: q,
						onChange: function (e) { wbNavState.q = e.target.value; wbNavEmit(); },
					}),
					h("div", { className: "wb_nvTree" },
						names.length === 0
							? h("div", { className: "wb_nvHint" }, "还没有会话，点上方发起")
							: (names.length === 0
								? h("div", { className: "wb_nvHint" }, "还没有会话")
								: names.map(function (name) {
									var open = wbNavState.open[name] !== false;
									return h("div", { key: name, className: "wb_nvGroup" },
										h("button", {
											type: "button", className: "wb_nvGroupName",
											onClick: function () {
												wbNavState.open[name] = !open; wbNavEmit();
											},
										}, (open ? "▾ " : "▸ ") + name + "（" + groups[name].length + "）"),
										open ? groups[name].map(function (it) {
											/* 对齐原型："09-18 · 老榜单" —— 登记日期做前缀 */
											var label = (it.at && it.at.length >= 10 ? it.at.slice(5, 10) + " · " : "") + it.title;
											return h("button", {
												type: "button", key: String(it.id),
												className: "wb_nvItem" + (it.id === wbNavState.current ? " wb_nvCur" : ""),
												title: label,
												onClick: function () { openSession(it.id); },
											}, label);
										}) : null);
								}))));
			}

			/* ---- 挑篇（原型 C6 pick-row）--------------------------------
			 * 勾选（选哪几篇）只在输入框上方的"改哪几篇"编号条里做；
			 * 右栏左列只负责点开看正文。两边共享这一份选中集。 */
			var WB_PICK = { sel: {}, client: "", drafts: null, done: {}, subs: [] };
			function wbPickEmit() {
				WB_PICK.subs.forEach(function (f) { try { f(); } catch (e) { } });
			}
			function wbPickToggle(title) {
				if (WB_PICK.sel[title]) delete WB_PICK.sel[title]; else WB_PICK.sel[title] = true;
				wbPickEmit();
			}
			function wbPickSub(f) {
				WB_PICK.subs.push(f);
				return function () { WB_PICK.subs = WB_PICK.subs.filter(function (x) { return x !== f; }); };
			}
			function useWbPickTick() {
				var s = React.useState(0);
				React.useEffect(function () {
					return wbPickSub(function () { s[1](function (x) { return x + 1; }); });
				}, []);
				return s[0];
			}
			function PickBar() {
				useWbPickTick();
				var drafts = WB_PICK.drafts || [];
				var done = WB_PICK.done || {};
				var pending = drafts.filter(function (d) { return done[d.title] !== true; });
				if (pending.length === 0) return null;
				var allOn = pending.every(function (d) { return WB_PICK.sel[d.title] === true; });
				/* 硬检摘要（R 区检查完成后写入）：红点/绿点的提示文案用真实数 */
				var hcMap = WB_PICK.hc || null;
				var badN = 0;
				if (hcMap) pending.forEach(function (d) {
					var c = hcMap[d.title]; if (!c) return;
					if ((c.fail || 0) + (c.proof || 0) + (c.warn || 0) > 0) badN++;
				});
				return h("div", { className: "wb_pkRow" },
					h("span", { className: "wb_pkK" }, "改哪几篇"),
					h("div", { className: "wb_pkChips" },
						pending.map(function (d, idx) {
							var on = WB_PICK.sel[d.title] === true;
							var viewing = WB_PICK.view === d.title;
							/* 序号用文件名前缀（01-xx 的 01），和 R 区列表、agent 汇报一致 */
							var m = d.title.match(/^(\d{1,3})-/);
							var no = String(m ? parseInt(m[1], 10) : idx + 1).padStart(2, "0");
							return h("button", {
								type: "button", key: d.title, className: "wb_pkChip" + (on ? " is-on" : "") + (viewing ? " is-view" : ""),
								title: d.title + (viewing ? "（正在右侧查看）" : ""),
								onClick: function () { wbPickToggle(d.title); },
							}, no);
						})),
					h("button", {
						type: "button", className: "wb_pkAll",
						onClick: function () {
							WB_PICK.sel = {};
							if (!allOn) pending.forEach(function (d) { WB_PICK.sel[d.title] = true; });
							wbPickEmit();
						},
					}, "全选"),
					hcMap
						? h("span", { className: "wb_pkHc", title: "机器检查结果（右侧「文章审核」可看详情、可重跑）" },
							h("span", { className: "wb_pkDot" + (badN > 0 ? " red" : " green") }),
							h("span", { className: "wb_pkHcT" }, badN + " 篇有问题"))
						: h("span", { className: "wb_pkHc", title: "还没跑机器检查 —— 右侧「文章审核」里点「开始检查」" },
							h("span", { className: "wb_pkDot green" }),
							h("span", { className: "wb_pkHcT" }, "未检查")));
			}

			/* R 区：右侧栏"文章审核" tab（对齐原型 styles.css 的 rev-* 结构）——
			 * 检查条（●未审核 + 检查预设 + 开始检查）/ 已通过 X/Y / 左列单行条目（勾选+查看态）
			 * 已入库段落绿底锁定 / 正文渲染 / 底部 hint+确认(勾选数)+全部确认。
			 * 客户来源：openTab params 优先，否则从当前会话解析。 */
			function ReviewTabBody(props) {
				var sessionId = props.sessionId;
				var useChat = props.useChat;
				var st = React.useState({ client: "", drafts: null, sel: "", body: "", msg: "", done: {}, editing: false, editText: "", saving: false });
				var client = st[0].client, drafts = st[0].drafts, sel = st[0].sel, bodyText = st[0].body, msg = st[0].msg, doneMap = st[0].done;
				var setL = st[1];
				useWbPickTick();   // 勾选集合在输入框挑篇条里维护 —— 订阅它，选中变化时这里跟着重渲
				var checked = WB_PICK.sel;
				var checkedCount = drafts === null ? 0 : drafts.filter(function (d) {
					return doneMap[d.title] !== true && checked[d.title] === true;
				}).length;

				/* 客户解析：params → 当前会话首条 user 消息的任务编号 → meta.client */
				var clientFromParams = null;
				try {
					var info = typeof props.useTabInfo === "function" ? props.useTabInfo() : null;
					clientFromParams = info && info.navigation && info.navigation.params ? (info.navigation.params.client || null) : null;
				} catch (e) { }
				var chatSnap = null;
				if (!clientFromParams && typeof useChat === "function" && sessionId) {
					chatSnap = useChat(function (s) { return s; });
				}
				var metaId = "";
				try {
					var info2 = typeof props.useTabInfo === "function" ? props.useTabInfo() : null;
					var pm = info2 && info2.navigation && info2.navigation.params ? info2.navigation.params.meta : null;
					if (typeof pm === "string" && pm !== "") metaId = pm;
				} catch (e) { }
				var legacyNodes = (chatSnap && chatSnap.legacy && chatSnap.legacy.nodes) || null;
				/* 本会话产物归属：数消息流里成功的 write_article 调用（argsRaw 带 title）。
				 * 文件时刻会串会话（别的会话后入库也会晚于本任务发起），
				 * 消息流留痕才是真正的会话归属。 */
				var writeTitles = {};
				if (Array.isArray(legacyNodes)) {
					for (var wsi = 0; wsi < legacyNodes.length; wsi++) {
						var wsn = legacyNodes[wsi];
						if (wsn && wsn.kind === "tool-result" && wsn.call
							&& wsn.call.name === "mcp__sora-articles__write_article" && wsn.isError !== true) {
							try {
								var wargs = JSON.parse(wsn.call.argsRaw || "{}");
								var wtitle = String(wargs.title || wargs.file || "").replace(/\.md$/i, "");
								if (wtitle !== "") writeTitles[wtitle] = true;
							} catch (e) { }
						}
					}
				}
				var writeCount = 0;
				for (var wtk in writeTitles) writeCount++;
				var list = (metaId === "" && Array.isArray(legacyNodes)) ? legacyNodes : null;
				for (var i = 0; list !== null && i < list.length; i++) {
					var node = list[i];
					if (node && node.kind === "user") {
						var content = Array.isArray(node.content) ? node.content : null;
						if (!content) break;
						var firstUser = content
							.filter(function (b) { return b && b.type === "text" && typeof b.text === "string"; })
							.map(function (b) { return b.text; }).join("");
						var m = firstUser.match(/[【\[]任务编号[：:]([a-z0-9-]+)[\]】]/);
						if (m) metaId = m[1];
						break;
					}
				}
				React.useEffect(function () {
					if (clientFromParams) { setL(function (p) { return Object.assign({}, p, { client: clientFromParams }); }); return; }
					if (metaId === "") { setL(function (p) { return Object.assign({}, p, { client: "" }); }); return; }
					var alive = true;
					fetch(WB_API.taskMeta + "?id=" + encodeURIComponent(metaId), { headers: { accept: "application/json" } })
						.then(function (r) { return r.json(); })
						.then(function (body) {
							if (alive && body && typeof body.client === "string") setL(function (p) { return Object.assign({}, p, { client: body.client }); });
						})
						.catch(function () { });
					return function () { alive = false; };
				}, [clientFromParams, metaId]);

				/* 本任务发起时刻：草稿列表只显示该时刻之后落盘的（C1 口径 ——
				 * 否则同客户的旧会话草稿会混进来）。时刻拿不到就退回全列。 */
				var at = st[0].at;
				/* 硬检状态：null=还没查过；[] 或 results 数组=查过了 */
				var checking = st[0].checking === true;
				var hc = st[0].hc !== undefined ? st[0].hc : null;
				var hcOpen = st[0].hcOpen === true;
				/* 顶部检查条的下拉展开态：点条开/合，点「开始检查」自动展开 */
				var rvOpen = st[0].rvOpen === true;
				var lvMark = { fail: "警告", proof: "提醒", warn: "提醒" };   // 两档制：警告=明确不行（红），提醒=扫一眼（橙）
				var lvCls = { fail: "fail", proof: "warn", warn: "warn" };
				/* 硬检块 children 扁平预构建：三行清单（未查） / 矩阵表+条目（已查） */
				var hcChildren = [];
				var HC_GROUPS = ["工程痕迹", "合规", "格式"];
				var HC_LV = { fail: "警告", proof: "提醒", warn: "提醒" };   // 两档：警告=明确不行（红），提醒=扫一眼（橙）
				var HC_LVC = { fail: "fail", proof: "warn", warn: "warn" };
				var hcCell = st[0].hcCell || null;   // {title, group} 当前展开的格子
				var ignKeys = st[0].ign || [];
				/* 忽略键两种粒度：
				 *   全局  ruleId|词        —— 共性问题「一键忽略」，所有篇都不算
				 *   单篇  篇名|ruleId|词   —— 这一处只在这篇不算（同一句话换篇可能就有问题） */
				function hcIgnKey(it, title) {
					var h = String(it && it.hit || "");
					if (/^另有 \d+ 处同类命中$/.test(h)) {
						/* 汇总行用独立键，「忽略本组」能把它一起收掉 */
						return title ? (title + "|AGG|" + it.ruleId) : ("AGG|" + it.ruleId);
					}
					var m = /「(.+?)」/.exec(String(it && it.hit || ""));
					if (!m) return null;
					return title ? (title + "|" + it.ruleId + "|" + m[1]) : (it.ruleId + "|" + m[1]);
				}
				/* 细粒度键：同篇同规则同词可能命中多句（如 6 句都有「100%」），粗键分不开 ——
				 * 细键在粗键上追加段号+原句，一条明细就是一条，点单条忽略不会殃及同词的其他条 */
				function hcFineKey(it, title) {
					var base = title ? hcIgnKey(it, title) : null;
					if (!base) return null;
					if (base.indexOf("|AGG|") >= 0) return base;   /* 汇总行键保持独立 */
					return base + "|" + String(it && it.where || "") + "|" + String(it && it.snippet || "");
				}
				function hcLive(it, title, keys) {
					var ig = keys || ignKeys;
					var kg = hcIgnKey(it);
					var kl = title ? hcIgnKey(it, title) : null;
					var kf = hcFineKey(it, title);
					return !((kg && ig.indexOf(kg) >= 0) || (kl && ig.indexOf(kl) >= 0) || (kf && ig.indexOf(kf) >= 0));
				}
				/* 汇总行跟随明细：同规则的带词明细全被忽略时，「另有 N 处同类命中」这行也藏起来 */
				function hcDropOrphanAgg(iss) {
					var isAgg = function (it) { return /另有 \d+ 处同类命中/.test(String(it.hit || "")); };
					/* 汇总行只在「同组还有别的活明细」时才显示 —— 同组的都忽略了它就跟着藏 */
					return iss.filter(function (it) {
						if (!isAgg(it)) return true;
						return iss.some(function (o) { return o !== it && o.group === it.group && !isAgg(o); });
					});
				}
				function hcStripWhy(why) {
					return String(why || "").replace(/（[^（]*）$/, "").trim();
				}
				function hcJumpTo(it, title) {
					var m = /「(.+?)」/.exec(String(it && it.hit || ""));
					var word = m ? m[1] : null;
					if (sel !== title) {
						WB_HC_JUMP = { word: word, para: it && it.para };
						openDraft(title);
					} else {
						hcScrollTo(word, it && it.para);
					}
				}
				function hcToggleCell(title, group) {
					setL(function (p) {
						var cur = p.hcCell || null;
						var next = (cur && cur.title === title && cur.group === group) ? null : { title: title, group: group };
						return Object.assign({}, p, { hcCell: next });
					});
				}
				if (checking) {
					hcChildren.push(h("div", { className: "wb_hcRow" },
						h("span", { className: "wb_hcV warn" }, "…"),
						h("span", { className: "wb_hcT" }, "正在检查 " + (drafts === null ? 0 : drafts.length) + " 篇…")));
				} else if (hc === null) {
					hcChildren.push(h("div", { className: "wb_hcIntro" },
						h("div", { className: "wb_hcIntroT" }, "我们查三类："),
						h("div", { className: "wb_hcIntroRow" }, "工程痕迹 —— 交代给 agent 的话漏进正文（数据口径、关键词布局、占位符）"),
						h("div", { className: "wb_hcIntroRow" }, "合规 —— 广告法绝对化用语、要出处的排他说法、医疗违禁词"),
						h("div", { className: "wb_hcIntroRow" }, "格式 —— 标题跳级、表格列数不齐、整段重复")));
				}
				if (hc !== null && drafts !== null && drafts.length > 0) {
					if (hc.length === 0) {
						hcChildren.push(h("div", { className: "wb_hcRow" }, h("span", { className: "wb_hcT" }, "没查到可检的草稿文件")));
					} else {
						/* 每篇 × 三大类的处数统计 */
						var gridRows = drafts.map(function (d) {
							var rs = null;
							hc.forEach(function (r) { if (r.title === d.title) rs = r; });
								var iss = hcDropOrphanAgg(((rs && rs.issues) || []).filter(function (it) { return hcLive(it, d.title); }));
							var cells = HC_GROUPS.map(function (g) {
								var list = iss.filter(function (i) { return i.group === g; });
								var hasFail = list.some(function (i) { return i.level === "fail"; });
								var hasProof = list.some(function (i) { return i.level === "proof"; });
								return { g: g, list: list, n: list.length, cls: hasFail ? "fail" : "warn" };
							});
							return { title: d.title, cells: cells };
						});
						/* 共性问题汇总：同一规则同一条词命中 >=2 篇就提出来，可一键忽略 */
						var agg = {};
						hc.forEach(function (r) {
							((r.issues) || []).forEach(function (it) {
								if (!hcLive(it, r.title)) return;
								var m = /「(.+?)」/.exec(String(it.hit || ""));
								if (!m) return;
								var key = it.ruleId + "|" + m[1];
								if (!agg[key]) agg[key] = { key: key, word: m[1], group: it.group, rule: it.rule, level: it.level, why: hcStripWhy(it.why), titles: {} };
								agg[key].titles[r.title] = true;
							});
						});
						var common = Object.keys(agg).map(function (k) { return agg[k]; })
							.map(function (a) { a.n = Object.keys(a.titles).length; return a; })
							.filter(function (a) { return a.n >= 2; })
							.sort(function (a, b) { return b.n - a.n; });
						if (common.length > 0) {
							hcChildren.push(h("div", { className: "wb_hcCommon" },
								h("div", { className: "wb_hcCommonT" }, "几篇共同的问题："),
								common.map(function (a) {
									return h("div", { className: "wb_hcCommonRow", key: a.key },
										h("span", { className: "wb_hcCommonW" }, "「" + a.word + "」"),
										h("span", { className: "wb_hcCommonC" }, a.n + " 篇都有 · " + a.rule + " · " + a.why),
										h("button", {
											type: "button", className: "wb_hcIgnBtn",
											onClick: function () { hcToggleIgn(a.key); },
											title: "忽略后所有篇的这一处都不再算问题，可随时撤销",
										}, "忽略"));
								})));
						}
						var ignoredCount = 0;
						hc.forEach(function (r) { ((r.issues) || []).forEach(function (it) { if (!hcLive(it, r.title)) ignoredCount++; }); });
						if (ignoredCount > 0) {
							/* 已忽略的明细不逐条显示（太占地方），收成一行：数字 + 全部恢复 */
							hcChildren.push(h("div", { className: "wb_hcIgnored" },
								h("div", { className: "wb_hcCommonRow" },
									h("span", { className: "wb_hcCommonT" }, "已忽略 " + ignoredCount + " 处"),
									h("button", {
										type: "button", className: "wb_hcIgnBtn",
										title: "一键清空全部忽略记录，所有明细恢复显示",
										onClick: function () { hcApplyIgn([]); },
									}, "全部恢复"))));
						}
						hcChildren.push(h("table", { className: "wb_hcGrid" },
							h("thead", null, h("tr", null,
								h("th", null, "篇目"),
								HC_GROUPS.map(function (g) { return h("th", { key: g }, g); }))),
							h("tbody", null, gridRows.map(function (row) {
								return h("tr", { key: row.title },
									h("td", { className: "wb_hcGridT" }, row.title),
									row.cells.map(function (c) {
										if (c.n === 0) return h("td", { key: c.g, className: "wb_hcCell0" }, "—");
										var open = hcCell && hcCell.title === row.title && hcCell.group === c.g;
										return h("td", { key: c.g },
											h("button", {
												type: "button",
												className: "wb_hcCell " + c.cls + (open ? " is-open" : ""),
												onClick: function () { hcToggleCell(row.title, c.g); },
												title: "点开看具体是哪里",
											}, String(c.n) + " 处"));
									}));
							}))));
						/* 展开的格子：该篇该类的条目列表，点条目正文定位 */
						if (hcCell) {
							var cellRow = null;
							gridRows.forEach(function (row) { if (row.title === hcCell.title) cellRow = row; });
							var cellList = [];
							if (cellRow) cellRow.cells.forEach(function (c) { if (c.g === hcCell.group) cellList = c.list; });
							hcChildren.push(h("div", { className: "wb_hcFile", key: "cell" },
								h("div", { className: "wb_hcFileT" },
									h("span", null, hcCell.title + " · " + hcCell.group),
									h("button", {
										type: "button", className: "wb_hcAll",
										title: "这一篇这一组的全部问题都不再算（可在下方已忽略区逐条恢复）",
										onClick: hcIgnoreAll,
									}, "忽略本组")),
								cellList.length === 0
									? h("div", { className: "wb_hcIssue" }, "没有明细")
									: cellList.map(function (it, ii) {
										var isAgg = /另有 \d+ 处同类命中/.test(String(it.hit || ""));
										return h("div", { className: "wb_hcItem", key: ii },
											h("div", {
												className: "wb_hcIssue" + (isAgg ? "" : " is-link"),
												onClick: function () { hcJumpTo(it, hcCell.title); },
												title: isAgg ? "同规则同词还有几处没列出来，点右上「全部忽略」一起算" : "点这里，右侧正文定位到这一处",
											},
												h("span", { className: "wb_hcLv " + (HC_LVC[it.level] || "warn") }, HC_LV[it.level] || it.level || ""),
												isAgg ? null : h("button", {
													type: "button", className: "wb_hcIgnOne",
													title: "这一处在这篇不算问题（只影响这篇，可撤销）",
													onClick: function (ev) {
														ev.stopPropagation();
														hcToggleIgn(hcFineKey(it, hcCell.title));
													},
												}, "忽略"),
												h("span", null, (it.where || "") + " · " + (it.hit || "")),
									h("span", { className: "wb_hcWhy" }, hcStripWhy(it.why)),
									it.snippet ? h("span", { className: "wb_hcSnip" }, " · " + (it.snippet.length > 15 ? it.snippet.slice(0, 15) + "…" : it.snippet)) : null));
									})));
						}
					}
				}
				var runCheck = function () {
					if (client === "" || checking) return;
					var titles = (st[0].drafts || []).map(function (d) { return d.title; });
					if (titles.length === 0) return;
					setL(function (p) { return Object.assign({}, p, { checking: true, rvOpen: true }); });
					fetch(WB_API.check, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ client: client, titles: titles }),
					}).then(function (r) { return r.json(); }).then(function (b) {
						var rs = b && b.ok === true ? (b.results || []) : [];
						var map = {};
						rs.forEach(function (r2) { map[r2.title] = r2.counts || {}; });
						WB_PICK.hc = map; wbPickEmit();   // 消息流挑篇条的红绿摘要跟着亮
						hcSave(client, rs);               // 持久化：刷新后自动恢复
						setL(function (p) { return Object.assign({}, p, { checking: false, hc: rs, hcOpen: false }); });
						setTimeout(function () { if (st[0].sel) hcMarkInBody(st[0].sel, rs); }, 80);
					}).catch(function () {
						WB_PICK.hc = {}; wbPickEmit();
						setL(function (p) { return Object.assign({}, p, { checking: false, hc: [] }); });
					});
				};
				React.useEffect(function () {
					if (metaId === "") { setL(function (p) { return Object.assign({}, p, { at: "" }); }); return; }
					var alive = true;
					fetch(WB_API.taskMeta + "?id=" + encodeURIComponent(metaId), { headers: { accept: "application/json" } })
						.then(function (r) { return r.json(); })
						.then(function (b) {
							if (alive && b && typeof b.savedAt === "string") setL(function (p) { return Object.assign({}, p, { at: b.savedAt }); });
						})
						.catch(function () { });
					return function () { alive = false; };
				}, [metaId]);
				React.useEffect(function () {
					if (!client) { setL(function (p) { return Object.assign({}, p, { drafts: null, sel: "", body: "", checked: {}, done: {} }); }); return; }
					var alive = true;
					fetch(WB_API.drafts + "?client=" + encodeURIComponent(client), { headers: { accept: "application/json" } })
						.then(function (r) { return r.json(); })
						.then(function (b) {
							if (alive && b && b.ok === true) setL(function (p) {
								var scope = at ? (b.drafts || []).filter(function (d) { return d.updatedAt >= at; }) : (b.drafts || []);
								/* 会话归属：消息流里有 write 调用 → 只显示本会话写的那几篇。
								 * 没有（还没开写 / 已终止）→ 列表为空，别的会话的产物不串进来。 */
								if (writeCount > 0) scope = scope.filter(function (d) { return writeTitles[d.title] === true; });
								else scope = [];
								var titles = {}; scope.forEach(function (d) { titles[d.title] = true; });
								var nextD = {};
								Object.keys(p.done).forEach(function (k) { if (titles[k]) nextD[k] = true; });
								/* 已入库的（同名出现在正式库）直接标绿 —— 刷新后状态不丢 */
								(b.library || []).forEach(function (lt) { if (titles[lt] && writeTitles[lt] === true) nextD[lt] = true; });
								Object.keys(WB_PICK.sel).forEach(function (k) { if (!titles[k]) delete WB_PICK.sel[k]; });
								WB_PICK.client = client; WB_PICK.drafts = scope; WB_PICK.done = nextD;
								wbPickEmit();
								return Object.assign({}, p, { drafts: scope, done: nextD });
							});
						})
						.catch(function () { });
					return function () { alive = false; };
				}, [client, at, writeCount]);   /* at / writeCount 回来要重拉重过滤 */

				/* 检查结果持久化恢复：本组件 state 归属正确，客户一定就从 sessionStorage 捞 */
				React.useEffect(function () {
					if (client === "") return;
					var ign = hcLoadIgn(client);
					var patch = { ign: ign };
					if (st[0].hc === undefined) {
						var savedHc = hcLoad(client);
						if (savedHc) {
							var map = {};
							savedHc.forEach(function (r) { map[r.title] = r.counts || {}; });
							WB_PICK.hc = map; wbPickEmit();
							patch.hc = savedHc; patch.rvOpen = true;
						}
					}
					setL(function (p) { return Object.assign({}, p, patch); });
				}, [client]);
				function hcApplyIgn(next) {
					setL(function (p) {
						try { sessionStorage.setItem("wb_hc_ign_" + client, JSON.stringify(next)); } catch (e) {}
						/* 同步消息流摘要：按忽略后的存活条目重算每篇 counts，写回 WB_PICK.hc 和 sessionStorage */
						var hcArr = p.hc;
						if (hcArr) {
							var map = {};
							hcArr.forEach(function (r) {
								/* 与矩阵格数同口径：hcLive（认全局/篇级/细键）+ 汇总行孤儿隐藏 */
								var live = hcDropOrphanAgg((r.issues || []).filter(function (it) { return hcLive(it, r.title, next); }));
								var c = {};
								live.forEach(function (it) { c[it.level] = (c[it.level] || 0) + 1; });
								r.counts = c;
								map[r.title] = c;
							});
							WB_PICK.hc = map; wbPickEmit();
							hcSave(client, hcArr);
						}
						return Object.assign({}, p, { ign: next });
					});
				}
				function hcToggleIgn(key) {
					if (!key) return;   /* 「另有 N 处同类命中」这类汇总行没有词，不响应单条忽略 */
					var cur = st[0].ign || [];
					hcApplyIgn(cur.indexOf(key) >= 0 ? cur.filter(function (k) { return k !== key; }) : cur.concat([key]));
				}
				/* 一键忽略当前格子的全部明细（不含汇总行） */
				function hcIgnoreAll() {
					var next = (st[0].ign || []).slice();
					cellList.forEach(function (it) {
						var k = hcFineKey(it, hcCell.title);
						if (k && next.indexOf(k) < 0) next.push(k);
					});
					hcApplyIgn(next);
				}
				function openDraft(title) {
					WB_PICK.view = title; wbPickEmit();   // 联动：消息流 chips 高亮正在看的篇
					setL(function (p) { return Object.assign({}, p, { sel: title, body: "加载中…", editing: false, editText: "" }); });
					fetch(WB_API.draft + "?client=" + encodeURIComponent(client) + "&title=" + encodeURIComponent(title), { headers: { accept: "text/markdown" } })
						.then(function (r) { return r.text(); })
						.then(function (text) {
							setL(function (p) { return Object.assign({}, p, { body: text }); });
							setTimeout(function () {
								hcMarkInBody(title, hc);
								if (WB_HC_JUMP) { hcScrollTo(WB_HC_JUMP.word, WB_HC_JUMP.para); WB_HC_JUMP = null; }
							}, 80);
						})
						.catch(function (e) { setL(function (p) { return Object.assign({}, p, { body: "读取失败：" + String(e) }); }); });
				}
				/* 审校面板里直接改草稿（Markdown 源码）。保存走 PUT /api/workbench/draft，
				 * 只写草稿区、不碰正式库；按用户口径「手改的不重跑检查」。 */
				function saveDraft() {
					if (st[0].saving === true) return;
					var text = st[0].editText;
					setL(function (p) { return Object.assign({}, p, { saving: true, msg: "" }); });
					fetch(WB_API.draft, {
						method: "PUT",
						headers: { "content-type": "application/json", accept: "application/json" },
						body: JSON.stringify({ client: client, title: st[0].sel, text: text }),
					})
						.then(function (r) { return r.json(); })
						.then(function (b) {
							if (!b || b.ok !== true) {
								setL(function (p) { return Object.assign({}, p, { saving: false, msg: "保存失败：" + ((b && (b.detail || b.error)) || "未知错误") }); });
								return;
							}
							setL(function (p) { return Object.assign({}, p, { saving: false, editing: false, editText: "", body: text }); });
						})
						.catch(function (e) {
							setL(function (p) { return Object.assign({}, p, { saving: false, msg: "保存失败：" + String(e) }); });
						});
				}
				function cancelEdit() {
					setL(function (p) { return Object.assign({}, p, { editing: false, editText: "", msg: "" }); });
				}
				/* agent 改稿后面板自动跟进（2026-10-12 用户报障：改了标题面板还是旧的）：
				 * writeCount 变化 = 消息流里有新的 write_article 落地 → 重拉当前选中篇的
				 * 正文。只在非编辑态时覆盖 —— 用户正在手改就不打断。 */
				React.useEffect(function () {
					var s = st[0];
					if (s.editing === true || s.sel === "" || client === "") return;
					var alive = true;
					fetch(WB_API.draft + "?client=" + encodeURIComponent(client) + "&title=" + encodeURIComponent(s.sel), { headers: { accept: "text/markdown" } })
						.then(function (r) { return r.text(); })
						.then(function (text) {
							if (!alive) return;
							setL(function (p) {
								if (p.editing === true || p.sel !== s.sel) return p;   /* 状态又变了就不覆盖 */
								return Object.assign({}, p, { body: text });
							});
						})
						.catch(function () { });
					return function () { alive = false; };
				}, [writeCount]);
				function confirmOne(title) {
					return fetch(WB_API.confirmDraft, {
						method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
						body: JSON.stringify({ client: client, title: title }),
					})
						.then(function (r) { return r.json().then(function (b) { return { code: r.status, body: b }; }); })
						.then(function (res) {
							var ok = res.body && res.body.ok === true;
							if (ok || res.code === 409) setL(function (p) {
								var nextD = Object.assign({}, p.done); nextD[title] = true;
								delete WB_PICK.sel[title];
								WB_PICK.done = nextD;
								return Object.assign({}, p, { done: nextD });
							});
							wbPickEmit();
							if (ok) return { state: "ok" };
							if (res.code === 409) return { state: "skip" };
							/* 失败要带真实原因 —— 不许再让所有失败都顶「重名」的帽子（2026-10-10） */
							var why = res.body && (res.body.detail || res.body.error) ? String(res.body.detail || res.body.error) : "HTTP " + res.code;
							return { state: "fail", why: why };
						});
				}
				function confirmTargets(targets, label) {
					var idx2 = 0, okN = 0, skipN = 0, failN = 0, failWhy = "";
					setL(function (p) { return Object.assign({}, p, { msg: (label || "入库") + "中 0/" + targets.length + " …" }) });
					function next() {
						if (idx2 >= targets.length) {
							var m = "已入库 ✓ " + okN + " 篇";
							if (skipN > 0) m += "，跳过 " + skipN + " 篇（正式库已有同名）";
							if (failN > 0) m += "，失败 " + failN + " 篇" + (failWhy !== "" ? "（" + failWhy + "）" : "");
							setL(function (p) { return Object.assign({}, p, { msg: m }) });
							return;
						}
						confirmOne(targets[idx2]).then(function (r3) {
							if (r3 && r3.state === "ok") okN += 1;
							else if (r3 && r3.state === "skip") skipN += 1;
							else { failN += 1; if (r3 && r3.why && failWhy === "") failWhy = r3.why; }
							idx2 += 1;
							setL(function (p) { return Object.assign({}, p, { msg: (label || "入库") + "中 " + idx2 + "/" + targets.length + " …" }) });
							next();
						}).catch(function () { failN += 1; if (failWhy === "") failWhy = "网络错误"; idx2 += 1; next(); });
					}
					next();
				}

				var n = (drafts || []).length;
				var doneCount = drafts ? drafts.filter(function (d) { return doneMap[d.title] === true; }).length : 0;
				var pending = drafts ? drafts.filter(function (d) { return doneMap[d.title] !== true; }) : [];

				if (!client) return h("div", { className: "wb_rvEmpty" }, "没有正在进行的任务 —— 从装配台发起后，这里会自动打开");
				var toggleRv = function () { setL(function (p) { return Object.assign({}, p, { rvOpen: !rvOpen }); }); };
				return h("div", { className: "wb_rv" },
					h("div", { className: "wb_rvHead", onClick: toggleRv, title: rvOpen ? "收起检查详情" : "展开检查详情" },
						h("span", { className: "wb_rvDot" + (doneCount === n && n > 0 ? " is-ok" : "") }, "●"),
						h("span", { className: "wb_rvState" }, doneCount === n && n > 0 ? "已检查" : "未检查"),
						h("span", { className: "wb_rvSel" }, "草稿审核"),
						h("button", {
							type: "button", className: "wb_rvCheck", disabled: checking || drafts === null || drafts.length === 0,
							title: "跑一遍硬检规则（拦/证/提 三档，纯正则零 token）",
							onClick: function (ev) { ev.stopPropagation(); runCheck(); },
						}, checking ? "检查中…" : (hc !== null ? "重新检查" : "开始检查")),
						h("span", { className: "wb_rvChev" + (rvOpen ? " is-open" : "") }, rvOpen ? "▾" : "▸")),
					h("div", { className: "wb_rvProg" },
						h("span", { className: "wb_rvCount" }, "已通过 " + doneCount + " / " + n),
						h("span", { className: "wb_rvHint" }, "确认 = 入库")),
					rvOpen && hcChildren.length > 0
						? h.apply(null, ["div", { className: "wb_hc" }].concat(hcChildren))
						: null,
					msg ? h("div", { className: "wb_reviewMsg" }, msg) : null,
					n === 0
						? h("div", { className: "wb_rvEmpty2" }, drafts === null ? "草稿列表加载中…" : "草稿区是空的 —— agent 写完会出现在这里")
						: h("div", { className: "wb_rvCols" },
							h("div", { className: "wb_reviewList" },
								pending.map(function (d, idx) {
									var picked = checked[d.title] === true;
									return h("div", {
										key: d.title, className: "wb_ri" + (picked ? " picked" : "") + (sel === d.title ? " is-on" : ""),
										onClick: function () { openDraft(d.title); },
										/* 2026-09-26 按用户设计澄清：右栏点条目只负责"看正文 + 知道是几号"，
										 * 勾选只发生在输入框挑篇条 —— 看和选是 1:1 两个独立动作，不联动。 */
									},
										h("span", { className: "wb_riNo" }, String(idx + 1).padStart(2, "0")),
										h("span", { className: "wb_riT" }, d.title));
								})),
							h("div", { className: "wb_reviewMain" },
								sel
									? h("div", { className: "wb_editBar" },
										h("span", { className: "wb_editBarT" }, sel),
										msg ? h("span", { className: "wb_editMsg" }, msg) : null,
										st[0].editing === true
											? h("span", { className: "wb_editOps" },
												h("button", {
													type: "button", className: "wb_editSave",
													disabled: st[0].saving === true,
													onClick: saveDraft,
												}, st[0].saving === true ? "保存中…" : "保存"),
												h("button", {
													type: "button", className: "wb_editCancel",
													onClick: cancelEdit,
												}, "取消"))
											: h("button", {
												type: "button", className: "wb_editBtn",
												title: "直接改这篇的 Markdown 源码，保存写回草稿文件（不重跑检查）",
												onClick: function () {
													setL(function (p) { return Object.assign({}, p, { editing: true, editText: p.body || "", msg: "" }); });
												},
											}, "编辑"))
									: null,
								st[0].editing === true
									? h("textarea", {
										className: "wb_editArea",
										value: st[0].editText,
										spellCheck: false,
										onChange: function (ev) {
											var v = ev.target.value;
											setL(function (p) { return Object.assign({}, p, { editText: v }); });
										},
									})
									: (bodyText && bodyText !== "加载中…"
										? h("div", { className: "wb_reviewText wb_rvMd", dangerouslySetInnerHTML: { __html: wbMdToHtml(bodyText) } })
										: h("div", { className: "wb_reviewText" }, bodyText || "")))),
					n > 0 && doneCount > 0
						? h("div", { className: "wb_rvDoneSeg" },
							h("div", { className: "wb_rvSep" }, "已入库 " + doneCount),
							drafts.filter(function (d) { return doneMap[d.title] === true; }).map(function (d) {
								return h("div", {
									key: d.title, className: "wb_ri done" + (sel === d.title ? " is-on" : ""),
									onClick: function () { openDraft(d.title); },
								},
									h("span", { className: "wb_riNo" }, "🔒"),
									h("span", { className: "wb_riT" }, d.title));
							}))
						: null,
					n > 0
						? h("div", { className: "wb_rvFoot" },
							h("button", {
								type: "button", className: "wb_rvConfirm", disabled: checkedCount === 0 && sel === "",
								onClick: function () {
									var targets = pending.filter(function (d) { return WB_PICK.sel[d.title] === true; }).map(function (d) { return d.title; });
									if (targets.length === 0 && sel !== "") targets = [sel];
									confirmTargets(targets, "入库");
								},
							}, checkedCount > 0 ? "确认入库（" + checkedCount + " 篇）" : "确认入库"),
							h("button", {
								type: "button", className: "wb_rvConfirmAll", disabled: pending.length === 0,
								onClick: function () { confirmTargets(pending.map(function (d) { return d.title; }), "批量入库"); },
							}, "全部确认"))
						: null);
			}

			/* ---- 硬检结果持久化（按客户存 sessionStorage，刷新不丢） ---- */
			var WB_HC_JUMP = null;   // 待正文加载后要定位的命中词
			function hcSave(client, results) {
				try { sessionStorage.setItem("wb_hc_" + client, JSON.stringify({ results: results })); } catch (e) {}
			}
			function hcLoad(client) {
				try {
					var raw = sessionStorage.getItem("wb_hc_" + client);
					if (!raw) return null;
					var o = JSON.parse(raw);
					return (o && o.results) || null;
				} catch (e) { return null; }
			}
			function hcLoadIgn(client) {
				try {
					var raw = sessionStorage.getItem("wb_hc_ign_" + client);
					return raw ? (JSON.parse(raw) || []) : [];
				} catch (e) { return []; }
			}
			/* 在正文容器里给命中词标红（mark.wbHcMk），先清旧标再标新的 */
			function hcMarkInBody(title, hcArr) {
				try {
					var host = document.querySelector(".wb_rvMd");
					if (!host) return;
					host.querySelectorAll("mark.wbHcMk").forEach(function (m) {
						var p = m.parentNode;
						p.replaceChild(document.createTextNode(m.textContent), m);
						p.normalize();
					});
					var rs = null;
					(hcArr || []).forEach(function (r) { if (r.title === title) rs = r; });
					var iss = (rs && rs.issues) || [];
					var words = {};
					iss.forEach(function (i) {
						var m = /「(.+?)」/.exec(String(i.hit || ""));
						if (m && m[1].length > 1) words[m[1]] = true;
					});
					var walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
					var nodes = [], n;
					while ((n = walker.nextNode())) nodes.push(n);
					nodes.forEach(function (node) {
						var txt = node.nodeValue;
						var best = -1, bw = null;
						for (var w in words) {
							var ix = txt.indexOf(w);
							if (ix >= 0 && (best < 0 || ix < best)) { best = ix; bw = w; }
						}
						if (bw === null) return;
						var after = node.splitText(best);
						after.splitText(bw.length);
						var mk = document.createElement("mark");
						mk.className = "wbHcMk";
						mk.textContent = bw;
						after.parentNode.replaceChild(mk, after);
					});
				} catch (e) {}
			}
			function hcScrollTo(word, para) {
				try {
					var host = document.querySelector(".wb_rvMd");
					if (!host) return;
					/* 段号优先：块级 data-seq 与执行器段号同口径，结构类问题没有命中词也能跳 */
					if (para && para > 0) {
						var el = host.querySelector('[data-seq="' + para + '"]');
						if (el) {
							el.scrollIntoView({ behavior: "smooth", block: "center" });
							el.classList.remove("wbMdFlash");
							void el.offsetWidth;
							el.classList.add("wbMdFlash");
							(function (n) { setTimeout(function () { n.classList.remove("wbMdFlash"); }, 1800); })(el);
							return;
						}
					}
					if (!word) return;
					var marks = host.querySelectorAll("mark.wbHcMk");
					for (var i = 0; i < marks.length; i++) {
						if (marks[i].textContent === word) {
							marks[i].scrollIntoView({ behavior: "smooth", block: "center" });
							marks[i].classList.add("flash");
							(function (m2) { setTimeout(function () { m2.classList.remove("flash"); }, 1800); })(marks[i]);
							return;
						}
					}
				} catch (e) {}
			}

			function wbMdToHtml(raw) {
				/* 与硬检执行器同口径：先摘 frontmatter，再按空行切段，段号 data-seq 与检查条目对齐 */
				var text = String(raw || "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
				var esc = text
					.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
				var paras = esc.split(/\n{2,}/);
				var out = [];
				var seq = 0;
				for (var pi = 0; pi < paras.length; pi++) {
					var chunk = paras[pi];
					if (chunk.trim() === "") continue;
					seq++;
					var lines = chunk.split("\n");
					var inner = [];
					var inList = false;
					function closeList() { if (inList) { inner.push("</ul>"); inList = false; } }
					for (var i = 0; i < lines.length; i++) {
						var line = lines[i];
						var bold = line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
						if (/^###\s/.test(bold)) { closeList(); inner.push("<h3>" + bold.replace(/^###\s/, "") + "</h3>"); }
						else if (/^##\s/.test(bold)) { closeList(); inner.push("<h2>" + bold.replace(/^##\s/, "") + "</h2>"); }
						else if (/^#\s/.test(bold)) { closeList(); inner.push("<h1>" + bold.replace(/^#\s/, "") + "</h1>"); }
						else if (/^---+\s*$/.test(bold)) { closeList(); inner.push("<hr>"); }
						else if (/^[-*]\s+/.test(bold)) { if (!inList) { inner.push("<ul>"); inList = true; } inner.push("<li>" + bold.replace(/^[-*]\s+/, "") + "</li>"); }
						else if (bold.trim() === "") { closeList(); }
						else { closeList(); inner.push("<p>" + bold + "</p>"); }
					}
					closeList();
					out.push('<div class="wb-md-p" data-seq="' + seq + '">' + inner.join("") + "</div>");
				}
				return out.join("");
			}

			function TaskBar(props) {
				var sessionId = props.sessionId;
				var useSessions = props.useSessions;
				var useChat = props.useChat;
				var state = React.useState({ status: "idle", meta: null, net: "-" });
				var meta = state[0].meta, net = state[0].net, setState = state[1];
				var title = "";
				if (typeof useSessions === "function" && sessionId !== undefined && sessionId !== null) {
					title = useSessions(function (s) {
						var rec = s && s.byId ? s.byId[sessionId] : null;
						return rec && typeof rec.displayTitle === "string" ? rec.displayTitle : "";
					}) || "";
				}
				/* 任务编号：useChat(s=>s) 拿 snapshot 引用（官方推荐用法，见
				 * dsh-client-ui-chat/lib/types/client/contract/snapshot.d.ts：
				 * ChatSnapshot.legacy.nodes = readonly ConversationNode[]；
				 * UserMessageNode 的文本在顶层 node.content[]），解析放渲染体
				 * 同步做 —— metaId 每次渲染都是真值，effect 链路自然闭合。 */
				var chatSnap = null;
				if (typeof useChat === "function" && sessionId !== undefined && sessionId !== null) {
					chatSnap = useChat(function (s) { return s; });
				}
				var metaId = "";
				var diag = "no-chat";
				var legacyNodes = (chatSnap && chatSnap.legacy && chatSnap.legacy.nodes) || null;
				var list = [];
				if (Array.isArray(legacyNodes)) list = legacyNodes;
				else if (legacyNodes && typeof legacyNodes.values === "function") list = legacyNodes.values();
				else if (legacyNodes && typeof legacyNodes.forEach === "function") { legacyNodes.forEach(function (v) { list.push(v); }); }
				diag = (Array.isArray(legacyNodes) ? "Array" : legacyNodes ? typeof legacyNodes : "null") + "/" + list.length;
				for (var i = 0; i < list.length; i++) {
					var node = list[i];
					if (node && node.kind === "user") {
						diag += " · user@" + i;
						/* 文本在顶层 node.content（records.d.ts: UserMessageNode），node.data 不存在 */
						var content = Array.isArray(node.content) ? node.content
							: (node.data && Array.isArray(node.data.content)) ? node.data.content : null;
						if (!content) { diag += " · content缺"; break; }
						var firstUser = content
							.filter(function (block) { return block && block.type === "text" && typeof block.text === "string"; })
							.map(function (block) { return block.text; })
							.join("");
						diag += " · 文本=" + (firstUser.slice(0, 40).replace(/\n/g, "⏎") || "(空)");
						var match = firstUser.match(/[【\[]任务编号[：:]([a-z0-9-]+)[\]】]/);
						if (match) { metaId = match[1]; diag += " · 命中"; }
						else diag += " · 未命中";
						break;
					}
				}
				React.useEffect(function () {
					if (sessionId === undefined || sessionId === null) return;
					if (metaId === "") { setState({ status: "none", meta: null, net: "-" }); return; }
					var alive = true;
					fetch(WB_API.taskMeta + "?id=" + encodeURIComponent(metaId), { headers: { accept: "application/json" } })
						.then(function (r) {
							var code = String(r.status);
							return r.json().then(function (body) { return { code: code, body: body }; });
						})
						.then(function (res) {
							if (!alive) return;
							if (res.body && (res.body.ok === true || typeof res.body.client === "string")) setState({ status: "ready", meta: res.body, net: res.code });
							else setState({ status: "none", meta: null, net: res.code + ":" + JSON.stringify(res.body).slice(0, 60) });
						})
						.catch(function (e) {
							if (alive) setState({ status: "none", meta: null, net: "fail:" + String(e && e.message ? e.message : e).slice(0, 50) });
						});
					return function () { alive = false; };
				}, [sessionId, metaId]);

				/* 右栏数据一：本会话的子任务（subagent 会话）。selector 只返回
				 * 稳定字符串，避免每次渲染新引用导致无限重渲。 */
				var subsText = "";
				if (typeof useSessions === "function" && sessionId !== undefined && sessionId !== null) {
					subsText = useSessions(function (s) {
						var byId = s && s.byId ? s.byId : {};
						var rows = [];
						Object.keys(byId).forEach(function (id) {
							var rec = byId[id];
							if (rec && rec.parentId === sessionId) {
								rows.push((rec.displayTitle || id) + "｜" + (rec.status || ""));
							}
						});
						return rows.join("§");
					}) || "";
				}
				/* 右栏数据二：产物 / 入库客观状态（宿主按客户目录探测）。 */
				var state2 = React.useState({ ws: null, lib: null });
				var st = state2[0], setSt = state2[1];
				var refreshStatusRef = React.useRef(function () { });
				React.useEffect(function () {
					if (meta === null || typeof meta !== "object" || !meta.client) return;
					var alive = true;
					fetch(WB_API.taskStatus + "?client=" + encodeURIComponent(meta.client) + "&since=" + encodeURIComponent(String(meta.savedAt || "")), { headers: { accept: "application/json" } })
						.then(function (r) { return r.json(); })
						.then(function (body) {
							if (alive && body && body.ok === true) setSt({ ws: body.workspace || null, lib: body.library || null });
						})
						.catch(function () { });
					return function () { alive = false; };
				}, [metaId, meta && meta.client]);
				React.useEffect(function () {
					refreshStatusRef.current = function () {
						if (meta === null || typeof meta !== "object" || !meta.client) return;
						fetch(WB_API.taskStatus + "?client=" + encodeURIComponent(meta.client) + "&since=" + encodeURIComponent(String(meta.savedAt || "")), { headers: { accept: "application/json" } })
							.then(function (r) { return r.json(); })
							.then(function (body) { if (body && body.ok === true) setSt({ ws: body.workspace || null, lib: body.library || null }); })
							.catch(function () { });
					};
				}, [metaId, meta && meta.client]);

				/* 草稿区（write draft:true 落「文章库/<客户>/草稿/」）：待人工确认入库 */
				var state3 = React.useState({ drafts: null });
				var drafts = state3[0].drafts;
				var setRv = state3[1];
				/* 草稿从无到有 → 自动在右侧栏打开"文章审核" tab（每个任务编号只弹一次） */
				var autoRef = React.useRef(null);
				React.useEffect(function () {
					if (drafts === null || drafts.length === 0) return;
					if (autoRef.current === metaId) return;
					var ctrl = WbCtx && WbCtx.sidebarRight;
					if (ctrl && typeof ctrl.openTab === "function") {
						try {
							/* 2026-09-26：openTab 在右栏 surface 未挂载时直接 throw
							 * （sidebarRight: no session surface is mounted）。
							 * 先弹成功、后记号 —— 失败不占位，下一条会话消息再重试；
							 * 以前先记号，agent 写第一篇时弹失败一次就永远不弹了。 */
							ctrl.openTab("wb-review", { params: { client: meta.client, meta: metaId } });
							autoRef.current = metaId;
						}
						catch (e) { console.warn("[dsh-workbench] 打开审核侧栏失败（下条消息重试）：", String(e)); }
					}
				}, [drafts, metaId]);
				React.useEffect(function () {
					if (meta === null || typeof meta !== "object" || !meta.client) return;
					var alive = true;
					fetch(WB_API.drafts + "?client=" + encodeURIComponent(meta.client), { headers: { accept: "application/json" } })
						.then(function (r) { return r.json(); })
						.then(function (b) {
							if (alive && b && b.ok === true) {
								setRv(function (p) { return Object.assign({}, p, { drafts: b.drafts || [] }); });
								/* 与 R 区同口径：本会话 write 过的才算 —— 否则全量覆盖
								 * 会把 R 区过滤好的列表冲掉，chips 序号就和 R 区对不上。 */
								var scope2 = b.drafts || [];
								var wc2 = 0; for (var k2 in writeTitles) wc2++;
								if (wc2 > 0) scope2 = scope2.filter(function (d) { return writeTitles[d.title] === true; });
								else scope2 = [];
								WB_PICK.client = meta.client; WB_PICK.drafts = scope2;
								wbPickEmit();

							}
						})
						.catch(function () { });
					return function () { alive = false; };
				}, [metaId, meta && meta.client, chatSnap]);
				if (meta === null || typeof meta !== "object") {
					return h("div", { className: "wb_task" },
						h("span", { className: "wb_taskTitle" }, title === "" ? "会话" : title),
);
				}

				function presetRow(label, value) {
					if (!value) return null;
					return h("div", { className: "wb_row", key: label },
						h("span", { className: "wb_label" }, label),
						h("span", { className: "wb_value" }, value));
				}
				var clientText = [meta.client, meta.line, meta.period].filter(Boolean).join(" · ");
				var materialText = (meta.refs && meta.refs.urls && meta.refs.urls.length > 0)
					? "参考文章 · " + meta.refs.urls.length + " 篇" + (meta.refs.style ? " · " + meta.refs.style : "")
					: "客户知识库";
				var modeText = meta.mode === "free" ? "输入选题" : meta.mode === "weak" ? "薄弱问句" : (meta.mode || "");
				var typeText = [modeText, (meta.refs && meta.refs.style && meta.refs.urls && meta.refs.urls.length > 0) ? meta.refs.style : ""].filter(Boolean).join(" · ");
				var wsText = (st.ws && st.ws.exists) ? "工作区共 " + st.ws.files + " 个文件" + (st.ws.recent > 0 ? "（本任务新增 " + st.ws.recent + "）" : "") : "暂无";
				var libText = (st.lib && st.lib.exists) ? "文章库共 " + st.lib.files + " 篇" + (st.lib.recent > 0 ? "（本任务新增 " + st.lib.recent + "）" : "") : "暂无";
				var subRows = subsText === "" ? [] : subsText.split("§");
				/* 真进度（2026-09-26 用户指出旧两行是静态假话）：数会话消息流里
				 * 成功落地的 write_article 调用 —— 节点 kind='tool-result'，
				 * call.name 匹配、isError 不为 true 才算数。agent 每写完一篇，
				 * 消息流更新 → 这里跟着变，是真数据不是推导。 */
				var writeDone = 0;
				var writeTitles = {};
				for (var wi = 0; wi < list.length; wi++) {
					var tn = list[wi];
					if (tn && tn.kind === "tool-result" && tn.call
						&& tn.call.name === "mcp__sora-articles__write_article" && tn.isError !== true) {
						writeDone += 1;
						try {
							var targs = JSON.parse(tn.call.argsRaw || "{}");
							var ttitle = String(targs.title || targs.file || "").replace(/\.md$/i, "");
							if (ttitle !== "") writeTitles[ttitle] = true;
						} catch (e) { }
					}
				}
				var skillTotal = (meta.skills || []).length;
				/* 任务清单样式的行：[状态, 文本] —— done=绿勾，run=进行中，wait=待办 */
				var taskRows = [];
				if (writeDone > 0) {
					var scopeTxt = skillTotal > 0 ? writeDone + "/" + skillTotal : String(writeDone);
					var finished = skillTotal > 0 && writeDone >= skillTotal;
					taskRows.push([finished ? "done" : "run",
						(finished ? "草稿已写完：" : "写作中 · 已写 ") + scopeTxt + " 篇（草稿区待审）"]);
				} else if (chatSnap && chatSnap.legacy
					&& (chatSnap.legacy.partial !== null
						|| (chatSnap.legacy.runningCalls && chatSnap.legacy.runningCalls.length > 0))) {
					taskRows.push(["run", "写作中：还没有文章落草稿区"]);
				} else {
					taskRows.push(["wait", "已停止：还没有文章落草稿区（可继续追问让它写）"]);
				}
				/* 入库数按会话归属：本会话 write 过的 title ∩ 正式库清单（st.lib.list）。
				 * 时刻口径会串会话（别的会话晚入库也算进来），文件名交集才是真的。 */
				var libHit = 0;
				var libList = (st.lib && st.lib.list) || [];
				for (var li = 0; li < libList.length; li++) {
					if (writeTitles[String(libList[li]).replace(/\.md$/i, "")] === true) libHit++;
				}
				if (libHit > 0) taskRows.push(["done", "文章已入库：本任务新增 " + libHit + " 篇"]);
				/* 右上任务进程与下方任务清单同源：取消息流里最后一次成功的
				 * todo_write（agent 维护的任务清单，last-write-wins），直接镜像。
				 * 有清单 → 只显示清单（真正同步）；没有 → 保留上面的推导行。 */
				for (var pi = list.length - 1; pi >= 0; pi--) {
					var pn = list[pi];
					if (pn && pn.kind === "tool-result" && pn.call && pn.call.name === "todo_write" && pn.isError !== true) {
						try {
							var pargs = JSON.parse(pn.call.argsRaw || "{}");
							var ptodos = Array.isArray(pargs.todos) ? pargs.todos : null;
							if (ptodos !== null && ptodos.length > 0) {
								taskRows = [];
								for (var pj = 0; pj < ptodos.length; pj++) {
									var pit = ptodos[pj] || {};
									var ptext = String(pit.content || "").trim();
									if (ptext === "") continue;
									var pst = String(pit.status || "pending");
									taskRows.push([pst === "completed" ? "done" : pst === "in_progress" ? "run" : "wait", ptext]);
								}
							}
						} catch (e) { }
						break;   // 只看最后一次 todo_write
					}
				}



				var colL = h("div", { className: "wb_col" },
					h("div", { className: "wb_colTitle" }, "这次发起时的预设"),
					presetRow("客户", clientText),
					presetRow("素材", materialText),
					presetRow("类型", typeText || meta.mode),
					presetRow("要求", meta.base || "（没写补充要求）"),
					presetRow("主题", meta.topic),
					(meta.skills || []).length > 0 ? presetRow("技能", meta.skills.join("、")) : null);
				var colR = h("div", { className: "wb_col wb_colDiv" },
					h("div", { className: "wb_colTitle" },
						"任务进程",
						h("span", { className: "wb_tstat" }, (function () {
							var done = 0;
							for (var k = 0; k < taskRows.length; k++) if (taskRows[k][0] === "done") done++;
							return done + " 完成 · " + (taskRows.length - done) + " 待办";
						})())),
					taskRows.map(function (row) {
						return h("div", { className: "wb_trow", key: row[1] },
							h("span", { className: "wb_ticon", "data-s": row[0] }, row[0] === "done" ? "✓" : row[0] === "run" ? "◷" : "○"),
							h("span", { className: "wb_ttext" }, row[1]));
					}));
				return h("div", { className: "wb_taskbarWrap" },
					h("div", { className: "wb_taskbar" }, colL, colR));
			}

		/* ==================================================================
		 * 装配台
		 * ================================================================== */
		var REF_STYLES = ["一比一", "模仿结构", "其他"];
		var URL_RE = /^(https?:\/\/|www\.)\S+$/i;

		function splitRefs(text) {
			var urls = [];
			var body = [];
			var lines = String(text || "").split("\n");
			for (var i = 0; i < lines.length; i++) {
				var line = lines[i].trim();
				if (line === "") continue;
				if (URL_RE.test(line)) urls.push(line); else body.push(line);
			}
			return { urls: urls, body: body.join("\n") };
		}

		/* 期数属于业务线，不是跟它并列的第三个东西。
		 *
		 * 但库里的数据是混的：`business_line_id` 有值的是挂在这条线下的，
		 * 为 null 的是"没指定线"的（客户级）。严格按线过滤会把没指定线的
		 * 那些全藏起来，所以这里：挂了线的按线过滤，没指定线的照留。 */
		function periodsFor(customer, lineId) {
			var all = (customer && customer.service_periods) || [];
			return all.filter(function (period) {
				var bound = period.business_line_id === null || period.business_line_id === undefined
					? ""
					: String(period.business_line_id);
				if (bound === "") return true;          // 没指定线 —— 客户级，哪条线都看得见
				return bound === String(lineId || "");   // 挂了线 —— 只在那条线下出现
			});
		}

		function firstPeriodId(customer, lineId) {
			var list = periodsFor(customer, lineId);
			return list.length === 0 ? "" : String(list[0].id || "");
		}

		/** 勾中的薄弱问句拼成一段交接文本（客户点「发送」时进任务）。
		 * 上限 20 条 —— 再多模型也吃不下，而且真正要写的就是最薄的那几条。 */
		/** 勾中的薄弱问句拼成交接清单（进装配台预填）。
		 * 只给问句原文、编号列出 —— 差额/平台数据是工作台给人看的，写文章用不上（2026-10-10 定）。
		 * 上限 20 条 —— 再多模型也吃不下。 */
		function weakSelectionText(questions, pickedNames) {
			var wanted = {};
			for (var index = 0; index < pickedNames.length; index++) wanted[pickedNames[index]] = true;
			var bits = [];
			for (var q = 0; q < questions.length && bits.length < 20; q++) {
				var question = questions[q];
				if (wanted[question.question] !== true) continue;
				bits.push(question.question);
			}
			return bits.map(function (name, i) { return (i + 1) + ". " + name; }).join("\n");
		}

		/** 五个 AI 平台的固定列顺序。 */
		var WEAK_PLATFORMS = ["豆包", "DeepSeek", "元宝", "Kimi", "千问"];

		/** 按词根筛出要显示的问句。词根可多选（数组，空 = 全部）；平台筛选 = 决定显示哪几列。 */
		function weakVisible(questions, rootSel) {
			var out = [];
			for (var index = 0; index < questions.length; index++) {
				var question = questions[index];
				if (rootSel.length > 0 && rootSel.indexOf(question.root) < 0) continue;
				out.push(question);
			}
			return out;
		}

		/** 取某个问句在指定平台上的差额；该平台没数据返回 null。 */
		function weakGapOf(question, platformName) {
			for (var index = 0; index < question.platforms.length; index++) {
				if (question.platforms[index].name === platformName) return question.platforms[index].gap;
			}
			return null;
		}

		/** 按列排序。key 是 "summary" 或平台名。null 一律排最后。 */
		function weakSortRows(rows, sort) {
			var key = sort.key;
			var dir = sort.dir;
			return rows.slice().sort(function (a, b) {
				var left = key === "summary" ? a.summary.gap : weakGapOf(a, key);
				var right = key === "summary" ? b.summary.gap : weakGapOf(b, key);
				var ln = left === null || left === undefined;
				var rn = right === null || right === undefined;
				if (ln && rn) return 0;
				if (ln) return 1;
				if (rn) return -1;
				return (left - right) * dir;
			});
		}

		/** 表头：点一下切换排序。 */
		function weakHead(label, key, sort, setSort, extraClass) {
			var on = sort.key === key;
			return h("th", {
				key: "th-" + key,
				className: extraClass || undefined,
				style: { cursor: "pointer", userSelect: "none" },
				title: "点一下排序",
				onClick: function () { setSort({ key: key, dir: on ? -sort.dir : -1 }); },
			}, label + (on ? (sort.dir < 0 ? " ↓" : " ↑") : ""));
		}

		/** 薄弱问句那一格的渲染。 */
		/** 薄弱问句那一格的渲染。rows 由 WorkbenchPage 算好传进来（工作条的「显示 N 条」和它共用一份）。 */
		function renderWeakPane(args) {
			var gaps = args.gaps;
			if (args.entry === null) {
				var sub;
				if (args.dirStatus === "loading") sub = "问一次数据服务的客户目录。";
				else if (args.dirStatus === "error") sub = "刚才没问到客户目录（服务可能短暂不可用）—— 点工作条上的 ⟳ 重试。";
				else if (args.unmapped.indexOf(args.clientName) >= 0) sub = "「" + args.clientName + "」还没配到数据服务的企业 ID。";
				else sub = "数据服务的 45 天窗口内没有「" + args.clientName + "」。";
				return h(Empty, {
					title: args.dirStatus === "loading" ? "正在取可查客户…" : "这个客户还没有薄弱问句数据",
					sub: sub,
				});
			}
			if (gaps.status === "loading") return h(Empty, { title: "取数中…", sub: "" });
			if (gaps.status === "error") return h(Empty, { bad: true, title: "这个客户取不到薄弱问句", sub: weakErrorText(gaps.error, gaps.detail) });
			if (gaps.status !== "ready") return h(Empty, { title: "还没有数据", sub: "" });
			if (gaps.questions.length === 0) return h(Empty, { title: "这一期没有问句", sub: "" });

			var rows = args.rows;
			var shownPlatforms = WEAK_PLATFORMS.filter(function (name) {
				return args.visiblePlatforms.indexOf(name) >= 0;
			});
			var pickedNames = args.weakPicked;
			var allOn = rows.length > 0 && rows.every(function (row) { return pickedNames.indexOf(row.question) >= 0; });

			/* 表头：首格全选；平台/综合可点排序。 */
			var head = h("tr", null,
				h("th", { key: "th-chk" },
					h("input", {
						type: "checkbox", checked: allOn, "aria-label": "全选",
						onChange: function () {
							var names = rows.map(function (row) { return row.question; });
							args.setWeakPicked(allOn
								? pickedNames.filter(function (item) { return names.indexOf(item) < 0; })
								: pickedNames.concat(names.filter(function (item) { return pickedNames.indexOf(item) < 0; })));
							args.setChipOff(false);
						},
					})),
				h("th", { key: "th-root" }, "词根"),
				h("th", { key: "th-q" }, "问句"),
				weakHead("综合", "summary", args.sort, args.setSort),
				shownPlatforms.map(function (name) {
					return weakHead(name, name, args.sort, args.setSort);
				}));

			var body;
			if (rows.length === 0) {
				body = h("tr", null, h("td", { colSpan: 4 + shownPlatforms.length }, h("div", { className: "wb_gapEmpty" }, "没有符合条件的问句。")));
			} else {
				/* 行：点哪都勾；按住往下拖，划过的行跟着第一行同一个动作（原型同款）。 */
				body = rows.map(function (question) {
					var on = pickedNames.indexOf(question.question) >= 0;
					return h("tr", {
						key: question.question,
						className: on ? "on" : undefined,
						onMouseDown: function (e) { args.rowDown(question.question, e); },
						onMouseEnter: function () { args.rowEnter(question.question); },
					},
						h("td", null, h("input", {
							type: "checkbox", checked: on,
							onChange: function (e) {
								e.stopPropagation();
								args.pickSet(question.question, e.target.checked);
								args.setChipOff(false);
							},
						})),
						h("td", { className: "wb_gapRoot" }, question.root || "—"),
						h("td", null, h("div", { className: "wb_gapQ" }, question.question)),
						h("td", null,
							h("span", { className: "wb_gapNum", "data-sign": gapSign(question.summary.gap), title: gapTitle("综合", question.summary.gap) }, gapText(question.summary.gap))),
						shownPlatforms.map(function (name) {
							var gap = weakGapOf(question, name);
							return h("td", { key: name },
								h("span", { className: "wb_gapNum", "data-sign": gapSign(gap), title: gapTitle(name, gap) }, gapText(gap)));
						}));
				});
			}

			return h("div", null,
				h("table", { className: "wb_tbl wb_tblGap", "data-drag": args.dragging ? "1" : "0" },
					h("thead", null, head),
					h("tbody", null, body)));
		}

		function WorkbenchPage(props) {
			var ctx = props.ctx;
			var clients = useClients();
			/* 薄弱问句：目录一次，问句按客户 */
			var weakDir = useWeakDir();

			var modeS = React.useState("weak");
			var mode = modeS[0], setMode = modeS[1];
			var pickS = React.useState({ key: "", line: "", period: "" });
			var pick = pickS[0], setPick = pickS[1];
			var topicS = React.useState("");
			var topic = topicS[0], setTopic = topicS[1];
			var baseS = React.useState("");
			var base = baseS[0], setBase = baseS[1];
			var chipOffS = React.useState(false);
			var chipOff = chipOffS[0], setChipOff = chipOffS[1];

			var refOpenS = React.useState(true);
			var refOpen = refOpenS[0], setRefOpen = refOpenS[1];
			var refTabS = React.useState("copy");
			var refTab = refTabS[0], setRefTab = refTabS[1];
			var refTextS = React.useState("");
			var refText = refTextS[0], setRefText = refTextS[1];
			var refStyleS = React.useState(REF_STYLES[0]);
			var refStyle = refStyleS[0], setRefStyle = refStyleS[1];
			var pickedS = React.useState([]);
			var picked = pickedS[0], setPicked = pickedS[1];
			/* 已选的薄弱问句（按问句原文记），**按客户分开存**（2026-10-10 定）。
			 * 任务永远只发给单个客户，跨客户攒勾选只会制造「这 N 条是谁的」糊涂账 ——
			 * 换客户 = 自动切到那个客户自己的清单；刷新页面不丢。和 `picked`（模板）别混。 */
			var weakPickedS = React.useState(function () {
				try {
					var list = JSON.parse(sessionStorage.getItem(WB_KEY.weakPicked + ":" + pick.key) || "[]");
					return Array.isArray(list) ? list : [];
				} catch (error) { return []; }
			});
			var weakPicked = weakPickedS[0], setWeakPicked = weakPickedS[1];
			/* 换客户：当前清单归还给旧客户，装载新客户的清单。 */
			var weakPickClientRef = React.useRef(pick.key);
			React.useEffect(function () {
				if (weakPickClientRef.current === pick.key) return undefined;
				var prevClient = weakPickClientRef.current;
				weakPickClientRef.current = pick.key;
				try {
					sessionStorage.setItem(WB_KEY.weakPicked + ":" + prevClient, JSON.stringify(weakPicked));
					var list = JSON.parse(sessionStorage.getItem(WB_KEY.weakPicked + ":" + pick.key) || "[]");
					setWeakPicked(Array.isArray(list) ? list : []);
				} catch (error) { /* 隐身模式就算了 */ }
				return undefined;
			}, [pick.key]);
			React.useEffect(function () {
				try { sessionStorage.setItem(WB_KEY.weakPicked + ":" + weakPickClientRef.current, JSON.stringify(weakPicked)); } catch (error) { /* 隐身模式就算了 */ }
			}, [weakPicked]);

			var zoomS = React.useState(false);
			var zoom = zoomS[0], setZoom = zoomS[1];
			/* 本次任务的模型（装配台下拉）：默认 = 宿主 agent-default-model；
			 * 选了 yishan 里的模型就经 PromptRelay 绑给新会话（Key 在服务端）。 */
			var modelS = React.useState(function () {
				try { return sessionStorage.getItem(WB_KEY.modelLast) || "__default__"; }
				catch (error) { return "__default__"; }
			});
			var selModel = modelS[0], setSelModel = modelS[1];
			var modelOpenS = React.useState(false);
			var modelOpen = modelOpenS[0], setModelOpen = modelOpenS[1];
			function pickModel(v) {
				setSelModel(v);
				setModelOpen(false);
				try { localStorage.setItem(WB_KEY.modelLast, v); } catch (error) { /* 隐身模式就算了 */ }
			}
			/* 思考强度：默认 = 跟随模型；选了就随模型一起绑给会话。 */
			var effortS = React.useState(function () {
				try { return localStorage.getItem(WB_KEY.effortLast) || "__default__"; }
				catch (error) { return "__default__"; }
			});
			var selEffort = effortS[0], setSelEffort = effortS[1];
			var effortOpenS = React.useState(false);
			var effortOpen = effortOpenS[0], setEffortOpen = effortOpenS[1];
			function effortLabel(v) {
				if (v === "__default__") return "默认";
				for (var i = 0; i < WB_EFFORTS.length; i++) if (WB_EFFORTS[i].v === v) return WB_EFFORTS[i].label;
				return v;
			}
			function pickEffort(v) {
				setSelEffort(v);
				setEffortOpen(false);
				try { localStorage.setItem(WB_KEY.effortLast, v); } catch (error) { /* 隐身模式就算了 */ }
			}
			/* 薄弱问句：词根筛选（数组，可多选；空 = 全部）。平台筛选改成多选下拉——勾几个平台显示几列。 */
			var rootSelS = React.useState([]);
			var rootSel = rootSelS[0], setRootSel = rootSelS[1];
			/* 平台列显隐（下拉里勾选 = 显示这一列；一个都不勾就只剩「综合」）。 */
			var visiblePlatS = React.useState(WEAK_PLATFORMS.slice());
			var visiblePlatforms = visiblePlatS[0], setVisiblePlatforms = visiblePlatS[1];
			var platOpenS = React.useState(false);
			var platOpen = platOpenS[0], setPlatOpen = platOpenS[1];
			var rootOpenS = React.useState(false);
			var rootOpen = rootOpenS[0], setRootOpen = rootOpenS[1];
			/* 放大看：把工作条+表格整块搬进全屏浮层（原型 ⤢ 同款）。 */
			var weakZoomS = React.useState(false);
			var weakZoom = weakZoomS[0], setWeakZoom = weakZoomS[1];
			/* 发送前确认卡：一道闸管住选错客户/问句/技能/材料（2026-10-10 定）。 */
			var confirmOpenS = React.useState(false);
			var confirmOpen = confirmOpenS[0], setConfirmOpen = confirmOpenS[1];
			React.useEffect(function () {
				if (!confirmOpen) return undefined;
				function onKey(e) { if (e.key === "Escape") setConfirmOpen(false); }
				document.addEventListener("keydown", onKey);
				return function () { document.removeEventListener("keydown", onKey); };
			}, [confirmOpen]);
			/* 排序：默认按汇总，差额大的在前。 */
			var sortS = React.useState({ key: "summary", dir: -1 });
			var sort = sortS[0], setSort = sortS[1];
			var heightS = React.useState(null);
			var workHeight = heightS[0], setWorkHeight = heightS[1];
			var sendingS = React.useState("");
			var sending = sendingS[0], setSending = sendingS[1];

			/* 默认选第一个客户 */
			React.useEffect(function () {
				if (clients.status !== "ready" || clients.customers.length === 0) return;
				var first = clients.customers[0];
				var line = (first.business_lines && first.business_lines[0]) || null;
				setPick({
					key: customerId(first),
					line: line === null ? "" : String(line.id || ""),
					period: firstPeriodId(first, line === null ? "" : String(line.id || "")),
				});
			}, [clients.status, clients.customers]);

			var current = null;
			for (var i = 0; i < clients.customers.length; i++) {
				if (customerId(clients.customers[i]) === pick.key) { current = clients.customers[i]; break; }
			}
			var lines = (current && current.business_lines) || [];
			var periods = periodsFor(current, pick.line);
			var clientName = current ? customerName(current) : "";
			var clientMeta = current ? customerMeta(current) : "";
			var skills = useSkills();
			var articles = useArticles(clientName);

			/* 这个客户在万湖那边能不能查。业务线来自**顶部那个下拉**（pick.line），
			 * ID 绑在业务线上（华熙生物四条线各一个企业）。 */
			var weakEntry = null;
			for (var wi = 0; wi < weakDir.customers.length; wi++) {
				if (String(weakDir.customers[wi].name) === clientName) { weakEntry = weakDir.customers[wi]; break; }
			}
			var weakLines = (weakEntry === null || !Array.isArray(weakEntry.lines)) ? [] : weakEntry.lines;
			/* 单线客户直接用它自己；多线客户必须选到线。 */
			var weakLine = null;
			if (weakEntry !== null) {
				if (weakLines.length === 0) weakLine = weakEntry;
				else {
					for (var wl = 0; wl < weakLines.length; wl++) {
						if (String(weakLines[wl].name) === String(pick.line)) { weakLine = weakLines[wl]; break; }
					}
				}
			}
			var weakClientId = weakLine === null ? "" : String(weakLine.id || "");
			var weakGaps = useWeakGaps(weakClientId, mode === "weak" && weakClientId !== "");
			/* 这一期出现过哪些词根（给下拉用）。 */
			var weakRoots = [];
			for (var wr = 0; wr < weakGaps.questions.length; wr++) {
				var rootName = weakGaps.questions[wr].root;
				if (rootName !== "" && weakRoots.indexOf(rootName) < 0) weakRoots.push(rootName);
			}
			weakRoots.sort();
			var lineName = "";
			for (var li = 0; li < lines.length; li++) if (String(lines[li].id) === pick.line) lineName = String(lines[li].name || "");
			var periodName = "";
			for (var pi = 0; pi < periods.length; pi++) if (String(periods[pi].id) === pick.period) periodName = String(periods[pi].name || "");

			var refs = splitRefs(refText);
			var refCount = refs.urls.length + (refs.body.trim() === "" ? 0 : 1);
			var baseRef = React.useRef(null);
			React.useEffect(function () {
				var node = baseRef.current;
				if (node === null) return;
				node.style.height = "auto";
				var max = zoom ? 520 : 168;
				var min = zoom ? 240 : 64;
				node.style.height = Math.min(max, Math.max(min, node.scrollHeight)) + "px";
				node.style.overflowY = node.scrollHeight > max ? "auto" : "hidden";
			}, [base, zoom]);

			function onClient(event) {
				var key = event.target.value;
				var found = null;
				for (var j = 0; j < clients.customers.length; j++) {
					if (customerId(clients.customers[j]) === key) { found = clients.customers[j]; break; }
				}
				var line = (found && found.business_lines && found.business_lines[0]) || null;
				var lineId = line === null ? "" : String(line.id || "");
				setPick({ key: key, line: lineId, period: firstPeriodId(found, lineId) });
				setChipOff(false);
			}

			/* 换产品线 → 期数跟着重选（期数是线下面的东西，不是并列的） */
			function onLine(event) {
				var lineId = event.target.value;
				setPick({ key: pick.key, line: lineId, period: firstPeriodId(current, lineId) });
				setChipOff(false);
			}

			/* 拼提示词：只写用户真的选了的，没选的不编。 */
			function composePrompt() {
				/* 预填规则（2026-09-23 用户定的粗糙版）：装配台内容从上到下罗列成
				 * 指令式初始上下文，直接可见不隐藏，每条写明"走什么工具"。
				 * 拼装顺序/措辞/隐藏式注入，等整体功能通了再细调。
				 *
				 * 2026-09-29 拍板的方向：下面"行为守则"这类通用规则是**临时放在预填里**
				 * 的 —— 以后做真正的提示词上下文装配时，应整体迁进系统提示词
				 * （preset 层），预填只留任务参数（客户/主题/技能/材料）。 */
				var lines = [];
				var n = 0;
				function step(text) { n += 1; lines.push(n + ". " + text); }

				/* 行为守则先入列（放在任务条目前面，先立规矩再派活）。 */
				lines.push("行为守则（硬规则，违反即返工）：① 前置依赖无法满足时（链接抓不到、知识库缺竞品/客户资料、素材缺失），立即停下报告缺什么、等我决定 —— 不得换技能类型变通，不得编造品牌名/数据/事实，不得跳过依赖硬写。② 给了参考链接就先用 web_fetch 抓正文再动笔；抓取失败立即报告，不要凭域名猜内容。③ 竞品事实只能来自竞品资料，库里没有的就写「待补充」或停下问，不编造。④ 文章写完落草稿后立即停止并汇报草稿清单 —— 不得自行运行任何审核/检查动作，不得宣布「审核通过」「已审完」，审核由我在工作台人工完成（自查结论只能写「待人工审核」）。");
				var lines = [];
				var n = 0;
				function step(text) { n += 1; lines.push(n + ". " + text); }

				var who = "客户：" + (clientName || "（没选客户）");
				if (lineName !== "") who += " · 业务线：" + lineName;
				if (periodName !== "") who += " · 期数：" + periodName;
				step(who + " —— 请调用知识库工具（sora-knowledge）读全知识库再动笔：先 list_kb_files 列文件清单，再逐个 read_kb_file 读完每一份；不要用 read_kb 一把全读（大客户的返回会被截断，截掉的后半段你拿不到），也不要去读「完整内容已存到某文件」之类的提示路径 —— 那些路径你够不着。");

				if (mode === "weak") {
					/* 勾了就把勾中的带进任务；没勾就说清楚没勾 —— 不编主题。
					 * 主题只列问句，不带差额数据；不写任何先后顺序（选题来源无排序语义）。 */
					var pickedText = weakSelectionText(weakGaps.questions, weakPicked);
					if (pickedText !== "") {
						step("主题：写下面这些薄弱问句（共 " + weakPicked.length + " 条，每条一行）——\n" + pickedText + "。\n覆盖要求：产出的全部文章要覆盖以上每一条问句；语义相同或相近的问句可合并成一篇（一篇可覆盖多条），每篇文章覆盖了哪几条要在最后汇总里列出来。我的其他要求与覆盖冲突时，以我的要求为准。");
					} else if (weakGaps.status === "ready") {
						step("主题：从「" + (clientName || "客户") + "」这一期（" + (collectedDay(weakGaps.collectedAt) || "采集日期未知") + "）的薄弱问句里选，共 " + String(weakGaps.questions.length) + " 条 —— 装配台上一条都没勾，请先挑最薄的开写。");
					} else {
						step("主题：这个客户这一期取不到薄弱问句数据，请先按知识库内容判断，或让我补充。");
					}
				} else if (topic.trim() !== "") {
					step("主题：" + topic.trim());
				}

				if (refCount > 0) {
					var bits = [];
					if (refs.urls.length > 0) bits.push("链接：" + refs.urls.join("、"));
					if (refs.body.trim() !== "") bits.push("正文材料：「" + refs.body.trim() + "」");
					step("怎么写：仿写，" + refStyle + "。参考材料 —— " + bits.join("；"));
				}

				if (picked.length > 0) {
					picked.forEach(function (name) {
						step("技能：" + name + " —— 请通过技能工具（skill provider）调用这个 skill，按它的规则写。");
					});
				}

				if (base.trim() !== "") step("补充要求：" + base.trim());

				lines.splice(0, 0, "工具分工（请严格照此使用，不要猜）：客户知识库、文章的读写都走 MCP 工具（mcp__sora-knowledge__*、mcp__sora-articles__*）；只有下面列出的 sora-* 写作技能才走技能工具（skill），其他名字不是技能。新文章用文章库的 write_article 写入，必须带 draft:true（进草稿区等人工确认，不要直接入库；除非用户明确说「直接入库」）。技能正文（get_skill 返回的内容）已包含全部规则和提示词，够你写作使用 —— 不要尝试用 skill 工具读技能的子文件/附属文件（如 xxx/prompts/xxx.md 这种带路径的名字），也不要用其他方式抓取它们。");
				/* lines 里各条已自带序号（step 加的），这里直接拼，别再加一遍（9-23 实测出现 1.1.）。 */
				return "【装配台预填 · 初始上下文】\n" + lines.join("\n");
			}

			async function dispatch() {
				if (clientName === "") return;
				/* C1 数据源：先把装配参数登记到宿主（POST task-meta）拿编号，
				 * 编号追加在预填消息尾部 + 记进 sessionStorage —— 会话页顶部
				 * 的任务条凭编号读回参数。登记失败不挡发送（任务条显示兜底）。 */
				var metaId = "";
				setSending("正在登记任务参数…");
				try {
					var resp = await fetch(WB_API.taskMeta, {
						method: "POST",
						headers: { "content-type": "application/json", accept: "application/json" },
						body: JSON.stringify({
							client: clientName, line: lineName, period: periodName,
							mode: mode, topic: topic,
							refs: { urls: refs.urls, body: refs.body, style: refStyle },
							skills: picked, base: base,
						}),
					});
					var body = await resp.json();
					if (body && body.ok === true && typeof body.id === "string") metaId = body.id;
				} catch (error) { /* 登记失败照常发送，任务条走兜底 */ }
				var text = composePrompt() + (metaId === "" ? "" : "\n\n[任务编号：" + metaId + "]");
				if (metaId !== "") {
					try {
						sessionStorage.setItem(WB_KEY.taskMetaId, metaId);
						sessionStorage.setItem(WB_KEY.pendingMeta, metaId);         // PromptRelay 绑定任务条用
					} catch (error) { /* 隐身模式就算了 */ }
				}
				try {
					sessionStorage.setItem(WB_KEY.pendingClient, clientName);       // 自绘侧栏分组登记用
					/* 主题标签：有主题用主题；薄弱问句模式没填主题就标模式名 */
					var topicLabel = (topic && topic.trim() !== "") ? topic.trim()
						: (mode === "weak" ? "薄弱问句" : "");
					sessionStorage.setItem(WB_KEY.pendingTopic, topicLabel);
				} catch (error) { /* 隐身模式就算了 */ }
				var workspace = ctx !== undefined && ctx !== null && typeof ctx.get === "function" ? ctx.get("uiWorkspace") : undefined;
				if (workspace === undefined || workspace === null || typeof workspace.startSession !== "function") {
					setSending("起不了会话：宿主没有 uiWorkspace");
					return;
				}
				/* 客户分组（2026-09-26 定稿方向）：工作区概念砍掉，所有会话都在同一个
				 * 大工作区；「客户」只是前端展示层的分组（自绘侧栏按客户渲染树）。
				 * 这里保持无参 startSession —— 不按工作区起会话。 */
				pendingPrompt = text;
				/* 模型/思考强度随任务走（PromptRelay 消费）：都没选就什么都不写 = 用宿主默认。 */
				try {
					if (selModel !== "__default__" || selEffort !== "__default__") {
						var mp = String(selModel).split("::");
						var mProv = mp[0], mModel = mp[1];
						if (selModel === "__default__") {
							/* 模型没选、只调了思考：绑到宿主默认模型（agent-default-model） */
							mProv = "deepseek-official"; mModel = "deepseek-flash";
						}
						sessionStorage.setItem(WB_KEY.modelPending, JSON.stringify({
							provider: mProv,
							model: mModel,
							effort: selEffort !== "__default__" ? selEffort : "",
						}));
					}
				} catch (error) { /* 隐身模式就算了，照常用默认模型 */ }
				setSending("");
				/* 直接造一个真实（普通）会话并打开 —— 不再走 startSession()：
				 * 它现在落到「探索未至之境」向导页，那里没有我们的挂载点，
				 * 提示词永远没人消费（2026-10-12 用户报障）。创建失败退回老路径。 */
				var fallbackStart = function () {
					try { workspace.startSession(); } catch (error) {
						pendingPrompt = null;
						setSending("起会话失败：" + String(error && error.message ? error.message : error));
					}
				};
				fetch(WB_API.sessionCreate, { method: "POST" })
					.then(function (r) { return r.json(); })
					.then(function (b) {
						if (!b || b.ok !== true || !b.sessionId) { fallbackStart(); return; }
						try {
							workspace.openSession(b.sessionId);
							/* 会话页渲染是异步的：relay 挂载后 effect 自动消费；
							 * 1.2s 后再敲一次事件兜底渲染竞态。 */
							setTimeout(function () {
								try { window.dispatchEvent(new Event("wb-prompt-set")); } catch (e) { /* 老浏览器就算了 */ }
							}, 1200);
						} catch (error) { fallbackStart(); }
					})
					.catch(fallbackStart);
			}

			/* A4：拖杆改工作区高度。指针捕获，鼠标移出窗口也不会卡住。 */
			function startDrag(event) {
				event.preventDefault();
				var startY = event.clientY;
				var host = document.getElementById("wb-work");
				var startH = host === null ? 200 : host.getBoundingClientRect().height;
				var target = event.currentTarget;
				target.setPointerCapture(event.pointerId);
				target.dataset.drag = "1";
				document.body.setAttribute("data-wb-drag", "1");
				var move = function (moveEvent) {
					/* 拖杆 = 「薄弱问句区」和「怎么写区」的分界线：同时定两区高度，
					 * 补充要求区钉底不动。可用空间 = 装配台高度 - 其余所有块
					 * （头部/主题/拖杆/补充要求）- flex gap；两区按分界线切分。 */
					var asm = host.closest(".wb_asm");
					if (asm === null || asm === undefined) return;
					var refEl = asm.querySelector(".wb_ref");
					var kids = asm.children;
					var sum = 0;
					for (var i = 0; i < kids.length; i++) {
						if (kids[i] === host) continue;
						if (refEl !== null && kids[i] === refEl) continue;
						sum += kids[i].getBoundingClientRect().height;
					}
					sum += Math.max(0, kids.length - 1) * 10;   /* .wb_asm 的 flex gap:10px */
					var avail = Math.max(240, asm.getBoundingClientRect().height - sum - 2);
					var refMin = 120;                            /* 怎么写：标题 + 一行内容 */
					var next = Math.max(120, Math.min(avail - refMin, startH + (moveEvent.clientY - startY)));
					setWorkHeight({ work: next, ref: avail - next });
				};
				var up = function () {
					target.removeEventListener("pointermove", move);
					target.removeEventListener("pointerup", up);
					target.removeEventListener("pointercancel", up);
					target.dataset.drag = "0";
					document.body.removeAttribute("data-wb-drag");
				};
				target.addEventListener("pointermove", move);
				target.addEventListener("pointerup", up);
				target.addEventListener("pointercancel", up);
			}

			/* 薄弱问句当期要显示的行（词根筛选 + 当前排序），工作条统计和表格共用一份。 */
			var weakRows = weakGaps.status === "ready"
				? weakSortRows(weakVisible(weakGaps.questions, rootSel), sort)
				: [];

			/* 薄弱问句勾选：点行、拖行、勾方块、全选，都走这一个入口。 */
			function weakPickSet(name, on) {
				setWeakPicked(function (prev) {
					var has = prev.indexOf(name) >= 0;
					if (on && !has) return prev.concat([name]);
					if (!on && has) return prev.filter(function (item) { return item !== name; });
					return prev;
				});
			}
			var weakDragS = React.useState(false);
			var weakDragging = weakDragS[0], setWeakDragging = weakDragS[1];
			var weakDragTo = React.useRef(null);
			React.useEffect(function () {
				function up() { weakDragTo.current = null; setWeakDragging(false); }
				document.addEventListener("mouseup", up);
				return function () { document.removeEventListener("mouseup", up); };
			}, []);
			/* 按住往下拖 = 连着勾一串（原型同款）；按下 preventDefault 防止拖出选字。 */
			function weakRowDown(name, e) {
				if (e.button !== 0) return;
				if (e.target && e.target.type === "checkbox") return;
				e.preventDefault();
				var on = weakPicked.indexOf(name) < 0;
				weakDragTo.current = on;
				weakPickSet(name, on);
				setWeakDragging(true);
				setChipOff(false);
			}
			function weakRowEnter(name) {
				if (weakDragTo.current === null) return;
				weakPickSet(name, weakDragTo.current);
			}
			/* 「选前10」：一键选定当前排序下最薄的前 10 条；再点一次撤销这 10 条，防误触。 */
			function pickTop10() {
				setWeakPicked(function (prev) {
					var names = weakRows.slice(0, 10).map(function (row) { return row.question; });
					var allIn = names.length > 0 && names.every(function (n) { return prev.indexOf(n) >= 0; });
					if (allIn) return prev.filter(function (item) { return names.indexOf(item) < 0; });
					return prev.concat(names.filter(function (n) { return prev.indexOf(n) < 0; }));
				});
				setChipOff(false);
			}

			/* 工作条：日期 · 平台多选 · 词根 · 勾差额前20 · 统计 · ⟳/⤢。放大时同一份搬进浮层。 */
			var weakBar = h("span", { className: "wb_filters" },
				mode !== "weak"
					? h("span", { className: "wb_weakDate" }, "直接输入选题")
					: [
						h("span", { key: "meta", className: "wb_weakDate" },
							(weakLine === null || !weakLine.collectedAt) ? "最新采集 —"
								: "最新采集 " + collectedDay(weakLine.collectedAt)
									+ (weakGaps.status === "ready" ? " · " + String(weakGaps.questions.length) + " 条" : "")),
						h("span", { key: "plat", className: "wb_fsel" },
							h("button", {
								type: "button",
								title: "勾选要显示的平台列；一个不勾就只看综合",
								onClick: function () { setPlatOpen(!platOpen); },
							}, visiblePlatforms.length === WEAK_PLATFORMS.length ? "全部平台" : "平台 " + visiblePlatforms.length + "/" + WEAK_PLATFORMS.length),
							platOpen ? h("div", { key: "shield", className: "wb_platShield", onMouseDown: function () { setPlatOpen(false); } }) : null,
							platOpen ? h("div", { key: "menu", className: "wb_platMenu" },
								WEAK_PLATFORMS.map(function (name) {
									var on = visiblePlatforms.indexOf(name) >= 0;
									return h("button", {
										key: name, type: "button", className: "wb_platCard", "data-on": on ? "1" : "0",
										onClick: function () {
											setVisiblePlatforms(on
												? visiblePlatforms.filter(function (item) { return item !== name; })
												: visiblePlatforms.concat([name]));
										},
									}, name);
								})) : null),
						h("span", { key: "root", className: "wb_fsel" },
							h("button", {
								type: "button",
								title: "按词根筛选问句；可多选",
								onClick: function () { setRootOpen(!rootOpen); },
							}, rootSel.length === 0 ? "全部词根"
								: rootSel.length === 1 ? rootSel[0]
									: "词根 " + rootSel.length + "/" + weakRoots.length),
							rootOpen ? h("div", { key: "shield", className: "wb_platShield", onMouseDown: function () { setRootOpen(false); } }) : null,
							rootOpen ? h("div", { key: "menu", className: "wb_platMenu" },
								h("button", {
									key: "all", type: "button", className: "wb_platCard", "data-on": rootSel.length === 0 ? "1" : "0",
									onClick: function () { setRootSel([]); },
								}, "全部词根"),
								weakRoots.map(function (root) {
									var on = rootSel.indexOf(root) >= 0;
									return h("button", {
										key: root, type: "button", className: "wb_platCard", "data-on": on ? "1" : "0",
										onClick: function () {
											setRootSel(on
												? rootSel.filter(function (item) { return item !== root; })
												: rootSel.concat([root]));
										},
									}, root);
								})) : null),
						h("button", { key: "top", type: "button", className: "wb_miniBtn", title: "一键选定当前排序下最薄的前 10 条；再点一次撤销", onClick: pickTop10 }, "选前10"),
						h("span", { key: "stat", className: "wb_weakStat" }, "显示 " + String(weakRows.length) + " 条 · 已选定 " + String(weakPicked.length) + " 条"),
						weakGaps.status === "ready" ? h("span", { key: "icons", className: "wb_weakIcons" },
							h("button", {
								type: "button", className: "wb_iconBtn", title: "重新取一次数据",
								onClick: function () { if (typeof weakGaps.refresh === "function") weakGaps.refresh(); },
							}, "⟳"),
							h("button", {
								type: "button", className: "wb_iconBtn", title: weakZoom ? "还原" : "放大看",
								onClick: function () { setWeakZoom(!weakZoom); },
							}, weakZoom ? "⤡" : "⤢")) : null,
					]);

			/* 工作区主体：客户列表挂了给重试；薄弱模式出表；否则自由输入。 */
			var weakBody = clients.status === "error"
				? h("div", null,
					h(Empty, { bad: true, title: "客户列表读不到，装配台就选不了客户", sub: clientsErrorText(clients.error, clients.detail) }),
					h("div", { style: { padding: "0 14px 14px" } },
						h("button", {
							type: "button", className: "wb_mini",
							onClick: function () { if (typeof clients.retry === "function") clients.retry(); },
						}, "重试")))
				: mode === "weak"
					? renderWeakPane({
						clientName: clientName,
						entry: weakEntry,
						dirStatus: weakDir.status,
						unmapped: weakDir.unmapped,
						gaps: weakGaps,
						rows: weakRows,
						visiblePlatforms: visiblePlatforms,
						sort: sort,
						setSort: setSort,
						weakPicked: weakPicked,
						pickSet: weakPickSet,
						rowDown: weakRowDown,
						rowEnter: weakRowEnter,
						setWeakPicked: setWeakPicked,
						setChipOff: setChipOff,
						dragging: weakDragging,
					})
					: h("textarea", {
						className: "wb_free",
						placeholder: "想写什么选题，直接打。",
						value: topic,
						onChange: function (e) { setTopic(e.target.value); setChipOff(false); },
					});

			/* 发送前确认卡的行文案（只罗列装配台真实选了的东西，不编）。 */
			var confirmTopicText = mode === "weak"
				? (weakPicked.length === 0
					? "薄弱问句 · 未选定 —— agent 会从当期自己挑最薄的"
					: "薄弱问句 · 已选定 " + weakPicked.length + " 条：" +
						weakPicked.slice(0, 3).map(function (n) { return n.length > 18 ? n.slice(0, 18) + "…" : n; }).join("；") +
						(weakPicked.length > 3 ? " 等" : ""))
				: (topic.trim() === "" ? "（无主题）" : topic.trim());
			var confirmHowText = refCount === 0
				? "无参考材料"
				: "仿写 · " + refStyle + " · " + (refs.urls.length + (refs.body.trim() === "" ? 0 : 1)) + " 份参考";

			var headHint = clients.status === "loading"				? "知识库：查询中…"
				: clients.status === "error"
					? "知识库：读不到客户"
					: "知识库：" + clients.customers.length + " 个客户"
						+ (articles.status === "ready" ? " · 文章库 " + articles.articles.length + " 篇" : "")
						+ (articles.status === "error" ? " · 文章库读不到" : "");

			var chip = "给 " + (clientName || "（没选客户）")
				+ (lineName === "" ? "" : " · " + lineName)
				+ (periodName === "" ? "" : " · " + periodName)
				+ (mode === "free" && topic.trim() !== "" ? " 写「" + topic.trim().slice(0, 24) + "」" : " 写")
				+ (refCount === 0 ? "" : "，照着 " + refCount + " 篇仿写");

			var refSummary = refCount === 0 ? "" : refCount + " 篇参考 · " + refStyle;

			return h("div", { className: "wb_root" },
				h("div", { className: "wb_asm" },

					/* ---- A1 给谁写 ---- */
					h("div", { className: "wb_head" },
						h("span", { className: "wb_headT" }, "给"),
						h("span", { className: "wb_sel wb_lv1" },
							h("select", {
								value: pick.key, onChange: onClient, "aria-label": "客户",
								disabled: clients.status !== "ready" || clients.customers.length === 0,
							},
								clients.status === "ready" && clients.customers.length === 0
									? h("option", { value: "" }, "（没有可见客户）")
									: clients.customers.map(function (customer) {
										var key = customerId(customer);
										return h("option", { key: key, value: key }, customerName(customer));
									}))),
						clientMeta === "" ? null : h("span", { className: "wb_meta" }, clientMeta),
						h("span", { className: "wb_dot" }, "›"),
						h("span", { className: "wb_sel wb_lv2" },
							h("select", {
								value: pick.line, "aria-label": "产品线", disabled: lines.length === 0,
								onChange: onLine,
							},
								lines.length === 0
									? h("option", { value: "" }, "（无产品线）")
									: lines.map(function (line) {
										var id = String(line.id || "");
										return h("option", { key: id, value: id }, String(line.name || id));
									}))),
						h("span", { className: "wb_dot" }, "›"),
						h("span", { className: "wb_sel wb_lv3" },
							h("select", {
								value: pick.period, "aria-label": "期数", disabled: periods.length === 0,
								onChange: function (e) { setPick({ key: pick.key, line: pick.line, period: e.target.value }); setChipOff(false); },
							},
								periods.length === 0
									? h("option", { value: "" }, "（无期数）")
									: periods.map(function (period) {
										var id = String(period.id || "");
										return h("option", { key: id, value: id }, String(period.name || id));
									}))),
						h("span", { className: "wb_headT" }, "写"),
						h("button", {
							className: "wb_mini", disabled: true,
							title: "新建客户 = 去知识库那边建一个；这一版还没接",
						}, "＋ 新建客户"),
						h("span", { className: "wb_hint" }, headHint)),

					/* ---- A2 主题 ---- */
					h("div", { className: "wb_row" },
						h("span", { className: "wb_cap" }, "主题"),
						h("span", { className: "wb_tabs" },
							h("button", { type: "button", className: "wb_tab", "data-on": mode === "weak" ? "1" : "0", onClick: function () { setMode("weak"); setChipOff(false); setWeakZoom(false); } }, "薄弱问句"),
							h("button", { type: "button", className: "wb_tab", "data-on": mode === "free" ? "1" : "0", onClick: function () { setMode("free"); setChipOff(false); setWeakZoom(false); } }, "输入"))),

					/* ---- A3 工作区（⤢ 放大时整块搬进全屏浮层，工作条/表格复用同一份） ---- */
					(weakZoom && mode === "weak" && weakGaps.status === "ready"
						? h("div", {
							className: "wb_zoomMask",
							onMouseDown: function (e) { if (e.target === e.currentTarget) setWeakZoom(false); },
						},
							h("div", { className: "wb_zoomSheet" },
								h("div", { className: "wb_workBar" }, weakBar),
								h("div", { className: "wb_workBody" }, weakBody)))
						: h("div", { className: "wb_work", id: "wb-work", style: workHeight === null ? undefined : { flex: "0 0 " + workHeight.work + "px" } },
							h("div", { className: "wb_workBar" }, weakBar),
							h("div", { className: "wb_workBody" }, weakBody))),

					/* ---- A4 拖杆 ---- */
					h("div", {
						id: "wb-split", className: "wb_split", title: "拖动调整高度",
						onPointerDown: startDrag, role: "separator", "aria-orientation": "horizontal",
					}),

					/* ---- A5 怎么写 ---- */
					h("div", { className: "wb_ref", "data-open": refOpen ? "1" : "0",
						style: workHeight === null ? undefined : { flex: "0 0 " + workHeight.ref + "px" } },
						h("div", {
							className: "wb_refHd",
							onClick: function () { setRefOpen(!refOpen); },
						},
							h("span", { className: "wb_cap" }, "怎么写"),
							h("span", { className: "wb_chev" }, refOpen ? "▾" : "▸"),
							h("span", { className: "wb_refTabs" },
								h("button", {
									type: "button", className: "wb_refTab", "data-on": refTab === "copy" ? "1" : "0",
									onClick: function (e) { e.stopPropagation(); setRefTab("copy"); setRefOpen(true); },
								}, "仿写" + (refCount === 0 ? "" : " " + refCount)),
								h("button", {
									type: "button", className: "wb_refTab", "data-on": refTab === "skill" ? "1" : "0",
									onClick: function (e) { e.stopPropagation(); setRefTab("skill"); setRefOpen(true); },
								}, "用模板" + (picked.length === 0 ? "" : " " + picked.length))),
							h("span", { className: "wb_refSum" }, refSummary)),
						refOpen ? h("div", { className: "wb_refBd" },
							refTab === "copy"
								? h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
									h("div", { className: "wb_refBox" },
										h("textarea", {
											placeholder: "一行一个链接，或者直接把整篇正文粘进来…",
											value: refText,
											onChange: function (e) { setRefText(e.target.value); },
										}),
										h("div", { className: "wb_ribBar" },
											h("button", { className: "wb_mini", disabled: true, title: "附件还没接" }, "选文件"))),
									refs.urls.length > 0 || refs.body.trim() !== ""
										? h("div", { className: "wb_refList" },
											refs.urls.map(function (url, index) {
												return h("div", { className: "wb_refItem", key: "u" + index },
													h("span", { className: "wb_refK" }, "链接"),
													h("span", { className: "wb_refV" }, url),
													h("button", {
														type: "button", className: "wb_refX", title: "去掉",
														onClick: function () {
															var next = refs.urls.filter(function (_, i) { return i !== index; });
															setRefText(next.concat(refs.body === "" ? [] : [refs.body]).join("\n"));
														},
													}, "×"));
											}),
											refs.body.trim() === "" ? null : h("div", { className: "wb_refItem" },
												h("span", { className: "wb_refK" }, "正文"),
												h("span", { className: "wb_refV" }, refs.body.replace(/\s/g, "").length + " 字"),
												h("button", {
													type: "button", className: "wb_refX", title: "去掉",
													onClick: function () { setRefText(refs.urls.join("\n")); },
												}, "×")))
										: null,
									h("span", { className: "wb_seg" },
										REF_STYLES.map(function (style) {
											return h("button", {
												type: "button", key: style, className: "wb_segB", "data-on": refStyle === style ? "1" : "0",
												onClick: function () { setRefStyle(style); },
											}, style);
										})))
								: h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
									skills.status === "error"
										? h("div", { className: "wb_skEmpty" }, skillsErrorText(skills.error, skills.detail))
										: skills.status === "loading"
											? h("div", { className: "wb_skEmpty" }, "技能目录读取中…")
											: skills.skills.length === 0
												? h("div", { className: "wb_skEmpty" }, "技能服务是空的 —— 一个 skill 都没注册")
										: (function () {
											/* 技能三层（2026-09-23，配合 skill-remote 分层）：个人层 → 个人中间层 → 公共层，
											 没带层的归「其他」。顺序按使用频率排：自己的最常用，放最前。 */
											var LAYER_ORDER = ["personal", "middle", "public"];
											var LAYER_LABELS = { "personal": "个人层", "middle": "个人中间层", "public": "公共层" };
											function normalizeLayer(raw) {
												if (raw === "personal" || raw === "个人") return "personal";
												if (raw === "middle" || raw === "_middle" || raw.indexOf("中") >= 0) return "middle";
												if (raw === "public" || raw === "公共") return "public";
												return "other";
											}
																						var buckets = { other: [] };
											LAYER_ORDER.forEach(function (key) { buckets[key] = []; });
											skills.skills.forEach(function (skill) {
												var key = normalizeLayer(skill.layer);
												buckets[key].push(skill);
											});
											return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
												LAYER_ORDER.concat(["other"]).filter(function (key) { return buckets[key].length > 0; })
													.map(function (key) {
														return h("div", { className: "wb_skGroup", key: key },
															h("div", { className: "wb_skCap" },
																(LAYER_LABELS[key] || "其他技能") + " · " + buckets[key].length + " 个"),
															h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
																buckets[key].map(function (skill) {
																	var on = picked.indexOf(skill.name) >= 0;
																	return h("button", {
																		type: "button", key: skill.name,
																		className: "wb_chipBtn", "data-on": on ? "1" : "0",
																		title: skill.description + (skill.whenToUse === "" ? "" : "\n" + skill.whenToUse),
																		onClick: function () {
																			setPicked(on
																				? picked.filter(function (n) { return n !== skill.name; })
																				: picked.concat([skill.name]));
																			setChipOff(false);
																		},
																	}, (on ? "✓ " : "") + skill.name);
																})));
													}));
										}()))) : null),

					/* ---- A6 底座 + A7 放大 ---- */
					h("div", { className: "wb_base", "data-zoom": zoom ? "1" : "0" },
						h("div", { className: "wb_box" },
							h("textarea", {
								ref: baseRef, className: "wb_input", rows: 1,
								placeholder: "补充要求（选填）…",
								value: base,
								onChange: function (e) { setBase(e.target.value); setChipOff(false); },
							}),
							h("button", {
								type: "button", className: "wb_zoom", title: zoom ? "收起" : "放大编辑",
								onClick: function () { setZoom(!zoom); },
							}, "⤢ " + (zoom ? "收起" : "放大")),
							h("div", { className: "wb_actions" },
								chipOff || clientName === "" ? null : h("span", { className: "wb_chip" },
									h("span", null, chip),
									h("button", {
										type: "button", className: "wb_chipX", title: "去掉",
										onClick: function () { setChipOff(true); },
									}, "×")),
								h("span", { key: "effort", className: "wb_fsel", style: { marginLeft: "auto" } },
									h("button", {
										type: "button", className: "wb_modelSel", "data-on": selEffort !== "__default__" ? "1" : "0",
										title: "思考强度：越高越细但越慢（模型不支持时由宿主兜底）",
										onClick: function () { setEffortOpen(!effortOpen); setModelOpen(false); },
									}, "思考：" + effortLabel(selEffort) + " ▾"),
									effortOpen ? h("div", { key: "shield", className: "wb_platShield", onMouseDown: function () { setEffortOpen(false); } }) : null,
									effortOpen ? h("div", { key: "menu", className: "wb_modelMenu" },
										h("button", {
											type: "button", className: "wb_modelItem", "data-on": selEffort === "__default__" ? "1" : "0",
											onClick: function () { pickEffort("__default__"); },
										}, "默认", selEffort === "__default__" ? h("span", { className: "wb_mk" }, "✓") : null),
										WB_EFFORTS.map(function (ef) {
											var on = selEffort === ef.v;
											return h("button", {
												key: ef.v, type: "button", className: "wb_modelItem", "data-on": on ? "1" : "0",
												onClick: function () { pickEffort(ef.v); },
											}, ef.label, on ? h("span", { className: "wb_mk" }, "✓") : null);
										})) : null),
								h("span", { key: "model", className: "wb_fsel" },
									h("button", {
										type: "button", className: "wb_modelSel", "data-on": selModel !== "__default__" ? "1" : "0",
										title: "本次任务用的模型（Key 在服务端，这里只选名字）",
										onClick: function () { setModelOpen(!modelOpen); },
									}, (selModel === "__default__" ? "模型：默认" : String(selModel).split("::")[1]) + " ▾"),
									modelOpen ? h("div", { key: "shield", className: "wb_platShield", onMouseDown: function () { setModelOpen(false); } }) : null,
									modelOpen ? h("div", { key: "menu", className: "wb_modelMenu" },
										h("button", {
											type: "button", className: "wb_modelItem", "data-on": selModel === "__default__" ? "1" : "0",
											onClick: function () { pickModel("__default__"); },
										}, "模型：默认", selModel === "__default__" ? h("span", { className: "wb_mk" }, "✓") : null),
										h("div", { className: "wb_modelGroup" }, "yishan"),
										WB_MODELS.map(function (m) {
											var val = m.provider + "::" + m.model;
											var on = selModel === val;
											return h("button", {
												key: val, type: "button", className: "wb_modelItem", "data-on": on ? "1" : "0",
												onClick: function () { pickModel(val); },
											}, m.model, on ? h("span", { className: "wb_mk" }, "✓") : null);
										})) : null),
								h("button", {
									type: "button", className: "wb_go",
									disabled: clientName === "" || sending !== "",
									title: "发送",
									onClick: function () { setConfirmOpen(true); },
								}, "↑"))),
						sending === "" ? null : h("div", { className: "wb_emptyS wb_bad" }, sending))),

					/* ---- 发送前确认卡：一道闸管住选错客户/问句/技能/材料 ---- */
					confirmOpen ? h("div", {
						className: "wb_confirmMask",
						onMouseDown: function (e) { if (e.target === e.currentTarget) setConfirmOpen(false); },
					},
						h("div", { className: "wb_confirmCard" },
							h("div", { className: "wb_cardHd" }, "确认发送"),
							h("div", { className: "wb_cardBody" },
								h("div", { className: "wb_cRow" },
									h("span", { className: "wb_cKey" }, "给谁写"),
									h("span", { className: "wb_cVal" },
										clientName + (clientMeta === "" ? "" : "（" + clientMeta + "）")
											+ (lineName === "" ? "" : " · " + lineName)
											+ (periodName === "" ? "" : " · " + periodName))),
								h("div", { className: "wb_cRow" },
									h("span", { className: "wb_cKey" }, "主题"),
									h("span", { className: "wb_cVal" }, confirmTopicText)),
								h("div", { className: "wb_cRow" },
									h("span", { className: "wb_cKey" }, "怎么写"),
									h("span", { className: "wb_cVal" }, confirmHowText)),
								h("div", { className: "wb_cRow" },
									h("span", { className: "wb_cKey" }, "技能"),
									h("span", { className: "wb_cVal" }, picked.length === 0 ? "（未选）" : picked.join("、"))),
								h("div", { className: "wb_cRow" },
									h("span", { className: "wb_cKey" }, "模型"),
									h("span", { className: "wb_cVal" },
										(selModel === "__default__" ? "默认（deepseek-flash）" : String(selModel).split("::")[1])
											+ (selEffort === "__default__" ? "" : " · 思考" + effortLabel(selEffort)))),
								h("div", { className: "wb_cRow" },
									h("span", { className: "wb_cKey" }, "补充"),
									h("span", { className: "wb_cVal" }, base.trim() === "" ? "（无）" : base.trim()))),
							h("div", { className: "wb_cardFt" },
								h("button", {
									type: "button", className: "wb_mini",
									onClick: function () { setConfirmOpen(false); },
								}, "返回修改"),
								h("button", {
									type: "button", className: "wb_send",
									disabled: sending !== "",
									onClick: function () { setConfirmOpen(false); dispatch(); },
								}, "确认发送"))))
						: null);
		}

		/* ---- wiring ------------------------------------------------------- */
		function apply(ctx, config) {
			WbCtx = ctx;
			/* 注意：**不要**在这里注册 locale。`sidebar` 命名空间是官方
			 * dsh-client-ui-sidebar 的单一占用者，我们再去 register 会把
			 * 官方侧边栏插件整个炸掉（"locale namespace sidebar already
			 * has locale zh"，9-23 实测）。文案覆盖不值得这个代价。 */
			var style = injectStyles();
			if (style !== null && ctx && typeof ctx.effect === "function") {
				ctx.effect(function () { return function () {
					if (style.parentNode !== null) style.parentNode.removeChild(style);
				}; }, "dsh-workbench: remove the workbench stylesheet");
			}

			/* ---- 面板接线（2026-09-23 按用户产品决策定稿）--------------------
			 * 这个 DSH 是「生文 Agent」产品本体，不是通用聊天工具：
			 * 打开就落在装配台（发起任务），装配台发送 → 进入会话写正文。
			 * 「新会话」按钮（无参 startSession）落在默认工作区的空白会话；
			 * 按钮级劫持成装配台需要更深的 hero/侧栏改造，列为下一步。 */
			ctx.slots.inject("main", function () {
				return ctx.slots.register({ name: "main", key: WORKBENCH_KEY }, function () {
					return h(WorkbenchPage, { ctx: ctx });
				});
			});
			ctx.slots.inject("sidebar.panellist", function () {
				return ctx.slots.register({
					name: "sidebar.panellist",
					id: WORKBENCH_KEY,
					label: "发起任务",
					order: 20,
				}, WorkbenchIcon);
			});

			/* ---- 没收设置入口（2026-09-23 用户决策）--------------------------
			 * 产品形态：使用者只写文章，不做任何配置。`sidebar.settings` 是
			 * single 槽 —— 注册空组件即整体替换官方设置按钮。设置弹窗随之
			 * 永远打不开（模型由管理员在服务器后台配置，域名访问本就锁着）。 */
			/* ---- R 区：右侧栏"文章审核" tab（2026-09-24）--------------------
			 * stage1：向 tab 注册表声明类型（分页型，不带资源地址）；
			 * stage2：`sidebar.right.pane.tab`/`.title` 槽按 id 给 body 和 chip。
			 * TaskBar 探测到草稿从无到有时 openTab 自动展开右侧栏。 */
			try {
				ctx.sidebarRightTabs.register({
					id: "workbench-article-review",
					kind: "wb-review",
					title: function () { return "文章审核"; },
				});
			} catch (e) { console.warn("[dsh-workbench] tab 类型注册失败：", String(e)); }
			ctx.slots.inject("sidebar.right.pane.tab", function () {
				return ctx.slots.register({
					name: "sidebar.right.pane.tab",
					key: "workbench-article-review",
				}, ReviewTabBody);
			});
			ctx.slots.inject("sidebar.right.pane.tab.title", function () {
				return ctx.slots.register({
					name: "sidebar.right.pane.tab.title",
					key: "workbench-article-review",
				}, function () { return "文章审核"; });
			});

			/* C1 顶部任务条：替换会话头部（single 槽）。 */
			/* header 槽官方已占 priority 0 —— 显式用 -1（更低者渲染）遮蔽它，
			 * 否则官方插件 apply 时撞车报错（9-23 实测）。 */
			ctx.slots.inject("conversation.session.header", function () {
				return ctx.slots.register({
					name: "conversation.session.header",
					id: "workbench-task-bar",
					priority: -1,
				}, TaskBar);
			});

			ctx.slots.inject("sidebar.settings", function () {
				return ctx.slots.register({
					name: "sidebar.settings",
					id: "workbench-no-settings",
					priority: -1,   /* 单槽：最低优先渲染。priority 0 已被其他插件占用，
					                   * 撞号会抛异常并中断整个 stage2 注册链（右栏 tab 全没）。 */
				}, function () { return null; });
			});

			/* 会话域的接力挂件 —— 装配台发出去的那句话靠它落地。
			 * 挂两个点，因为新会话有两个形态：
			 *   - conversation.composer.dock：正式会话态才有；
			 *   - conversation.input.dock：空白态（hero）也渲染。
			 * 装配台发送 → startSession 打开空白会话 → 先落在空白态 →
			 * 只有 input.dock 上的挂件在场，由它消费提示词发出第一条消息。
			 * 消费即清空 pendingPrompt，两个挂件不会双发。 */
			ctx.slots.inject("conversation.composer.dock", function () {
				return ctx.slots.register({
					name: "conversation.composer.dock",
					id: "workbench-prompt-relay",
					order: 90,
				}, function (props) { return h(PromptRelay, Object.assign({}, props, { wbCtx: ctx })); });
			});
			ctx.slots.inject("conversation.input.dock", function () {
				return ctx.slots.register({
					name: "conversation.input.dock",
					id: "workbench-prompt-relay-hero",
					order: 90,
				}, function (props) { return h(PromptRelay, Object.assign({}, props, { wbCtx: ctx })); });
			});
			ctx.slots.inject("conversation.input.dock", function () {
				return ctx.slots.register({
					name: "conversation.input.dock",
					id: "workbench-pick-bar",
					order: 85,
				}, PickBar);
			});
			ctx.slots.inject("shell.overlay", function () {
				return ctx.slots.register({
					name: "shell.overlay",
					id: "workbench-sidebar-nav",
					order: 5,
				}, function (props) {
					return h(SidebarNav, Object.assign({}, props, { wbCtx: ctx }));
				});
			});

			/* 进来就落在装配台。布局自己的初始选择在我们后面才落定，所以延后。 */
			var defaultPanel = (config !== null && typeof config === "object"
				&& typeof config.defaultPanel === "string") ? config.defaultPanel : WORKBENCH_KEY;
			if (defaultPanel !== "") {
				var select = function () {
					try {
						ctx.layout.selectPanel(defaultPanel);
					} catch (error) {
						console.warn("[dsh-workbench] 没落到默认面板：", String(error && error.message ? error.message : error));
					}
				};
				setTimeout(select, 250);
				setTimeout(select, 900);
			}
		}

		exports.inject = ["slots", "layout", "sidebarRight", "sidebarRightTabs", "sessions"];
		exports.apply = apply;
		return module.exports;
	}
});
