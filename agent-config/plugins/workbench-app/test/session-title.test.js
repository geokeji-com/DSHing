import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
function load() {
  let api
  const window = { matchMedia: () => ({ matches: false }), __ModuleLoader__: { load({ factory }) { api = factory(() => ({})) } } }
  vm.runInNewContext(source.replace('return module.exports;', 'return {wbSessionTitle, wbClampTitle, wbTitleToSave, wbTitleKey, wbCanRename, wbSaveSessionTitle, wbNavRename, wbNavReadSessions, wbNavState, setContext(ctx) { wbNavCtx = ctx; }};'), { window })
  return api
}
const api = load()
const id = 'session:opaque/id'
function service({ known = true, result = { ok: true }, reject = false, discover = true } = {}) {
  const calls = [], byId = known ? { [id]: { displayTitle: '旧标题' } } : {}
  const ctx = { get(name) { assert.equal(name, 'sessions'); return {
    list: { getSnapshot: () => ({ phase: 'ready', byId }) },
    async refresh() { calls.push('refresh'); if (discover) byId[id] = { displayTitle: '旧标题' } },
    binding(value) { calls.push(['binding', value]); return { session: { async rename(title) { calls.push(['rename', title]); if (reject) throw Error('offline'); return result } } } },
  } } }
  return { ctx, calls }
}

test('sidebar and mobile groups prefer non-blank harness display titles, then legacy topics', () => {
  assert.equal(api.wbSessionTitle({ topic: '旧选题' }, { displayTitle: '自动标题', title: 'canonical' }), '自动标题')
  assert.equal(api.wbSessionTitle({ topic: '旧选题' }, { blank: true, displayTitle: 'canonical' }), '旧选题')
  assert.equal(api.wbSessionTitle({ topic: '旧选题' }, { displayTitle: '' }), '旧选题')
  assert.equal(api.wbSessionTitle(null, null), '未命名会话')
  assert.match(source, /wbNavState\.renames\[id\]\.title : wbSessionTitle\(rec, wbNavState\.sessions/)
  assert.match(source, /title\.indexOf\(q\)/)
  assert.match(source, /h\('b',null,it\.title\)/)
})
test('title input clamps Unicode code points and save trims, cancelling empty and unchanged values', () => {
  assert.equal(api.wbClampTitle('字'.repeat(41)), '字'.repeat(40))
  assert.equal(api.wbClampTitle('😀'.repeat(41)), '😀'.repeat(40))
  assert.equal(api.wbTitleToSave('  新名称  ', '旧标题'), '新名称')
  assert.equal(api.wbTitleToSave(' \n ', '旧标题'), '')
  assert.equal(api.wbTitleToSave(' 旧标题 ', '旧标题'), '')
  assert.equal(api.wbTitleToSave('x'.repeat(41), 'x'.repeat(40)), '')
  assert.match(source, /className:'wb_mRename'.*maxLength:40.*wbClampTitle\(e.target.value\)/)
  assert.match(source, /className:'wb_nvRename'.*maxLength:40/)
})
test('Enter saves, Escape cancels, and IME confirmation never submits', () => {
  const actions = []
  const key = (key, extra = {}) => api.wbTitleKey({ key, preventDefault() {}, stopPropagation() {}, ...extra }, () => actions.push('save'), () => actions.push('cancel'))
  key('Enter'); key('Escape'); key('a'); key('Enter', { nativeEvent: { isComposing: true } }); key('Enter', { keyCode: 229 })
  assert.deepEqual(actions, ['save', 'cancel'])
  assert.match(source, /if \(!editing.current\) return;\s+cancel\(\); busy\[1\]\(true\)/)
  assert.match(source, /onBlur:save/)
  assert.match(source, /function cancel\(\) \{ editing.current = false;/)
})
test('rename optimistically uses the session binding RPC with an opaque id', async () => {
  const { ctx, calls } = service(), titles = []
  await api.wbSaveSessionTitle(ctx, id, ' 新标题 ', '旧标题', (title) => { titles.push(title); assert.equal(calls.length, 0) })
  assert.deepEqual(titles, ['新标题'])
  assert.deepEqual(calls, [['binding', id], ['rename', '新标题']])
})
test('unknown sessions refresh before binding, but still-unknown sessions never rename', async () => {
  const ready = service({ known: false })
  await api.wbSaveSessionTitle(ready.ctx, id, '新标题', '旧标题', () => {})
  assert.deepEqual(ready.calls, ['refresh', ['binding', id], ['rename', '新标题']])
  const missing = service({ known: false, discover: false }), titles = []
  await assert.rejects(api.wbSaveSessionTitle(missing.ctx, id, '新标题', '旧标题', (title) => titles.push(title)), /重命名失败，请稍后重试/)
  assert.deepEqual(missing.calls, ['refresh'])
  assert.deepEqual(titles, ['新标题', '旧标题'])
})
test('rejected RPC, transport errors and missing service revert the optimistic title', async () => {
  for (const ctx of [service({ result: { ok: false } }).ctx, service({ reject: true }).ctx, { get: () => undefined }]) {
    const titles = []
    await assert.rejects(api.wbSaveSessionTitle(ctx, id, '新标题', '旧标题', (title) => titles.push(title)), /重命名失败，请稍后重试/)
    assert.deepEqual(titles, ['新标题', '旧标题'])
  }
  await assert.doesNotReject(api.wbNavReadSessions())
})
test('empty/unchanged edits do not pin a title; writes are capped even without an input', async () => {
  const { ctx, calls } = service()
  for (const text of [' ', ' 旧标题 ']) await api.wbSaveSessionTitle(ctx, id, text, '旧标题', () => assert.fail('no optimistic update'))
  assert.deepEqual(calls, [])
  await api.wbSaveSessionTitle(ctx, id, '😀'.repeat(45), '旧标题', () => {})
  assert.deepEqual(calls.at(-1), ['rename', '😀'.repeat(40)])
})
test('either explicit foreign owner blocks desktop/mobile rename when uid is known', async () => {
  const own = load(), { ctx, calls } = service()
  own.wbNavState.uid = 'me'
  for (const field of ['map', 'bindings']) {
    own.wbNavState[field][id] = { owner_uid: 'other' }
    assert.equal(own.wbCanRename(id), false)
    await assert.rejects(own.wbSaveSessionTitle(ctx, id, '新标题', '旧标题', () => {}), /重命名失败/)
    own.wbNavState[field][id] = { owner_uid: 'me' }
  }
  assert.deepEqual(calls, [])
  assert.equal(own.wbCanRename(id), true)
  own.wbNavState.uid = ''
  own.wbNavState.map[id] = { owner_uid: 'other' }
  assert.equal(own.wbCanRename(id), true)
})
test('nav failure removes transient title and retains a visible error across row remounts', async () => {
  const own = load(), { ctx } = service({ result: { ok: false } })
  await assert.rejects(own.wbNavRename(ctx, id, '新标题', '旧标题'), /重命名失败/)
  assert.equal(own.wbNavState.renames[id], undefined)
  assert.equal(own.wbNavState.renameErrors[id], '重命名失败，请稍后重试')
})
test('a post-save refresh replaces optimistic text with the normalized harness title', async () => {
  const own = load()
  own.setContext({ get: () => ({ refresh: async () => {}, list: { getSnapshot: () => ({ phase: 'ready', byId: { [id]: { displayTitle: '规范 标题' } } }) } }) })
  own.wbNavState.renames[id] = { title: '规范  标题', saving: false }
  await own.wbNavReadSessions()
  assert.equal(own.wbNavState.sessions[id].displayTitle, '规范 标题')
  assert.equal(own.wbNavState.renames[id], undefined)
  own.wbNavState.renames[id] = { title: '仍在保存', saving: true }
  await own.wbNavReadSessions()
  assert.equal(own.wbNavState.renames[id].title, '仍在保存')
})
