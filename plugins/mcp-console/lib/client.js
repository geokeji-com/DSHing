window.__ModuleLoader__.load({
	id: "dsh-mcp-console",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var React = require("react");
		var createElement = React.createElement;
		var useState = React.useState;
		var useEffect = React.useEffect;
		var useCallback = React.useCallback;

		var API = "/api/mcp-console";
		var CREDENTIAL_RE = /(authorization|token|secret|password|api[-_]?key|cookie)/i;

		var ERROR_TEXT = {
			"bad-server-name": "名称不合法：只能用字母、数字、下划线、连字符，1–32 位。",
			"duplicate-server-name": "这个名称已经有了，换一个。",
			"bad-transport": "请选择连接方式。",
			"command-required": "本地命令方式必须填命令。",
			"url-required": "远程地址方式必须填 URL。",
			"yaml-unavailable": "宿主侧读不到配置文件解析器（js-yaml）。",
			"js-tag-present": "配置文件里有 !!js 表达式，控制台不覆盖它——请手工编辑。",
			"not-found": "这条服务器已经不在了，刷新一下。",
			"bad-tool": "工具名不合法。",
			"body-too-large": "提交内容太大。",
			"invalid-json": "提交内容不是合法 JSON。",
		};

		function message(error, detail) {
			return (ERROR_TEXT[error] || ("操作失败：" + error)) + (detail ? "  [" + detail + "]" : "");
		}

		function maskOf(data) {
			return (data && data.mask) || "\u2022\u2022\u2022\u2022\u2022\u2022";
		}

		function pairsFromKeys(keys, mask) {
			return (keys || []).map(function (k) { return { k: k, v: mask }; });
		}

		function pairsToObject(pairs) {
			var out = {};
			(pairs || []).forEach(function (p) {
				var key = (p && p.k ? String(p.k) : "").trim();
				if (key !== "") out[key] = p.v === undefined ? "" : p.v;
			});
			return out;
		}

		function hasCredential(keys) {
			return (keys || []).some(function (k) { return CREDENTIAL_RE.test(String(k)); });
		}


		/* Keep the host harness light even when the OS or saved Appearance says dark. */
		function forceLightTheme() {
			if (typeof document === "undefined" || !document.documentElement) return;
			var root = document.documentElement;
			var observer = null;
			var observerOptions = { attributes: true, attributeFilter: ["data-dsh-theme", "data-ds-dark-theme", "class", "style"] };
			function normalize() {
				if (observer) observer.disconnect();
				var body = document.body;
				root.setAttribute("data-dsh-theme", "light");
				root.removeAttribute("data-ds-dark-theme");
				root.classList.remove("dark");
				if (root.style.getPropertyValue("color-scheme") !== "light" || root.style.getPropertyPriority("color-scheme") !== "important") root.style.setProperty("color-scheme", "light", "important");
				if (body) {
					if (body.hasAttribute("data-dsh-theme") && body.getAttribute("data-dsh-theme") !== "light") body.setAttribute("data-dsh-theme", "light");
					body.removeAttribute("data-ds-dark-theme");
					body.classList.remove("dark");
					if (body.style.getPropertyValue("color-scheme") !== "light" || body.style.getPropertyPriority("color-scheme") !== "important") body.style.setProperty("color-scheme", "light", "important");
				}
				if (observer) {
					observer.observe(root, observerOptions);
					if (body) observer.observe(body, observerOptions);
				}
			}
			normalize();
			if (window.__DSH_FORCE_LIGHT_THEME__ || typeof MutationObserver !== "function") return;
			window.__DSH_FORCE_LIGHT_THEME__ = true;
			observer = new MutationObserver(normalize);
			observer.observe(root, observerOptions);
			if (document.body) observer.observe(document.body, observerOptions);
			window.__DSH_FORCE_LIGHT_THEME_OBSERVER__ = observer;
		}
		forceLightTheme();

		var CSS = [
			"html,body{color-scheme:light!important;}",
			"[data-theme-toggle],[data-theme-switch],[data-theme-picker],button[aria-label*=\"主题\"],button[title*=\"主题\"]{display:none!important;}",
			".mc_root { display:flex; flex-direction:column; gap:16px; font-size:13px; }",
			".mc_head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }",
			".mc_caption { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--dsw-alias-label-tertiary); }",
			".mc_title { font-size:15px; font-weight:600; color:var(--dsw-alias-label-primary); margin-top:2px; }",
			".mc_hint { font-size:12px; line-height:17px; color:var(--dsw-alias-label-tertiary); }",
			".mc_linkBtn { border:0; background:transparent; padding:0; cursor:pointer; font:inherit; font-size:12px; color:var(--dsw-alias-label-secondary); text-decoration:underline; }",
			".mc_list { display:flex; flex-direction:column; gap:8px; }",
			".mc_row { border:.5px solid var(--dsw-alias-border-l2); border-radius:10px; background:var(--dsw-alias-bg-layer-1); }",
			".mc_rowOff { opacity:.72; }",
			".mc_rowHead { display:flex; align-items:center; gap:8px; padding:10px 12px; cursor:pointer; user-select:none; }",
			".mc_swWrap { flex:none; display:inline-flex; align-items:center; }",
			".mc_chev { flex:none; width:12px; font-size:10px; color:var(--dsw-alias-label-tertiary); }",
			".mc_name { flex:none; font-weight:600; font-size:13.5px; color:var(--dsw-alias-label-primary); }",
			".mc_nameOff { color:var(--dsw-alias-label-tertiary); }",
			".mc_grow { flex:1; min-width:0; }",
			".mc_badge { flex:none; font-size:11px; padding:2px 7px; border-radius:999px; background:var(--dsw-alias-button-ghost-active-fill); color:var(--dsw-alias-label-caption); }",
			".mc_warnIcon { flex:none; font-size:12px; color:#c47f17; }",
			".mc_dot { flex:none; width:8px; height:8px; border-radius:50%; }",
			".mc_dotOn { background:var(--dsw-alias-state-success-primary); }",
			".mc_dotOff { background:var(--dsw-alias-state-error-primary); }",
			".mc_dotMuted { background:var(--dsw-alias-label-tertiary); }",
			".mc_stateText { flex:none; font-size:12px; }",
			".mc_stateOn { color:var(--dsw-alias-state-success-primary); }",
			".mc_stateOff { color:var(--dsw-alias-state-error-primary); }",
			".mc_stateMuted { color:var(--dsw-alias-label-tertiary); }",
			".mc_icon { flex:none; border:0; background:transparent; cursor:pointer; font:inherit; font-size:15px; line-height:1; padding:2px 6px; border-radius:6px; color:var(--dsw-alias-label-tertiary); }",
			".mc_icon:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }",
			".mc_icon[disabled] { opacity:.4; cursor:default; }",
			".mc_detail { display:flex; flex-direction:column; gap:14px; padding:4px 14px 14px 14px; border-top:.5px solid var(--dsw-alias-border-l1); }",
			".mc_f { display:flex; gap:16px; align-items:flex-start; padding-top:12px; }",
			".mc_fLabel { flex:none; width:132px; }",
			".mc_fName { font-size:13px; color:var(--dsw-alias-label-secondary); padding-top:7px; }",
			".mc_fHint { font-size:11.5px; line-height:15px; color:var(--dsw-alias-label-tertiary); margin-top:3px; }",
			".mc_fControl { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }",
			".mc_input, .mc_select { box-sizing:border-box; width:100%; min-width:0; height:34px; padding:0 10px; font:inherit; font-size:13px; border-radius:8px; border:.5px solid var(--dsw-alias-border-l3); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); }",
			".mc_input[disabled], .mc_select[disabled] { opacity:.6; }",
			".mc_kv { display:flex; flex-direction:column; gap:8px; }",
			".mc_kvRow { display:flex; gap:8px; align-items:center; }",
			".mc_kvKey { flex:0 0 42%; }",
			".mc_kvVal { flex:1; }",
			".mc_kvActions { display:flex; align-items:center; gap:10px; }",
			".mc_addBtn { border:0; background:transparent; cursor:pointer; font:inherit; font-size:12.5px; padding:4px 2px; color:var(--dsw-alias-label-secondary); }",
			".mc_addBtn:hover { color:var(--dsw-alias-label-primary); }",
			".mc_bar { display:flex; align-items:center; gap:10px; }",
			".mc_btn { box-sizing:border-box; cursor:pointer; font:inherit; font-size:13px; border-radius:8px; padding:6px 12px; border:.5px solid var(--dsw-alias-border-l3); background:var(--dsw-alias-button-elevated-fill); color:var(--dsw-alias-label-primary); }",
			".mc_btn:hover { background:var(--dsw-alias-interactive-bg-hover); }",
			".mc_btn[disabled] { opacity:.5; cursor:default; }",
			".mc_msg { display:flex; gap:8px; padding:9px 11px; border-radius:8px; font-size:12px; line-height:17px; color:var(--dsw-alias-label-secondary); background:rgba(196,127,23,.13); }",
			".mc_tools { display:flex; flex-direction:column; gap:4px; }",
			".mc_tool { display:flex; align-items:flex-start; gap:10px; padding:6px 0; }",
			".mc_toolText { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }",
			".mc_toolName { font-family:var(--dsh-font-mono,monospace); font-size:12px; color:var(--dsw-alias-label-primary); }",
			".mc_toolDesc { font-size:11.5px; line-height:16px; color:var(--dsw-alias-label-tertiary); }",
			".mc_toolOff .mc_toolName { text-decoration:line-through; color:var(--dsw-alias-label-tertiary); }",
			".mc_sw { position:relative; display:inline-block; flex:none; width:34px; height:20px; }",
			".mc_sw input { position:absolute; opacity:0; width:0; height:0; }",
			".mc_sw span { position:absolute; inset:0; border-radius:999px; background:var(--dsw-alias-border-l3); transition:background .15s ease; }",
			".mc_sw span:before { content:\"\"; position:absolute; width:16px; height:16px; left:2px; top:2px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.2); transition:transform .15s ease; }",
			".mc_sw input:checked + span { background:var(--dsw-alias-state-success-primary); }",
			".mc_sw input:checked + span:before { transform:translateX(14px); }",
			".mc_sw input:disabled + span { opacity:.5; }",
			".mc_footer { display:flex; align-items:center; gap:10px; padding-top:4px; flex-wrap:wrap; }",
			".mc_path { font-family:var(--dsh-font-mono,monospace); font-size:11px; color:var(--dsw-alias-label-caption); word-break:break-all; }",
			".mc_error { color:var(--dsw-alias-state-error-primary); font-size:12px; line-height:18px; }",
			".mc_okText { color:var(--dsw-alias-state-success-primary); font-size:12px; }",
			".mc_empty { padding:18px 12px; text-align:center; color:var(--dsw-alias-label-tertiary); font-size:13px; border:1px dashed var(--dsw-alias-border-l2); border-radius:10px; }",
		].join("\n");

		var TAG_ID = "dsh-mcp-console/settings.css";
		(function injectStyles() {
			if (typeof document === "undefined") return;
			var old = document.querySelector('style[data-plugin-css="' + TAG_ID + '"]');
			if (old !== null && old.parentNode !== null) old.parentNode.removeChild(old);
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-mcp-console";
			tag.dataset.pluginCss = TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		})();

		function Toggle(props) {
			return createElement("label", { className: "mc_sw" },
				createElement("input", {
					type: "checkbox",
					checked: props.checked === true,
					disabled: props.disabled === true,
					title: props.title || "",
					onChange: function (e) { props.onChange(e.target.checked); },
				}),
				createElement("span", null));
		}

		function Field(props) {
			return createElement("div", { className: "mc_f" },
				createElement("div", { className: "mc_fLabel" },
					createElement("div", { className: "mc_fName" }, props.label),
					props.hint ? createElement("div", { className: "mc_fHint" }, props.hint) : null),
				createElement("div", { className: "mc_fControl" }, props.children));
		}

		function KvEditor(props) {
			var pairs = props.pairs || [];
			function change(next) { props.onChange(next); }
			function setAt(index, key, value) {
				change(pairs.map(function (p, i) {
					if (i !== index) return p;
					return { k: key === undefined ? p.k : key, v: value === undefined ? p.v : value };
				}));
			}
			return createElement("div", { className: "mc_kv" },
				pairs.map(function (p, i) {
					return createElement("div", { className: "mc_kvRow", key: i },
						createElement("input", { className: "mc_input mc_kvKey", value: p.k, placeholder: "名称", disabled: props.disabled, onChange: function (e) { setAt(i, e.target.value, undefined); } }),
						createElement("input", { className: "mc_input mc_kvVal", value: p.v, placeholder: "值", disabled: props.disabled, type: props.reveal ? "text" : "password", onChange: function (e) { setAt(i, undefined, e.target.value); } }),
						createElement("button", { className: "mc_icon", title: "删除这一行", disabled: props.disabled, onClick: function () { change(pairs.filter(function (_, j) { return j !== i; })); } }, "\u00d7"));
				}),
				createElement("div", { className: "mc_kvActions" },
					createElement("button", { className: "mc_addBtn", disabled: props.disabled, onClick: function () { change(pairs.concat([{ k: "", v: "" }])); } }, "+ 添加"),
					pairs.length > 0 ? createElement("button", { className: "mc_addBtn", disabled: props.disabled, onClick: function () { props.onToggleReveal(!props.reveal); } }, props.reveal ? "隐藏" : "显示") : null));
		}

		function McpConsole() {
			var [data, setData] = useState(null);
			var [error, setError] = useState("");
			var [notice, setNotice] = useState(null);
			var [busy, setBusy] = useState(false);
			var [loading, setLoading] = useState(true);
			var [open, setOpen] = useState({});
			var [drafts, setDrafts] = useState({});
			var [tests, setTests] = useState({});
			var [help, setHelp] = useState(false);
			var [addOpen, setAddOpen] = useState(false);
			var [addDraft, setAddDraft] = useState(null);

			var mask = maskOf(data);

			var load = useCallback(function () {
				setLoading(true);
				fetch(API, { headers: { accept: "application/json" } })
					.then(function (r) { return r.json(); })
					.then(function (body) {
						if (!body || body.ok !== true) { setError(message(body && body.error)); setData(null); return; }
						setError("");
						setData(body);
					})
					.catch(function (e) { setError(message("request-failed", String(e && e.message))); setData(null); })
					.then(function () { setLoading(false); });
			}, []);

			useEffect(function () { load(); }, [load]);

			function post(payload, okText) {
				setBusy(true);
				setNotice(null);
				return fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
					.then(function (r) { return r.json(); })
					.then(function (body) {
						if (!body || body.ok !== true) { setNotice({ kind: "error", text: message(body && body.error, body && body.detail) }); return null; }
						if (body.test === undefined) {
							setData(body);
							setError("");
							setNotice({ kind: "ok", text: okText });
						}
						return body;
					})
					.catch(function (e) { setNotice({ kind: "error", text: String(e && e.message) }); return null; })
					.then(function (body) { setBusy(false); return body; });
			}

			function emptyDraft() {
				return { name: "", transport: "streamable-http", url: "", command: "", args: "", timeoutSec: "", headers: [], env: [], reveal: false };
			}

			function draftFromServer(s) {
				return {
					name: s.serverName || "",
					transport: s.transport || "streamable-http",
					url: s.url || "",
					command: s.command || "",
					args: (s.args || []).join(" "),
					timeoutSec: s.toolCallTimeoutMs ? String(Math.round(s.toolCallTimeoutMs / 1000)) : "",
					headers: pairsFromKeys(s.headerKeys, mask),
					env: pairsFromKeys(s.envKeys, mask),
					reveal: false,
				};
			}

			function setDraft(name, patch) {
				var next = {}; for (var k in drafts) next[k] = drafts[k];
				var base = next[name] || draftFromServer({ serverName: name });
				var draft = {}; for (var f in base) draft[f] = base[f];
				for (var p in patch) draft[p] = patch[p];
				next[name] = draft;
				setDrafts(next);
			}

			function toggleOpen(s) {
				var isOpen = open[s.serverName] === true;
				var nextOpen = {}; for (var k in open) nextOpen[k] = open[k];
				nextOpen[s.serverName] = !isOpen;
				setOpen(nextOpen);
				if (!isOpen && !drafts[s.serverName]) setDraft(s.serverName, draftFromServer(s));
			}

			function serverPayload(draft, fallbackName) {
				var server = { serverName: (draft.name || fallbackName || "").trim(), transport: draft.transport };
				if (draft.transport === "stdio") {
					server.command = (draft.command || "").trim();
					if ((draft.args || "").trim() !== "") server.args = draft.args.trim().split(/\s+/);
					var env = pairsToObject(draft.env);
					if (Object.keys(env).length > 0) server.env = env;
				} else {
					server.url = (draft.url || "").trim();
					var headers = pairsToObject(draft.headers);
					if (Object.keys(headers).length > 0) server.headers = headers;
				}
				var secs = parseFloat(draft.timeoutSec);
				if (isFinite(secs) && secs > 0) server.toolCallTimeoutMs = Math.round(secs * 1000);
				return server;
			}

			function save(s) {
				post({ action: "update", serverName: s.serverName, server: serverPayload(drafts[s.serverName], s.serverName) }, "已保存 " + s.serverName + "，正在重新挂载…");
			}

			function remove(s) {
				post({ action: "remove", serverName: s.serverName }, "已删除 " + s.serverName);
			}

			function toggleServer(s, enabled) {
				post({ action: "server", serverName: s.serverName, enabled: enabled }, (enabled ? "已开启 " : "已关闭 ") + s.serverName);
			}

			function test(s) {
				post({ action: "test", serverName: s.serverName }, null).then(function (body) {
					if (!body || !body.test) return;
					var next = {}; for (var k in tests) next[k] = tests[k];
					next[s.serverName] = body.test;
					setTests(next);
					setNotice({ kind: "ok", text: "已测试 " + s.serverName + "：" + describeTest(body.test) });
				});
			}

			function describeTest(t) {
				if (t.state === "disabled") return "这台已关闭";
				if (t.state === "connected") return "已连接，" + t.tools + " 个工具";
				if (t.state === "reachable") return "服务可达，但工具尚未注册";
				if (t.state === "unreachable") return "连不上" + (t.detail ? "（" + t.detail + "）" : "");
				return "服务器没有注册任何工具";
			}

			function toolRow(t) {
				return createElement("div", { className: "mc_tool" + (t.enabled ? "" : " mc_toolOff"), key: t.name },
					createElement(Toggle, {
						checked: t.enabled,
						disabled: busy,
						title: t.enabled ? "关闭后模型看不到这个工具" : "打开",
						onChange: function (on) { post({ action: "toggle", tool: t.name, enabled: on }, on ? ("已开启 " + t.label) : ("已关闭 " + t.label)); },
					}),
					createElement("div", { className: "mc_toolText" },
						createElement("span", { className: "mc_toolName" }, t.label),
						t.description ? createElement("span", { className: "mc_toolDesc" }, t.description) : null));
			}

			var servers = data && Array.isArray(data.servers) ? data.servers : [];

			var rows = servers.map(function (s) {
				var enabled = s.enabled !== false;
				var connected = enabled && s.status === "connected";
				var isOpen = open[s.serverName] === true;
				var enabledCount = s.tools.filter(function (t) { return t.enabled; }).length;
				var draft = drafts[s.serverName] || draftFromServer(s);
				var risky = hasCredential(s.headerKeys) || hasCredential(s.envKeys);
				var result = tests[s.serverName];
				var dotClass = !enabled ? "mc_dotMuted" : connected ? "mc_dotOn" : "mc_dotOff";
				var stateClass = !enabled ? "mc_stateMuted" : connected ? "mc_stateOn" : "mc_stateOff";
				var stateText = !enabled ? "已关闭" : connected ? "已连接" : "已断开";

				var detail = null;
				if (isOpen) {
					var kvLabel = draft.transport === "stdio" ? "环境变量" : "请求头";
					var kvPairs = draft.transport === "stdio" ? draft.env : draft.headers;
					var kvHint = "每行一个；已保存的密钥只显示为 " + mask + "，不动它就保持原值。";
					detail = createElement("div", { className: "mc_detail" },
						createElement(Field, { label: "名称", hint: "模型的工具名会用到它：mcp__名称__工具" },
							createElement("input", { className: "mc_input", value: draft.name, disabled: busy, onChange: function (e) { setDraft(s.serverName, { name: e.target.value }); } })),
						createElement(Field, { label: "连接方式" },
							createElement("select", { className: "mc_select", value: draft.transport, disabled: busy, onChange: function (e) { setDraft(s.serverName, { transport: e.target.value }); } },
								createElement("option", { value: "streamable-http" }, "Streamable HTTP（远程地址）"),
								createElement("option", { value: "stdio" }, "stdio（本地命令）"))),
						draft.transport === "stdio"
							? createElement(Field, { label: "命令", hint: "可执行文件" },
								createElement("input", { className: "mc_input", value: draft.command, placeholder: "npx", disabled: busy, onChange: function (e) { setDraft(s.serverName, { command: e.target.value }); } }))
							: createElement(Field, { label: "URL", hint: "MCP 端点地址" },
								createElement("input", { className: "mc_input", value: draft.url, placeholder: "https://example.com/mcp", disabled: busy, onChange: function (e) { setDraft(s.serverName, { url: e.target.value }); } })),
						draft.transport === "stdio"
							? createElement(Field, { label: "参数" },
								createElement("input", { className: "mc_input", value: draft.args, placeholder: "-y @modelcontextprotocol/server-github", disabled: busy, onChange: function (e) { setDraft(s.serverName, { args: e.target.value }); } }))
							: null,
						createElement(Field, { label: kvLabel, hint: kvHint },
							createElement(KvEditor, {
								pairs: kvPairs,
								reveal: draft.reveal,
								disabled: busy,
								onChange: function (next) { var patch = {}; patch[draft.transport === "stdio" ? "env" : "headers"] = next; setDraft(s.serverName, patch); },
								onToggleReveal: function (value) { setDraft(s.serverName, { reveal: value }); },
							})),
						risky ? createElement("div", { className: "mc_msg" },
							createElement("span", null, "\u26a0"),
							createElement("span", null, kvLabel + "里有看起来像凭据的字段（明文保存在配置文件里）。已保存的值不会回传到浏览器，页面只显示 " + mask + "。")) : null,
						createElement(Field, { label: "单次调用超时", hint: "秒；留空用默认 60 秒" },
							createElement("input", { className: "mc_input", value: draft.timeoutSec, placeholder: "60", inputMode: "numeric", disabled: busy, onChange: function (e) { setDraft(s.serverName, { timeoutSec: e.target.value }); } })),
						createElement(Field, { label: "工具策略", hint: enabled ? "关掉某个工具，模型就看不到它（对所有会话生效）" : "整台已关闭：打开后这里的工具才会重新出现" },
							!enabled
								? createElement("div", { className: "mc_hint" }, "用这一行最前面的开关打开它，已保存的逐个工具开关会原样恢复。")
								: s.tools.length === 0
									? createElement("div", { className: "mc_hint" }, connected ? "这个服务器没有暴露工具。" : (s.detail ? ("探测失败：" + s.detail) : "未连接到服务器，或它没有暴露工具。"))
									: createElement("div", { className: "mc_tools" }, s.tools.map(toolRow))),
						createElement("div", { className: "mc_footer" },
							createElement("span", { className: "mc_bar" },
								createElement("span", { className: "mc_dot " + dotClass }),
								createElement("span", { className: "mc_stateText " + stateClass }, stateText),
								result ? createElement("span", { className: "mc_hint" }, "· 已测试：" + describeTest(result)) : null),
							createElement("button", { className: "mc_btn", disabled: busy, onClick: function () { test(s); } }, "测试连接"),
							createElement("span", { className: "mc_grow" }),
							createElement("button", { className: "mc_btn", disabled: busy, onClick: function () { setDraft(s.serverName, draftFromServer(s)); } }, "还原"),
							createElement("button", { className: "mc_btn", disabled: busy, onClick: function () { save(s); } }, busy ? "保存中…" : "保存")));
				}

				return createElement("div", { className: "mc_row" + (enabled ? "" : " mc_rowOff"), key: s.serverName },
					createElement("div", { className: "mc_rowHead", onClick: function () { toggleOpen(s); } },
						createElement("span", { className: "mc_swWrap", onClick: function (e) { e.stopPropagation(); } },
							createElement(Toggle, {
								checked: enabled,
								disabled: busy,
								title: enabled ? "关闭这台服务器（工具不再给模型）" : "打开这台服务器",
								onChange: function (on) { toggleServer(s, on); },
							})),
						createElement("span", { className: "mc_chev" }, isOpen ? "\u25be" : "\u25b8"),
						createElement("span", { className: "mc_name" + (enabled ? "" : " mc_nameOff") }, s.serverName),
						risky ? createElement("span", { className: "mc_warnIcon", title: "配置里有看起来像凭据的字段" }, "\u26a0") : null,
						createElement("span", { className: "mc_badge" }, s.transport === "stdio" ? "stdio" : "HTTP"),
						enabled && s.tools.length > 0 ? createElement("span", { className: "mc_hint" }, enabledCount + "/" + s.tools.length + " 个工具开启") : null,
						createElement("span", { className: "mc_grow" }),
						createElement("span", { className: "mc_dot " + dotClass }),
						createElement("span", { className: "mc_stateText " + stateClass }, stateText),
						createElement("button", { className: "mc_icon", title: "删除", disabled: busy, onClick: function (e) { e.stopPropagation(); remove(s); } }, "\u00d7")),
					detail);
			});

			var addForm = null;
			if (addOpen) {
				var ad = addDraft || emptyDraft();
				var setAdd = function (patch) { var draft = {}; var base = addDraft || emptyDraft(); for (var k in base) draft[k] = base[k]; for (var p in patch) draft[p] = patch[p]; setAddDraft(draft); };
				addForm = createElement("div", { className: "mc_row" },
					createElement("div", { className: "mc_detail" },
						createElement(Field, { label: "名称", hint: "字母/数字/下划线/连字符，1–32 位" },
							createElement("input", { className: "mc_input", value: ad.name, placeholder: "github", disabled: busy, onChange: function (e) { setAdd({ name: e.target.value }); } })),
						createElement(Field, { label: "连接方式" },
							createElement("select", { className: "mc_select", value: ad.transport, disabled: busy, onChange: function (e) { setAdd({ transport: e.target.value }); } },
								createElement("option", { value: "streamable-http" }, "Streamable HTTP（远程地址）"),
								createElement("option", { value: "stdio" }, "stdio（本地命令）"))),
						ad.transport === "stdio"
							? createElement(Field, { label: "命令" },
								createElement("input", { className: "mc_input", value: ad.command, placeholder: "npx", disabled: busy, onChange: function (e) { setAdd({ command: e.target.value }); } }))
							: createElement(Field, { label: "URL" },
								createElement("input", { className: "mc_input", value: ad.url, placeholder: "https://example.com/mcp", disabled: busy, onChange: function (e) { setAdd({ url: e.target.value }); } })),
						ad.transport === "stdio"
							? createElement(Field, { label: "参数" },
								createElement("input", { className: "mc_input", value: ad.args, placeholder: "-y @modelcontextprotocol/server-github", disabled: busy, onChange: function (e) { setAdd({ args: e.target.value }); } }))
							: null,
						createElement(Field, { label: ad.transport === "stdio" ? "环境变量" : "请求头", hint: "每行一个名称/值；留空也可以" },
							createElement(KvEditor, {
								pairs: ad.transport === "stdio" ? ad.env : ad.headers,
								reveal: ad.reveal,
								disabled: busy,
								onChange: function (next) { var patch = {}; patch[ad.transport === "stdio" ? "env" : "headers"] = next; setAdd(patch); },
								onToggleReveal: function (value) { setAdd({ reveal: value }); },
							})),
						createElement(Field, { label: "单次调用超时", hint: "秒；留空用默认 60 秒" },
							createElement("input", { className: "mc_input", value: ad.timeoutSec, placeholder: "60", inputMode: "numeric", disabled: busy, onChange: function (e) { setAdd({ timeoutSec: e.target.value }); } })),
						createElement("div", { className: "mc_footer" },
							createElement("span", { className: "mc_grow" }),
							createElement("button", { className: "mc_btn", disabled: busy, onClick: function () { setAddOpen(false); setAddDraft(null); } }, "取消"),
							createElement("button", { className: "mc_btn", disabled: busy || ad.name.trim() === "", onClick: function () {
								post({ action: "add", server: serverPayload(ad, ad.name) }, "已添加，正在挂载…").then(function (body) { if (body) { setAddOpen(false); setAddDraft(null); } });
							} }, busy ? "处理中…" : "添加"))));
			}

			return createElement("div", { className: "mc_root" },
				createElement("div", { className: "mc_head" },
					createElement("div", null,
						createElement("div", { className: "mc_caption" }, "MCP 服务器"),
						createElement("div", { className: "mc_title" }, "已配置的 MCP 服务器"),
						createElement("div", { className: "mc_hint" }, "远程（HTTP）或本地（stdio 命令）。行首开关控制整台是否启用；工具会以 mcp__名称__工具 暴露给模型。"),
						createElement("button", { className: "mc_linkBtn", onClick: function () { setHelp(!help); } }, help ? "收起说明 \u2303" : "了解更多 \u2304"),
						help ? createElement("div", { className: "mc_hint", style: { marginTop: "6px" } },
							"行首开关：绿色=启用，灰色=关闭；关掉整台，它的工具就全部不给模型（逐个工具的开关会保留，重新打开即恢复）。点一行展开详情：改名称、连接方式、地址/命令、请求头、超时，并逐个开关工具。改动写进 $DSH_HOME/cordis.patch.yml（会先留 .bak），改完即时生效。") : null),
					createElement("button", { className: "mc_btn", disabled: busy || loading, onClick: load }, loading ? "读取中…" : "刷新")),

				error ? createElement("div", { className: "mc_error" }, error) : null,
				notice ? createElement("div", { className: notice.kind === "error" ? "mc_error" : "mc_okText" }, notice.text) : null,

				servers.length === 0
					? createElement("div", { className: "mc_empty" }, loading ? "读取中…" : "还没有配置任何 MCP 服务器")
					: createElement("div", { className: "mc_list" }, rows),

				createElement("div", null,
					createElement("button", { className: "mc_addBtn", disabled: busy, onClick: function () { setAddOpen(!addOpen); if (!addOpen && addDraft === null) setAddDraft(emptyDraft()); } }, addOpen ? "收起" : "+ 添加"),
					addOpen ? addForm : null),

				data && data.homePatch ? createElement("div", { className: "mc_path" }, "配置文件：" + data.homePatch) : null);
		}

		function apply(ctx) {
			ctx.slots.inject("settings.section", function () {
				return ctx.slots.register({
					name: "settings.section",
					id: "mcp-console",
					order: 50,
					label: "MCP",
				}, McpConsole);
			});
		}

		exports.inject = ["slots"];
		exports.apply = apply;
		return module.exports;
	}
});
