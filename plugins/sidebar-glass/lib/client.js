window.__ModuleLoader__.load({
	id: "dsh-local-sidebar-glass",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		/* ------------------------------------------------------------------
		 * Left sidebar: the composer card's material.
		 *
		 * The background plugin (deepseek-harness-background) paints the app
		 * frame plus the sidebar fill transparent so every column shares one
		 * wallpaper, but its frosted glass is a WHITELIST and the sidebar is
		 * not on it -- so the sidebar is left translucent WITHOUT frost and the
		 * art shows through, leaving the sidebar and the conversation column
		 * reading as one undivided sheet.
		 *
		 * The fill is --dsw-specific-input-major, the very token the painter
		 * overrides on body for the composer card, so the two surfaces cannot
		 * drift apart.
		 *
		 * ------------------------------------------------------------------
		 * WHY THERE IS NO backdrop-filter HERE. Do not add one back.
		 *
		 * Measured, not theorised -- the sidebar hosts fixed-position popovers
		 * (the Cordis/plugin-market panel, the chat-import panel) and they are
		 * DESCENDANTS of .hHd-Xa_root. A `backdrop-filter` other than none
		 * makes its element a containing block for fixed-position descendants,
		 * so the popovers stopped being laid out against the viewport and
		 * started being laid out against the sidebar: a 420px panel collapsed
		 * into the sidebar's ~208px width and its content was cut off.
		 *
		 * The correlation held across four configurations: filter on the root
		 * broke them, filter off the root (plugin stopped, or filter moved to a
		 * pseudo-element) fixed them, and it reproduced on this permanent
		 * bundle when the filter came back. The only way that pattern exists is
		 * the containing-block mechanism above.
		 *
		 * A `z-index:-1` pseudo-element was also tried, twice, and is worse: the
		 * fill and sheen then compete for stacking order with the sidebar's own
		 * content and paint over it. Nothing here may ride a negative z-index.
		 *
		 * So the sidebar keeps the FILL and the SHEEN -- which is what actually
		 * separates it from the conversation column -- and gives up the blur.
		 * That is a deliberate trade: a working sidebar with slightly less
		 * frosting than the composer card, instead of a sidebar that traps the
		 * user's dialogs. If the blur is ever wanted back, it needs the popovers
		 * moved out of the sidebar's DOM first; it cannot be won with CSS here.
		 * ------------------------------------------------------------------ */

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

		var SIDEBAR_CSS = [
			"html,body{color-scheme:light!important;}",
			"[data-theme-toggle],[data-theme-switch],[data-theme-picker],button[aria-label*=\"主题\"],button[title*=\"主题\"]{display:none!important;}",
			"body[data-dsh-bg-glass] .hHd-Xa_root {",
			"  background-color: var(--dsw-specific-input-major);",
			"  background-image: linear-gradient(180deg,",
			"    rgba(255, 255, 255, var(--bg-glass-sheen, 0.07)),",
			"    rgba(255, 255, 255, var(--bg-glass-sheen-mid, 0.02)) 38%,",
			"    rgba(255, 255, 255, 0.01));",
			"}"
		].join("\n");


		/* ------------------------------------------------------------------
		 * Workspace (project) row in the sidebar.
		 *
		 * The rounded hover rectangle becomes a resting state, so a workspace
		 * is distinguishable without pointing at it. Same paint the stock
		 * :hover / menuOpen rules use. Session rows belonging to a workspace
		 * live in a child subtree, so they never match ._projectRow.
		 *
		 * Its title is bold and centred in the space to the right of the folder
		 * icon (_projectText is flex:1, so text-align centres within exactly
		 * that space); scoped to ._projectRow so session titles are untouched.
		 * ------------------------------------------------------------------ */

		/* ------------------------------------------------------------------
		 * Keep the last message readable above the composer.
		 *
		 * The composer seat is `position: sticky; bottom: 0` INSIDE this scroll
		 * container, with a gradient mask on its top edge, so scrolling to the end
		 * parks the final line behind it and the user cannot read it.
		 *
		 * The clearance goes on the message column's LAST CHILD, never on the
		 * scroll container itself. padding on the container pushed the composer
		 * seat (its child) into mid-air -- that mistake is why this targets
		 * :last-child instead. A bottom margin on the last flow item simply opens
		 * room at the end of the content, leaving the seat where it belongs.
		 *
		 * The amount is the kernel's own measured composer height, so it tracks the
		 * composer as it grows (tool row, attachments, multi-line input).
		 * ------------------------------------------------------------------ */
		var CONVERSATION_CSS = [
			".EvIC1a_column > .EvIC1a_flowItem:last-child {",
			"  margin-bottom: calc(var(--dsh-composer-height, 152px) + 16px);",
			"}"
		].join("\n");

		var WORKSPACE_CSS = [
			".YDXeBa_projectRow { background-color: var(--dsw-alias-interactive-bg-hover); }",
			".YDXeBa_projectRow .YDXeBa_title { font-weight: 600; text-align: center; }"
		].join("\n");

		var CSS = SIDEBAR_CSS + "\n" + CONVERSATION_CSS + "\n" + WORKSPACE_CSS + "\n";

		/* Official client-package insertion pattern: insert once at module
		 * evaluation, deduped by the tag's own data-plugin-css key. This is the
		 * shape the shipped client packages use, and it needs no ctx at all. */
		var TAG_ID = "dsh-local-sidebar-glass/sidebar-and-workspace.css";

		function inject() {
			if (typeof document === "undefined") return null;
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG_ID) + "]") !== null) return null;
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-local-sidebar-glass";
			tag.dataset.pluginCss = TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return tag;
		}

		var inserted = inject();

		function apply(ctx) {
			/* Cleanup is a bonus, never a precondition: the sheet is already in
			 * place before apply runs, so a missing effect() cannot blank the UI. */
			if (inserted !== null && ctx !== void 0 && ctx !== null && typeof ctx.effect === "function") {
				ctx.effect(() => () => {
					if (inserted.parentNode !== null) inserted.parentNode.removeChild(inserted);
				}, "dsh-local-sidebar-glass: remove the sidebar + workspace stylesheet");
			}
		}

		exports.apply = apply;
		return module.exports;
	}
});
//# sourceMappingURL=client.js.map
