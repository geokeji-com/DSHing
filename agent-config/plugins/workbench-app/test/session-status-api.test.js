import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { create, sessionStatusIds, sessionStatusItem } from '../lib/impl.js'

const savedAt = '2026-10-19T03:42:00Z'
const binding = { client_key: 'CUS-A', client: '客户 A', owner_uid: 'alice' }
const records = [
  { round: 1, status: 'ok', title: '本地草稿' },
  { round: 2, status: 'failed', title: '失败标题' },
  { round: 3, status: 'pending' },
]
function fixture(t) {
  const keys = ['DSH_ROOT', 'DSH_HOME', 'DSH_ALLOWED_PROJECT_IDS', 'DSH_WORKBENCH_META_DIR', 'DSH_WORKBENCH_LIBRARY_ROOT']
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  keys.forEach(key => { delete process.env[key] })
  const root = mkdtempSync(join(tmpdir(), 'wb-session-status-'))
  const meta = join(root, 'meta'), library = join(root, 'library'), calls = []
  process.env.DSH_WORKBENCH_META_DIR = meta
  process.env.DSH_WORKBENCH_LIBRARY_ROOT = library
  t.after(() => {
    keys.forEach(key => { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key] })
    rmSync(root, { recursive: true, force: true })
  })
  let remote = [], execute
  const ctx = { tools: {
    schemas: () => [{ name: 'mcp__articles__list_articles' }],
    execute: async call => {
      calls.push(call)
      assert.equal(call.name, 'mcp__articles__list_articles', 'aggregate must never call a write tool')
      if (execute) return execute(call)
      return { value: { items: remote } }
    },
  } }
  function put(path, value) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
  }
  function batch(session = 'a', patch = {}) {
    const record = { id: 'wbb-' + session, session_id: session, ...binding, status: 'running', rounds: 3,
      records, review_opened: false, savedAt, ...patch }
    put(join(meta, 'batches', record.id + '.json'), record)
    return record
  }
  function headers(uid = 'alice', allowed = ['CUS-A']) {
    return { 'x-dsh-uid': uid, 'x-dsh-allowed-client-keys': JSON.stringify(allowed),
      'x-dsh-allowed-clients': JSON.stringify([{ key: 'CUS-A', name: '客户 A' }, { key: 'CUS-B', name: '客户 B' }]) }
  }
  async function request(query = '?ids=a', options = {}) {
    const path = options.path || '/api/workbench/session-status'
    const req = { url: path + query, method: options.method || 'GET', headers: options.headers || headers() }
    const result = {}
    // Match the route shell: fresh handlers, stable host context on every request.
    await create(ctx, {}).handlers[path](req, {
      writeHead(status, responseHeaders) { result.status = status; result.headers = responseHeaders },
      end(body) { result.body = JSON.parse(body) },
    })
    return result
  }
  function files(dir = root) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name))
      : [[join(dir, entry.name), readFileSync(join(dir, entry.name), 'utf8')]])
  }
  put(join(meta, 'session-client-index.json'), { a: binding, b: binding })
  put(join(meta, 'client-map.json'), { a: binding, b: binding })
  return { root, meta, library, put, batch, headers, request, calls, files, ctx,
    set remote(value) { remote = value }, set execute(value) { execute = value } }
}

test('ids are required, bounded before deduplication, shape validated, and GET only', async t => {
  const f = fixture(t)
  const bad = ['', '?ids=', '?ids=a,,b', '?ids=../a', '?ids=a/b', '?ids=a%5Cb', '?ids=a%00', '?ids=a%20b', '?ids=a&ids=b',
    '?ids=' + 'a'.repeat(129), '?ids=' + Array(51).fill('a').join(',')]
  for (const query of bad) {
    const response = await f.request(query)
    assert.equal(response.status, 400, query)
    assert.equal(response.body.ok, false)
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) assert.equal((await f.request('?ids=a', { method })).status, 405)
  assert.equal(f.calls.length, 0)
  assert.deepEqual(sessionStatusIds(new URLSearchParams('ids=session-90c27338-5aad-4b29-b6de-42b940289571,a,a')), ['session-90c27338-5aad-4b29-b6de-42b940289571', 'a'])
  assert.equal((await f.request('?ids=' + Array.from({ length: 50 }, (_, i) => 's' + i).join(','))).status, 200)
})

test('session and batch ACLs omit other owners, forbidden clients, unknown ids and prototype properties', async t => {
  const f = fixture(t)
  const entries = { a: binding, other: { ...binding, owner_uid: 'bob' }, denied: { ...binding, client_key: 'CUS-B' },
    mapDenied: binding, batchOther: binding, shared: { client_key: 'CUS-A' } }
  f.put(join(f.meta, 'session-client-index.json'), entries)
  f.put(join(f.meta, 'client-map.json'), { ...entries, mapDenied: { ...binding, owner_uid: 'bob' } })
  f.batch('a'); f.batch('other'); f.batch('denied'); f.batch('mapDenied'); f.batch('batchOther', { owner_uid: 'bob' })
  const response = await f.request('?ids=a,a,other,denied,mapDenied,batchOther,shared,missing,__proto__,constructor')
  assert.equal(response.status, 200)
  assert.deepEqual(Object.keys(response.body.items).sort(), ['a', 'batchOther', 'shared'])
  assert.equal(response.body.items.a.batch.id, 'wbb-a')
  assert.deepEqual(response.body.items.batchOther, { batch: null, drafts_pending: null, finished_at: null })
  assert.deepEqual(response.body.items.shared, { batch: null, drafts_pending: null, finished_at: null })
  assert.equal(f.calls.length, 1)
  assert.deepEqual((await f.request('?ids=a', { headers: f.headers('bob') })).body.items, {})
  assert.deepEqual((await f.request('?ids=a', { headers: f.headers('alice', []) })).body.items, {})
  assert.deepEqual((await f.request('?ids=a', { headers: f.headers('') })).body.items, {})
  assert.equal(f.calls.length, 1, 'revocation/owner filtering happens before cache or tools')
})

test('latest visible batch matches GET batch selection; legacy and batch-only sessions work', async t => {
  const f = fixture(t)
  f.batch('a', { id: 'wbb-old', savedAt: '2026-10-18T00:00:00Z' })
  f.batch('a', { id: 'wbb-new' })
  f.batch('a', { id: 'wbb-foreign', owner_uid: 'bob', savedAt: '2026-10-20T00:00:00Z' })
  f.batch('orphan')
  const aggregate = (await f.request('?ids=a,orphan')).body.items
  const single = (await f.request('?session_id=a', { path: '/api/workbench/batch' })).body.batch
  assert.equal(aggregate.a.batch.id, single.id)
  assert.equal(single.id, 'wbb-new')
  assert.equal(aggregate.orphan.batch.id, 'wbb-orphan')
  assert.equal(aggregate.orphan.drafts_pending, null, 'unbound client attribution stays unknown')
  assert.equal((await f.request('?ids=a', { headers: {} })).body.items.a.batch.id, 'wbb-foreign', 'legacy route has no uid restriction')
})

test('batch projection derives first unfinished round, failed count and terminal savedAt without mutating', () => {
  const batch = { id: 'wbb-test', status: 'running', rounds: 3, records, savedAt }
  const before = structuredClone(batch)
  assert.deepEqual(sessionStatusItem(batch, { drafts: [], library: [] }), {
    batch: { id: 'wbb-test', status: 'running', round: 3, rounds: 3, failed: 1, review_opened: false, savedAt },
    drafts_pending: 0, finished_at: null,
  })
  assert.equal(sessionStatusItem({ ...batch, records: [{ round: 1, status: 'sending' }, ...records] }).batch.round, 1)
  for (const status of ['done', 'failed_partial', 'stopped']) {
    const item = sessionStatusItem({ ...batch, status, records: records.slice(0, 2), review_opened: true })
    assert.equal(item.batch.round, 3)
    assert.equal(item.batch.review_opened, true)
    assert.equal(item.finished_at, savedAt)
  }
  assert.deepEqual(batch, before)
  assert.deepEqual(sessionStatusItem(null), { batch: null, drafts_pending: null, finished_at: null })
})

test('counts only successful batch titles in the merged unconfirmed drafts, shared once per client', async t => {
  const f = fixture(t)
  const titles = ['本地草稿', '远端草稿', '本地已入库', '远端已入库', '已忽略', '重复草稿']
  const batch = f.batch('a', { status: 'done', rounds: 8, records: [
    ...titles.map((title, i) => ({ round: i + 1, status: 'ok', title })),
    { round: 7, status: 'failed', title: '失败标题' }, { round: 8, status: 'pending', title: '未完成' },
  ] })
  f.batch('b', { records: [{ round: 1, status: 'ok', title: '本地草稿' }] })
  for (const title of ['本地草稿', '本地已入库', '远端已入库', '重复草稿', '其他会话', '失败标题', '未完成']) f.put(join(f.library, 'CUS-A', '草稿', title + '.md'), '# fixture')
  f.put(join(f.library, 'CUS-A', '本地已入库.md'), '# confirmed')
  f.remote = [{ title: '远端草稿', status: 'draft' }, { title: '重复草稿', status: 'draft' },
    { title: '远端已入库', status: 'ready' }, { title: '本地已入库', status: 'draft' }, { title: '已忽略', status: 'ignored' }]
  const before = f.files()
  const response = await f.request('?ids=a,b')
  assert.equal(response.body.items.a.drafts_pending, 3)
  assert.equal(response.body.items.b.drafts_pending, 1)
  assert.equal(f.calls.length, 1)
  const drafts = (await f.request('?session_id=a', { path: '/api/workbench/drafts' })).body
  const expected = batch.records.filter(row => row.status === 'ok' && drafts.drafts.some(draft => draft.title === row.title) && !drafts.library.includes(row.title)).length
  assert.equal(response.body.items.a.drafts_pending, expected)
  assert.deepEqual(f.files(), before, 'GET does not write metadata, drafts or articles')
})

test('Support cache lasts 30 seconds across create(), shares concurrent reads and isolates uid/client', async t => {
  const f = fixture(t)
  let now = 1000
  t.mock.method(Date, 'now', () => now)
  f.batch('a'); f.batch('b')
  let release
  f.execute = () => new Promise(resolve => { release = resolve })
  const first = f.request('?ids=a,b'), second = f.request('?ids=a')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.calls.length, 1)
  release({ value: { items: [{ title: '本地草稿', status: 'draft' }] } })
  await Promise.all([first, second]); f.execute = null
  now += 29999
  assert.equal((await f.request()).body.items.a.drafts_pending, 1)
  assert.equal(f.calls.length, 1)
  now++
  assert.equal((await f.request()).body.items.a.drafts_pending, 0)
  assert.equal(f.calls.length, 2)
  f.put(join(f.meta, 'session-client-index.json'), { a: binding, b: { ...binding, owner_uid: 'bob' }, c: { ...binding, client_key: 'CUS-B', client: '客户 B' } })
  f.put(join(f.meta, 'client-map.json'), {})
  f.batch('b', { owner_uid: 'bob' }); f.batch('c', { client_key: 'CUS-B', client: '客户 B' })
  await f.request('?ids=b', { headers: f.headers('bob') })
  await f.request('?ids=c', { headers: f.headers('alice', ['CUS-B']) })
  assert.equal(f.calls.length, 4)
  assert.equal(f.calls.at(-1).arguments.client, 'CUS-B')
})

test('missing MCP falls back to local drafts and local confirmations are never cached', async t => {
  const f = fixture(t)
  f.batch('a')
  f.ctx.tools.schemas = () => []
  f.put(join(f.library, '客户 A', '草稿', '本地草稿.md'), '# local legacy draft')
  assert.equal((await f.request()).body.items.a.drafts_pending, 1)
  f.put(join(f.library, '客户 A', '本地草稿.md'), '# confirmed')
  assert.equal((await f.request()).body.items.a.drafts_pending, 0)
  assert.equal(f.calls.length, 0)
})

test('forged legacy names and foreign metadata never read drafts or call Support', async t => {
  const f = fixture(t)
  const forged = { ...binding, client: '客户 B' }
  f.put(join(f.meta, 'session-client-index.json'), { a: forged, b: { meta_id: 'wbtm-foreign', owner_uid: 'alice' } })
  f.put(join(f.meta, 'wbtm-foreign.json'), { ...binding, owner_uid: 'bob' })
  f.put(join(f.library, '客户 B', '草稿', '本地草稿.md'), '# forbidden')
  f.batch('a', forged); f.batch('b')
  assert.deepEqual((await f.request('?ids=a,b')).body.items, {})
  assert.equal(f.calls.length, 0)
})
