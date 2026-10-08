import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import vm from 'node:vm'
import { create } from '../lib/impl.js'

const envKeys = ['DSH_ROOT', 'DSH_HOME', 'DSH_ALLOWED_PROJECT_IDS', 'DSH_WORKBENCH_META_DIR', 'DSH_WORKBENCH_LIBRARY_ROOT', 'DSH_WORKBENCH_WORKSPACE_ROOT']
const customers = [
  { client_key: 'CUS-Y', display_name: '猿编程' },
  { client_key: 'CUS-M', display_name: '我的客户' },
  { client_key: 'demo', display_name: '演示' },
]
const index = {
  y: { client_key: 'CUS-Y', client: '猿编程', meta_id: 'wbtm-y', topic: 'Y topic' },
  m: { client_key: 'CUS-M', client: '我的客户', meta_id: 'wbtm-m' },
  nameY: { client: '猿编程' },
  nameM: { client: '我的客户' },
  own: { client_key: 'CUS-M', owner_uid: 'alice' },
  other: { client_key: 'CUS-M', owner_uid: 'bob' },
  unbound: { topic: 'unowned' },
  ownUnbound: { topic: 'mine', owner_uid: 'alice' },
  otherUnbound: { topic: 'theirs', owner_uid: 'bob' },
}

function fixture(t) {
  const saved = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  envKeys.forEach(key => { delete process.env[key] })
  const root = mkdtempSync(join(fileURLToPath(new URL('.', import.meta.url)), '.acl-'))
  t.after(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    rmSync(root, { recursive: true, force: true })
  })
  const calls = []
  const ctx = { tools: {
    schemas: () => ['knowledge__list_clients', 'articles__list_articles', 'articles__read_article', 'articles__write_article'].map(name => ({ name: 'mcp__' + name })),
    execute: async call => {
      calls.push(call)
      if (call.name.endsWith('__list_clients')) return { value: { customers } }
      if (call.name.endsWith('__list_articles')) return { value: { items: [] } }
      if (call.name.endsWith('__read_article')) return { value: { content: 'Remote body' } }
      return { value: { id: 'written' } }
    },
  }, skills: { list: async () => [] } }
  // Construct handlers before overriding paths: overrides must be resolved at call time.
  const { handlers } = create(ctx, {})
  const meta = join(root, 'meta'), library = join(root, 'library'), workspace = join(root, 'workspace')
  process.env.DSH_WORKBENCH_META_DIR = meta
  process.env.DSH_WORKBENCH_LIBRARY_ROOT = library
  process.env.DSH_WORKBENCH_WORKSPACE_ROOT = workspace
  const put = (path, value) => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
  }
  put(join(meta, 'session-client-index.json'), index)
  put(join(meta, 'client-map.json'), index)
  put(join(meta, 'wbtm-y.json'), index.y)
  put(join(meta, 'wbtm-m.json'), index.m)
  put(join(meta, 'wbtm-other.json'), index.other)
  const draft = join(library, '猿编程', '草稿', 'x.md')
  put(draft, 'Private Y draft')
  put(join(library, '猿编程', 'ready.md'), 'Ready article')
  put(join(workspace, '猿编程', 'work.md'), 'Workspace article')
  function cloud(keys = ['CUS-M', 'demo'], extra = {}) {
    return {
      'x-dsh-uid': 'alice',
      'x-dsh-allowed-client-keys': JSON.stringify(keys),
      'x-dsh-allowed-clients': JSON.stringify(customers.map(c => ({ key: c.client_key, name: c.display_name }))).replace(/[^\x00-\x7f]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')),
      ...extra,
    }
  }
  async function request(route, { method = 'GET', body, headers = {} } = {}) {
    const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
    Object.assign(req, { method, url: '/api/workbench/' + route, headers })
    const response = { status: 0, headers: {}, raw: '' }
    const res = {
      writeHead(status, headers) { response.status = status; response.headers = headers },
      end(raw) { response.raw = String(raw); try { response.body = JSON.parse(raw) } catch { response.body = raw } },
    }
    await handlers[req.url.split('?')[0]](req, res)
    return response
  }
  return { root, meta, library, workspace, draft, put, calls, ctx, cloud, request }
}

function denied(response, status = 403) {
  assert.equal(response.status, status)
  assert.deepEqual(response.body, { ok: false, error: status === 403 ? 'forbidden' : 'not-found' })
}

test('legacy mode returns the entire index and preserves existing response contracts', async t => {
  const f = fixture(t)
  assert.deepEqual((await f.request('session-client')).body, { ok: true, index })
  assert.deepEqual((await f.request('client-map')).body, { ok: true, map: index })
  assert.deepEqual((await f.request('session-client?session=missing')).body, { ok: true, session: 'missing', binding: null })
  assert.deepEqual((await f.request('task-meta?id=wbtm-y')).body, index.y)
  assert.equal((await f.request('draft?client=猿编程&title=x')).body, 'Private Y draft')
})

test('cloud lists hide other clients, other owners and unowned unbound records', async t => {
  const f = fixture(t), headers = f.cloud()
  const expected = ['m', 'nameM', 'own', 'ownUnbound'].sort()
  assert.deepEqual(Object.keys((await f.request('session-client', { headers })).body.index).sort(), expected)
  assert.deepEqual(Object.keys((await f.request('client-map', { headers })).body.map).sort(), expected)
  denied(await f.request('session-client?client_key=CUS-Y', { headers }))
  denied(await f.request('session-client?session=m&client_key=CUS-Y', { headers }))
  for (const session of ['', 'y', 'other', 'missing', 'unbound', 'otherUnbound']) {
    denied(await f.request('session-client?session=' + session, { headers }), 404)
  }
  for (const id of ['', '../wbtm-y', 'wbtm-y', 'wbtm-other', 'wbtm-missing']) denied(await f.request('task-meta?id=' + id, { headers }), 404)
  const sessions = (await f.request('session-client?client_key=CUS-M', { headers })).body.sessions
  assert.deepEqual(sessions.map(s => s.session_id).sort(), ['m', 'own'])
  assert.deepEqual((await f.request('clients', { headers })).body.customers.map(c => c.id), ['CUS-M', 'demo'])
})

test('unauthorized client routes reject before article MCP calls or draft mutation', async t => {
  const f = fixture(t), headers = f.cloud()
  for (const route of ['task-status?client=猿编程', 'drafts?client=猿编程', 'draft?client=猿编程&title=x', 'articles?client=CUS-Y', 'drafts?client=猿%2F编%5C程']) {
    denied(await f.request(route, { headers }))
  }
  denied(await f.request('confirm-draft', { method: 'POST', headers, body: { session_id: 'y', title: 'x' } }))
  assert.equal(f.calls.length, 0)
  assert.equal(readFileSync(f.draft, 'utf8'), 'Private Y draft')
  assert.equal(existsSync(join(f.library, '猿编程', 'x.md')), false)
})

test('binding writes reject unauthorized keys, names and overwrites', async t => {
  const f = fixture(t), headers = f.cloud()
  for (const route of ['session-client', 'assign-client-group']) {
    for (const body of [
      { session_id: 'new', client_key: 'CUS-Y' },
      { session_id: 'new', client: '猿编程' },
      { session_id: 'y', client_key: 'CUS-M' },
      { session_id: 'other', client_key: 'CUS-M' },
      { session_id: 'unbound', client_key: 'CUS-M' },
    ]) denied(await f.request(route, { method: 'POST', headers, body }))
  }
  denied(await f.request('task-meta', { method: 'POST', headers, body: { client_key: 'CUS-Y' } }))
  assert.deepEqual(JSON.parse(readFileSync(join(f.meta, 'session-client-index.json'))), index)
  assert.deepEqual(JSON.parse(readFileSync(join(f.meta, 'client-map.json'))), index)
})

test('grantee can read shared legacy metadata, local drafts and workspace status', async t => {
  const f = fixture(t), headers = f.cloud(['CUS-Y'])
  assert.deepEqual(Object.keys((await f.request('session-client', { headers })).body.index).sort(), ['nameY', 'ownUnbound', 'y'])
  assert.deepEqual((await f.request('task-meta?id=wbtm-y', { headers })).body, index.y)
  const status = (await f.request('task-status?client=猿编程', { headers })).body
  assert.deepEqual(status.workspace.list, ['work'])
  assert.deepEqual(status.library.list, ['ready'])
  assert.deepEqual((await f.request('drafts?client=猿编程', { headers })).body.drafts.map(d => d.title).sort(), ['ready', 'x'])
  assert.equal((await f.request('draft?client=猿编程&title=x', { headers })).body, 'Private Y draft')
  assert.equal((await f.request('articles?client=CUS-Y', { headers })).body.ok, true)
})

test('cloud writes stamp the trusted owner and ignore payload owner_uid', async t => {
  const f = fixture(t), headers = f.cloud()
  for (const route of ['session-client', 'assign-client-group']) {
    const response = await f.request(route, { method: 'POST', headers, body: { session_id: 'new', client_key: 'CUS-M', owner_uid: 'bob' } })
    assert.equal(response.status, 200)
    assert.equal((response.body.binding || response.body.entry).owner_uid, 'alice')
    const merged = await f.request(route, { method: 'POST', headers, body: { session_id: 'new', client_key: 'CUS-M', topic: 'updated' } })
    assert.equal((merged.body.binding || merged.body.entry).owner_uid, 'alice')
  }
  for (const body of [{ client_key: 'CUS-M', owner_uid: 'bob' }, { owner_uid: 'bob', topic: 'unbound' }]) {
    const response = await f.request('task-meta', { method: 'POST', headers, body })
    assert.equal(response.body.ok, true)
    const record = await f.request('task-meta?id=' + response.body.id, { headers })
    assert.equal(record.body.owner_uid, 'alice')
    denied(await f.request('task-meta?id=' + response.body.id, { headers: f.cloud(undefined, { 'x-dsh-uid': 'bob' }) }), 404)
  }
})

test('grant intersection prevents widening and supports live revocation', async t => {
  const f = fixture(t)
  process.env.DSH_ALLOWED_PROJECT_IDS = JSON.stringify(['CUS-M'])
  denied(await f.request('session-client?client_key=CUS-Y', { headers: f.cloud(['CUS-M', 'CUS-Y']) }))
  assert.deepEqual((await f.request('clients', { headers: f.cloud(['CUS-M', 'CUS-Y']) })).body.customers.map(c => c.id), ['CUS-M'])
  process.env.DSH_ALLOWED_PROJECT_IDS = JSON.stringify(['CUS-M', 'CUS-Y'])
  assert.equal((await f.request('session-client?session=y', { headers: f.cloud(['CUS-Y']) })).status, 200)
  denied(await f.request('session-client?session=y', { headers: f.cloud(['CUS-M']) }), 404)
  denied(await f.request('drafts?client=猿编程', { headers: f.cloud(['CUS-M']) }))
})

test('cloud with absent, invalid or empty grants fails closed', async t => {
  const f = fixture(t)
  for (const value of [undefined, '', 'broken', '{}', '[]', '[1]']) {
    process.env.DSH_ROOT = '' // Presence, even empty, activates cloud mode.
    if (value === undefined) delete process.env.DSH_ALLOWED_PROJECT_IDS
    else process.env.DSH_ALLOWED_PROJECT_IDS = value
    for (const route of ['session-client', 'client-map']) {
      const response = await f.request(route)
      assert.deepEqual(response.body, route === 'client-map' ? { ok: true, map: {} } : { ok: true, index: {} })
    }
    denied(await f.request('drafts?client=猿编程'))
    assert.deepEqual((await f.request('clients')).body.customers, [])
  }
  delete process.env.DSH_ROOT
  delete process.env.DSH_ALLOWED_PROJECT_IDS
  for (const value of ['', 'broken', '{}']) {
    const headers = { 'x-dsh-allowed-client-keys': value }
    assert.deepEqual((await f.request('session-client', { headers })).body.index, {})
    denied(await f.request('articles?client=CUS-Y', { headers }))
  }
})

test('trusted names fall back only to scoped knowledge results when header is absent', async t => {
  const f = fixture(t)
  process.env.DSH_ALLOWED_PROJECT_IDS = '["CUS-M"]'
  const headers = { 'x-dsh-uid': 'alice' }
  assert.deepEqual(Object.keys((await f.request('session-client', { headers })).body.index).sort(), ['m', 'nameM', 'own', 'ownUnbound'])
  denied(await f.request('drafts?client=猿编程', { headers }))
  assert.equal((await f.request('drafts?client=我的客户', { headers })).body.ok, true)
  assert.ok(f.calls.some(c => c.name === 'mcp__knowledge__list_clients'))
  for (const names of ['broken', '[]', '{}']) {
    denied(await f.request('drafts?client=我的客户', { headers: { ...headers, 'x-dsh-allowed-clients': names } }))
  }
})

test('writable metadata cannot authorize a forged client display name', async t => {
  const f = fixture(t), headers = f.cloud()
  f.put(join(f.meta, 'session-client-index.json'), { forged: { client_key: 'CUS-M', client: '猿编程' } })
  f.put(join(f.meta, 'wbtm-forged.json'), { client_key: 'CUS-M', client: '猿编程' })
  for (const body of [{ session_id: 'forged' }, { meta_id: 'wbtm-forged' }, { client_key: 'CUS-M', client: '猿编程' }]) {
    denied(await f.request('confirm-draft', { method: 'POST', headers, body: { ...body, title: 'x' } }))
  }
  assert.equal(f.calls.length, 0)
  assert.equal(readFileSync(f.draft, 'utf8'), 'Private Y draft')
})

test('confirm rejects invisible metadata and owners before fallback or mismatch details', async t => {
  const f = fixture(t), headers = f.cloud()
  f.put(join(f.meta, 'session-client-index.json'), { ...index, viaMeta: { owner_uid: 'alice', meta_id: 'wbtm-other' } })
  for (const body of [
    { session_id: 'y', client_key: 'CUS-M' },
    { session_id: 'other', client_key: 'CUS-M' },
    { session_id: 'viaMeta', client_key: 'CUS-M' },
    { meta_id: 'wbtm-y', client_key: 'CUS-M' },
    { meta_id: 'wbtm-other', client_key: 'CUS-M' },
  ]) denied(await f.request('confirm-draft', { method: 'POST', headers, body: { ...body, title: 'x' } }))
  assert.equal(f.calls.length, 0)
})

test('authorized confirmation keeps session, metadata and body-only workflows', async t => {
  const f = fixture(t), headers = f.cloud(['CUS-Y'])
  for (const body of [{ session_id: 'y' }, { meta_id: 'wbtm-y' }, { client_key: 'CUS-Y', client: '猿编程' }]) {
    f.put(f.draft, 'Private Y draft')
    const response = await f.request('confirm-draft', { method: 'POST', headers, body: { ...body, title: 'x' } })
    assert.equal(response.status, 200)
    assert.equal(response.body.ok, true)
    assert.equal(existsSync(f.draft), false)
    assert.equal(readFileSync(join(f.library, '猿编程', 'x.md'), 'utf8'), 'Private Y draft')
  }
  const writes = f.calls.filter(c => c.name.endsWith('__write_article'))
  assert.equal(writes.length, 3)
  assert.ok(writes.every(c => c.arguments.client === 'CUS-Y' && c.arguments.draft === false))
})

test('uid fallback requires the exact cloud homes directory and header takes precedence', async t => {
  const f = fixture(t)
  process.env.DSH_ROOT = '/opt/dsh'
  process.env.DSH_ALLOWED_PROJECT_IDS = '["CUS-M"]'
  process.env.DSH_HOME = '/opt/dsh/homes/alice'
  assert.equal((await f.request('session-client?session=own')).status, 200)
  denied(await f.request('session-client?session=own', { headers: { 'x-dsh-uid': 'bob' } }), 404)
  for (const home of ['/elsewhere/homes/alice', '/opt/dsh/homes/alice/nested']) {
    process.env.DSH_HOME = home
    denied(await f.request('session-client?session=own'), 404)
    const response = await f.request('task-meta', { method: 'POST', body: { client_key: 'CUS-M', owner_uid: 'alice' } })
    assert.equal(JSON.parse(readFileSync(join(f.meta, response.body.id + '.json'))).owner_uid, undefined)
  }
})

test('one valid grant source is used and explicit empty grants still intersect', async t => {
  const f = fixture(t)
  process.env.DSH_ALLOWED_PROJECT_IDS = '["CUS-M"]'
  for (const live of [undefined, 'invalid']) {
    const headers = { 'x-dsh-uid': 'alice' }
    if (live !== undefined) headers['x-dsh-allowed-client-keys'] = live
    assert.equal((await f.request('session-client?session=m', { headers })).status, 200)
    denied(await f.request('session-client?session=y', { headers }), 404)
  }
  process.env.DSH_ALLOWED_PROJECT_IDS = 'invalid'
  assert.equal((await f.request('session-client?session=y', { headers: f.cloud(['CUS-Y']) })).status, 200)
  process.env.DSH_ALLOWED_PROJECT_IDS = '[]'
  denied(await f.request('session-client?session=y', { headers: f.cloud(['CUS-Y']) }), 404)
})

test('knowledge failure never falls back to writable customer names', async t => {
  const f = fixture(t)
  process.env.DSH_ALLOWED_PROJECT_IDS = '["CUS-M"]'
  f.ctx.tools.execute = async () => { throw new Error('offline fixture') }
  denied(await f.request('drafts?client=我的客户'))
  const response = await f.request('session-client')
  assert.deepEqual(Object.keys(response.body.index), ['m'])
})

test('display names use the same separator stripping as local directories', async t => {
  const f = fixture(t)
  const headers = f.cloud(['CUS-Y'], { 'x-dsh-allowed-clients': '[{"key":"CUS-Y","name":"猿/编\\\\程"}]' })
  assert.equal((await f.request('draft?client=' + encodeURIComponent('猿/编\\程') + '&title=x', { headers })).body, 'Private Y draft')
  const response = await f.request('session-client', { headers })
  assert.ok(response.body.index.nameY)
  for (const client of ['..', '.', '/', '../我的客户']) denied(await f.request('task-status?client=' + encodeURIComponent(client), { headers }))
})

test('own unbound and name-only posts remain usable and inherited session names are not records', async t => {
  const f = fixture(t), headers = f.cloud()
  for (const route of ['session-client', 'assign-client-group']) {
    for (const body of [{ session_id: 'fresh-unbound' }, { session_id: 'fresh-name', client: '我的客户' }, { session_id: '__proto__', client_key: 'CUS-M' }]) {
      const response = await f.request(route, { method: 'POST', headers, body })
      assert.equal((response.body.binding || response.body.entry).owner_uid, 'alice')
    }
  }
  const response = await f.request('session-client', { headers })
  for (const id of ['fresh-unbound', 'fresh-name', '__proto__']) assert.ok(Object.hasOwn(response.body.index, id))
  for (const id of ['constructor', 'toString']) denied(await f.request('session-client?session=' + id, { headers }), 404)
})

test('path overrides remain dynamic after the handlers have already served requests', async t => {
  const f = fixture(t)
  await f.request('session-client')
  const next = join(f.root, 'next')
  process.env.DSH_WORKBENCH_META_DIR = join(next, 'meta')
  process.env.DSH_WORKBENCH_LIBRARY_ROOT = join(next, 'library')
  process.env.DSH_WORKBENCH_WORKSPACE_ROOT = join(next, 'workspace')
  assert.deepEqual((await f.request('session-client')).body.index, {})
  assert.deepEqual((await f.request('client-map')).body.map, {})
  const status = (await f.request('task-status?client=猿编程')).body
  assert.equal(status.library.exists, false)
  assert.equal(status.workspace.exists, false)
  const response = await f.request('task-meta', { method: 'POST', body: { client_key: 'CUS-Y' } })
  assert.ok(existsSync(join(next, 'meta', response.body.id + '.json')))
  assert.equal(existsSync(join(f.meta, response.body.id + '.json')), false)
})

test('mcp and skills keep their behavior in cloud mode with no grants', async t => {
  const f = fixture(t)
  const before = [(await f.request('mcp')).body, (await f.request('skills')).body]
  process.env.DSH_ROOT = '/opt/dsh'
  assert.deepEqual([(await f.request('mcp')).body, (await f.request('skills')).body], before)
  assert.equal(f.calls.length, 0)
})

function browserApi() {
  let api
  const window = { matchMedia: () => ({ matches: false }), __ModuleLoader__: { load({ factory }) { api = factory(() => ({})) } } }
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  vm.runInNewContext(source.replace('return module.exports;', 'return {wbAuthorizedRecords, readWorkbenchList};'), { window })
  return api
}

test('browser grouping drops unknown keys and names, while preserving real unbound sessions', () => {
  const { wbAuthorizedRecords } = browserApi()
  const records = { ...index, forged: { client_key: 'CUS-Y', client: '我的客户' } }
  const visible = wbAuthorizedRecords(records, [{ id: 'CUS-M', name: '我的客户' }])
  assert.deepEqual(Object.keys(visible).sort(), ['m', 'nameM', 'other', 'otherUnbound', 'own', 'ownUnbound', 'unbound'])
  assert.equal(Object.values(visible).some(entry => entry.client_key === 'CUS-Y'), false)
  assert.deepEqual(Object.keys(wbAuthorizedRecords(visible, [])).sort(), ['otherUnbound', 'ownUnbound', 'unbound'])
})

test('browser list reads turn 403 and 404 into empty data without parsing error bodies', async () => {
  const { readWorkbenchList } = browserApi()
  for (const status of [403, 404]) {
    const body = await readWorkbenchList({ status, ok: false, json: () => { throw new Error('must not parse') } })
    assert.deepEqual(JSON.parse(JSON.stringify(body)), { ok: true, index: {}, map: {}, customers: [] })
  }
})
