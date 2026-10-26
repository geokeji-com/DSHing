import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
let api
vm.runInNewContext(source.replace('return module.exports;', 'return {CSS, WB_API, WB_WRITE_TOOL_RE};'), {
  window: { __ModuleLoader__: { load({ factory }) { api = factory(() => ({})) } } },
})

test('production mobile layout (#12/#15/#17), viewport and review adapters survive the port', () => {
  for (const marker of ['html[data-wb-mobile]', 'wbInstallMobile', 'useWbChatLayout', 'wbMobileViewport', 'MobileAssembly', 'MobileChatHeader', 'MobileQuickPrompts', 'wbStripLeadingTitle', 'wbContextLabel']) {
    assert.ok(source.includes(marker), marker)
  }
  assert.match(api.CSS, /html\[data-wb-mobile\] \.wb_mWeakRow\{flex:0 0 auto;display:grid;grid-template-columns:44px minmax\(0,1fr\)/)
  assert.match(api.CSS, /--wb-chat-scroll-h/)
  assert.match(api.CSS, /html\[data-wb-mobile\]\[data-wb-keyboard\]/)
  assert.match(source, /ctx\.effect\(wbInstallMobile/)
})

test('force-light remains installed and the port adds no dark selectors or hooks', () => {
  for (const marker of ['function forceLightTheme()', 'forceLightTheme();', '__DSH_FORCE_LIGHT_THEME__', '__DSH_FORCE_LIGHT_THEME_OBSERVER__']) assert.ok(source.includes(marker), marker)
  assert.match(api.CSS, /html,body\{color-scheme:light!important;\}/)
  assert.doesNotMatch(api.CSS, /data-ds-dark-theme|data-dsh-theme\s*=\s*["']?dark|\.dark\b|:dark|prefers-color-scheme|color-scheme\s*:\s*dark/i)
  assert.doesNotMatch(source, /matchMedia\([^\n]*prefers-color-scheme|setAttribute\(["']data-ds-dark-theme|classList\.add\(["']dark/)
})

test('write recognition, explicit article review and both scoped confirmation bodies survive', () => {
  for (const name of ['mcp__articles__write_article', 'mcp__sora-articles__write_article']) assert.ok(api.WB_WRITE_TOOL_RE.test(name), name)
  assert.ok(!api.WB_WRITE_TOOL_RE.test('mcp__articles__read_article'))
  assert.match(source, /文章审核 ›/)
  assert.match(source, /openTab\("wb-review", \{ params: \{ client: meta\.client, meta: metaId \} \}\)/)
  assert.match(source, /wb:review-refresh/)
  const bodies = [...source.matchAll(/fetch\(WB_API\.confirmDraft,[\s\S]*?body: JSON\.stringify\(\{([\s\S]*?)\}\)/g)]
  assert.equal(bodies.length, 2)
  for (const [, body] of bodies) for (const key of ['client', 'client_key', 'session_id', 'meta_id', 'title']) assert.match(body, new RegExp('\\b' + key + ':'))
  assert.equal(api.WB_API.sessionClient, '/api/workbench/session-client')
  assert.match(source, /fetch\(WB_API\.sessionClient/)
})

test('capture-words data stays shared while workbench selection is local', () => {
  assert.equal(api.WB_API.weakDir, '/api/v1/capture-words/clients')
  assert.equal(api.WB_API.weakGaps, '/api/v1/capture-words')
  assert.equal(api.WB_API.weakTicks, '/api/v1/capture-words/ticks')
  assert.equal(api.WB_API.weakTicksBulk, undefined)
  assert.match(source, /weakSelectionText\(weakGaps\.questions, weakPicked\)/)
  assert.match(source, /weakPickedFromTicks\(weakTicks\.ticks, weakGaps\.questions\)/)
  assert.doesNotMatch(source, /\/api\/workbench\/weak-(?:dir|gaps)/)
  assert.match(source, /useWeakSelection\(weakSelectionKey, weakSuggestion\)/)
  assert.match(source, /write_article 写入，必须带 draft:true/)
})

test('light process cards, pills, loader and wrapping markdown tables retain the prototype skin', () => {
  assert.match(api.CSS, /button\[data-turn-process\]\{[^}]*background:#fff;[^}]*border-radius:13px/)
  assert.match(api.CSS, /\[data-disclosure-row\]\{[^}]*background:#fafafc;[^}]*border-radius:12px/)
  assert.match(api.CSS, /\[data-wb-running\][\s\S]*?\[data-chat-flow-kind='reasoning'\]\{display:none !important/)
  assert.match(api.CSS, /table\{table-layout:auto; width:100%; max-width:100%/)
  assert.match(api.CSS, /white-space:normal !important; word-break:break-word; overflow-wrap:anywhere/)
  assert.match(api.CSS, /th\{border-bottom:2px solid #cfdcff; background:#eef3ff/)
})

test('desktop and mobile fold the injected 装配台预填 message by default (10-20; supersedes 10-19 full display)', () => {
  assert.match(api.CSS, /\[data-slot='main\.conversation'\] \[data-wb-prefold\]:not\(\[data-wb-open\]\) > :not\(\.wb_prefoldHead\)\{display:none !important;\}/)
  assert.match(api.CSS, /\.wb_prefoldHead\{all:unset;[^}]*background:#eef2fb;[^}]*color:#002FA7;/)
  assert.match(api.CSS, /\.wb_pfT::before, \[data-slot='main\.conversation'\] \.wb_prefoldHead \.wb_pfC::before\{content:attr\(data-t\);\}/, 'header text is CSS-generated, never in textContent')
  assert.doesNotMatch(api.CSS, /data-wb-pref-tail\]\{display|max-height:37px/)
  assert.doesNotMatch(source, /function wbConvStatusRow\b|liveTails|sessionStorage\.setItem\([^)]*prefold|localStorage\.setItem\([^)]*prefold/)
  assert.match(source, /var wbPrefoldOpen = new Map\(\);/)
  const mobileChat = api.CSS.match(/html\[data-wb-mobile\] \[data-slot='conversation\.chat\.node'\]\{([^}]+)\}/)[1]
  assert.doesNotMatch(mobileChat, /display:none|max-height|overflow:hidden|line-clamp|white-space/)
  assert.match(mobileChat, /font-size:16px;line-height:26px/)
  assert.match(source, /!String\(title\)\.trim\(\)\.startsWith\('【装配台预填'\)/, 'session-title fallback still recognizes the prefix')
})

test('desktop conversation blocks share the harness width axis W; mobile rules untouched (10-20)', async () => {
  const { createHash } = await import('node:crypto')
  const desk = "html:not([data-wb-mobile]) [data-slot='main.conversation'] "
  const rule = (sel) => { const at = api.CSS.indexOf(desk + sel + '{'); assert.ok(at !== -1, sel); return api.CSS.slice(at, api.CSS.indexOf('}', at) + 1) }
  assert.match(rule('[data-phase]:has([data-conversation-scroll])'), /--dsh-composer-card-max-width:min\(var\(--dsh-chat-content-width\), calc\(100% - 2 \* var\(--dsh-composer-side-clearance, 16px\)\)\);/, 'composer plan A: card outer edge = message column (W, or the narrower available width), set on ConversationRoot .root (no hashed classes)')
  assert.match(rule('.wb_pkRow'), /width:calc\(100% - 4 \* var\(--dsh-composer-side-clearance, 16px\)\);/, '改哪几篇 strip shares the card box')
  const table = rule('.md-table-wide')
  for (const token of ['width:100% !important', 'max-width:100% !important', 'margin-left:0 !important', 'padding-left:0 !important', 'overflow-x:auto']) assert.ok(table.includes(token), token)
  assert.match(rule(':is(button[data-turn-process],[data-disclosure-row])'), /\{max-width:100%;\}/)
  assert.match(rule('.wb_prefoldHead'), /max-width:min\(calc\(var\(--dsh-chat-content-width, 748px\) \* 0\.702\), 100%\)/, 'prefold header cap = harness user bubble cap')
  // #50 fold logic and markers stay as shipped.
  assert.match(api.CSS, /\[data-wb-prefold\]:not\(\[data-wb-open\]\) > :not\(\.wb_prefoldHead\)\{display:none !important;\}/)
  assert.match(source, /var wbPrefoldOpen = new Map\(\);/)
  // No new width rule leaks into the user bubble or into mobile.
  assert.doesNotMatch(api.CSS, /html:not\(\[data-wb-mobile\]\)[^{]*_bubble/)
  const mobile = source.split('\n').filter(l => l.includes('data-wb-mobile]') && !l.includes('html:not([data-wb-mobile])'))
  assert.equal(mobile.length, 191)
  assert.equal(createHash('sha256').update(mobile.join('\n')).digest('hex').slice(0, 16), '721ae5a02b269517', 'mobile rules byte-identical to #50 (5bb4f43)')
})

test('desktop batch round label lives in the 改哪几篇 pick bar; floating card is mobile-only (10-20)', () => {
  const desk = "html:not([data-wb-mobile]) [data-slot='main.conversation'] "
  for (const sel of ['.wb_pkRound{', ':is(.wb_pkStop,.wb_pkFail > summary){', '.wb_pkFail{']) assert.ok(api.CSS.includes(desk + sel), sel)
  // Every new rule string is desktop-scoped; ellipsis keeps the #51 width axis.
  const added = source.split('\n').filter(l => /wb_pkRound|wb_pkStop|wb_pkFail/.test(l) && l.trim().startsWith('"'))
  assert.equal(added.length, 3)
  for (const line of added) for (const block of line.split('} ').map(b => b.replace(/^\s*"/, ''))) assert.ok(block.startsWith(desk), block.slice(0, 80))
  assert.match(api.CSS, /:is\(\.wb_pkRoundT,\.wb_pkRoundE\)\{min-width:0; overflow:hidden; text-overflow:ellipsis;\}/)
  // PickBar reads the batch rounds (not the harness turn counter) and hides the round part on mobile.
  assert.match(source, /var batch = useWbBatch\(sessionId\);/)
  assert.match(source, /var roundText = mobileBar \? "" : wbBatchRoundLabel\(batch\);/)
  assert.match(source, /if \(pending\.length === 0\) return round \? h\("div", \{ className: "wb_pkRow is-round" \}, round\) : null;/)
  // BatchRelay still drives the batch everywhere but only renders the floating card on mobile.
  assert.match(source, /if \(!batch \|\| !mobileCard \|\| !wbBatchViews\[key\]/)
  assert.match(source, /\.wb_batch\{position:fixed;z-index:100;bottom:100px;right:24px;/, 'mobile floating card styles unchanged')
})
