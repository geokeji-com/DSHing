import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const plain = value => JSON.parse(JSON.stringify(value))
const doneAt = '2026-10-19T03:42:00Z'
const failed = { id: 'wbb-failed', status: 'failed_partial', round: 3, rounds: 3, failed: 1, savedAt: doneAt }
const info = (batch = failed, drafts_pending = 0) => ({ batch, drafts_pending, finished_at: doneAt })
const settle = () => new Promise(resolve => setImmediate(resolve))

function load({ values = new Map(), visible = true } = {}) {
  let api, now = Date.parse(doneAt) + 1000, nextTimer = 0, reply = () => info(), fetcher
  const requests = [], listeners = new Map(), timers = new Map()
  const document = { visibilityState: visible ? 'visible' : 'hidden',
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type),
  }
  const react = { createElement: (type, props, ...children) => ({ type, props, children }) }
  const window = { matchMedia: () => ({ matches: false }), __ModuleLoader__: { load({ factory }) { api = factory(() => react) } } }
  vm.runInNewContext(source.replace('return module.exports;', `return {wbRunStatus, wbSessionStatus, wbNavState, wbNavRunState, wbNavStatus,
    wbNavSelect, wbNavSnapshot, wbNavEmit, wbNavBatchChanged, wbNavStatusIds, wbBatchViews, wbBatchKey, wbBatches,
    start() { return wbNavStatusPoll = wbNavPollSessionStatus(); }};`), {
    window, document,
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    Date: class extends Date { static now() { return now } },
    setInterval(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id },
    clearInterval: id => timers.delete(id),
    fetch: async (url, options) => {
      const ids = new URL(url, 'http://test').searchParams.get('ids').split(',')
      requests.push({ ids, options })
      if (fetcher) return fetcher(ids)
      return { json: async () => ({ ok: true, items: Object.fromEntries(ids.map(id => [id, reply(id)])) }) }
    },
  })
  api.wbNavState.uid = 'alice'
  api.wbNavRunState()
  function sessions(count = 1) {
    api.wbNavState.map = Object.fromEntries(Array.from({ length: count }, (_, i) => ['s' + i, { client: '客户', topic: '任务 ' + i }]))
    api.wbNavSnapshot({ byId: Object.fromEntries(Object.keys(api.wbNavState.map).map(id => [id, { id, running: false }])) })
  }
  return { api, values, requests, timers, listeners, sessions,
    set reply(fn) { reply = fn }, set fetcher(fn) { fetcher = fn },
    async advance(ms) { now += ms; for (const timer of [...timers.values()]) { assert.equal(timer.ms, 10000); await timer.fn() } await settle() },
    async visibility(value) { document.visibilityState = value; listeners.get('visibilitychange')?.(); await settle() },
  }
}

test('aggregate priority and mobile wording match attention/running/failed/review/done', () => {
  const { api } = load(), summary = { id: 's', running: false }, unread = { s: Date.parse(doneAt) }
  const derive = extra => api.wbRunStatus({ summary, unread, statusInfo: info(failed, 2), ...extra })
  assert.equal(derive({ pendingInteraction: 'approval', summary: { ...summary, running: true } }).kind, 'attention')
  assert.equal(derive({ summary: { ...summary, running: true } }).kind, 'running')
  assert.equal(derive().kind, 'failed')
  assert.equal(derive().label, '失败 · 点开查看原因')
  const review = derive({ batchFailureRead: true })
  assert.equal(review.kind, 'review')
  assert.equal(review.tone, 'warn')
  assert.equal(review.extra, '2 篇待审')
  assert.equal(api.wbSessionStatus(review).label, '2 篇草稿待审')
  assert.equal(derive({ batchFailureRead: true, statusInfo: info() }).kind, 'idle')
  assert.equal(derive({ statusInfo: info({ ...failed, failed: 0, status: 'done' }) }).kind, 'done')
  assert.equal(derive({ summary: null }).kind, 'idle')
})

test('paused batches show their next round unless the current session has a mounted relay', () => {
  const f = load(), { api } = f
  f.sessions()
  api.wbNavState.statusInfo.s0 = info({ id: 'wbb-next', status: 'running', round: 2, rounds: 5 })
  assert.equal(api.wbNavStatus('s0').extra, '待继续 2/5')
  assert.equal(api.wbSessionStatus(api.wbNavStatus('s0')).label, '待继续 第 2/5 轮')
  api.wbNavSelect('s0')
  assert.equal(api.wbNavStatus('s0').kind, 'attention', 'opening alone does not prove a relay is mounted')
  api.wbBatchViews[api.wbBatchKey('s0')] = [{}]
  assert.equal(api.wbNavStatus('s0').kind, 'attention', 'a mounted relay without this batch/actions cannot drive it')
  api.wbBatchViews[api.wbBatchKey('s0')] = [{ batchId: 'wbb-next', driving: true }]
  assert.equal(api.wbNavStatus('s0').kind, 'idle')
  api.wbNavSelect('other')
  assert.equal(api.wbNavStatus('s0').kind, 'attention', 'stale views cannot drive a background session')
  api.wbNavSnapshot({ byId: { s0: { running: true } } })
  assert.equal(api.wbNavStatus('s0').extra, '2/5 轮')
  assert.equal(api.wbNavStatus('s0').kind, 'running')
})

test('opening a batch failure clears it across reload and review saves, scoped by uid and batch', () => {
  const f = load(), { api } = f
  f.sessions()
  api.wbNavState.statusInfo.s0 = info()
  assert.equal(api.wbNavStatus('s0').kind, 'failed')
  api.wbNavSelect('s0'); api.wbNavSelect('other')
  assert.equal(api.wbNavStatus('s0').kind, 'idle')
  const restored = load({ values: f.values })
  restored.sessions()
  restored.api.wbNavState.statusInfo.s0 = info({ ...failed, review_opened: true, savedAt: '2026-10-19T04:00:00Z' }, 1)
  assert.equal(restored.api.wbNavStatus('s0').kind, 'review')
  restored.api.wbNavState.statusInfo.s0 = info({ ...failed, id: 'wbb-new' })
  assert.equal(restored.api.wbNavStatus('s0').kind, 'failed')
  restored.api.wbNavState.uid = 'bob'
  assert.equal(restored.api.wbNavStatus('s0').kind, 'idle', 'old user aggregate is discarded')
  restored.api.wbNavState.statusInfo.s0 = info()
  assert.equal(restored.api.wbNavStatus('s0').kind, 'failed', 'read acknowledgements are isolated')
})

test('late aggregate after opening acknowledges old failures and newer local batch saves win', async () => {
  const f = load(), { api } = f
  f.sessions()
  api.wbNavSelect('s0'); api.wbNavSelect('other')
  const poll = api.start(); await settle()
  assert.equal(api.wbNavStatus('s0').kind, 'idle')
  api.wbBatches[api.wbBatchKey('s0')] = { batch: { id: 'wbb-local', status: 'running', round: 1, rounds: 2, savedAt: '2026-10-20T00:00:00Z' } }
  assert.equal(api.wbNavStatus('s0').kind, 'attention')
  poll.dispose()
})

test('opening a running batch does not acknowledge a later background failure', () => {
  const f = load(), { api } = f
  f.sessions()
  api.wbNavState.statusInfo.s0 = info({ ...failed, status: 'running' })
  api.wbNavSelect('s0'); api.wbNavSelect('other')
  api.wbNavState.statusInfo.s0 = info({ ...failed, savedAt: '2026-10-20T00:00:00Z' })
  assert.equal(api.wbNavStatus('s0').kind, 'failed')
  api.wbNavSelect('s0'); api.wbNavSelect('other')
  assert.equal(api.wbNavStatus('s0').kind, 'idle')
})

test('polls once on mount and every visible 10s, chunks at 50, and refreshes on running stop', async () => {
  const f = load(), { api } = f
  f.sessions(101)
  const poll = api.start(); await settle()
  assert.deepEqual(f.requests.map(r => r.ids.length), [50, 50, 1])
  assert.ok(f.requests.every(r => r.options.method === 'GET'))
  assert.equal(Object.keys(api.wbNavState.statusInfo).length, 101)
  await f.advance(10000)
  assert.equal(f.requests.length, 6)
  api.wbNavSnapshot({ byId: { s0: { running: true } } })
  await settle(); assert.equal(f.requests.length, 6)
  api.wbNavSnapshot({ byId: { s0: { running: false } } })
  await settle(); assert.equal(f.requests.length, 9)
  api.wbNavSnapshot({ byId: { s0: { running: false } } })
  await settle(); assert.equal(f.requests.length, 9)
  await f.visibility('hidden')
  assert.equal(f.timers.size, 0)
  api.wbNavSnapshot({ byId: { s0: { running: true } } })
  api.wbNavSnapshot({ byId: { s0: { running: false } } })
  await poll.refresh(); await f.advance(20000)
  assert.equal(f.requests.length, 9)
  await f.visibility('visible')
  assert.equal(f.requests.length, 12)
  poll.dispose()
  assert.equal(f.timers.size, 0)
  assert.equal(f.listeners.size, 0)
  await poll.refresh(); api.wbNavEmit(); await settle()
  assert.equal(f.requests.length, 12)
})

test('hidden mount is quiet; loaded/search-filtered list changes refresh only listed ids', async () => {
  const f = load({ visible: false }), { api } = f
  const poll = api.start()
  f.sessions(2); await settle()
  assert.equal(f.requests.length, 0)
  await f.visibility('visible')
  assert.deepEqual(f.requests[0].ids, ['s0', 's1'])
  api.wbNavState.q = '任务 1'; api.wbNavEmit(); await settle()
  assert.deepEqual(f.requests[1].ids, ['s1'])
  api.wbNavState.map.s2 = { topic: '任务 1', client: '新客户' }; api.wbNavEmit(); await settle()
  assert.deepEqual(f.requests[2].ids, ['s1', 's2'])
  f.fetcher = async () => ({ json: async () => ({ ok: true, items: {} }) })
  await poll.refresh()
  assert.equal(api.wbNavState.statusInfo.s1, undefined, 'ACL omission clears old facts')
  poll.dispose()
})

test('in-flight results cannot cross uid, visibility or disposal; edges coalesce for a fresh retry', async () => {
  for (const change of ['uid', 'hidden', 'dispose', 'edge']) {
    const f = load(), { api } = f
    f.sessions(51)
    let release
    f.fetcher = () => new Promise(resolve => { release = () => resolve({ json: async () => ({ ok: true, items: { s0: info() } }) }) })
    const poll = api.start()
    assert.equal(f.requests.length, 1)
    if (change === 'uid') { api.wbNavState.uid = 'bob'; api.wbNavRunState() }
    if (change === 'hidden') await f.visibility('hidden')
    if (change === 'dispose') poll.dispose()
    if (change === 'edge') {
      api.wbNavSnapshot({ byId: { s0: { running: true } } })
      api.wbNavSnapshot({ byId: { s0: { running: false } } })
      assert.equal(f.requests.length, 1)
    }
    f.fetcher = null; release(); await settle()
    if (change === 'edge') assert.equal(f.requests.length, 4, 'two chunks finish, then the queued edge gets fresh chunks')
    else {
      assert.equal(f.requests.length, 1)
      assert.deepEqual(plain(api.wbNavState.statusInfo), {})
    }
    poll.dispose()
  }
})
