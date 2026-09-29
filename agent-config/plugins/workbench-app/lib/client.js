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
		 *    + Noah 同构 `shell.overlay` 左栏。root / conversation / composer 仍不碰原生行为。
		 *    WB-SUP P1：正式绑定索引仍保留；左树用 overlay 呈现客户分组，
		 *    仍禁止用脆弱的 hash 类名刮官方 DOM。
		 *
		 * 类名全是自己的 `wb_` 前缀：CSS 是手写的（本包没有 tsdown 构建，
		 * 没有 class-name hashing 可依赖），所以也绝不写指向别人 hash 类名的选择器。
		 *
		 * 令牌照搬 workbench/原型v2暂定版/styles.css:8-80。
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
			"}",
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
			"  --dsh-chat-content-width:var(--wb-content);",
			"  background:var(--wb-bg); color:var(--wb-text); font-family:var(--wb-font);",
			"}",
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

			/* A3 工作区 */
			".wb_work{",
			"  flex:1 1 0; min-height:120px; display:flex; flex-direction:column;",
			"  border:1px solid var(--wb-line); border-radius:var(--wb-r); background:var(--wb-elev);",
			"  box-shadow:var(--wb-shadow); overflow:hidden;",
			"}",
			".wb_workBar{",
			"  flex:0 0 auto; display:flex; align-items:center; gap:8px; padding:8px 10px;",
			"  border-bottom:1px solid var(--wb-line-soft); background:var(--wb-side);",
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
			"  flex:0 1 auto; min-height:0; display:flex; flex-direction:column;",
			"  border:1px solid var(--wb-line); border-radius:var(--wb-r); background:var(--wb-elev);",
			"  box-shadow:var(--wb-shadow); overflow:hidden;",
			"}",
			".wb_ref[data-open='1']{flex:1 1 0;}",
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
			".wb_nv{position:fixed;left:0;top:0;bottom:0;width:248px;background:#f9fafb;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;padding:12px 10px;gap:8px;z-index:40;}",
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
			".wb_nvFoot{margin-top:auto;padding:8px 6px 4px;border-top:1px solid #e5e7eb;display:flex;flex-direction:column;gap:2px;flex:0 0 auto;}",
			".wb_nvFootName{font-size:13px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
			".wb_nvFootSub{font-size:11px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",

			/* 挑篇条（原型 pick-row）：改哪几篇 + 编号格子 + 全选 + 红绿点（机器检查未接，置灰） */
			".wb_pkRow{display:flex;align-items:center;gap:8px;margin:0 16px -7px;padding:8px 16px 10px;border:1px solid #e5e7eb;border-bottom:none;border-radius:14px 14px 0 0;background:#fff;position:relative;z-index:1;box-shadow:0 -1px 2px rgba(16,24,40,.03);}",
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
			".wb_rvCheck{margin-left:auto;border:1px solid #e5e7eb;background:#fff;border-radius:7px;padding:3px 10px;font-size:11px;cursor:pointer;}",
			".wb_rvCheck:disabled{opacity:.5;cursor:default;}",
			".wb_rvProg{display:flex;justify-content:space-between;align-items:center;padding:5px 12px;font-size:11px;color:#6b7280;border-bottom:1px solid #eef0f3;}",
			".wb_rvCount{color:#374151;font-weight:600;}",
			".wb_rv .wb_reviewMain{flex:1 1 0;min-width:0;min-height:0;overflow-y:auto;display:flex;flex-direction:column;padding:0 14px;background:#fff;}",
			".wb_rvHint{color:#9ca3af;}",
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

			/* ---- 客户项目分组（WB-SUP P1 左栏/注入面板） ---------------- */
			".wb_cg{",
			"  box-sizing:border-box; display:flex; flex-direction:column; height:100%; min-height:0;",
			"  background:var(--wb-side); color:var(--wb-text); font:13px/1.5 var(--wb-font); padding:10px 8px 16px;",
			"}",
			".wb_cg *{box-sizing:border-box;}",
			".wb_cgHd{display:flex; align-items:baseline; gap:8px; padding:4px 8px 10px;}",
			".wb_cgTitle{font-size:13px; font-weight:600; color:var(--wb-strong);}",
			".wb_cgHint{font-size:11px; color:var(--wb-dim2); margin-left:auto;}",
			".wb_cgList{flex:1; min-height:0; overflow:auto; display:flex; flex-direction:column; gap:4px;}",
			".wb_cgGroup{border:1px solid var(--wb-line-soft); border-radius:8px; background:var(--wb-elev); overflow:hidden;}",
			".wb_cgGroup[data-open='0'] .wb_cgBody{display:none;}",
			".wb_cgGHd{",
			"  display:flex; align-items:center; gap:6px; width:100%; padding:8px 10px; border:none;",
			"  background:transparent; color:inherit; text-align:left; cursor:pointer;",
			"}",
			".wb_cgGHd:hover{background:var(--wb-elev2);}",
			".wb_cgGName{font-weight:600; font-size:13px; color:var(--wb-strong); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}",
			".wb_cgGKey{font-size:10.5px; color:var(--wb-dim2); font-family:var(--wb-mono);}",
			".wb_cgGCnt{margin-left:auto; font-size:11px; color:var(--wb-dim2);}",
			".wb_cgBody{padding:0 6px 8px; display:flex; flex-direction:column; gap:2px;}",
			".wb_cgSess{",
			"  display:flex; align-items:center; gap:6px; width:100%; padding:6px 8px; border:none;",
			"  border-radius:6px; background:transparent; color:inherit; text-align:left; cursor:pointer; font-size:12.5px;",
			"}",
			".wb_cgSess:hover{background:var(--wb-accent-bg); color:var(--wb-accent);}",
			".wb_cgSessMeta{font-size:10.5px; color:var(--wb-dim2); margin-left:auto; white-space:nowrap;}",
			".wb_cgEmpty{padding:8px 10px; font-size:11.5px; color:var(--wb-dim2);}",
			".wb_cgNew{",
			"  margin:4px 4px 0; padding:5px 8px; border:1px dashed var(--wb-accent-line); border-radius:6px;",
			"  background:var(--wb-accent-bg); color:var(--wb-accent); font-size:12px; cursor:pointer;",
			"}",
			".wb_cgNew:hover{border-style:solid;}",
			".wb_cgNote{padding:10px 8px 0; font-size:11px; color:var(--wb-dim2); line-height:1.6;}",


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

		/* Noah UI API/key registries. P1/P2 routes remain the formal source of truth. */
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
			sessionClient: "/api/workbench/session-client",
		};
		var WB_KEY = {
			pendingMeta: "wb-pending-meta",
			pendingClient: "wb-pending-client",
			pendingTopic: "wb-pending-topic",
			taskMetaId: "wb-task-meta-id",
			metaFor: "wb-meta-for-",
			navW: "wb-nav-w",
			rightbarW: "wb-rightbar-w",
		};
		var CLIENT_PROJECTS_KEY = "workbench-clients";

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

		/* ==================================================================
		 * 客户 = 知识库。打开查一次，本次会话内复用；权限在服务端过滤，
		 * 前端不判权限、也拿不到别人客户的名单。
		 * ================================================================== */
		var CLIENTS_PATH = "/api/workbench/clients";

		function useClients() {
			var state = React.useState({ status: "loading", customers: [], error: "", detail: "", uid: "" });
			var setValue = state[1];
			React.useEffect(function () {
				var alive = true;
				fetch(CLIENTS_PATH, { headers: { accept: "application/json" } })
					.then(readJson)
					.then(function (body) {
						if (!alive) return;
						if (body && body.ok === true) {
							setValue({ status: "ready", customers: body.customers || [], error: "", detail: "", uid: body.uid || "" });
						} else {
							setValue({
								status: "error", customers: [],
								error: (body && body.error) || "unknown",
								detail: (body && body.detail) || "",
								uid: (body && body.uid) || "",
							});
						}
					})
					.catch(function (error) {
						if (!alive) return;
						setValue({ status: "error", customers: [], error: "unreachable", detail: String(error && error.message ? error.message : error), uid: "" });
					});
				return function () { alive = false; };
			}, []);
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
				fetch("/api/workbench/skills", { headers: { accept: "application/json" } })
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
				fetch("/api/workbench/articles?client=" + encodeURIComponent(client), { headers: { accept: "application/json" } })
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

		/* 装配台 POST /api/workbench/task-meta 的 body。稳定键 client_key + 显示名 client。
		 * 抽成纯函数方便离线快照自检（无 DOM）。 */
		function buildTaskMetaPayload(opts) {
			opts = opts || {};
			return {
				client_key: String(opts.client_key || ""),
				client: String(opts.client || ""),
				line: String(opts.line || ""),
				period: String(opts.period || ""),
				mode: opts.mode,
				topic: opts.topic,
				refs: opts.refs,
				skills: opts.skills,
				base: opts.base,
			};
		}

		function bindSessionClient(sessionId, bind) {
			if (!sessionId || !bind) return;
			fetch("/api/workbench/session-client", {
				method: "POST",
				headers: { "content-type": "application/json", accept: "application/json" },
				body: JSON.stringify({
					session_id: sessionId,
					client_key: bind.client_key || "",
					client: bind.client || "",
					meta_id: bind.meta_id || "",
					topic: bind.topic || "",
				}),
			})
				.then(function (r) { return r.json().catch(function () { return {}; }); })
				.then(function (body) {
					if (!body || body.ok !== true) {
						console.warn("[dsh-workbench] session-client 绑定未成功：", body && (body.error || body.detail) || "unknown");
						return;
					}
					/* Noah 兼容登记：保留 topic，旧壳/左树也能读到。 */
					fetch(WB_API.assignGroup, {
						method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
						body: JSON.stringify({ session: sessionId, client: bind.client || "", client_key: bind.client_key || "", topic: bind.topic || "", meta_id: bind.meta_id || "" }),
					}).catch(function () { });
					try { window.dispatchEvent(new Event("wb-session-bound")); } catch (e) { /* */ }
				})
				.catch(function (e) {
					console.warn("[dsh-workbench] session-client 绑定失败（会话暂进未归类）：", String(e && e.message ? e.message : e));
				});
		}

		function openSessionBestEffort(ctx, sessionId) {
			if (!sessionId) return false;
			var workspace = ctx && typeof ctx.get === "function" ? ctx.get("uiWorkspace") : null;
			if (workspace) {
				var methods = ["openSession", "selectSession", "focusSession", "activateSession"];
				for (var i = 0; i < methods.length; i++) {
					if (typeof workspace[methods[i]] === "function") {
						try { workspace[methods[i]](sessionId); return true; } catch (e) { /* try next */ }
					}
				}
			}
			console.warn("[dsh-workbench] 无法打开会话 " + sessionId + "：宿主未暴露 openSession/selectSession");
			return false;
		}

		function goAssembleWithClient(ctx, clientKey) {
			try { sessionStorage.setItem("wb-preselect-client", String(clientKey || "")); } catch (e) { /* */ }
			try { window.dispatchEvent(new CustomEvent("wb-client-select", { detail: { key: String(clientKey || "") } })); } catch (e) { /* */ }
			if (ctx && ctx.layout && typeof ctx.layout.selectPanel === "function") {
				try { ctx.layout.selectPanel(WORKBENCH_KEY); } catch (e) { /* */ }
			}
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
				/* 把任务参数编号绑定到这个会话 —— C1 任务条按 sessionId 取。
				 * （多设备/刷新后不跨会话残留。） */
				try {
					var pendingId = sessionStorage.getItem("wb-pending-meta")
						|| sessionStorage.getItem("wb-task-meta-id") || "";
					if (pendingId !== "" && typeof props.sessionId === "string" && props.sessionId !== "") {
						sessionStorage.setItem("wb-meta-for-" + props.sessionId, pendingId);
						sessionStorage.removeItem("wb-pending-meta");
					}
					/* WB-SUP P1：session id 已知时立刻写 session↔client 索引。
					 * 失败只打 log，不挡发消息 —— 会话暂时进「未归类」。 */
					var bindRaw = sessionStorage.getItem("wb-pending-bind") || "";
					if (bindRaw !== "" && typeof props.sessionId === "string" && props.sessionId !== "") {
						var bind = null;
						try { bind = JSON.parse(bindRaw); } catch (e2) { bind = null; }
						sessionStorage.removeItem("wb-pending-bind");
						if (bind && typeof bind === "object") {
							if (!bind.meta_id && pendingId) bind.meta_id = pendingId;
							bindSessionClient(props.sessionId, bind);
						}
					} else if (bindRaw !== "" && !(typeof props.sessionId === "string" && props.sessionId !== "")) {
						console.warn("[dsh-workbench] 起会话后暂无 session id，绑定推迟；会话可能暂进未归类");
					}
				} catch (error) { /* 无 sessionStorage 就没有任务条，不影响发消息 */ }
				actions.setDraft(text);
				actions.submit();
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

			/* session id 晚到：pending-bind 还在就补绑一次（不挡消息）。 */
			React.useEffect(function () {
				if (typeof props.sessionId !== "string" || props.sessionId === "") return;
				var bindRaw = "";
				try { bindRaw = sessionStorage.getItem("wb-pending-bind") || ""; } catch (e) { return; }
				if (bindRaw === "") return;
				var bind = null;
				try { bind = JSON.parse(bindRaw); } catch (e2) { return; }
				if (!bind || typeof bind !== "object") return;
				try { sessionStorage.removeItem("wb-pending-bind"); } catch (e3) { /* */ }
				bindSessionClient(props.sessionId, bind);
			}, [props.sessionId]);
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

			function wbOpenReview(client, onChanged, clientKey) {
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
				var resolvedClientKey = String(clientKey || "");
				function ensureMain() {
					if (mainTitle) return;
					mainTitle = document.createElement("div"); mainTitle.className = "wb_reviewMainTitle";
					mainText = document.createElement("div"); mainText.className = "wb_reviewText"; mainText.textContent = "← 点左侧草稿看正文";
					mainFoot = document.createElement("div"); mainFoot.className = "wb_reviewFoot"; mainFoot.style.display = "none";
					msgEl = document.createElement("span"); msgEl.className = "wb_reviewMsg";
					var ok = document.createElement("button"); ok.type = "button"; ok.className = "wb_confirmBtn"; ok.textContent = "确认入库";
					ok.onclick = function () { confirmDraft(currentTitle); };
					mainFoot.appendChild(msgEl); mainFoot.appendChild(ok);
					mainEl.appendChild(mainTitle); mainEl.appendChild(mainText); mainEl.appendChild(mainFoot);
				}
				function loadDrafts() {
					fetch("/api/workbench/drafts?client=" + encodeURIComponent(client), { headers: { accept: "application/json" } })
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
					fetch("/api/workbench/draft?client=" + encodeURIComponent(client) + "&title=" + encodeURIComponent(title), { headers: { accept: "text/markdown" } })
						.then(function (r) { return r.text(); })
						.then(function (text) { mainText.textContent = text; mainFoot.style.display = "flex"; })
						.catch(function (e) { mainText.textContent = "读取失败：" + String(e); });
				}
				function confirmDraft(title) {
					if (!title) return;
					fetch("/api/workbench/confirm-draft", {
						method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
						body: JSON.stringify({ client: client, client_key: resolvedClientKey, title: title }),
					})
						.then(function (r) { return r.json().then(function (b) { return { code: r.status, body: b }; }); })
						.then(function (res) {
							var msg = res.body && res.body.ok === true ? "已入库 ✓（" + title + "）"
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
			var WB_NAV_W = 248;
			var wbNavState = { sessions: null, map: {}, bindings: {}, customers: [], q: "", open: {}, current: "", navW: 248 };
			try {
				var savedW = parseInt(sessionStorage.getItem(WB_KEY.navW) || "0", 10);
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
			function wbNavEmit() { wbNavSubs.forEach(function (f) { try { f(); } catch (e) { } }); }
			function wbNavRefresh() {
				/* 组装清单优先读正式 P1 session-client 索引，再合并 Noah 的
				 * client-map（topic/旧会话兼容）。客户显示名来自 list_clients。
				 * 单个兼容路由尚未热上的过渡期不应遮住正式索引。 */
				function readNav(url) {
					return fetch(url, { headers: { accept: "application/json" } }).then(readJson).catch(function () { return {}; });
				}
				Promise.all([
					readNav(WB_API.sessionClient),
					readNav(WB_API.clientMap),
					readNav(WB_API.clients),
				]).then(function (rows) {
					var bindingBody = rows[0] || {};
					var mapBody = rows[1] || {};
					var clientBody = rows[2] || {};
					if (bindingBody.ok === true) wbNavState.bindings = bindingBody.index || {};
					if (mapBody.ok === true) wbNavState.map = mapBody.map || {};
					if (clientBody.ok === true) wbNavState.customers = clientBody.customers || [];
					wbNavEmit();
				}).catch(function () { });
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
				var meSt = React.useState({ label: "…", sub: "", uid: "" });
				var me = meSt[0];
				React.useEffect(function () {
					var cancelled = false;
					fetch("/api/me", { credentials: "same-origin" }).then(function (r) {
						if (!r.ok) throw new Error("me " + r.status);
						return r.json();
					}).then(function (j) {
						if (cancelled || !j) return;
						var uid = j.uid ? String(j.uid) : "";
						var name = j.display_name ? String(j.display_name).trim() : "";
						var email = j.email ? String(j.email).trim() : "";
						var label = name || email || (uid ? uid.slice(0, 8) : "未识别登录");
						var sub = "";
						if (name && email) sub = email;
						else if (!name && email && uid) sub = uid.slice(0, 8);
						else if (name && uid) sub = uid.slice(0, 8);
						meSt[1]({ label: label, sub: sub, uid: uid });
					}).catch(function () {
						if (!cancelled) meSt[1]({ label: "未识别登录", sub: "", uid: "" });
					});
					return function () { cancelled = true; };
				}, []);
				/* 右栏拖宽（原型 R1/R4）：拖动条贴在官方右栏列左缘，
				 * 改官方 frame 的最后一列宽；宽度记 sessionStorage，下次恢复。
				 * 官方重渲染会清掉注入节点 —— tick 里定期补挂。 */
				function ensureGrip() {
					try {
						var col = document.querySelector('[class*="rightbarCol"]');
						if (col === null) return;
						if (col.querySelector(".wb_grip") !== null) return;
						var g = document.createElement("div");
						g.className = "wb_grip";
						g.title = "拖动调宽";
						g.style.cssText = "position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:col-resize;z-index:60;";
						g.addEventListener("mousedown", function (ev) {
							ev.preventDefault();
							var fr2 = col.closest('[class*="frame"]');
							if (fr2 === null) return;
							function mv(e) {
								var cols = (fr2.style.gridTemplateColumns || "").split(/\s+/);
								if (cols.length < 3) return;
								var w = Math.max(320, Math.min(window.innerWidth - 560, window.innerWidth - e.clientX));
								cols[cols.length - 1] = w + "px";
								fr2.style.gridTemplateColumns = cols.join(" ");
								try { sessionStorage.setItem(WB_KEY.rightbarW, String(w)); } catch (er) { }
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
							try { saved = parseInt(sessionStorage.getItem(WB_KEY.rightbarW) || "0", 10); } catch (er) { }
							if (saved >= 320 && fr !== null) {
								var cols = (fr.style.gridTemplateColumns || "").split(/\s+/);
								if (cols.length >= 3) { cols[cols.length - 1] = saved + "px"; fr.style.gridTemplateColumns = cols.join(" "); }
							}
						}
					} catch (e) { }
				}
				React.useEffect(function () {
					wbNavRefresh();
					var stop = false;
					function tick() { if (!stop) { wbNavRefresh(); wbNavHideOfficial(); ensureGrip(); } }
					setTimeout(ensureGrip, 600);
					var timerId = setInterval(tick, 4000);
					wbNavHideOfficial();
					return function () { stop = true; clearInterval(timerId); };
				}, []);
				var q = wbNavState.q;
				var records = {};
				Object.keys(wbNavState.map || {}).forEach(function (id) { records[id] = Object.assign({}, wbNavState.map[id]); });
				Object.keys(wbNavState.bindings || {}).forEach(function (id) { records[id] = Object.assign({}, records[id] || {}, wbNavState.bindings[id]); });
				function displayClient(rec) {
					var key = rec && rec.client_key ? String(rec.client_key) : "";
					for (var ci = 0; ci < wbNavState.customers.length; ci++) {
						var customer = wbNavState.customers[ci];
						if (key !== "" && customerId(customer) === key) return customerName(customer);
						if (key === "" && rec && rec.client && customerName(customer) === String(rec.client)) return customerName(customer);
					}
					return rec && rec.client ? String(rec.client) : "其他";
				}
				/* 组装：客户显示名 → [{id,title,at}]，按绑定时间倒序。 */
				var groups = {};
				Object.keys(records).forEach(function (id) {
					var rec = records[id] || {};
					var m = displayClient(rec);
					var title = rec.topic || (rec.meta_id ? "任务 " + rec.meta_id : "未命名会话");
					var at = rec.bound_at || rec.at || "";
					if (q !== "" && title.indexOf(q) < 0 && m.indexOf(q) < 0) return;
					if (groups[m] === undefined) groups[m] = [];
					groups[m].push({ id: id, title: title, at: at });
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
					h("button", { type: "button", className: "wb_nvNew", onClick: goCompose }, "＋ 新建任务"),
					h("input", {
						className: "wb_nvSearch", type: "search", placeholder: "搜索会话…",
						value: q,
						onChange: function (e) { wbNavState.q = e.target.value; wbNavEmit(); },
					}),
					h("div", {
						className: "wb_grip", title: "拖动调宽",
						style: { position: "absolute", top: "0", bottom: "0", right: "-4px", width: "8px", cursor: "col-resize", zIndex: "50" },
						onMouseDown: function (ev) {
							ev.preventDefault();
							function mv(e) {
								var w = Math.max(200, Math.min(480, e.clientX));
								if (w === wbNavState.navW) return;
								wbNavState.navW = w;
								try { sessionStorage.setItem(WB_KEY.navW, String(w)); } catch (er) { }
								wbNavTakeFrame();
								wbNavEmit();
							}
							function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
							window.addEventListener("mousemove", mv);
							window.addEventListener("mouseup", up);
						},
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
								}))),
					h("div", {
						className: "wb_nvFoot",
						title: me.uid || me.label,
					},
						h("div", { className: "wb_nvFootName" }, me.label),
						me.sub ? h("div", { className: "wb_nvFootSub" }, me.sub) : null));
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
				return h("div", { className: "wb_pkRow" },
					h("span", { className: "wb_pkK" }, "改哪几篇"),
					h("div", { className: "wb_pkChips" },
						pending.map(function (d, idx) {
							var on = WB_PICK.sel[d.title] === true;
							return h("button", {
								type: "button", key: d.title, className: "wb_pkChip" + (on ? " is-on" : ""),
								title: d.title,
								onClick: function () { wbPickToggle(d.title); },
							}, String(idx + 1).padStart(2, "0"));
						})),
					h("button", {
						type: "button", className: "wb_pkAll",
						onClick: function () {
							WB_PICK.sel = {};
							if (!allOn) pending.forEach(function (d) { WB_PICK.sel[d.title] = true; });
							wbPickEmit();
						},
					}, "全选"),
					h("button", { type: "button", className: "wb_pkDot red", disabled: true, title: "机器检查还没接 —— 现在直接人工看" }),
					h("button", { type: "button", className: "wb_pkDot green", disabled: true, title: "机器检查还没接 —— 现在直接人工看" }));
			}

			/* R 区：右侧栏"文章审核" tab（对齐原型）——
			 * 头：●未审核 + 客户 + 开始检查（脚本后接）；进度：已通过 N/M · 确认=入库；
			 * 左列草稿编号列表 + 右区正文；底部【确认】【全部确认】。
			 * 客户来源：openTab params 优先，否则从当前会话解析（切会话自动跟随）。 */
			function ReviewTabBody(props) {
				var sessionId = props.sessionId;
				var useChat = props.useChat;
				var st = React.useState({ client: "", client_key: "", drafts: null, sel: "", body: "", msg: "", done: {} });
				var client = st[0].client, clientKey = st[0].client_key, drafts = st[0].drafts, sel = st[0].sel, bodyText = st[0].body, msg = st[0].msg, doneMap = st[0].done;
				var setL = st[1];
				useWbPickTick();   // 勾选集合在输入框挑篇条里维护 —— 订阅它，选中变化时这里跟着重渲
				var checked = WB_PICK.sel;
				var checkedCount = drafts === null ? 0 : drafts.filter(function (d) {
					return doneMap[d.title] !== true && checked[d.title] === true;
				}).length;

				/* 客户解析：params → 当前会话首条 user 消息的任务编号 → meta.client */
				var clientFromParams = null;
				var clientKeyFromParams = null;
				try {
					var info = typeof props.useTabInfo === "function" ? props.useTabInfo() : null;
					var navParams = info && info.navigation && info.navigation.params ? info.navigation.params : null;
					clientFromParams = navParams ? (navParams.client || null) : null;
					clientKeyFromParams = navParams ? (navParams.client_key || null) : null;
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
							&& /^(?:mcp__articles__|mcp__sora-articles__)write_article$/.test(wsn.call.name) && wsn.isError !== true) {
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
					var alive = true;
					function applyClient(disp, key) {
						if (!alive) return;
						setL(function (p) { return Object.assign({}, p, { client: disp || p.client || "", client_key: key || p.client_key || "" }); });
					}
					function fallbackMeta() {
						if (clientFromParams || clientKeyFromParams) { applyClient(clientFromParams || "", clientKeyFromParams || ""); return; }
						if (metaId === "") { applyClient("", ""); return; }
						fetch(WB_API.taskMeta + "?id=" + encodeURIComponent(metaId), { headers: { accept: "application/json" } })
							.then(function (r) { return r.json(); })
							.then(function (body) { if (body) applyClient(typeof body.client === "string" ? body.client : "", typeof body.client_key === "string" ? body.client_key : ""); })
							.catch(function () { });
					}
					if (typeof sessionId === "string" && sessionId !== "") {
						fetch(WB_API.sessionClient + "?session=" + encodeURIComponent(sessionId), { headers: { accept: "application/json" } })
							.then(function (r) { return r.json(); })
							.then(function (body) {
								var binding = body && body.binding ? body.binding : null;
								if (binding && binding.client_key) applyClient(binding.client || clientFromParams || "", binding.client_key);
								else fallbackMeta();
							})
							.catch(function () { fallbackMeta(); });
					} else fallbackMeta();
					return function () { alive = false; };
				}, [clientFromParams, clientKeyFromParams, metaId, sessionId]);

				/* 本任务发起时刻：草稿列表只显示该时刻之后落盘的（C1 口径 ——
				 * 否则同客户的旧会话草稿会混进来）。时刻拿不到就退回全列。 */
				var at = st[0].at;
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

				function openDraft(title) {
					setL(function (p) { return Object.assign({}, p, { sel: title, body: "加载中…" }); });
					fetch(WB_API.draft + "?client=" + encodeURIComponent(client) + "&title=" + encodeURIComponent(title), { headers: { accept: "text/markdown" } })
						.then(function (r) { return r.text(); })
						.then(function (text) { setL(function (p) { return Object.assign({}, p, { body: text }); }); })
						.catch(function (e) { setL(function (p) { return Object.assign({}, p, { body: "读取失败：" + String(e) }); }); });
				}
				function confirmOne(title) {
					return fetch(WB_API.confirmDraft, {
						method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
						body: JSON.stringify({
							client: client,
							client_key: clientKey || "",
							title: title,
							session_id: typeof sessionId === "string" ? sessionId : "",
							meta_id: metaId || "",
						}),
					})
						.then(function (r) { return r.json().then(function (b) { return { code: r.status, body: b }; }); })
						.then(function (res) {
							var ok = res.body && res.body.ok === true;
							if (res.body && res.body.error === "client-mismatch") setL(function (p) { return Object.assign({}, p, { msg: "失败：客户不匹配（禁止串客户入库）" }); });
							if (ok || res.code === 409) setL(function (p) {
								var nextD = Object.assign({}, p.done); nextD[title] = true;
								delete WB_PICK.sel[title];
								WB_PICK.done = nextD;
								return Object.assign({}, p, { done: nextD });
							});
							wbPickEmit();
							return ok;
						});
				}
				function confirmTargets(targets, label) {
					var idx2 = 0, okN = 0, skipN = 0, failN = 0;
					setL(function (p) { return Object.assign({}, p, { msg: (label || "入库") + "中 0/" + targets.length + " …" }) });
					function next() {
						if (idx2 >= targets.length) {
							var m = "已入库 ✓ " + okN + " 篇";
							if (skipN > 0) m += "，跳过 " + skipN + " 篇（正式库已有同名）";
							if (failN > 0) m += "，失败 " + failN + " 篇";
							setL(function (p) { return Object.assign({}, p, { msg: m }) });
							return;
						}
						confirmOne(targets[idx2]).then(function (r3) {
							if (r3 === true) okN += 1; else if (r3 === false) skipN += 1; else failN += 1;
							idx2 += 1;
							setL(function (p) { return Object.assign({}, p, { msg: (label || "入库") + "中 " + idx2 + "/" + targets.length + " …" }) });
							next();
						}).catch(function () { failN += 1; idx2 += 1; next(); });
					}
					next();
				}

				var n = (drafts || []).length;
				var doneCount = drafts ? drafts.filter(function (d) { return doneMap[d.title] === true; }).length : 0;
				var pending = drafts ? drafts.filter(function (d) { return doneMap[d.title] !== true; }) : [];

				if (!client) return h("div", { className: "wb_rvEmpty" }, "没有正在进行的任务 —— 从装配台发起后，这里会自动打开");
				return h("div", { className: "wb_rv" },
					h("div", { className: "wb_rvHead" },
						h("span", { className: "wb_rvDot" + (doneCount === n && n > 0 ? " is-ok" : "") }, "●"),
						h("span", { className: "wb_rvState" }, doneCount === n && n > 0 ? "已审完" : "未审核"),
						h("span", { className: "wb_rvSel" }, client + " · 草稿审核"),
						h("button", {
							type: "button", className: "wb_rvCheck", disabled: true,
							title: "机器硬检脚本还没接 —— 先人工看正文",
						}, "开始检查"),
						h("span", { className: "wb_rvChev" }, "▸")),
					h("div", { className: "wb_rvProg" },
						h("span", { className: "wb_rvCount" }, "已通过 " + doneCount + " / " + n),
						h("span", { className: "wb_rvHint" }, "确认 = 入库")),
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
								sel ? h("div", { className: "wb_reviewMainTitle" }, sel) : null,
								bodyText && bodyText !== "加载中…"
									? h("div", { className: "wb_reviewText wb_rvMd", dangerouslySetInnerHTML: { __html: wbMdToHtml(bodyText) } })
									: h("div", { className: "wb_reviewText" }, bodyText || "← 点左侧草稿看正文"))),
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
							h("div", { className: "wb_rfHint" }, "机器检查脚本还没接 —— 现在直接人工确认"),
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

			function wbMdToHtml(raw) {
				var esc = String(raw || "")
					.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
				var lines = esc.split("\n");
				var out = [];
				var inList = false;
				function closeList() { if (inList) { out.push("</ul>"); inList = false; } }
				for (var i = 0; i < lines.length; i++) {
					var line = lines[i];
					var bold = line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
					if (/^###\s/.test(bold)) { closeList(); out.push("<h3>" + bold.replace(/^###\s/, "") + "</h3>"); }
					else if (/^##\s/.test(bold)) { closeList(); out.push("<h2>" + bold.replace(/^##\s/, "") + "</h2>"); }
					else if (/^#\s/.test(bold)) { closeList(); out.push("<h1>" + bold.replace(/^#\s/, "") + "</h1>"); }
					else if (/^---+\s*$/.test(bold)) { closeList(); out.push("<hr>"); }
					else if (/^[-*]\s+/.test(bold)) { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + bold.replace(/^[-*]\s+/, "") + "</li>"); }
					else if (bold.trim() === "") { closeList(); }
					else { closeList(); out.push("<p>" + bold + "</p>"); }
				}
				closeList();
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
								var scope = b.drafts || [];
								var sessionTitles = Object.keys(writeTitles || {});
								if (sessionTitles.length > 0) scope = scope.filter(function (draft) { return writeTitles[draft.title] === true; });
								else scope = [];
								var done = {};
								(b.library || []).forEach(function (title) { if (writeTitles[title] === true) done[title] = true; });
								setRv(function (p) { return Object.assign({}, p, { drafts: scope }); });
								WB_PICK.client = meta.client; WB_PICK.drafts = scope; WB_PICK.done = done;
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
				var clientDisp = meta.client || meta.client_key || "";
				if (meta.client_key && meta.client && meta.client_key !== meta.client) clientDisp = meta.client + "（" + meta.client_key + "）";
				var clientText = [clientDisp, meta.line, meta.period].filter(Boolean).join(" · ");
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
						&& /^(?:mcp__articles__|mcp__sora-articles__)write_article$/.test(tn.call.name) && tn.isError !== true) {
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

		function WorkbenchPage(props) {
			var ctx = props.ctx;
			var clients = useClients();

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

			var zoomS = React.useState(false);
			var zoom = zoomS[0], setZoom = zoomS[1];
			var heightS = React.useState(null);
			var workHeight = heightS[0], setWorkHeight = heightS[1];
			var sendingS = React.useState("");
			var sending = sendingS[0], setSending = sendingS[1];

			/* 默认选第一个客户；左栏「在此客户下新开会话」可预填 client_key */
			React.useEffect(function () {
				if (clients.status !== "ready" || clients.customers.length === 0) return;
				var prefer = "";
				try { prefer = sessionStorage.getItem("wb-preselect-client") || ""; } catch (e) { prefer = ""; }
				if (prefer !== "") {
					try { sessionStorage.removeItem("wb-preselect-client"); } catch (e2) { /* */ }
				}
				var chosen = null;
				if (prefer !== "") {
					for (var ci = 0; ci < clients.customers.length; ci++) {
						if (customerId(clients.customers[ci]) === prefer) { chosen = clients.customers[ci]; break; }
					}
				}
				if (chosen === null) chosen = clients.customers[0];
				var line = (chosen.business_lines && chosen.business_lines[0]) || null;
				setPick({
					key: customerId(chosen),
					line: line === null ? "" : String(line.id || ""),
					period: firstPeriodId(chosen, line === null ? "" : String(line.id || "")),
				});
			}, [clients.status, clients.customers]);

			React.useEffect(function () {
				var onSel = function (ev) {
					var key = ev && ev.detail && ev.detail.key ? String(ev.detail.key) : "";
					if (key === "" || clients.status !== "ready") return;
					var found = null;
					for (var j = 0; j < clients.customers.length; j++) {
						if (customerId(clients.customers[j]) === key) { found = clients.customers[j]; break; }
					}
					if (found === null) return;
					var line = (found.business_lines && found.business_lines[0]) || null;
					var lineId = line === null ? "" : String(line.id || "");
					setPick({ key: key, line: lineId, period: firstPeriodId(found, lineId) });
					setChipOff(false);
				};
				window.addEventListener("wb-client-select", onSel);
				return function () { window.removeEventListener("wb-client-select", onSel); };
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
				var min = zoom ? 240 : 26;
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
				 * 拼装顺序/措辞/隐藏式注入，等整体功能通了再细调。 */
				var lines = [];
				var n = 0;
				function step(text) { n += 1; lines.push(n + ". " + text); }

				var who = "客户：" + (clientName || "（没选客户）");
				if (lineName !== "") who += " · 业务线：" + lineName;
				if (periodName !== "") who += " · 期数：" + periodName;
				step(who + " —— 请调用知识库工具（knowledge；旧席位兼容 sora-knowledge），读取该客户的全部知识库内容再动笔。");

				if (mode === "weak") {
					step("主题：从薄弱问句里选（薄弱问句库还没接数据 —— 先按知识库内容自行判断主题，或等我补充）。");
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

				lines.splice(0, 0, "工具分工（请严格照此使用，不要猜）：客户知识库、文章的读写都走 MCP 工具（mcp__knowledge__*、mcp__articles__*；旧席位兼容 mcp__sora-knowledge__*、mcp__sora-articles__*）；只有下面列出的 sora-* 写作技能才走技能工具（skill），其他名字不是技能。新文章用文章库的 write_article 写入，必须带 draft:true（进草稿区等人工确认，不要直接入库；除非用户明确说「直接入库」）。技能正文（get_skill 返回的内容）已包含全部规则和提示词，够你写作使用 —— 不要尝试用 skill 工具读技能的子文件/附属文件（如 xxx/prompts/xxx.md 这种带路径的名字），也不要用其他方式抓取它们。");
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
					var resp = await fetch("/api/workbench/task-meta", {
						method: "POST",
						headers: { "content-type": "application/json", accept: "application/json" },
						body: JSON.stringify(buildTaskMetaPayload({
							client_key: pick.key,
							client: clientName,
							line: lineName, period: periodName,
							mode: mode, topic: topic,
							refs: { urls: refs.urls, body: refs.body, style: refStyle },
							skills: picked, base: base,
						})),
					});
					var body = await resp.json();
					if (body && body.ok === true && typeof body.id === "string") metaId = body.id;
				} catch (error) { /* 登记失败照常发送，任务条走兜底 */ }
				var text = composePrompt() + (metaId === "" ? "" : "\n\n[任务编号：" + metaId + "]");
				try {
					if (metaId !== "") {
						sessionStorage.setItem("wb-task-meta-id", metaId);
						sessionStorage.setItem("wb-pending-meta", metaId);
					}
					/* 新会话强制绑客户：等 PromptRelay 拿到 session id 再 POST 索引 */
					sessionStorage.setItem("wb-pending-bind", JSON.stringify({
						client_key: pick.key,
						client: clientName,
						topic: topic,
						meta_id: metaId,
					}));
				} catch (error) { /* 隐身模式就算了 */ }
				var workspace = ctx !== undefined && ctx !== null && typeof ctx.get === "function" ? ctx.get("uiWorkspace") : undefined;
				if (workspace === undefined || workspace === null || typeof workspace.startSession !== "function") {
					setSending("起不了会话：宿主没有 uiWorkspace");
					return;
				}
				pendingPrompt = text;
				setSending("");
				try {
					workspace.startSession();
				} catch (error) {
					pendingPrompt = null;
					setSending("起会话失败：" + String(error && error.message ? error.message : error));
					return;
				}
				/* 通知接力挂件：万一当前挂着的会话就是空白目标
				 * （effect 的 deps 都没变），靠这个事件立刻消费。 */
				try { window.dispatchEvent(new Event("wb-prompt-set")); } catch (error) { /* 老浏览器就算了 */ }
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
					var next = Math.max(120, startH + (moveEvent.clientY - startY));
					setWorkHeight(next);
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

			var headHint = clients.status === "loading"
				? "知识库：查询中…"
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
							h("button", { type: "button", className: "wb_tab", "data-on": mode === "weak" ? "1" : "0", onClick: function () { setMode("weak"); setChipOff(false); } }, "薄弱问句"),
							h("button", { type: "button", className: "wb_tab", "data-on": mode === "free" ? "1" : "0", onClick: function () { setMode("free"); setChipOff(false); } }, "输入"))),

					/* ---- A3 工作区 ---- */
					h("div", { className: "wb_work", id: "wb-work", style: workHeight === null ? undefined : { flex: "0 0 " + workHeight + "px" } },
						h("div", { className: "wb_workBar" },
							h("span", { className: "wb_meta" }, mode === "weak" ? "薄弱问句库 · 还没接" : "直接输入选题"),
							h("span", { className: "wb_hint" }, mode === "weak" ? "数据源未定，先留空" : "")),
						h("div", { className: "wb_workBody" },
							clients.status === "error"
								? h(Empty, { bad: true, title: "客户列表读不到，装配台就选不了客户", sub: clientsErrorText(clients.error, clients.detail) })
								: mode === "weak"
									? h("div", null,
										h("table", { className: "wb_tbl" },
											h("thead", null, h("tr", null,
												h("th", null, ""),
												h("th", null, "问句"),
												h("th", null, "差额（竞品第一 − 客户）"),
												h("th", null, "缺口平台"))),
											h("tbody", null, h("tr", null,
												h("td", { colSpan: 4 },
													h(Empty, {
														title: "薄弱问句库还没接",
														sub: "这里就是原型 A3 那张表（问句 / 差额 / 缺口平台 / 按住拖选）。数据源没定，一个字都不编。",
													}))))))
									: h("textarea", {
										className: "wb_free",
										placeholder: "想写什么选题，直接打。",
										value: topic,
										onChange: function (e) { setTopic(e.target.value); setChipOff(false); },
									}))),

					/* ---- A4 拖杆 ---- */
					h("div", {
						id: "wb-split", className: "wb_split", title: "拖动调整高度",
						onPointerDown: startDrag, role: "separator", "aria-orientation": "horizontal",
					}),

					/* ---- A5 怎么写 ---- */
					h("div", { className: "wb_ref", "data-open": refOpen ? "1" : "0" },
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
								h("button", {
									type: "button", className: "wb_send",
									disabled: clientName === "" || sending !== "",
									onClick: dispatch,
								}, "发送"))),
						sending === "" ? null : h("div", { className: "wb_emptyS wb_bad" }, sending))));
		}

		/* ---- 客户项目分组面板（WB-SUP P1）---------------------------------
		 * 方案 A：注入独立 main 面板 + panellist 入口，不刮官方 hash DOM。
		 * 组 = list_clients；组下会话来自 session-client 索引。
		 * 「未归类」= 索引里无 client_key / 空键的绑定。
		 * 局限：拿不到官方全量会话列表时，未归类只覆盖索引内未绑客户的条目，
		 * 历史原生会话仍在官方 sessions 列表，不会自动出现在本面板。 */
		function ClientProjectsIcon(props) {
			var size = Number(props && props.size) || 16;
			return h("svg", {
				width: size, height: size, viewBox: "0 0 16 16", fill: "none",
				"aria-hidden": "true", focusable: "false",
			},
				h("path", { d: "M2.5 3.5h5v4h-5v-4zM8.5 3.5h5v4h-5v-4zM2.5 8.5h5v4h-5v-4zM8.5 8.5h5v4h-5v-4z", stroke: "currentColor", strokeWidth: 1.2 }));
		}

		function ClientProjectsPage(props) {
			var ctx = props.ctx;
			var clients = useClients();
			var indexS = React.useState({ status: "loading", index: {} });
			var indexState = indexS[0], setIndexState = indexS[1];
			var openS = React.useState({});
			var openMap = openS[0], setOpenMap = openS[1];

			function reloadIndex() {
				setIndexState(function (prev) { return { status: "loading", index: prev.index || {} }; });
				fetch("/api/workbench/session-client", { headers: { accept: "application/json" } })
					.then(function (r) { return r.json(); })
					.then(function (body) {
						if (body && body.ok === true && body.index && typeof body.index === "object") {
							setIndexState({ status: "ready", index: body.index });
						} else {
							setIndexState({ status: "error", index: {} });
						}
					})
					.catch(function () { setIndexState({ status: "error", index: {} }); });
			}
			React.useEffect(function () {
				reloadIndex();
				var onBound = function () { reloadIndex(); };
				window.addEventListener("wb-session-bound", onBound);
				return function () { window.removeEventListener("wb-session-bound", onBound); };
			}, []);

			var groups = [];
			if (clients.status === "ready") {
				clients.customers.forEach(function (c) {
					groups.push({
						key: customerId(c),
						name: customerName(c),
						kind: "client",
					});
				});
			}
			groups.push({ key: "", name: "未归类", kind: "unbound" });

			var byKey = {};
			Object.keys(indexState.index || {}).forEach(function (sid) {
				var entry = indexState.index[sid];
				if (!entry || typeof entry !== "object") return;
				var ck = String(entry.client_key || "");
				if (!byKey[ck]) byKey[ck] = [];
				byKey[ck].push({
					session_id: sid,
					client: entry.client || "",
					meta_id: entry.meta_id || "",
					bound_at: entry.bound_at || "",
				});
			});
			Object.keys(byKey).forEach(function (ck) {
				byKey[ck].sort(function (a, b) { return String(b.bound_at).localeCompare(String(a.bound_at)); });
			});

			function isOpen(key) {
				if (Object.prototype.hasOwnProperty.call(openMap, key)) return openMap[key] !== false;
				return true; // 默认展开
			}
			function toggle(key) {
				setOpenMap(function (prev) {
					var next = Object.assign({}, prev);
					next[key] = !isOpen(key);
					return next;
				});
			}

			return h("div", { className: "wb_cg" },
				h("div", { className: "wb_cgHd" },
					h("span", { className: "wb_cgTitle" }, "客户项目"),
					h("span", { className: "wb_cgHint" },
						clients.status === "loading" ? "客户加载中…"
							: clients.status === "error" ? "客户列表读不到"
							: (clients.customers.length + " 个客户")
								+ (indexState.status === "ready" ? " · 索引 " + Object.keys(indexState.index).length : ""))),
				h("div", { className: "wb_cgList" },
					clients.status === "error"
						? h("div", { className: "wb_cgEmpty" }, clientsErrorText(clients.error, clients.detail))
						: groups.map(function (g) {
							var sess = byKey[g.key] || [];
							/* 未归类：空 client_key；也把「索引里 client_key 不在客户列表」的孤儿并进来 */
							if (g.kind === "unbound") {
								var known = {};
								groups.forEach(function (x) { if (x.kind === "client") known[x.key] = true; });
								sess = [];
								Object.keys(byKey).forEach(function (ck) {
									if (ck === "" || !known[ck]) {
										byKey[ck].forEach(function (row) { sess.push(row); });
									}
								});
								sess.sort(function (a, b) { return String(b.bound_at).localeCompare(String(a.bound_at)); });
							}
							var open = isOpen(g.key === "" ? "__unbound__" : g.key);
							var mapKey = g.key === "" ? "__unbound__" : g.key;
							return h("div", { className: "wb_cgGroup", key: mapKey, "data-open": open ? "1" : "0" },
								h("button", {
									type: "button", className: "wb_cgGHd",
									onClick: function () { toggle(mapKey); },
								},
									h("span", null, open ? "▾" : "▸"),
									h("span", { className: "wb_cgGName" }, g.name),
									g.kind === "client" && g.key
										? h("span", { className: "wb_cgGKey" }, g.key)
										: null,
									h("span", { className: "wb_cgGCnt" }, String(sess.length))),
								h("div", { className: "wb_cgBody" },
									sess.length === 0
										? h("div", { className: "wb_cgEmpty" },
											g.kind === "unbound"
												? "暂无未归类绑定（历史原生会话仍在官方列表）"
												: "还没有绑到此客户的会话")
										: sess.map(function (row) {
											var label = row.meta_id || row.session_id;
											var when = row.bound_at ? String(row.bound_at).slice(5, 16).replace("T", " ") : "";
											return h("button", {
												type: "button", key: row.session_id, className: "wb_cgSess",
												title: row.session_id,
												onClick: function () { openSessionBestEffort(ctx, row.session_id); },
											},
												h("span", null, label),
												when ? h("span", { className: "wb_cgSessMeta" }, when) : null);
										}),
									g.kind === "client"
										? h("button", {
											type: "button", className: "wb_cgNew",
											onClick: function () { goAssembleWithClient(ctx, g.key); },
										}, "＋ 在此客户下新开会话")
										: null));
						})),
				h("div", { className: "wb_cgNote" },
					"新从装配台发出的会话会自动挂到所选客户。历史未绑定会话进「未归类」。",
					" 品线/期数仍在装配台下拉，不在左栏展开。"));
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
			/* WB-SUP P1：客户项目页保留在源码供回滚/诊断，但从默认 panellist 下线；
			 * Noah SidebarNav 是正式站唯一左树，避免用户看到两套客户入口。 */

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
			} catch (e) { console.log("[dsh-workbench] tab 类型注册失败：", String(e)); }
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
				}, PromptRelay);
			});
			ctx.slots.inject("conversation.input.dock", function () {
				return ctx.slots.register({
					name: "conversation.input.dock",
					id: "workbench-prompt-relay-hero",
					order: 90,
				}, PromptRelay);
			});
			ctx.slots.inject("conversation.input.dock", function () {
				return ctx.slots.register({
					name: "conversation.input.dock",
					id: "workbench-pick-bar",
					order: 85,
				}, PickBar);
			});
			/* 覆盖官方左栏但保留其 grid 列，避免主区横向跳动。 */
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
						console.log("[dsh-workbench] 没落到默认面板：", String(error && error.message ? error.message : error));
					}
				};
				setTimeout(select, 250);
				setTimeout(select, 900);
			}
		}

		exports.inject = ["slots", "layout", "sidebarRight", "sidebarRightTabs"];
		exports.apply = apply;
		return module.exports;
	}
});
