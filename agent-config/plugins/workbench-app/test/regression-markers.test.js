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

test('desktop and mobile leave the injected prompt to the harness with no prefill fold styles', () => {
  assert.doesNotMatch(api.CSS, /data-wb-prefold|data-wb-pref-tail|data-wb-open|wb_prefoldHead|wb_pf(?:T|Tag|C)/)
  assert.doesNotMatch(source, /function wbPrefoldSummary\b|function wbConvStatusRow\b|liveTails|_wbSync/)
  const mobileChat = api.CSS.match(/html\[data-wb-mobile\] \[data-slot='conversation\.chat\.node'\]\{([^}]+)\}/)[1]
  assert.doesNotMatch(mobileChat, /display:none|max-height|overflow:hidden|line-clamp|white-space/)
  assert.match(mobileChat, /font-size:16px;line-height:26px/)
  assert.match(source, /!String\(title\)\.trim\(\)\.startsWith\('【装配台预填'\)/, 'session-title fallback still recognizes the prefix')
})
