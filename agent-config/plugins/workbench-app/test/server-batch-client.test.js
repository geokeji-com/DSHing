import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const apiPath = '/api/v1/workbench/batch'
const pluginPath = '/api/workbench/batch'
const configPath = apiPath + '-config'
const copy = value => JSON.parse(JSON.stringify(value))
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => copy(body) })
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)) }
const makeBatch = (patch = {}) => ({
  id: 'wbb-server', session_id: 's0', driver: 'server', rounds: 3, revision: 1,
  client: '测试客户', client_key: 'CUS-test', meta_id: 'task-test', prompt: '完整生文流程',
  status: 'running', review_opened: false, savedAt: '2026-10-19T00:00:00Z',
  records: [1, 2, 3].map(round => ({ round, status: 'pending', title: '', angle: '' })), ...patch,
})

function load({ cloud = true, mobile = false, config = () => response({ ok: true, server: true, mode: '1' }) } = {}) {
  let api, now = 100000, current, hookIndex, nextTimer = 0, stopped = 0, running = false
  let intercept = () => undefined, items = {}
  const requests = [], events = [], drafts = [], sends = [], opens = [], updates = []
  const timers = new Map(), listeners = new Map(), storage = new Map(), batches = new Map()
  const on = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn) }
  const off = (type, fn) => listeners.get(type)?.delete(fn)
  const emit = event => { events.push(event); for (const fn of listeners.get(event.type) || []) fn(event) }
  class TestEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail } }
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }), createPortal: node => node,
    useRef(value) { const i = hookIndex++; return current.hooks[i] ||= { current: value } },
    useState(value) {
      const i = hookIndex++, instance = current
      if (!(i in instance.hooks)) {
        if (instance.component === 'WorkbenchPage') {
          if (value?.status === 'loading' && value.customers) value = { status: 'ready', customers: [{ id: 'CUS-test', name: '测试客户' }] }
          if (value?.status === 'loading' && value.skills) value = { status: 'ready', skills: [{ name: '测试技能' }] }
          if (value?.key === '') value = { key: 'CUS-test', line: '', period: '' }
        }
        instance.hooks[i] = value
      }
      return [instance.hooks[i], next => {
        instance.hooks[i] = typeof next === 'function' ? next(instance.hooks[i]) : next
        updates.push(instance.hooks[i])
      }]
    },
    useEffect(fn, deps) {
      const i = hookIndex++, before = current.hooks[i]
      if (!before || deps.some((v, j) => v !== before.deps[j])) current.effects.push(() => {
        before?.cleanup?.(); const cleanup = fn(); current.hooks[i] = { deps, cleanup }
      })
    },
  }
  const window = {
    matchMedia: () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} }),
    addEventListener: on, removeEventListener: off, dispatchEvent: emit,
    __ModuleLoader__: { load({ factory }) { api = factory(() => react) } },
  }
  if (cloud) window.dshUnified = { store: { state: { uid: 'alice', status: 'ready', selection: { clientKey: 'CUS-test' } }, subscribe: () => () => {} } }
  const document = {
    body: {}, visibilityState: 'visible', addEventListener: on, removeEventListener: off,
    querySelector: () => null,
    querySelectorAll: () => running ? [{ textContent: '停止生成', getAttribute: () => '', click() { stopped++; running = false } }] : [],
  }
  const instrumented = source.replace('return module.exports;', `return { ...module.exports,
    wbServerBatch, wbBatchPost, wbBatchSave, wbBatchSend, wbBatchTick, wbBatchStop,
    wbBatchKey, wbBatches, wbBatchFor, wbRunStatus, wbNavBatch, wbNavState, wbNavRunState, wbNavStatus,
    wbNavPollSessionStatus, wbNavEmit, wbRememberServerBatch, wbCacheWorkspace, BatchRelay, PromptRelay, WorkbenchPage, PickBar, wbBatchRoundLabel,
    pending: () => pendingPrompt, setPending: p => { pendingPrompt = p; }, context: ctx => { WbCtx = ctx; },
    watchBatchSend: fn => { var send = wbBatchSend; wbBatchSend = (...args) => { fn(); return send(...args); }; }
  };`).replace('function startDrag(event) {', 'if (props.captureDispatch) return props.captureDispatch(dispatch, setCounts);\nfunction startDrag(event) {')
  const webStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  vm.runInNewContext(instrumented, {
    window, document, Event: TestEvent, CustomEvent: TestEvent, console,
    localStorage: webStorage, sessionStorage: webStorage,
    Date: class extends Date { static now() { return now } },
    setInterval(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id }, clearInterval: id => timers.delete(id),
    fetch: async (url, options = {}) => {
      const body = options.body && JSON.parse(options.body)
      requests.push({ url, body, options })
      const intercepted = intercept(url, options)
      if (intercepted !== undefined) return intercepted
      if (url === configPath) return config()
      const parsed = new URL(url, 'http://test')
      if ([apiPath, pluginPath].includes(parsed.pathname)) {
        const server = parsed.pathname === apiPath
        if (body) {
          if (server) assert.equal(Object.hasOwn(body, 'records'), false, 'server records are read-only')
          let batch = batches.get(body.id)
          if (!batch) batch = makeBatch({ ...body, driver: server ? 'server' : 'client' })
          else if (body.op === 'stop') batch = { ...batch, status: server ? 'stopping' : 'stopped', revision: batch.revision + 1 }
          else {
            if (body.revision !== batch.revision) return response({ ok: false, batch, error: 'revision-conflict' }, 409)
            batch = { ...batch, ...body, revision: batch.revision + 1 }
          }
          batches.set(batch.id, batch)
          return response({ ok: true, batch })
        }
        if (parsed.searchParams.has('session_ids')) {
          const ids = parsed.searchParams.get('session_ids').split(',')
          return response({ ok: true, items: Object.fromEntries([...batches.values()].filter(b => b.driver === 'server' && ids.includes(b.session_id)).map(b => [b.session_id, b])) })
        }
        const batch = parsed.searchParams.has('id') ? batches.get(parsed.searchParams.get('id')) : [...batches.values()].find(b => b.session_id === parsed.searchParams.get('session_id'))
        return response(batch ? { ok: true, batch } : { ok: false }, batch ? 200 : 404)
      }
      if (parsed.pathname === '/api/workbench/session-status') {
        const ids = parsed.searchParams.get('ids').split(',')
        return response({ ok: true, items: Object.fromEntries(ids.filter(id => items[id]).map(id => [id, items[id]])) })
      }
      if (url === '/api/workbench/task-meta') return response({ ok: true, id: 'task-test' })
      if (url === '/api/workbench/session-create') return response({ ok: true, sessionId: 's0' })
      return response({ ok: true })
    },
  })
  api.wbNavState.uid = 'alice'
  api.wbNavRunState()
  api.context({ sidebarRight: { openTab: (...args) => opens.push(args) } })
  const actions = { setDraft: text => drafts.push(text), submit: async () => sends.push(drafts.at(-1)) }
  const view = { sessionId: 's0', actions, alive: () => true, nodes: () => [], running: () => running }
  function component(name, props) {
    const instance = { component: name, hooks: [], effects: [], tree: null }
    function render(runEffects = true) {
      current = instance; hookIndex = 0; instance.tree = api[name](props)
      if (runEffects) instance.effects.splice(0).forEach(fn => fn())
      else instance.effects.length = 0
      return instance.tree
    }
    return { render, dispose() { instance.hooks.forEach(hook => hook?.cleanup?.()) } }
  }
  function seed(batch = makeBatch()) {
    batches.set(batch.id, copy(batch))
    const entry = { batch: copy(batch) }; api.wbBatches[api.wbBatchKey(batch.session_id)] = entry
    return entry
  }
  function list(count = 1) {
    api.wbNavState.map = Object.fromEntries(Array.from({ length: count }, (_, i) => ['s' + i, { client: '测试客户' }]))
    api.wbNavState.sessions = Object.fromEntries(Object.keys(api.wbNavState.map).map(id => [id, { id, running: false }]))
  }
  return { api, requests, events, drafts, sends, opens, updates, timers, storage, window, document, batches, actions, view, seed, component, list,
    get stopped() { return stopped }, set running(value) { running = value },
    set config(fn) { config = fn }, set intercept(fn) { intercept = fn }, set items(value) { items = value },
    advance(ms) { now += ms }, async timersTick(ms) { now += ms; for (const timer of [...timers.values()]) await timer.fn(); await settle() },
    async mount() {
      const c = component('BatchRelay', { sessionId: 's0', inputActions: actions })
      c.render(); await settle(); return c
    },
    async bar(sessionId = 's0') {
      const c = component('PickBar', { sessionId })
      c.render(); await settle(); return c
    },
  }
}

test('config shares in-flight requests, caches per page and rechecks only after 60 seconds', async () => {
  let release
  const f = load({ config: () => new Promise(resolve => { release = resolve }) })
  const first = f.api.wbServerBatch(), second = f.api.wbServerBatch()
  assert.equal(first, second)
  assert.equal(f.requests.length, 1)
  release(response({ ok: true, server: true }))
  assert.equal(await first, true)
  f.advance(59999)
  assert.equal(await f.api.wbServerBatch(), true)
  assert.equal(f.requests.length, 1)
  f.advance(1); f.config = () => response({ ok: true, server: false, mode: 'dryrun' })
  assert.equal(await f.api.wbServerBatch(), false)
  assert.equal(f.requests.length, 2)
})

test('config failure, missing/unauthorized route, non-JSON and malformed flags select client mode', async () => {
  for (const config of [
    () => { throw Error('offline') },
    () => response({ ok: true, server: true }, 404),
    () => response({ ok: true, server: true }, 401),
    () => ({ ok: true, json: async () => { throw Error('HTML') } }),
    () => response({ ok: false, server: true }), () => response({ ok: true, server: 'true' }),
    () => response({ ok: true, server: false, mode: '0' }),
  ]) {
    const f = load({ config })
    assert.equal(await f.api.wbServerBatch(), false)
    assert.equal(await f.api.wbServerBatch(), false)
    assert.equal(f.requests.length, 1)
    f.config = () => response({ ok: true, server: true }); f.advance(60000)
    assert.equal(await f.api.wbServerBatch(), true, 'failures can recover after the cache expires')
  }
})

test('server relay never sends or writes records for pending, sending or sent rounds', async () => {
  for (const status of ['pending', 'sending', 'sent']) {
    const f = load(), batch = makeBatch()
    batch.records[0] = { round: 1, status: 'ok', title: '第一篇' }
    batch.records[1].status = status
    const entry = f.seed(batch)
    let batchSendCalls = 0
    f.api.watchBatchSend(() => batchSendCalls++)
    await f.api.wbBatchTick(entry, f.view)
    f.advance(20000); await f.api.wbBatchTick(entry, f.view)
    assert.equal(batchSendCalls, 0, 'the server relay must not call wbBatchSend')
    await f.api.wbBatchSend(entry, f.actions, 'should not send', () => true)
    assert.equal(await f.api.wbBatchSave(entry, { records: batch.records }), false)
    assert.deepEqual(f.drafts, []); assert.deepEqual(f.sends, [])
    assert.equal(f.api.pending(), null)
    assert.ok(f.requests.every(r => !r.body && r.url.startsWith(apiPath + '?')))
    assert.equal(f.api.wbBatchFor('s0').records[1].status, status)
  }
})

test('mounted server relay discovers without history and polls every 3s until unmount', async () => {
  const f = load(), batch = makeBatch()
  batch.records[0].status = 'sent'; f.batches.set(batch.id, batch)
  const c = await f.mount()
  assert.equal(f.requests.filter(r => r.url.startsWith(apiPath + '?')).length, 1)
  assert.ok(f.requests.some(r => r.url === apiPath + '?session_id=s0'))
  assert.equal(c.render(), null, 'desktop no longer renders the floating batch card')
  const bar = await f.bar()
  assert.match(JSON.stringify(bar.render()), /第 1\/3 轮/)
  bar.dispose()
  for (const ms of [1000, 1000]) await f.timersTick(ms)
  assert.equal(f.requests.filter(r => r.url.startsWith(apiPath + '?')).length, 1)
  await f.timersTick(1000)
  assert.equal(f.requests.filter(r => r.url.startsWith(apiPath + '?')).length, 2)
  c.dispose(); const count = f.requests.length
  await f.timersTick(3000)
  assert.equal(f.requests.length, count)
  assert.deepEqual(f.drafts, []); assert.deepEqual(f.sends, [])
})

test('late missing-batch reads cannot erase a batch created while discovery/list polling was in flight', async () => {
  for (const list of [false, true]) {
    const f = load(); f.list()
    let release
    f.intercept = url => url.startsWith(apiPath + (list ? '?session_ids=' : '?session_id='))
      ? new Promise(resolve => { release = resolve }) : undefined
    const mounted = list ? f.api.wbNavPollSessionStatus() : await f.mount()
    await settle()
    const entry = f.seed()
    release(response(list ? { ok: true, items: {} } : { ok: false }, list ? 200 : 404))
    await settle()
    assert.equal(f.api.wbBatchFor('s0'), entry.batch)
    mounted.dispose()
  }
})

test('mobile floating card stop button posts server op:stop and stops visible generation immediately', async () => {
  const f = load({ mobile: true }), entry = f.seed(), c = await f.mount()
  f.running = true
  const button = c.render().children.find(node => node?.type === 'button')
  button.props.onClick()
  assert.equal(f.stopped, 1)
  await settle()
  assert.equal(entry.batch.status, 'stopping')
  assert.match(JSON.stringify(c.render()), /正在停止本批/)
  assert.deepEqual(f.requests.filter(r => r.body).map(r => ({ url: r.url, body: r.body })), [
    { url: apiPath, body: { id: entry.batch.id, revision: 1, op: 'stop' } },
  ])
  c.dispose()
})

test('desktop pick-bar stop button posts server op:stop, stops generation and shows 正在停止', async () => {
  const f = load(), entry = f.seed(), c = await f.mount(), bar = await f.bar()
  assert.equal(c.render(), null)
  f.running = true
  const find = (node, cls) => node && typeof node === 'object' ? (node.props?.className === cls ? node : (node.children || []).flat().map(n => find(n, cls)).find(Boolean)) : null
  const tree = bar.render()
  assert.equal(tree.props.className, 'wb_pkRow is-round', 'batch-only bar renders just the round part')
  assert.equal(find(tree, 'wb_pkK'), undefined)
  find(tree, 'wb_pkStop').props.onClick()
  assert.equal(f.stopped, 1)
  await settle()
  assert.equal(entry.batch.status, 'stopping')
  const after = JSON.stringify(bar.render())
  assert.match(after, /第 1\/3 轮 · 正在停止/)
  assert.doesNotMatch(after, /停止本批/)
  assert.deepEqual(f.requests.filter(r => r.body).map(r => ({ url: r.url, body: r.body })), [
    { url: apiPath, body: { id: entry.batch.id, revision: 1, op: 'stop' } },
  ])
  c.dispose(); bar.dispose()
})

test('round label copy: running / stopping / stopped / ended; single round and mobile show nothing', async () => {
  const f = load(), label = f.api.wbBatchRoundLabel
  const b = (status, done = 1) => makeBatch({ status, records: [1, 2, 3].map(round => ({ round, status: round <= done ? 'ok' : 'pending' })) })
  assert.equal(label(b('running')), '第 2/3 轮')
  assert.equal(label(b('stopping')), '第 2/3 轮 · 正在停止')
  assert.equal(label(b('stopped')), '第 2/3 轮 · 已停止')
  assert.equal(label(b('done', 3)), '共 3 轮 · 本批已结束')
  assert.equal(label(b('failed_partial', 3)), '共 3 轮 · 本批已结束')
  assert.equal(label(makeBatch({ rounds: 1, records: [{ round: 1, status: 'pending' }] })), '')
  assert.equal(label(undefined), '')
  assert.equal((await f.bar()).render(), null, 'no batch, no drafts: no bar')
  const m = load({ mobile: true }); m.seed()
  assert.equal((await m.bar()).render(), null, 'mobile keeps the floating card, bar shows no round')
})

test('done/failed_partial open unified review once, acknowledge it, and retain batch titles/progress', async () => {
  for (const status of ['done', 'failed_partial']) {
    const f = load(), batch = makeBatch({ status })
    batch.records = [1, 2, 3].map(round => ({ round, status: status === 'failed_partial' && round === 2 ? 'failed' : 'ok', title: '文章' + round, reason: '资料不足' }))
    const entry = f.seed(batch)
    await Promise.all([f.api.wbBatchTick(entry, f.view), f.api.wbBatchTick(entry, f.view)])
    await f.api.wbBatchTick(entry, f.view)
    assert.equal(f.events.filter(e => e.type === 'dsh:review-available').length, 1)
    const posts = f.requests.filter(r => r.body)
    assert.equal(posts.length, 1)
    assert.equal(posts[0].url, apiPath)
    assert.deepEqual(posts[0].body, { id: batch.id, revision: 1, review_opened: true })
    assert.equal(f.api.wbWriteProgress(null, f.api.wbBatchFor('s0'), {}).done, status === 'done' ? 3 : 2)
    const restored = load(); const saved = restored.seed(entry.batch)
    await restored.api.wbBatchTick(saved, restored.view)
    assert.equal(restored.events.filter(e => e.type === 'dsh:review-available').length, 0)
    assert.deepEqual(f.drafts, []); assert.deepEqual(f.sends, [])
  }
})

test('server completion on mobile opens the existing batch review surface once', async () => {
  const f = load({ mobile: true }), batch = makeBatch({ status: 'done' })
  batch.records = batch.records.map(r => ({ ...r, status: 'ok', title: '文章' + r.round }))
  const entry = f.seed(batch)
  await f.api.wbBatchTick(entry, f.view); await f.api.wbBatchTick(entry, f.view)
  assert.equal(f.events.filter(e => e.type === 'wb:batch-review').length, 1)
  assert.equal(f.events.find(e => e.type === 'wb:batch-review').detail.sessionId, 's0')
  assert.equal(f.requests.filter(r => r.body?.review_opened).length, 1)
})

test('opening a completed server batch immediately opens review even if every round failed', async () => {
  const f = load(), batch = makeBatch({ status: 'failed_partial' })
  batch.records = batch.records.map(r => ({ ...r, status: 'failed', reason: '资料不足' }))
  f.batches.set(batch.id, batch)
  const c = await f.mount()
  assert.equal(f.events.filter(e => e.type === 'dsh:review-available').length, 1)
  assert.equal(f.requests.filter(r => r.body?.review_opened).length, 1)
  assert.equal(c.render(), null)
  const bar = JSON.stringify((await f.bar()).render())
  assert.match(bar, /共 3 轮 · 本批已结束/)
  assert.match(bar, /3 轮失败/)
  assert.match(bar, /第 2 轮：资料不足/)
  assert.doesNotMatch(bar, /停止本批/)
  const m = load({ mobile: true }); m.batches.set(batch.id, batch)
  const card = JSON.stringify((await m.mount()).render())
  assert.match(card, /本批已结束/)
  assert.match(card, /资料不足/)
  await f.timersTick(3000)
  assert.equal(f.events.filter(e => e.type === 'dsh:review-available').length, 1)
  c.dispose()
})

test('review conflict observes acknowledgement without opening twice; stopped batches do not open review', async () => {
  const f = load(), entry = f.seed(makeBatch({ status: 'done', records: [{ round: 1, status: 'ok', title: '草稿' }] }))
  f.intercept = (url, opts) => {
    if (url === apiPath && opts.body) {
      const batch = { ...entry.batch, review_opened: true, revision: 2 }
      f.batches.set(batch.id, batch)
      return response({ ok: false, error: 'revision-conflict', batch }, 409)
    }
  }
  await f.api.wbBatchTick(entry, f.view); await f.api.wbBatchTick(entry, f.view)
  assert.equal(f.events.filter(e => e.type === 'dsh:review-available').length, 0)
  for (const status of ['stopping', 'stopped']) {
    const stopped = f.seed(makeBatch({ status }))
    const count = f.requests.filter(r => r.body).length
    await f.api.wbBatchTick(stopped, f.view)
    assert.equal(f.requests.filter(r => r.body).length, count)
  }
})

test('server driver remains read-only and uses the server endpoint after config flips false or fails', async () => {
  const f = load(), entry = f.seed()
  assert.equal(await f.api.wbServerBatch(), true)
  for (const config of [() => response({ ok: true, server: false }), () => { throw Error('offline') }]) {
    f.config = config; f.advance(60000)
    assert.equal(await f.api.wbServerBatch(), false)
    await f.api.wbBatchTick(entry, f.view)
    await f.api.wbBatchSend(entry, f.actions, 'never send', () => true)
    assert.equal(f.api.wbBatchFor('s0').driver, 'server')
  }
  assert.deepEqual(f.drafts, []); assert.deepEqual(f.sends, [])
  assert.ok(f.requests.every(r => !r.url.startsWith(pluginPath) && !r.body))
  await f.api.wbBatchStop(entry, 's0')
  assert.equal(f.requests.at(-1).url, apiPath)
})

test('list merge prefers server batch, keeps draft counts and displays idle sessions as running', () => {
  const f = load(), batch = makeBatch(), plugin = { id: 'wbb-plugin', status: 'running', rounds: 2, savedAt: '2099-01-01' }
  batch.records[0].status = 'ok'; batch.records[1].status = 'sent'
  const items = { s0: { batch: plugin, drafts_pending: 4, finished_at: 'old' } }
  const merged = f.api.wbMergeBatchStatus(items, { s0: batch, wrong: batch })
  assert.equal(merged.s0.batch, batch)
  assert.equal(merged.s0.drafts_pending, 4)
  assert.equal(merged.s0.finished_at, null)
  assert.equal(merged.wrong, undefined)
  assert.equal(items.s0.batch, plugin, 'pure merge does not mutate inputs')
  f.list(); f.api.wbNavState.statusInfo = merged; f.api.wbBatches[f.api.wbBatchKey('s0')] = { batch: plugin }
  assert.equal(f.api.wbNavStatus('s0').kind, 'running')
  assert.equal(f.api.wbNavStatus('s0').extra, '2/3 轮')
  const attention = f.api.wbRunStatus({ summary: { running: false }, batch, pendingInteraction: 'approval' })
  assert.equal(attention.extra, '等你确认')
})

test('server list reads share the visible 10s poll, chunk at 50, and populate batch cache', async () => {
  const f = load(); f.list(101)
  const batch = makeBatch(); f.batches.set(batch.id, batch)
  f.items = { s0: { drafts_pending: 2, batch: { id: 'wbb-plugin', status: 'failed_partial' } } }
  const poll = f.api.wbNavPollSessionStatus(); await settle()
  const listRequests = () => f.requests.filter(r => r.url.startsWith(apiPath + '?session_ids='))
  assert.deepEqual(listRequests().map(r => new URL(r.url, 'http://test').searchParams.get('session_ids').split(',').length), [50, 50, 1])
  assert.equal(f.api.wbBatchFor('s0').id, batch.id)
  assert.equal(f.api.wbNavState.statusInfo.s0.drafts_pending, 2)
  assert.equal(f.api.wbNavStatus('s0').kind, 'running')
  assert.ok([...f.timers.values()].every(timer => timer.ms === 10000))
  await f.timersTick(10000)
  assert.equal(listRequests().length, 6)
  assert.equal(f.requests.filter(r => r.url === configPath).length, 1)
  f.document.visibilityState = 'hidden'; f.window.dispatchEvent({ type: 'visibilitychange' })
  const count = f.requests.length; await poll.refresh(); await f.timersTick(10000)
  assert.equal(f.requests.length, count)
  poll.dispose()
})

test('list failures preserve known server batches, ACL omissions clear them, and stale users cannot receive results', async () => {
  const f = load(); f.list(); const batch = makeBatch(); f.batches.set(batch.id, batch)
  const poll = f.api.wbNavPollSessionStatus(); await settle()
  f.items = { s0: { batch: { id: 'wbb-plugin', status: 'running', round: 1, rounds: 2, savedAt: '2099' } } }
  f.intercept = url => url.startsWith(apiPath + '?session_ids=') ? Promise.reject(Error('offline')) : undefined
  await poll.refresh()
  assert.equal(f.api.wbNavBatch('s0').driver, 'server')
  f.intercept = () => undefined; f.batches.clear(); f.items = {}
  await poll.refresh()
  assert.equal(f.api.wbBatchFor('s0'), undefined)
  assert.equal(f.api.wbNavState.statusInfo.s0, undefined)
  let release
  f.intercept = url => url.startsWith(apiPath + '?session_ids=') ? new Promise(resolve => { release = resolve }) : undefined
  const pending = poll.refresh(); await settle()
  f.window.dshUnified.store.state.uid = 'bob'; f.api.wbNavRunState()
  release(response({ ok: true, items: { s0: batch } })); await pending
  assert.equal(f.api.wbBatchFor('s0'), undefined)
  assert.deepEqual(copy(f.api.wbNavState.statusInfo), {})
  poll.dispose()
})

test('cart creates on selected route with a session id before the one PromptRelay first turn', async () => {
  for (const server of [true, false]) {
    for (const fallback of [false, true]) {
      const f = load({ config: () => response({ ok: true, server }) })
      const workspace = { async openWorkspace(id, callback) { callback('s0') }, openSession() {} }
      if (fallback) delete workspace.openWorkspace
      const ctx = { get: name => name === 'uiWorkspace' ? workspace : undefined }
      f.api.wbCacheWorkspace({ workspace: { personal: { id: 'own', path: '/test' }, legacySharedIds: [] } })
      let dispatch, counts
      const page = f.component('WorkbenchPage', { ctx, captureDispatch(fn, setCounts) { dispatch = fn; counts = setCounts } })
      page.render(false); counts({ 测试技能: 3 }); page.render(false)
      await dispatch()
      const creates = f.requests.filter(r => [apiPath, pluginPath].includes(r.url) && r.body?.rounds)
      assert.equal(creates.length, 1)
      assert.equal(creates[0].url, server ? apiPath : pluginPath)
      if (server) assert.equal(creates[0].body.session_id, 's0')
      assert.ok(f.api.pending()?.batchId)
      let batchSendCalls = 0
      f.api.watchBatchSend(() => batchSendCalls++)
      const target = f.component('PromptRelay', { sessionId: 's0', inputActions: f.actions, useChat: select => select({ legacy: { nodes: [] } }) })
      target.render(); await settle(); target.render(); await settle()
      assert.equal(f.sends.length, 1)
      assert.equal(batchSendCalls, server ? 0 : 1)
      assert.match(f.sends[0], /第 1\/3 轮/)
      if (server) assert.ok(f.requests.every(r => !r.body?.records))
      target.dispose()
    }
  }
})

test('delayed first-turn binding cannot send after stop or navigation', async () => {
  for (const stop of [true, false]) {
    const f = load(), entry = f.seed()
    let release
    f.intercept = url => url === '/api/workbench/session-client' ? new Promise(resolve => { release = resolve }) : undefined
    // A real cart leaves this binding for PromptRelay before dispatching its event.
    f.storage.set('wb-pending-bind', JSON.stringify({ client_key: 'CUS-test', client: '测试客户' }))
    f.api.setPending({ text: '首轮', sessionId: 's0', batchId: entry.batch.id })
    const mounted = f.component('PromptRelay', { sessionId: 's0', inputActions: f.actions })
    mounted.render()
    if (stop) await f.api.wbBatchStop(entry, 's0')
    else mounted.dispose()
    release(response({ ok: true })); await settle()
    assert.deepEqual(f.sends, [])
    assert.deepEqual(f.drafts, [])
    if (stop) mounted.dispose()
  }
})

test('failed server creation leaves no pending prompt and never falls back to client creation', async () => {
  const f = load(), workspace = { async openWorkspace(id, callback) { callback('s0') } }
  f.api.wbCacheWorkspace({ workspace: { personal: { id: 'own', path: '/test' }, legacySharedIds: [] } })
  f.intercept = (url, opts) => url === apiPath && opts.body ? response({ ok: false, error: 'server-batch-off' }, 409) : undefined
  let dispatch, counts
  const page = f.component('WorkbenchPage', { ctx: { get: () => workspace }, captureDispatch(fn, setCounts) { dispatch = fn; counts = setCounts } })
  page.render(false); counts({ 测试技能: 3 }); page.render(false)
  await dispatch()
  assert.equal(f.api.pending(), null)
  assert.ok(f.updates.some(value => typeof value === 'string' && value.includes('server-batch-off')))
  assert.ok(f.requests.every(r => r.url !== pluginPath))
  assert.deepEqual(f.sends, [])
})
