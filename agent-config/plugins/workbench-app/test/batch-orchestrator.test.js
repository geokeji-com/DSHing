import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { create } from '../lib/impl.js'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const copy = value => JSON.parse(JSON.stringify(value))
const user = text => ({ kind: 'user', content: [{ type: 'text', text }] })
const assistant = text => ({ kind: 'assistant', blocks: [{ kind: 'text', text }] })
const write = (title, extra = {}) => ({ kind: 'tool-result', call: { name: 'mcp__sora-articles__write_article', argsRaw: JSON.stringify({ title, draft: true, ...extra }) } })

function host(t) {
  const previous = process.env.DSH_WORKBENCH_META_DIR
  const dir = mkdtempSync(join(tmpdir(), 'wb-batch-'))
  process.env.DSH_WORKBENCH_META_DIR = dir
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_WORKBENCH_META_DIR
    else process.env.DSH_WORKBENCH_META_DIR = previous
    rmSync(dir, { recursive: true, force: true })
  })
  const { handlers } = create({}, {})
  const requests = []
  async function fetch(url, options = {}) {
    requests.push({ url, ...options })
    if (!url.startsWith('/api/workbench/batch')) return { json: async () => ({ ok: true }) }
    const req = Readable.from(options.body ? [options.body] : [])
    Object.assign(req, { url, method: options.method || 'GET', headers: {} })
    let status, result
    await handlers['/api/workbench/batch'](req, { writeHead(code) { status = code }, end(text) { result = JSON.parse(text) } })
    return { status, json: async () => result }
  }
  const post = async body => (await (await fetch('/api/workbench/batch', { method: 'POST', body: JSON.stringify(body) })).json()).batch
  return { fetch, post, requests }
}

function client(server, initial, { mobile = false } = {}) {
  let api, now = 100000, running = false, active = true, nodes = [], draft = '', stopped = 0
  const sends = [], opens = [], events = [], effects = [], intervals = []
  const listeners = new Map(), storage = new Map()
  class TestEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail } }
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }), createPortal: node => node,
    useRef: value => ({ current: value }), useState: value => [value, () => {}], useEffect: fn => effects.push(fn),
  }
  const window = {
    matchMedia: () => ({ matches: mobile }),
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn) },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn) },
    dispatchEvent(e) { events.push(e); for (const fn of listeners.get(e.type) || []) fn(e) },
    __ModuleLoader__: { load({ factory }) { api = factory(() => react) } },
  }
  vm.runInNewContext(source.replace('return module.exports;', `return { ...module.exports,
    wbBatchTick, wbBatchSend, wbBatchSave, wbBatchStop, wbBatchResult, wbBatchTitles, wbRoundPrompt, wbBatchKey,
    wbBatches, wbBatchFor, wbNavState, BatchRelay, PromptRelay,
    pending: () => pendingPrompt, context: ctx => { WbCtx = ctx; }
  };`), {
    window, Event: TestEvent, CustomEvent: TestEvent, console,
    Date: class extends Date { static now() { return now } },
    setInterval(fn) { intervals.push(fn); return intervals.length }, clearInterval() {},
    document: { body: {}, querySelector: () => null, querySelectorAll: () => running ? [{ textContent: '停止生成', getAttribute: () => '', click() { stopped++; running = false } }] : [] },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: server.fetch,
  })
  api.context({ sidebarRight: { openTab: (...args) => opens.push(copy(args)) } })
  const entry = { batch: copy(initial) }
  api.wbBatches[api.wbBatchKey(initial.session_id)] = entry
  const actions = { setDraft: text => { draft = text }, submit: async () => { sends.push(draft); nodes.push(user(draft)); running = true } }
  const view = { sessionId: initial.session_id, actions, alive: () => active, nodes: () => nodes, running: () => running }
  async function tick(ms = 0) { now += ms; await api.wbBatchTick(entry, view) }
  async function settle() { for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve)) }
  async function mount(component = 'BatchRelay', sessionId = initial.session_id, session) {
    api[component]({ sessionId, inputActions: actions, useSession: session ? select => select(session) : undefined, useChat: select => select({ legacy: { nodes, partial: running ? {} : null, runningCalls: [] } }) })
    effects.splice(0).forEach(fn => fn()); await settle()
  }
  async function complete(...results) { nodes.push(...results); running = false; await tick(); await tick(2000) }
  return { api, entry, sends, opens, events, view, tick, mount, complete, settle, intervals,
    get nodes() { return nodes }, set nodes(value) { nodes = value },
    set running(value) { running = value }, set active(value) { active = value }, get stopped() { return stopped },
  }
}
const make = server => server.post({ id: 'wbb-test', rounds: 3, session_id: 'session-a', client: '客户', client_key: 'CUS-test', prompt: '完整流程：知识库、技能与参考资料', questions: [{ qid: 'q1' }] })

test('sequential full rounds: first uses PromptRelay; failures skip; one final review includes successful titles', async t => {
  const server = host(t), batch = await make(server), f = client(server, batch)
  await f.tick()
  assert.equal(f.sends.length, 0)
  assert.equal(f.api.pending().batchId, batch.id)
  await f.mount('PromptRelay')
  assert.equal(f.sends.length, 1)
  assert.match(f.sends[0], /第 1\/3 轮/)
  await f.tick(10000)
  assert.equal(f.sends.length, 1)
  await f.complete(write('第一篇'), assistant('已写草稿\n本轮角度：家庭选购与对比结构'))
  assert.equal(f.entry.batch.records[0].status, 'ok')
  assert.equal(f.opens.length, 0)
  await f.tick()
  assert.equal(f.sends.length, 2)
  assert.match(f.sends[1], /第一篇｜角度：家庭选购与对比结构/)
  assert.match(f.sends[1], /完整流程：知识库、技能与参考资料/)
  await f.complete(assistant('知识库缺少竞品资料，无法完成'))
  assert.equal(f.entry.batch.records[1].status, 'failed')
  assert.match(f.entry.batch.records[1].reason, /缺少竞品/)
  await f.tick()
  assert.equal(f.sends.length, 3)
  assert.match(f.sends[2], /第 3\/3 轮/)
  await f.complete(write('第三篇'), assistant('本轮角度：售后服务与场景结构'))
  await f.tick(); await f.tick(); await f.tick()
  assert.equal(f.entry.batch.status, 'failed_partial')
  assert.equal(f.opens.length, 1)
  assert.deepEqual(Object.keys(f.api.wbBatchTitles(f.entry.batch, {})), ['第一篇', '第三篇'])
  assert.equal(f.entry.batch.review_opened, true)
})

test('reload reconciles an already-written sending round, never resends ok rounds or reopens acknowledged review', async t => {
  const server = host(t)
  let batch = await make(server)
  batch.records[0] = { ...batch.records[0], status: 'ok', title: '第一篇', angle: '角度一' }
  batch.records[1] = { ...batch.records[1], status: 'sending', sent_at: 100 }
  batch = await server.post(batch)
  const f = client(server, batch)
  f.nodes = [user(f.api.wbRoundPrompt(batch.prompt, batch, 2)), write('第二篇'), assistant('本轮角度：角度二')]
  await f.tick(); await f.tick(2000)
  assert.equal(f.sends.length, 0)
  assert.equal(f.entry.batch.records[1].status, 'ok')
  await f.tick()
  assert.equal(f.sends.length, 1)
  assert.match(f.sends[0], /第 3\/3 轮/)
  assert.match(f.sends[0], /第一篇｜角度：角度一/)
  await f.complete(write('第三篇'), assistant('本轮角度：角度三'))
  await f.tick(); await f.tick()
  assert.equal(f.entry.batch.status, 'done')
  const restored = client(server, f.entry.batch)
  await restored.tick()
  assert.equal(restored.sends.length, 0)
  assert.equal(restored.opens.length, 0)
})

test('remote stop stops host generation, captures current draft and schedules nothing else', async t => {
  const server = host(t)
  let batch = await make(server)
  batch.records[0] = { ...batch.records[0], status: 'sending', sent_at: 100 }
  batch = await server.post(batch)
  const f = client(server, batch)
  f.nodes = [user(f.api.wbRoundPrompt(batch.prompt, batch, 1)), write('已完成草稿')]
  f.running = true
  await server.post({ id: batch.id, op: 'stop' })
  await f.tick()
  assert.equal(f.stopped, 1)
  await f.tick(); await f.tick(2000); await f.tick()
  assert.equal(f.entry.batch.status, 'stopped')
  assert.equal(f.entry.batch.records[0].status, 'ok')
  assert.equal(f.sends.length, 0)
  assert.equal(f.opens.length, 1)
})

test('two tabs claim only one next turn, and navigation cancels a pending send', async t => {
  const server = host(t)
  let batch = await make(server)
  batch.records[0] = { ...batch.records[0], status: 'ok', title: '第一篇', angle: '一' }
  batch = await server.post(batch)
  const a = client(server, batch), b = client(server, batch)
  await Promise.all([a.tick(), b.tick()])
  assert.equal(a.sends.length + b.sends.length, 1)
  a.active = false; b.active = false
  await a.tick(); await b.tick()
  assert.equal(a.sends.length + b.sends.length, 1)
})

test('unconfirmed send is skipped on resume and invalid multi-write/direct-library results fail', async t => {
  const server = host(t)
  let batch = await make(server)
  batch.records[0] = { ...batch.records[0], status: 'sending', sent_at: 100 }
  batch = await server.post(batch)
  const f = client(server, batch)
  await f.tick(); await f.tick(2000)
  assert.equal(f.entry.batch.records[0].status, 'failed')
  assert.match(f.entry.batch.records[0].reason, /发送未确认/)
  assert.equal(f.sends.length, 0)
  assert.equal(f.api.wbBatchResult([write('A'), write('B')], batch.records[0]).status, 'failed')
  assert.equal(f.api.wbBatchResult([write('A', { draft: false })], batch.records[0]).status, 'failed')
})

test('ordinary N=1 mounts call no batch APIs; owner/session cache keys cannot cross sessions', async t => {
  const server = host(t), batch = await make(server), f = client(server, batch)
  const before = server.requests.length
  await f.mount('BatchRelay', 'ordinary-session')
  for (const interval of f.intervals) await interval()
  assert.equal(server.requests.length, before)
  assert.equal(f.api.wbBatchFor('ordinary-session'), undefined)
  f.api.wbNavState.uid = 'another-user'
  assert.equal(f.api.wbBatchFor(batch.session_id), undefined)
  f.view.sessionId = 'another-session'
  await f.tick()
  assert.equal(f.sends.length, 0)
})

test('mobile batch completion opens the existing review surface once', async t => {
  const server = host(t)
  let batch = await make(server)
  batch.records = batch.records.map(r => ({ ...r, status: 'ok', title: '文章' + r.round, angle: '角度' + r.round }))
  batch = await server.post(batch)
  const f = client(server, batch, { mobile: true })
  await f.tick(); await f.tick(); await f.tick()
  assert.equal(f.events.filter(e => e.type === 'wb:batch-review').length, 1)
  assert.equal(f.events.find(e => e.type === 'wb:batch-review').detail.sessionId, batch.session_id)
})


test('host session state prevents advancing between tool calls and while history is loading', async t => {
  const server = host(t)
  let batch = await make(server)
  batch.records[0] = { ...batch.records[0], status: 'ok', title: '第一篇', angle: '一' }
  batch = await server.post(batch)
  for (const mode of ['running', 'loading']) {
    const f = client(server, batch)
    f.nodes = [user(f.api.wbRoundPrompt(batch.prompt, batch, 1))]
    const session = { sessionId: batch.session_id, openState: mode === 'loading' ? 'loading' : 'open', running: mode === 'running' }
    await f.mount('BatchRelay', batch.session_id, session)
    for (const interval of f.intervals) await interval()
    assert.equal(f.sends.length, 0, mode)
  }
})

test('terminal host errors are retained as round failure reasons; reasoning blocks are not writing angles', async t => {
  const server = host(t), batch = await make(server), f = client(server, batch)
  const failed = f.api.wbBatchResult([{ kind: 'turn-error', message: '服务端限流，请稍后重试' }], batch.records[0])
  assert.equal(failed.reason, '服务端限流，请稍后重试')
  const result = f.api.wbBatchResult([write('文章'), { kind: 'assistant', blocks: [
    { kind: 'reasoning', text: '本轮角度：不应读取的思考' }, { kind: 'text', text: '本轮角度：实际写作角度' },
  ] }], batch.records[0])
  assert.equal(result.angle, '实际写作角度')
})


test('fresh conversation mount fetches persisted batch and resumes only its own session', async t => {
  const server = host(t)
  let batch = await make(server)
  batch.records[0] = { ...batch.records[0], status: 'ok', title: '第一篇', angle: '一' }
  batch = await server.post(batch)
  const wrong = client(server, batch)
  wrong.nodes = [user(wrong.api.wbRoundPrompt(batch.prompt, batch, 1))]
  await wrong.mount('BatchRelay', 'another-session')
  assert.equal(wrong.sends.length, 0)
  const resumed = client(server, batch)
  delete resumed.api.wbBatches[resumed.api.wbBatchKey(batch.session_id)]
  resumed.nodes = [user(resumed.api.wbRoundPrompt(batch.prompt, batch, 1))]
  await resumed.mount()
  assert.equal(resumed.sends.length, 1)
  assert.match(resumed.sends[0], /第 2\/3 轮/)
})

test('truncated history recovers title and angle through write_article question_context', async t => {
  const server = host(t)
  let batch = await make(server)
  batch.records[0] = { ...batch.records[0], status: 'sending', sent_at: 100 }
  batch = await server.post(batch)
  const f = client(server, batch)
  f.nodes = [write('第一篇', { question_context: { session_id: batch.session_id, batch_id: batch.id, round: 1, article_no: 1 } }), assistant('本轮角度：角度一')]
  await f.tick(); await f.tick(2000)
  assert.equal(f.entry.batch.records[0].status, 'ok')
  assert.equal(f.entry.batch.records[0].angle, '角度一')
  assert.equal(f.sends.length, 0)
})

test('stop clears pending first relay and also wins over a delayed round claim response', async t => {
  const server = host(t), batch = await make(server), f = client(server, batch)
  await f.tick()
  assert.ok(f.api.pending())
  f.running = true
  await f.api.wbBatchStop(f.entry, batch.session_id)
  assert.equal(f.api.pending(), null)
  assert.equal(f.stopped, 1)
  assert.equal(f.entry.batch.status, 'stopped')
  await f.tick()
  assert.equal(f.sends.length, 0)

  const second = await server.post({ id: 'wbb-race', rounds: 2, session_id: 'session-race', prompt: 'x' })
  const originalFetch = server.fetch
  let release, claimed
  const ready = new Promise(resolve => { claimed = resolve })
  server.fetch = async (url, options) => {
    const response = await originalFetch(url, options)
    if (options?.body && JSON.parse(options.body).records?.some(r => r.status === 'sending')) {
      claimed(); await new Promise(resolve => { release = resolve })
    }
    return response
  }
  const race = client(server, second)
  const sending = race.api.wbBatchSend(race.entry, race.view.actions, second.prompt, () => true)
  await ready
  await race.api.wbBatchStop(race.entry, second.session_id)
  release(); await sending
  assert.equal(race.sends.length, 0)
  assert.equal(race.entry.batch.status, 'stopped')
})
