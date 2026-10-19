import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const plain = value => JSON.parse(JSON.stringify(value))
const finishedAt = Date.parse('2026-10-19T03:42:00Z')
function storage() {
  const values = new Map()
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), values }
}
function load(localStorage = storage()) {
  let api, effectIndex = 0, effects = []
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: value => [value, () => {}], useRef: value => ({ current: value }),
    useEffect(fn, deps) {
      const before = effects[effectIndex]
      effects[effectIndex++] = deps
      if (!before || deps.some((v, i) => v !== before[i])) fn()
    },
  }
  const window = { matchMedia: () => ({ matches: false }), __ModuleLoader__: { load({ factory }) { api = factory(() => react) } } }
  vm.runInNewContext(source.replace('return module.exports;', `return {wbRunStatus, wbSessionStatus, wbUnreadNext, wbReadUnread, wbWriteUnread,
    wbNavState, wbNavRunState, wbNavStatus, wbNavSelect, wbNavSnapshot, wbNavSubscribe, wbNavReadSessions, useWbRunStatus,
    WbRunIndicator, WbSessionRow, setContext(ctx) { wbNavCtx = ctx; }, listen(fn) { wbNavSubs.push(fn); },
    setBatch(id, batch) { wbBatches[wbBatchKey(id)] = {batch}; }};`), { window, localStorage })
  api.wbNavState.uid = 'fixture-user'
  return { api, localStorage, renderHooks(props) { effectIndex = 0; api.useWbRunStatus(props) } }
}
const { api } = load()
const idle = { id: 's', running: false }
const unread = { s: finishedAt }

test('run status priority is attention, running, failed, review, done, idle without mutating inputs', () => {
  const input = { summary: { ...idle, running: true }, snapshot: { lastAgentError: 'failure' }, draftsPending: 3, unread }
  const original = plain(input)
  for (const kind of ['approval', 'question', 'plan-review']) {
    assert.deepEqual(plain(api.wbRunStatus({ ...input, pendingInteraction: { kind } })),
      { kind: 'attention', tone: 'warn', label: '等你确认', extra: '等你确认', unread: false })
  }
  assert.equal(api.wbRunStatus({ ...input, attention: '待继续 2/5' }).kind, 'attention')
  assert.equal(api.wbRunStatus(input).kind, 'running')
  assert.equal(api.wbRunStatus({ ...input, summary: idle }).kind, 'failed')
  assert.equal(api.wbRunStatus({ ...input, summary: idle, failureRead: true }).kind, 'review')
  assert.equal(api.wbRunStatus({ ...input, summary: idle, snapshot: null, draftsPending: 0 }).kind, 'done')
  assert.deepEqual(plain(api.wbRunStatus({ summary: idle })), { kind: 'idle', tone: '', label: '', extra: '', unread: false })
  assert.deepEqual(plain(input), original)
})

test('unknown sessions keep an empty slot even with stale local or batch facts', () => {
  assert.equal(api.wbRunStatus().kind, 'idle')
  assert.deepEqual(plain(api.wbRunStatus({ id: 's', unread, pendingInteraction: 'approval', snapshot: { promptError: {} }, batch: { status: 'running', rounds: 3 } })),
    { kind: 'idle', tone: '', label: '', extra: '', unread: false })
})

test('materialized errors precede done, but pending submissions and a queue do not invent a failure', () => {
  for (const snapshot of [{ lastAgentError: 'error' }, { promptError: { op: 'send', error: {} } }]) {
    const status = api.wbRunStatus({ summary: idle, snapshot, unread })
    assert.equal(status.kind, 'failed')
    assert.equal(status.extra, '失败')
    assert.equal(api.wbRunStatus({ summary: idle, snapshot, isCurrent: true }).unread, false)
  }
  assert.equal(api.wbRunStatus({ summary: idle, snapshot: { awaitingFirstTurn: true, pendingSubmissions: [{}], queue: [{}] } }).kind, 'idle')
})

test('mobile labels share the desktop projection and show the active batch round', () => {
  const mobile = input => api.wbSessionStatus(api.wbRunStatus(input)).label
  const running = { summary: { ...idle, running: true } }
  assert.equal(mobile(running), '写作中')
  const batch = { status: 'running', rounds: 3, records: [{ round: 1, status: 'ok' }, { round: 2, status: 'sending' }, { round: 3, status: 'pending' }] }
  assert.equal(api.wbRunStatus({ ...running, batch }).extra, '2/3 轮')
  assert.equal(mobile({ ...running, batch }), '写作中 2/3 轮')
  assert.equal(mobile({ ...running, batch: { status: 'running', round: 2, rounds: 3 } }), '写作中 2/3 轮')
  assert.equal(mobile({ ...running, batch: { ...batch, status: 'stopped' } }), '写作中')
  assert.equal(mobile({ summary: idle, unread }), '已完成 · 未查看')
  assert.equal(api.wbRunStatus({ summary: idle, unread }).label, '已完成 · 未查看 · 11:42 (UTC+8)')
  assert.equal(mobile({ summary: idle, snapshot: { promptError: {} } }), '失败 · 点开查看原因')
  assert.equal(mobile({ summary: idle, pendingInteraction: { kind: 'question' } }), '等你确认')
  assert.equal(mobile({ summary: idle }), '')
})

test('first observations establish baselines; independent background edges arm once and preserve finish time', () => {
  const empty = { unread: {}, previous: {} }
  let state = api.wbUnreadNext(empty, { a: { running: true }, b: { completed: true }, c: { running: false } }, '', 1)
  assert.deepEqual(plain(state.unread), {})
  state = api.wbUnreadNext(state, { a: { running: false }, b: { completed: true }, c: { completed: true } }, '', finishedAt)
  assert.deepEqual(plain(state.unread), { a: finishedAt, c: finishedAt })
  state = api.wbUnreadNext(state, { a: { running: false }, b: { completed: true }, c: { completed: true } }, '', finishedAt + 1)
  assert.deepEqual(plain(state.unread), { a: finishedAt, c: finishedAt })
  assert.deepEqual(empty, { unread: {}, previous: {} })
})

test('current and restarted sessions clear unread; stale completed does not rearm after leaving', () => {
  let state = { unread: { a: 1, b: 1 }, previous: { a: { running: true }, b: { running: false } } }
  state = api.wbUnreadNext(state, { a: { completed: true }, b: { running: true } }, 'a', 2)
  assert.deepEqual(plain(state.unread), {})
  state = api.wbUnreadNext(state, { a: { completed: true }, b: { running: false } }, 'b', 3)
  assert.deepEqual(plain(state.unread), {})
  assert.equal(api.wbRunStatus({ summary: { ...idle, completed: true }, unread, isCurrent: true }).unread, false)
  state = api.wbUnreadNext(state, {}, '', 4)
  state = api.wbUnreadNext(state, { a: { running: false } }, '', 5)
  assert.deepEqual(plain(state.unread), {})
})

test('reload restores finish timestamps per uid; opening and restarting persist their removal', () => {
  const first = load(), snapshot = running => ({ phase: 'ready', current: 'viewing', byId: { s: { ...idle, running } } })
  first.api.wbNavSnapshot(snapshot(true))
  first.api.wbNavSnapshot(snapshot(false))
  const before = first.api.wbNavRunState().unread.s
  assert.ok(before > 0)
  const restored = load(first.localStorage)
  restored.api.wbNavSnapshot(snapshot(false))
  assert.equal(restored.api.wbNavRunState().unread.s, before)
  assert.equal(restored.api.wbNavStatus('s').kind, 'done')
  restored.api.wbNavState.uid = 'other-user'
  assert.equal(restored.api.wbNavStatus('s').kind, 'idle')
  restored.api.wbNavState.uid = 'fixture-user'
  restored.api.wbNavSelect('s')
  assert.deepEqual(JSON.parse(first.localStorage.getItem('wb-unread-fixture-user')), {})
  first.api.wbNavSnapshot(snapshot(true))
  assert.deepEqual(JSON.parse(first.localStorage.getItem('wb-unread-fixture-user')), {})
})

test('unavailable, malformed and denied storage never prevents status updates', () => {
  for (const bad of ['{', 'null', '[]', '"text"', '{"bad":"today","negative":-1,"ok":1}']) {
    const own = load()
    own.localStorage.setItem('wb-unread-fixture-user', bad)
    assert.deepEqual(plain(own.api.wbReadUnread('fixture-user')), bad.includes('"ok"') ? { ok: 1 } : {})
  }
  const denied = load({ getItem() { throw Error('denied') }, setItem() { throw Error('quota') } })
  assert.doesNotThrow(() => denied.api.wbNavSnapshot({ byId: { s: { running: true } } }))
  assert.doesNotThrow(() => denied.api.wbNavSnapshot({ byId: { s: { running: false } } }))
  assert.equal(denied.api.wbNavStatus('s').kind, 'done')
  assert.doesNotThrow(() => denied.api.wbNavSelect('s'))
  assert.equal(denied.api.wbNavStatus('s').kind, 'idle')
  assert.deepEqual(plain(load(null).api.wbReadUnread('fixture-user')), {})
})

test('the current session restored by the harness clears a persisted reminder immediately', () => {
  const localStorage = storage()
  localStorage.setItem('wb-unread-fixture-user', JSON.stringify(unread))
  const { api } = load(localStorage)
  api.wbNavSnapshot({ current: 's', byId: { s: { ...idle, completed: true } } })
  assert.equal(api.wbNavStatus('s').kind, 'idle')
  assert.deepEqual(JSON.parse(localStorage.getItem('wb-unread-fixture-user')), {})
  api.wbNavSnapshot({ current: 'other', byId: { s: { ...idle, completed: true } } })
  assert.equal(api.wbNavStatus('s').kind, 'idle')
})

test('live subscription emits status changes without refreshing or retiring optimistic renames; cleanup unsubscribes', async () => {
  const own = load(), { api } = own
  let snapshot = { phase: 'ready', current: 'a', byId: { a: { running: true }, s: { running: true } } }
  let listener, refreshes = 0, emits = 0
  const ctx = { get: () => ({ list: { getSnapshot: () => snapshot, subscribe(fn) { listener = fn; return () => { listener = null } } }, async refresh() { refreshes++ } }) }
  api.setContext(ctx)
  api.listen(() => { emits++ })
  api.wbNavState.renames.s = { title: 'saving', saving: true }
  const dispose = api.wbNavSubscribe(ctx)
  assert.equal(api.wbNavStatus('s').kind, 'running')
  snapshot = { ...snapshot, byId: { a: { running: false, completed: true }, s: { running: false, completed: true } } }
  listener()
  assert.equal(api.wbNavStatus('a').kind, 'idle')
  assert.equal(api.wbNavStatus('s').kind, 'done')
  assert.equal(refreshes, 0)
  assert.ok(emits >= 2)
  api.wbNavState.renames.s.saving = false
  listener()
  assert.ok(api.wbNavState.renames.s)
  await api.wbNavReadSessions()
  assert.equal(refreshes, 1)
  assert.equal(api.wbNavState.renames.s, undefined)
  snapshot = { ...snapshot, current: 's' }
  listener()
  assert.equal(api.wbNavStatus('s').kind, 'idle')
  assert.equal(api.wbNavRunState().unread.s, undefined)
  dispose()
  assert.equal(listener, null)
})

test('older seats without subscriptions keep the refresh path and absent injected hooks are safe', async () => {
  const own = load(), { api } = own
  const ctx = { get: () => ({ list: { getSnapshot: () => ({ byId: { s: idle } }) } }) }
  assert.doesNotThrow(api.wbNavSubscribe(ctx))
  api.setContext(ctx)
  await assert.doesNotReject(api.wbNavReadSessions())
  assert.doesNotThrow(() => own.renderHooks({ sessionId: 's' }))
  assert.equal(api.wbNavStatus('s').kind, 'idle')
})

test('injected current errors update live, clear on open, and a later failure can alert again', () => {
  const own = load(), { api } = own
  api.wbNavSnapshot({ byId: { s: idle }, current: 's' })
  let snapshot = { lastAgentError: null }, pending = null
  const props = { sessionId: 's', useSession: select => select(snapshot), useSessionPendingInteraction: () => pending }
  own.renderHooks(props)
  snapshot = { lastAgentError: 'failed' }
  own.renderHooks(props)
  assert.equal(api.wbNavStatus('s').kind, 'failed')
  assert.equal(api.wbNavStatus('s').unread, false)
  pending = { kind: 'approval' }
  own.renderHooks(props)
  api.wbNavSnapshot({ byId: { s: { ...idle, running: true } }, current: 's' })
  assert.equal(api.wbNavStatus('s').kind, 'attention')
  pending = null
  own.renderHooks(props)
  api.wbNavSnapshot({ byId: { s: idle }, current: 'other' })
  assert.equal(api.wbNavStatus('s').kind, 'failed')
  api.wbNavSelect('s')
  assert.equal(api.wbNavStatus('s').kind, 'idle')
  snapshot = { promptError: { op: 'send', error: 'new failure' } }
  own.renderHooks(props)
  assert.equal(api.wbNavStatus('s').kind, 'failed')
})

test('desktop row preserves date/title, highlight, rename entrypoints and accessible status', () => {
  const own = load(), { api } = own
  api.wbNavSnapshot({ byId: { s: { ...idle, running: true } }, current: 's' })
  api.setBatch('s', { status: 'running', round: 2, rounds: 3 })
  const row = api.WbSessionRow({ item: { id: 's', title: '写作任务', at: '2026-10-19T03:00:00Z' }, open() {} }).children[0]
  assert.equal(row.props.className, 'wb_nvItem wb_nvCur')
  assert.match(row.props.title, /10-19 · 写作任务 · 写作中 2\/3 轮/)
  assert.equal(row.props.title, row.props['aria-label'])
  assert.equal(row.children[1].children[0], '10-19 · 写作任务')
  assert.equal(row.children[2].children[0], '2/3 轮')
  assert.equal(typeof row.props.onDoubleClick, 'function')
  assert.equal(typeof row.props.onContextMenu, 'function')
  const indicator = api.WbRunIndicator({ status: api.wbNavStatus('s'), mobile: true })
  assert.equal(indicator.children[0].props.className, 'wb_ldrSpin wb_runSpin')
  assert.equal(indicator.props['aria-hidden'], true)
  assert.equal(api.WbRunIndicator({ status: api.wbRunStatus() }).children[0], null)
})

test('reopening before the injected snapshot is ready does not revive an acknowledged failure', () => {
  const own = load(), { api } = own
  api.wbNavSnapshot({ byId: { s: idle }, current: 's' })
  let snapshot = null
  const props = { sessionId: 's', useSession: select => select(snapshot) }
  own.renderHooks(props)
  snapshot = { lastAgentError: 'previous failure' }
  own.renderHooks(props)
  assert.equal(api.wbNavStatus('s').kind, 'failed')
  snapshot = null
  own.renderHooks({ ...props, sessionId: 'other' })
  api.wbNavSelect('s')
  own.renderHooks(props)
  snapshot = { lastAgentError: 'previous failure' }
  own.renderHooks(props)
  assert.equal(api.wbNavStatus('s').kind, 'idle')
})

test('status geometry reuses the conic spinner and is covered by global reduced motion', () => {
  assert.match(source, /\.wb_runSlot\{[^}]*flex:0 0 14px;width:14px;height:14px/)
  assert.match(source, /\.wb_ldrSpin\.wb_runSpin\{width:12px;height:12px/)
  assert.match(source, /\.wb_runDot\{width:6px;height:6px/)
  assert.match(source, /\.wb_nvItem\{[^}]*padding:6px 6px 6px 18px/)
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)\{\[class\^='wb_'\][^\n]*animation:none!important/)
  assert.doesNotMatch(source, /状态未同步/)
})
