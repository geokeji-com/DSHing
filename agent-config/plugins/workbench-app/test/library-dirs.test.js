import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import vm from 'node:vm'
import { clientLibraryDir, create } from '../lib/impl.js'

function fixture(t, makeHandlers = create) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-m6-library-'))
  const env = { DSH_ROOT: undefined, DSH_ALLOWED_PROJECT_IDS: undefined,
    DSH_WORKBENCH_META_DIR: join(root, 'meta'), DSH_WORKBENCH_LIBRARY_ROOT: join(root, 'library'),
    DSH_WORKBENCH_WORKSPACE_ROOT: join(root, 'workspace') }
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  const setEnv = values => { for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  } }
  setEnv(env)
  t.after(() => { setEnv(saved); rmSync(root, { recursive: true, force: true }) })
  const library = env.DSH_WORKBENCH_LIBRARY_ROOT, meta = env.DSH_WORKBENCH_META_DIR
  mkdirSync(library)
  mkdirSync(meta)
  const put = (path, value) => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const binding = { client_key: 'CUS-A', client: '旧名', owner_uid: 'alice' }
  put(join(meta, 'session-client-index.json'), { session: binding, indirect: { meta_id: 'wbtm-a', owner_uid: 'alice' },
    other: { ...binding, owner_uid: 'bob' }, denied: { client_key: 'CUS-B', client: '别家' } })
  put(join(meta, 'wbtm-a.json'), binding)
  const calls = []
  const { handlers } = makeHandlers({ tools: {
    schemas: () => ['list_articles', 'read_article', 'write_article'].map(name => ({ name: 'mcp__articles__' + name })),
    execute: async call => {
      calls.push(call)
      return { value: call.name.endsWith('list_articles') ? { items: [] }
        : call.name.endsWith('read_article') ? { content: 'Support only' } : { id: 'fixture-article' } }
    },
  } }, {})
  const headers = { 'x-dsh-uid': 'alice', 'x-dsh-allowed-client-keys': '["CUS-A"]',
    'x-dsh-allowed-clients': JSON.stringify([{ key: 'CUS-A', name: '新名' }]) }
  async function request(route, body, extraHeaders) {
    const req = Readable.from(body ? [JSON.stringify(body)] : [])
    Object.assign(req, { url: '/api/workbench/' + route, method: body ? 'POST' : 'GET', headers: extraHeaders || headers })
    const result = {}
    await handlers[req.url.split('?')[0]](req, {
      writeHead(status) { result.status = status },
      end(raw) { try { result.body = JSON.parse(raw) } catch { result.body = raw } },
    })
    return result
  }
  return { root, library, meta, put, request, calls, headers }
}

test('helper prefers keyed directories and symlinks, independent of display renames', t => {
  const f = fixture(t)
  mkdirSync(join(f.library, '旧名'))
  assert.equal(clientLibraryDir('CUS-A', '旧名'), join(f.library, '旧名'))
  mkdirSync(join(f.library, 'CUS-A'))
  assert.equal(clientLibraryDir('CUS-A', '旧名'), join(f.library, 'CUS-A'))
  assert.equal(clientLibraryDir('CUS-A', '新名'), join(f.library, 'CUS-A'))
  symlinkSync('CUS-A', join(f.library, 'CUS-ALIAS'))
  assert.equal(clientLibraryDir('CUS-ALIAS', '旧名'), join(f.library, 'CUS-ALIAS'))
})

test('helper reads never create directories; new writes create only the keyed directory', t => {
  const f = fixture(t)
  assert.equal(clientLibraryDir('CUS-A', '旧名'), join(f.library, 'CUS-A'))
  assert.deepEqual(readdirSync(f.library), [])
  assert.equal(clientLibraryDir('CUS-A', '旧名', { create: true }), join(f.library, 'CUS-A'))
  assert.deepEqual(readdirSync(f.library), ['CUS-A'])
  mkdirSync(join(f.library, '旧名'))
  assert.equal(clientLibraryDir('CUS-B', '旧名', { create: true }), join(f.library, '旧名'))
  assert.equal(existsSync(join(f.library, 'CUS-B')), false)
  assert.throws(() => clientLibraryDir('', '新名', { create: true }))
})

test('helper refuses traversal, non-directories and dangling links without falling back', t => {
  const f = fixture(t)
  for (const key of ['..', '.', '../CUS-A', 'a/b', 'a\\b', 'bad\0key']) assert.throws(() => clientLibraryDir(key, '旧名'))
  assert.throws(() => clientLibraryDir('', '..'))
  f.put(join(f.library, 'CUS-A'), 'occupied')
  mkdirSync(join(f.library, '旧名'))
  assert.throws(() => clientLibraryDir('CUS-A', '旧名'), /not a directory/)
  symlinkSync('absent', join(f.library, 'CUS-B'))
  assert.throws(() => clientLibraryDir('CUS-B', '旧名'))
})

test('bound listing, reading, status and confirmation prefer the key after a display rename', async t => {
  const f = fixture(t)
  f.put(join(f.library, 'CUS-A', '草稿', 'draft.md'), 'keyed draft')
  f.put(join(f.library, 'CUS-A', 'ready.md'), 'keyed ready')
  f.put(join(f.library, '旧名', '草稿', 'draft.md'), 'legacy shadow')
  f.put(join(f.root, 'workspace', 'personal.md'), 'flat personal file')
  const query = '?session_id=session&client=' + encodeURIComponent('新名')
  assert.equal((await f.request('draft' + query + '&title=draft')).body, 'keyed draft')
  assert.equal((await f.request('draft?client=' + encodeURIComponent('新名') + '&title=draft')).body, 'keyed draft')
  assert.deepEqual((await f.request('drafts' + query)).body.library, ['ready'])
  assert.deepEqual((await f.request('task-status' + query)).body.library.list, ['ready'])
  for (const ref of ['meta_id=wbtm-a', 'session_id=indirect']) {
    assert.equal((await f.request('draft?' + ref + '&title=draft')).body, 'keyed draft')
  }
  const result = await f.request('confirm-draft', { session_id: 'session', client_key: 'CUS-A', client: '新名', title: 'draft' })
  assert.equal(result.status, 200)
  assert.equal(result.body.movedTo, join(f.library, 'CUS-A', 'draft.md'))
  assert.equal(readFileSync(result.body.movedTo, 'utf8'), 'keyed draft')
  assert.equal(readFileSync(join(f.library, '旧名', '草稿', 'draft.md'), 'utf8'), 'legacy shadow')
  assert.equal(readFileSync(join(f.root, 'workspace', 'personal.md'), 'utf8'), 'flat personal file')
  assert.ok(f.calls.every(call => call.arguments.client === 'CUS-A'))
})

test('legacy fallback stays usable with a bound key and matching trusted name', async t => {
  const f = fixture(t)
  const headers = { ...f.headers, 'x-dsh-allowed-clients': JSON.stringify([{ key: 'CUS-A', name: '旧名' }]) }
  f.put(join(f.library, '旧名', '草稿', 'draft.md'), 'legacy draft')
  assert.equal((await f.request('draft?session_id=session&title=draft', null, headers)).body, 'legacy draft')
  const confirmed = await f.request('confirm-draft', { meta_id: 'wbtm-a', title: 'draft' }, headers)
  assert.equal(confirmed.status, 200)
  assert.equal(confirmed.body.movedTo, join(f.library, '旧名', 'draft.md'))
  assert.equal(existsSync(join(f.library, 'CUS-A')), false)
})

test('bound keys enforce owner/grant checks; free-text keys and mismatches cannot choose a directory', async t => {
  const f = fixture(t)
  f.put(join(f.library, 'CUS-A', '草稿', 'draft.md'), 'private')
  for (const ref of ['session_id=other', 'session_id=denied']) {
    for (const route of ['drafts', 'draft', 'task-status']) assert.equal((await f.request(route + '?' + ref)).status, 403)
    const [key, value] = ref.split('=')
    assert.equal((await f.request('confirm-draft', { [key]: value, title: 'draft' })).status, 403)
  }
  for (const body of [{ client_key: 'CUS-A', client: '新名' }, { session_id: 'missing', client_key: 'CUS-A', client: '新名' },
    { session_id: 'session', client_key: 'CUS-B' }, { session_id: 'session', client: '别家' }]) {
    assert.equal((await f.request('confirm-draft', { ...body, title: 'draft' })).status, 400)
    assert.equal((await f.request('draft?' + new URLSearchParams(body) + '&title=draft')).status, 400)
  }
  assert.equal((await f.request('draft?client=CUS-A&title=draft')).status, 400)
  assert.equal((await f.request('draft?session_id=session&title=draft', null,
    { ...f.headers, 'x-dsh-allowed-client-keys': '[]' })).status, 403)
  assert.equal(f.calls.length, 0)
  assert.equal(readFileSync(join(f.library, 'CUS-A', '草稿', 'draft.md'), 'utf8'), 'private')
})

test('a bound but forged display name cannot read a different legacy directory', async t => {
  const f = fixture(t)
  f.put(join(f.library, '旧名', '草稿', 'draft.md'), 'ungranted legacy name')
  assert.equal((await f.request('draft?session_id=session&title=draft')).status, 403)
  assert.equal(f.calls.length, 0)
})

test('Support-only reads use the bound key and do not create local folders', async t => {
  const f = fixture(t)
  assert.equal((await f.request('draft?session_id=session&title=remote')).body, 'Support only')
  assert.equal((await f.request('confirm-draft', { meta_id: 'wbtm-a', title: 'remote' })).status, 200)
  assert.ok(f.calls.every(call => call.arguments.client === 'CUS-A'))
  assert.deepEqual(readdirSync(f.library), [])
})

test('hardcheck reads keyed draft and ready files with the same bound ACL', async t => {
  const saved = process.env.WORKBENCH_HARDCHECK_SCRIPT
  process.env.WORKBENCH_HARDCHECK_SCRIPT = fileURLToPath(new URL('../../../../文章硬检/硬检.mjs', import.meta.url))
  t.after(() => {
    if (saved === undefined) delete process.env.WORKBENCH_HARDCHECK_SCRIPT
    else process.env.WORKBENCH_HARDCHECK_SCRIPT = saved
  })
  const module = await import('../lib/impl.js?m6-hardcheck')
  const f = fixture(t, module.create)
  const draft = join(f.library, 'CUS-A', '草稿', 'draft.md'), ready = join(f.library, 'CUS-A', 'ready.md')
  f.put(draft, '# 草稿\n普通正文')
  f.put(ready, '# 正式稿\n普通正文')
  const result = await f.request('check', { session_id: 'session', titles: ['draft', 'ready'] })
  assert.equal(result.body.ok, true)
  assert.deepEqual(result.body.results.map(row => row.file), [draft, ready])
  assert.equal((await f.request('check', { session_id: 'other', titles: ['draft'] })).status, 403)
  assert.equal(readFileSync(draft, 'utf8'), '# 草稿\n普通正文')
  assert.equal(f.calls.length, 0)
})

test('browser library queries carry bound references while leaving key resolution to the host', () => {
  let api
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  vm.runInNewContext(source.replace('return module.exports;', 'return {wbLibraryQuery};'), {
    window: { __ModuleLoader__: { load({ factory }) { api = factory(() => ({})) } } },
  })
  const params = new URLSearchParams(api.wbLibraryQuery('新名', 's&id', 'wbtm-a'))
  assert.equal(params.get('client'), '新名')
  assert.equal(params.get('session_id'), 's&id')
  assert.equal(params.get('meta_id'), 'wbtm-a')
  assert.equal(params.has('client_key'), false)
  for (const line of source.split('\n').filter(line => /fetch\(WB_API\.(drafts|draft|taskStatus) \+/.test(line))) {
    assert.match(line, /wbLibraryQuery\(/)
  }
})
