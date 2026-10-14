import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const instrumented = source.replace('return module.exports;', 'return { ...module.exports, wbReviewAutoOpenDecision, wbIsSuccessfulWrite, WB_WRITE_TOOL_RE, TaskBar, ReviewTabBody, wbNavState, WB_PICK };')
let api
vm.runInNewContext(instrumented, {
  window: { __ModuleLoader__: { load({ factory }) { api = factory(() => ({})) } } },
})
const snapshot = (values = {}) => ({ sessionId: 'session-a', turnKey: 1, writeCount: 0, running: true, ...values })
const decision = (prev, next) => ({ ...api.wbReviewAutoOpenDecision(prev, next) })
const user = { kind: 'user', content: [{ type: 'text', text: '写一篇文章' }] }
const write = (title = '新文章', name = 'mcp__articles__write_article') => ({ kind: 'tool-result', call: { name, argsRaw: JSON.stringify({ title }) } })

test('first live successful write opens immediately; no write never opens', () => {
  assert.deepEqual(decision(null, snapshot()), { open: false, refresh: false })
  assert.deepEqual(decision(snapshot(), snapshot()), { open: false, refresh: false })
  assert.deepEqual(decision(snapshot(), snapshot({ writeCount: 1 })), { open: true, refresh: true })
})

test('second write refreshes without reopening, including after the user closes the panel', () => {
  const opened = snapshot({ writeCount: 1, openedTurn: 1 })
  assert.deepEqual(decision(opened, snapshot({ writeCount: 2 })), { open: false, refresh: true })
  assert.deepEqual(decision({ ...opened, writeCount: 2 }, snapshot({ writeCount: 3 })), { open: false, refresh: true })
  assert.deepEqual(decision(opened, snapshot({ writeCount: 1, running: false })), { open: false, refresh: false })
})

test('a new user turn can open again, including a batched first write', () => {
  const previous = snapshot({ writeCount: 3, openedTurn: 1 })
  assert.deepEqual(decision(previous, snapshot({ turnKey: 2 })), { open: false, refresh: false })
  assert.deepEqual(decision(previous, snapshot({ turnKey: 2, writeCount: 1 })), { open: true, refresh: true })
  assert.deepEqual(decision(snapshot({ turnKey: 2, openedTurn: 1 }), snapshot({ turnKey: 2, writeCount: 1 })), { open: true, refresh: true })
})

test('old session replay and session switches establish a baseline without opening', () => {
  const history = snapshot({ writeCount: 3, running: false })
  assert.deepEqual(decision(null, history), { open: false, refresh: false })
  assert.deepEqual(decision(snapshot({ turnKey: 0, running: false }), history), { open: false, refresh: false })
  assert.deepEqual(decision({ ...history, writeCount: 2 }, history), { open: false, refresh: false })
  assert.deepEqual(decision(snapshot(), { ...history, sessionId: 'session-b', running: true }), { open: false, refresh: false })
})

test('a running session with existing writes waits for an increase; its final write can open', () => {
  const history = snapshot({ writeCount: 3 })
  assert.deepEqual(decision(null, history), { open: false, refresh: false })
  assert.deepEqual(decision(history, snapshot({ writeCount: 4 })), { open: true, refresh: true })
  assert.deepEqual(decision(snapshot(), snapshot({ writeCount: 1, running: false })), { open: true, refresh: true })
})

test('all MCP aliases match, while error results and calls without results do not count', () => {
  for (const alias of ['articles', 'sora-articles', 'customer-articles', 'proxy__articles_v2']) {
    const node = write('文章', `mcp__${alias}__write_article`)
    assert.ok(api.WB_WRITE_TOOL_RE.test(node.call.name))
    assert.ok(api.wbIsSuccessfulWrite(node))
    assert.equal(api.wbIsSuccessfulWrite({ ...node, isError: true }), false)
  }
  const nodes = [write(), { ...write(), isError: true }, { ...write(), kind: 'tool-call' }, null, { kind: 'tool-result' }]
  assert.equal(nodes.filter(api.wbIsSuccessfulWrite).length, 1)
  for (const name of ['write_article', 'mcp____write_article', 'mcp__articles__read_article', 'mcp__articles__write_article_extra']) {
    assert.equal(api.wbIsSuccessfulWrite(write('文章', name)), false, name)
  }
})

test('task-bar drafts fetch depends on writes and manual refresh, never chatSnap', () => {
  const taskBar = source.slice(source.indexOf('function TaskBar(props)'), source.indexOf('var REF_STYLES'))
  const effect = taskBar.match(/fetch\(WB_API\.drafts[\s\S]*?\}, \[([^\]]+)\]\);/)
  assert.ok(effect, 'task-bar drafts effect exists')
  assert.equal(effect[1], 'metaId, client, writeCount, rvTick')
  assert.doesNotMatch(effect[1], /chatSnap/)
})

// Exercise actual components with persistent hooks, effect cleanup and a fake clock.
function harness({ component = 'TaskBar', binding, mapped, unified = false, openFailures = 0, fetchBody, mobile = false } = {}) {
  let clientApi, cursor = 0, dirty = false, now = 0, timerId = 0
  let nodes = [user], running = true, sessionId = 'session-a'
  const hooks = [], pending = [], timers = new Map(), listeners = new Map()
  const requests = [], opens = [], events = [], warnings = []
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useRef(value) { const i = cursor++; return hooks[i] ||= { current: value } },
    useState(value) {
      const i = cursor++
      hooks[i] ||= { value }
      return [hooks[i].value, next => {
        const value = typeof next === 'function' ? next(hooks[i].value) : next
        if (!Object.is(hooks[i].value, value)) { hooks[i].value = value; dirty = true }
      }]
    },
    useEffect(fn, deps) {
      const i = cursor++, old = hooks[i]
      if (!old || deps.some((dep, n) => !Object.is(dep, old.deps[n]))) {
        hooks[i] = { deps, cleanup: old?.cleanup }
        pending.push(() => { hooks[i].cleanup?.(); hooks[i].cleanup = fn() })
      }
    },
  }
  class TestEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail } }
  const window = {
    matchMedia: () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} }),
    ...(unified ? { dshUnified: {} } : {}),
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn) },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn) },
    dispatchEvent(event) { events.push(event.type); for (const fn of listeners.get(event.type) || []) fn(event) },
    __ModuleLoader__: { load({ factory }) { clientApi = factory(() => react) } },
  }
  vm.runInNewContext(instrumented, {
    window, Event: TestEvent, CustomEvent: TestEvent,
    console: { warn: (...args) => warnings.push(args) },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id },
    clearTimeout(id) { timers.delete(id) },
    fetch: async url => {
      requests.push(url)
      const body = fetchBody ? await fetchBody(url) : { ok: true, drafts: [], library: [] }
      return { json: async () => body }
    },
  })
  if (binding) clientApi.wbNavState.bindings[sessionId] = binding
  if (mapped) clientApi.wbNavState.map[sessionId] = mapped
  clientApi.apply({
    slots: { inject() {} }, sidebarRightTabs: { register() {} },
    sidebarRight: { openTab(kind, options) { opens.push({ kind, ...JSON.parse(JSON.stringify(options)) }); if (opens.length <= openFailures) throw Error('surface not mounted') } },
  }, {})
  function render(next = {}) {
    nodes = next.nodes ?? nodes; running = next.running ?? running; sessionId = next.sessionId ?? sessionId
    cursor = 0; dirty = false
    clientApi[component]({ sessionId, useChat: select => select({ legacy: { nodes, partial: running ? {} : null, runningCalls: [] } }), useTabInfo: () => ({ navigation: { params: { client: '客户 A' } } }) })
    pending.splice(0).forEach(fn => fn())
  }
  async function settle() {
    for (let i = 0; i < 15; i++) { await Promise.resolve(); if (dirty) render() }
  }
  function advance(ms) {
    const until = now + ms
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0]
      if (!next || next[1].at > until) break
      const [id, timer] = next; timers.delete(id); now = timer.at; timer.fn()
    }
    now = until
  }
  return { api: clientApi, render, settle, advance, requests, opens, events, warnings, timers,
    refresh() { window.dispatchEvent(new TestEvent('wb:review-refresh')) },
    dispose() { hooks.forEach(hook => hook.cleanup?.()) },
  }
}

test('no-meta sessions open using bindings/map or missing client, without awaiting a fetch', () => {
  for (const options of [{ binding: { client: '绑定客户' }, mapped: { client: '旧客户' } }, { mapped: { client: '映射客户' } }, {}]) {
    const f = harness({ ...options, fetchBody: () => new Promise(() => {}) })
    f.render()
    assert.equal(f.opens.length, 0)
    f.render({ nodes: [user, write()] })
    assert.deepEqual(f.opens, [{ kind: 'wb-review', params: { client: options.binding?.client || options.mapped?.client || '', meta: '' } }])
    f.render({ nodes: [user, write(), write('第二篇')] })
    assert.equal(f.opens.length, 1, 'closing the panel does not reset the once-per-turn marker')
    assert.equal(f.events.filter(type => type === 'wb:review-refresh').length, 2)
    f.render({ nodes: [user, write(), write('第二篇'), user] })
    f.render({ nodes: [user, write(), write('第二篇'), user, write('第三篇')] })
    assert.equal(f.opens.length, 2)
    f.dispose()
  }
})

test('old drafts and streamed deltas do not open the panel or restart draft requests', async () => {
  const f = harness({ binding: { client: '客户 A' }, fetchBody: async () => ({ ok: true, drafts: [{ title: '旧文章' }] }) })
  f.render(); await f.settle()
  for (let i = 0; i < 100; i++) f.render()
  assert.equal(f.opens.length, 0)
  assert.equal(f.requests.length, 1)
  f.render({ nodes: [user, write()] })
  assert.equal(f.requests.length, 2)
  f.refresh(); await f.settle()
  assert.equal(f.requests.length, 3)
  f.dispose()
})

test('openTab retries every 250ms independently of messages and stops on success', () => {
  const f = harness({ openFailures: 2 })
  f.render(); f.render({ nodes: [user, write()] })
  assert.equal(f.opens.length, 1)
  f.advance(249); assert.equal(f.opens.length, 1)
  f.advance(1); assert.equal(f.opens.length, 2)
  f.render({ nodes: [user, write(), write('第二篇')] })
  f.advance(250); assert.equal(f.opens.length, 3)
  f.advance(10000); assert.equal(f.opens.length, 3)
  assert.equal(f.timers.size, 0)
  f.dispose()
})

test('open retries are bounded and cancelled when the session changes or unmounts', () => {
  const f = harness({ openFailures: Infinity })
  f.render(); f.render({ nodes: [user, write()] }); f.advance(20000)
  assert.equal(f.opens.length, 41)
  assert.equal(f.warnings.filter(args => args[0].includes('重试超时')).length, 1)
  assert.equal(f.timers.size, 0)
  f.dispose()
  for (const switchSession of [false, true]) {
    const f = harness({ openFailures: Infinity })
    f.render(); f.render({ nodes: [user, write()] })
    if (switchSession) f.render({ sessionId: 'session-b', nodes: [user] })
    else f.dispose()
    f.advance(10000)
    assert.equal(f.opens.length, 1)
    f.dispose()
  }
})

test('unified shell receives one availability event per turn; mobile has no new auto-open', () => {
  for (const mobile of [false, true]) {
    const f = harness({ unified: true, mobile })
    f.render(); f.render({ nodes: [user, write()] }); f.render({ nodes: [user, write(), write('第二篇')] })
    assert.equal(f.events.filter(type => type === 'dsh:review-available').length, mobile ? 0 : 1)
    assert.equal(f.opens.length, 0)
    f.dispose()
  }
})

test('review with client params observes writes and retries file-list lag at 400/1200ms', async () => {
  let draftReads = 0
  const f = harness({ component: 'ReviewTabBody', fetchBody: async url => {
    if (url.startsWith('/api/workbench/drafts?')) {
      draftReads++
      return { ok: true, drafts: draftReads >= 3 ? [{ title: '新文章' }] : [], library: [] }
    }
    return { ok: true }
  } })
  f.render({ nodes: [user, write()] }); await f.settle()
  assert.equal(draftReads, 1)
  f.advance(399); await f.settle(); assert.equal(draftReads, 1)
  f.advance(1); await f.settle(); assert.equal(draftReads, 2)
  f.advance(1199); await f.settle(); assert.equal(draftReads, 2)
  f.advance(1); await f.settle(); assert.equal(draftReads, 3)
  assert.deepEqual(Array.from(f.api.WB_PICK.drafts, draft => draft.title), ['新文章'])
  assert.equal(f.timers.size, 0)
  f.render({ nodes: [user, write(), write()] }); await f.settle()
  assert.equal(draftReads, 4, 'rewriting the same title also refreshes')
  f.dispose()
})

test('missing-title retries stop after two attempts and are cancelled on unmount', async () => {
  for (const unmount of [false, true]) {
    const f = harness({ component: 'ReviewTabBody' })
    f.render({ nodes: [user, write()] }); await f.settle()
    if (unmount) f.dispose()
    for (const ms of [400, 1200, 10000]) { f.advance(ms); await f.settle() }
    assert.equal(f.requests.filter(url => url.startsWith('/api/workbench/drafts?')).length, unmount ? 1 : 3)
    assert.equal(f.timers.size, 0)
    f.dispose()
  }
})
