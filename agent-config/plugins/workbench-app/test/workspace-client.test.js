import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const personal = { id: 'personal-id', path: '/opt/dsh/homes/alice/workspaces/default' }
const workspaceInfo = { personal, legacySharedIds: ['legacy-id', 'legacy-alias'] }
const response = body => ({ ok: true, status: 200, json: async () => body })
const clientsBody = { ok: true, customers: [{ id: 'CUS-A', name: '我的客户' }], workspace: workspaceInfo }
const errorText = '个人工作区暂不可用，请稍后重试'

function client({ fetchBody = clientsBody, service, mobile = false } = {}) {
  let api, dispatch
  const requests = [], starts = [], opens = [], alerts = [], warnings = [], updates = [], effects = [], disposers = [], events = []
  const storage = new Map(), listeners = new Map()
  const workspace = service || {
    startSession(...args) { starts.push({ receiver: this, args }); return 'started' },
    async openWorkspace(id, beforeOpen) { opens.push(id); beforeOpen('personal-session') },
    openSession(id) { opens.push(id) },
  }
  const ctx = {
    get: name => name === 'uiWorkspace' ? workspace : undefined,
    slots: { inject() {} }, sidebarRightTabs: { register() {} },
    effect(fn, label) { if (label === 'dsh-workbench: personal new sessions') disposers.push(fn()) },
  }
  const react = {
    createElement() {}, useRef: value => ({ current: value }),
    useState(value) {
      if (value && value.status === 'loading' && Array.isArray(value.customers)) value = { status: 'ready', customers: clientsBody.customers }
      if (value && value.key === '') value = { key: 'CUS-A', line: '', period: '' }
      return [value, next => updates.push(next)]
    },
    useEffect(fn) { effects.push(fn) },
  }
  const window = {
    matchMedia: () => ({ matches: mobile }),
    alert: message => alerts.push(message),
    dispatchEvent(event) { events.push(event.type); for (const fn of listeners.get(event.type) || []) fn(event) },
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn) },
    __ModuleLoader__: { load({ factory }) { api = factory(() => react) } },
  }
  const instrumented = source
    .replace('return module.exports;', 'return { ...module.exports, wbFetchClients, wbRequireWorkspace, wbCacheWorkspace, wbInstallSessionGuard, WorkbenchPage, PromptRelay, openSessionBestEffort, useClients, wbNavRefresh };')
    .replace('function startDrag(event) {', 'if (props.captureDispatch) return props.captureDispatch(dispatch);\nfunction startDrag(event) {')
  vm.runInNewContext(instrumented, {
    window, Event, console: { warn: (...args) => warnings.push(args), log() {} },
    fetch: async (url, opts) => {
      requests.push({ url, opts })
      if (url === '/api/workbench/clients') return response(typeof fetchBody === 'function' ? await fetchBody() : fetchBody)
      if (url === '/api/workbench/task-meta') return response({ ok: true, id: 'task-1' })
      return response({ ok: true })
    },
    sessionStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key) ?? null, removeItem: key => storage.delete(key) },
  })
  function renderDispatch() {
    api.WorkbenchPage({ ctx, captureDispatch: fn => { dispatch = fn } })
    effects.length = 0
    return dispatch
  }
  function relay(sessionId) {
    const sent = []
    api.PromptRelay({ sessionId, inputActions: { setDraft: text => sent.push(text), submit: () => sent.push('submit') }, useChat: selector => selector({ legacy: { nodes: [] } }) })
    const cleanups = effects.splice(0).map(fn => fn()).filter(fn => typeof fn === 'function')
    return { sent, dispose: () => cleanups.forEach(fn => fn()) }
  }
  return { api, ctx, workspace, requests, starts, opens, alerts, warnings, updates, effects, disposers, storage, events, renderDispatch, relay }
}

test('guard redirects no-arg, undefined, null and canonical legacy IDs, preserving other explicit arguments and receiver', () => {
  const f = client()
  f.api.wbCacheWorkspace(clientsBody)
  const dispose = f.api.wbInstallSessionGuard(f.ctx)
  for (const args of [[], [undefined], [null], ['legacy-id'], ['legacy-alias'], ['other-id', 'extra'], ['personal-id']]) {
    assert.equal(f.workspace.startSession(...args), 'started')
  }
  assert.deepEqual(f.starts.map(call => call.args), [
    ['personal-id'], ['personal-id'], ['personal-id'], ['personal-id'], ['personal-id'], ['other-id', 'extra'], ['personal-id'],
  ])
  assert.ok(f.starts.every(call => call.receiver === f.workspace))
  assert.equal(f.requests.length, 0)
  dispose()
})

test('apply installs once and dispose restores the exact original property', () => {
  const f = client()
  const original = Object.getOwnPropertyDescriptor(f.workspace, 'startSession')
  f.api.apply(f.ctx, { defaultPanel: '' })
  assert.ok(f.api.inject.includes('uiWorkspace'))
  const wrapped = f.workspace.startSession
  const duplicateDispose = f.api.wbInstallSessionGuard(f.ctx)
  assert.equal(f.workspace.startSession, wrapped)
  duplicateDispose()
  f.disposers.forEach(dispose => dispose())
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.workspace, 'startSession'), original)
})

test('guard restores inherited methods and does not overwrite a later plugin wrapper', () => {
  const original = function () {}
  const service = Object.create({ startSession: original })
  const f = client({ service })
  const dispose = f.api.wbInstallSessionGuard(f.ctx)
  assert.equal(Object.hasOwn(service, 'startSession'), true)
  dispose()
  assert.equal(Object.hasOwn(service, 'startSession'), false)
  assert.equal(service.startSession, original)
  const disposeAgain = f.api.wbInstallSessionGuard(f.ctx)
  const newer = () => {}
  service.startSession = newer
  disposeAgain()
  assert.equal(service.startSession, newer)
})

test('frozen, non-writable and rejecting/proxied services log and leave plugin usable', () => {
  const original = () => 'original'
  for (const service of [
    Object.freeze({ startSession: original }),
    Object.defineProperty({}, 'startSession', { value: original }),
    new Proxy({ startSession: original }, { set() { throw Error('readonly proxy') } }),
    new Proxy({ startSession: original }, { set() { return true } }),
    new Proxy({ startSession: original }, { get(target, key) { return key === 'startSession' ? target[key].bind(target) : target[key] } }),
  ]) {
    const f = client({ service })
    const dispose = f.api.wbInstallSessionGuard(f.ctx)
    assert.equal(f.warnings.length, 1)
    assert.equal(service.startSession(), 'original')
    assert.doesNotThrow(dispose)
  }
})

test('native legacy action before clients loads lazily fetches and retries once before starting personal', async () => {
  let count = 0
  const f = client({ fetchBody: () => ++count === 1 ? { ok: true, customers: [] } : clientsBody })
  f.api.wbInstallSessionGuard(f.ctx)
  await f.workspace.startSession('legacy-id')
  assert.equal(count, 2)
  assert.deepEqual(f.starts.map(call => call.args), [['personal-id']])
  assert.deepEqual(f.alerts, [])
  f.workspace.startSession('other-id')
  assert.equal(count, 2)
  assert.deepEqual(f.starts[1].args, ['other-id'])
})

test('clients hook and sidebar requests both populate the workspace cache', async () => {
  for (const entry of ['useClients', 'wbNavRefresh']) {
    const f = client()
    if (entry === 'useClients') { f.api.useClients(); f.effects.splice(0).forEach(fn => fn()) }
    else f.api.wbNavRefresh()
    await new Promise(resolve => setImmediate(resolve))
    const before = f.requests.length
    assert.equal((await f.api.wbRequireWorkspace()).personal.id, 'personal-id')
    assert.equal(f.requests.length, before)
  }
})

test('concurrent lazy lookups share a fetch and disposal cancels pending native navigation', async () => {
  let release
  const f = client({ fetchBody: () => new Promise(resolve => { release = resolve }) })
  const dispose = f.api.wbInstallSessionGuard(f.ctx)
  const first = f.workspace.startSession()
  const second = f.api.wbRequireWorkspace()
  assert.equal(f.requests.length, 1)
  dispose()
  release(clientsBody)
  await Promise.all([first, second])
  assert.deepEqual(f.starts, [])
  assert.deepEqual(f.alerts, [])
})

test('native metadata/network failures retry once, show a Chinese error and never fall back', async () => {
  for (const fetchBody of [
    { ok: true }, { ok: true, workspace: null },
    { workspace: { personal: { id: '', path: '/own' }, legacySharedIds: [] } },
    { workspace: { personal, legacySharedIds: [personal.id] } },
    () => { throw Error('offline') },
  ]) {
    for (const args of [[], ['legacy-id']]) {
      const f = client({ fetchBody })
      f.api.wbInstallSessionGuard(f.ctx)
      await f.workspace.startSession(...args)
      assert.equal(f.requests.length, 2)
      assert.deepEqual(f.starts, [])
      assert.deepEqual(f.alerts, [errorText])
    }
  }
})

test('dispatch explicitly opens personal on desktop and mobile and relays only into that session', async () => {
  for (const mobile of [false, true]) {
    const f = client({ mobile })
    f.api.wbCacheWorkspace(clientsBody)
    const dispatch = f.renderDispatch()
    const old = f.relay('old-shared-blank-session')
    await dispatch()
    assert.deepEqual(f.opens, ['personal-id'])
    assert.deepEqual(f.starts, [])
    assert.deepEqual(old.sent, [])
    assert.equal(f.events.includes('wb-prompt-set'), true)
    const target = f.relay('personal-session')
    assert.match(target.sent[0], /我的客户/)
    assert.equal(target.sent[1], 'submit')
    assert.equal(f.storage.has('wb-pending-bind'), false)
    const bindings = f.requests.filter(({ url }) => url === '/api/workbench/session-client')
    assert.equal(bindings.length, 1)
    assert.equal(JSON.parse(bindings[0].opts.body).session_id, 'personal-session')
    assert.deepEqual(f.relay('personal-session').sent, [])
  }
})

test('dispatch retries metadata once and fails visibly before task writes, prompt storage or navigation', async () => {
  const f = client({ fetchBody: { ok: true, customers: [] } })
  await f.renderDispatch()()
  assert.equal(f.requests.length, 2)
  assert.ok(f.requests.every(({ url }) => url === '/api/workbench/clients'))
  assert.equal(f.updates.at(-1), errorText)
  assert.deepEqual(f.starts, [])
  assert.deepEqual(f.opens, [])
  assert.equal(f.storage.size, 0)
  assert.deepEqual(f.relay('old-shared-blank-session').sent, [])
})

test('dispatch succeeds after metadata retry and leaves no prompt when workspace opening fails or is superseded', async () => {
  let count = 0
  const f = client({ fetchBody: () => ++count === 1 ? {} : clientsBody })
  await f.renderDispatch()()
  assert.equal(count, 2)
  assert.deepEqual(f.opens, ['personal-id'])
  for (const fail of [true, false]) {
    const g = client()
    g.api.wbCacheWorkspace(clientsBody)
    g.workspace.openWorkspace = async () => { if (fail) throw Error('open failed') }
    await g.renderDispatch()()
    assert.equal(g.storage.size, 0)
    assert.deepEqual(g.relay('old-shared-blank-session').sent, [])
    if (fail) assert.match(g.updates.at(-1), /起会话失败/)
  }
})

test('existing sessions, including shared cwd sessions, still use the untouched openSession method', () => {
  const f = client()
  const original = f.workspace.openSession
  const dispose = f.api.wbInstallSessionGuard(f.ctx)
  assert.equal(f.workspace.openSession, original)
  assert.equal(f.api.openSessionBestEffort(f.ctx, 'existing-shared-session'), true)
  assert.equal(f.api.openSessionBestEffort(f.ctx, 'existing-personal-session'), true)
  assert.deepEqual(f.opens, ['existing-shared-session', 'existing-personal-session'])
  assert.equal(f.requests.length, 0)
  dispose()
})
