import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const personalPath = '/opt/dsh/homes/alice/workspaces/default'
const legacyPath = '/home/dsh/生文'
const plain = value => JSON.parse(JSON.stringify(value))

// Execute the real modules with isolated env/fs/registry fakes: no user directory is touched.
function host({ env = { DSH_HOME: '/opt/dsh/homes/alice' }, rows = [], aliases = {}, failure } = {}) {
  const calls = [], logs = [], routes = [], dirs = new Set(), files = new Map()
  const canonical = name => {
    const resolved = path.resolve(name)
    for (const [alias, target] of Object.entries(aliases)) {
      if (resolved === alias || resolved.startsWith(alias + '/')) return target + resolved.slice(alias.length)
    }
    return resolved
  }
  const forbidden = () => assert.fail('must never unregister, move, delete, or change a session')
  const fs = {
    mkdirSync(name, options) {
      calls.push(['mkdir', name, plain(options)])
      if (failure === 'mkdir') throw Error('mkdir failed')
      dirs.add(canonical(name))
    },
    realpathSync(name) {
      const result = canonical(name)
      if (!dirs.has(result) && !Object.hasOwn(aliases, path.resolve(name))) throw Error('ENOENT')
      return result
    },
    readdirSync(name) {
      calls.push(['readdir', name])
      if (!files.has(name)) throw Error('ENOENT')
      return files.get(name).map(name => ({ name, isFile: () => true }))
    },
    statSync: () => ({ mtimeMs: Date.now() }),
    readFileSync: forbidden, writeFileSync: forbidden, existsSync: () => false,
    renameSync: forbidden, unlinkSync: forbidden,
  }
  const registry = {
    list() { if (failure === 'list') throw Error('list failed'); return rows },
    async create(name, title) {
      calls.push(['create', name, title])
      if (failure === 'create') throw Error('create failed')
      let row = rows.find(row => canonical(row.path) === canonical(name))
      if (!row) { row = { id: 'personal-id', path: canonical(name), title, sessionIds: [] }; rows.push(row) }
      return row
    },
    unregister: forbidden, delete: forbidden, remove: forbidden,
  }
  const ctx = {
    workspaceRegistry: registry,
    tools: {
      schemas: () => [{ name: 'mcp__knowledge__list_clients' }],
      execute: async () => ({ value: { customers: [
        { client_key: 'CUS-A', display_name: '我的客户' },
        { client_key: 'CUS-B', display_name: '别的客户' },
      ] } }),
    },
    skills: { list: () => [] },
    inject: (names, fn) => fn(ctx),
    effect: fn => fn(),
    webServer: { register(route) { routes.push(route); return () => {} } },
  }
  function load(file, exports) {
    let source = readFileSync(new URL('../lib/' + file, import.meta.url), 'utf8')
    source = source.replace(/^import .*$/gm, '').replace(/export \{[^}]+\}/g, '')
      .replace(/export function /g, 'function ').replaceAll('import.meta.url', JSON.stringify(new URL('../lib/' + file, import.meta.url).href))
    const sandbox = { ...fs, ...path, fileURLToPath, URL, AbortSignal, process: { env, stderr: { write: text => logs.push(text) } } }
    vm.runInNewContext(source + '\nglobalThis.api = {' + exports + '}', sandbox)
    return sandbox.api
  }
  const index = load('index.js', 'apply')
  const impl = load('impl.js', 'create, resolvePersonalWorkspace, workspaceRoot')
  const handlers = impl.create(ctx, {}).handlers
  async function request(route = 'clients', headers = {}) {
    let response
    const req = { method: 'GET', url: '/api/workbench/' + route, headers }
    const res = { writeHead(status) { assert.equal(status, 200) }, end(raw) { response = JSON.parse(raw) } }
    await handlers[req.url.split('?')[0]](req, res)
    return response
  }
  return { ctx, registry, rows, env, calls, logs, routes, dirs, files, index, impl, request }
}

test('index ensures only the personal directory and registers it once, without unregistering legacy', async () => {
  const legacy = Object.freeze({ id: 'legacy-id', path: legacyPath, title: '生文工作台', sessionIds: ['old-session'] })
  const f = host({ rows: [legacy] })
  f.index.apply(f.ctx, {})
  await Promise.resolve()
  assert.deepEqual(f.calls, [
    ['mkdir', personalPath, { recursive: true }], ['create', personalPath, '我的工作区'],
  ])
  assert.equal(f.routes.length, 12)
  assert.equal(f.rows[0], legacy)
  assert.deepEqual(f.rows[0].sessionIds, ['old-session'])
  f.index.apply(f.ctx, {})
  assert.equal(f.calls.filter(([op]) => op === 'create').length, 1)
  assert.ok(f.calls.every(([, name]) => name !== legacyPath))
})

test('index preserves the preseeded title and matches the canonical home path', () => {
  const row = Object.freeze({ id: 'seeded', path: personalPath, title: '用户自定义标题' })
  const f = host({ env: { DSH_HOME: '/home-link' }, aliases: { '/home-link': '/opt/dsh/homes/alice' }, rows: [row] })
  f.index.apply(f.ctx, {})
  assert.deepEqual(f.calls, [['mkdir', '/home-link/workspaces/default', { recursive: true }]])
  assert.equal(f.rows[0], row)
})

test('index skips with a log when DSH_HOME is absent and still registers every route', () => {
  const f = host({ env: {} })
  f.index.apply(f.ctx, {})
  assert.deepEqual(f.calls, [])
  assert.equal(f.routes.length, 12)
  assert.match(f.logs.join(''), /DSH_HOME.*跳过/)
})

test('index directory and registry failures never prevent route registration', async () => {
  for (const failure of ['mkdir', 'list', 'create']) {
    const f = host({ failure })
    assert.doesNotThrow(() => f.index.apply(f.ctx, {}))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.routes.length, 12)
    assert.match(f.logs.join(''), /失败/)
  }
})

test('hot-loaded clients ensures personal workspace without index startup and keeps grant intersection', async () => {
  const f = host()
  f.env.DSH_ALLOWED_PROJECT_IDS = '["CUS-A"]'
  const headers = { 'x-dsh-allowed-client-keys': '["CUS-A","CUS-B"]' }
  const body = await f.request('clients', headers)
  assert.equal(body.ok, true)
  assert.deepEqual(body.workspace, { personal: { id: 'personal-id', path: personalPath }, legacySharedIds: [] })
  assert.deepEqual(body.customers.map(c => c.id), ['CUS-A'])
  assert.equal(f.routes.length, 0)
  assert.deepEqual((await f.request('clients', headers)).workspace, body.workspace)
  assert.equal(f.calls.filter(([op]) => op === 'create').length, 1)
  f.env.DSH_ALLOWED_PROJECT_IDS = '[]'
  assert.deepEqual((await f.request('clients', headers)).customers, [])
})

test('runtime preserves titles and legacy sessions, detecting canonical aliases and missing legacy paths', async () => {
  const rows = [
    { id: 'seeded', path: personalPath, title: 'Already seeded', sessionIds: ['own-session'] },
    { id: 'legacy', path: legacyPath + '/', title: 'Old', sessionIds: ['shared-session'] },
    { id: 'legacy-alias', path: '/legacy-link', title: 'Alias', sessionIds: [] },
    { id: 'other', path: legacyPath + '/customer', title: 'Explicit other workspace', sessionIds: [] },
  ].map(Object.freeze)
  const f = host({ rows: [...rows], aliases: { '/legacy-link': legacyPath } })
  const body = await f.request()
  assert.deepEqual(body.workspace, { personal: { id: 'seeded', path: personalPath }, legacySharedIds: ['legacy', 'legacy-alias'] })
  assert.deepEqual(f.rows, rows)
  assert.deepEqual(f.calls, [['mkdir', personalPath, { recursive: true }]])
})

test('runtime supports personal and legacy overrides without DSH_HOME', async () => {
  const f = host({ env: { DSH_WORKBENCH_PERSONAL_WORKSPACE: '/private/./own', DSH_WORKBENCH_LEGACY_SHARED_ROOT: '/old-shared' }, rows: [
    { id: 'old', path: '/old-shared/', title: 'Old' },
    { id: 'unrelated', path: legacyPath, title: 'Other' },
  ] })
  const body = await f.request()
  assert.deepEqual(body.workspace, { personal: { id: 'personal-id', path: '/private/own' }, legacySharedIds: ['old'] })
  assert.equal(f.impl.workspaceRoot(), '/private/./own')
  assert.ok(f.calls.every(([, name]) => !['/old-shared', legacyPath].includes(name)))
})

test('clients retains workspace metadata when customer MCP is unavailable or malformed', async () => {
  for (const kind of ['missing', 'failed', 'malformed']) {
    const f = host()
    if (kind === 'missing') f.ctx.tools.schemas = () => []
    else if (kind === 'failed') f.ctx.tools.execute = async () => { throw Error('offline') }
    else f.ctx.tools.execute = async () => ({ value: 'not a customer list' })
    const body = await f.request()
    assert.equal(body.ok, false)
    assert.equal(body.workspace.personal.id, 'personal-id')
  }
})

test('workspace failures leave the filtered customers response usable', async () => {
  for (const failure of ['home', 'registry', 'mkdir', 'list', 'create', 'shared']) {
    const f = host({ failure })
    if (failure === 'home') delete f.env.DSH_HOME
    if (failure === 'registry') delete f.ctx.workspaceRegistry
    if (failure === 'shared') f.env.DSH_WORKBENCH_PERSONAL_WORKSPACE = legacyPath
    const body = await f.request('clients', { 'x-dsh-allowed-client-keys': '["CUS-A"]' })
    assert.equal(body.ok, true, failure)
    assert.equal(body.workspace, null, failure)
    assert.deepEqual(body.customers.map(c => c.id), ['CUS-A'], failure)
    assert.ok(f.calls.every(([, name]) => name !== legacyPath), failure)
  }
})

test('workspaceRoot resolves at use time, respects overrides and never defaults to shared/cwd', async () => {
  const f = host()
  assert.equal(f.impl.workspaceRoot(), personalPath)
  f.files.set(path.join(personalPath, '我的客户'), ['my-article.md'])
  f.files.set(path.join(legacyPath, '我的客户'), ['another-customer.md'])
  assert.deepEqual((await f.request('task-status?client=我的客户')).workspace.list, ['my-article'])
  f.env.DSH_HOME = '/opt/dsh/homes/bob'
  assert.equal(f.impl.workspaceRoot(), '/opt/dsh/homes/bob/workspaces/default')
  f.env.DSH_WORKBENCH_PERSONAL_WORKSPACE = '/own-override'
  assert.equal(f.impl.workspaceRoot(), '/own-override')
  f.env.DSH_WORKBENCH_WORKSPACE_ROOT = '/probe-override'
  assert.equal(f.impl.workspaceRoot(), '/probe-override')
  delete f.env.DSH_WORKBENCH_WORKSPACE_ROOT
  delete f.env.DSH_WORKBENCH_PERSONAL_WORKSPACE
  delete f.env.DSH_HOME
  assert.equal(f.impl.workspaceRoot(), null)
  assert.deepEqual((await f.request('task-status?client=我的客户')).workspace, { exists: false, files: 0, recent: 0, list: [] })
  assert.ok(f.calls.every(([, name]) => !name.startsWith(legacyPath)))
})
