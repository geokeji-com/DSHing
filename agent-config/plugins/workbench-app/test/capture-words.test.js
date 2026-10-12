import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function api() {
  let value
  const react = { createElement() {}, useRef() {}, useState() {}, useEffect() {} }
  const window = { __ModuleLoader__: { load({ factory }) { value = factory(() => react) } } }
  vm.runInNewContext(source, { window, console: { warn() {}, log() {} } })
  return value
}

test('capture-words routes replace the legacy weak table sources', () => {
  assert.match(source, /\/api\/v1\/capture-words\/clients/)
  assert.match(source, /WB_API\.weakGaps\s*\+\s*"\?client=/)
  assert.match(source, /\/api\/v1\/capture-words\/ticks/)
  assert.match(source, /\/api\/v1\/capture-words\/ticks\/bulk/)
  assert.doesNotMatch(source, /\/api\/workbench\/weak-(?:dir|gaps)/)
  assert.doesNotMatch(source, /weakPicked[^\n]*sessionStorage/)
  assert.doesNotMatch(source, /薄弱问句库还没接|数据源未定/)
})

test('capture client directory maps client keys, enterprise lines, and unmapped names', () => {
  const result = api().wbMapCaptureWordDir({
    ok: true,
    algo_version: 'v4',
    customers: [
      { clientKey: 'acme', name: 'Acme', mapped: true, lines: [{ enterprise_id: 'ent-1', name: '主线', is_default: true }] },
      { clientKey: 'lost', name: '未映射', mapped: false, lines: [] },
    ],
  })
  assert.deepEqual(Array.from(result.unmapped), ['未映射'])
  assert.deepEqual(JSON.parse(JSON.stringify(result.customers[0])), {
    id: 'acme', clientKey: 'acme', name: 'Acme', collectedAt: '', inWindow: true,
    lines: [{ name: '主线', id: 'ent-1', enterprise_id: 'ent-1', is_default: true, collectedAt: '', inWindow: true }],
  })
  assert.equal(result.customers.length, 1)
})

test('capture words mapping keeps qid and the supplied question data', () => {
  const current = api()
  const questions = current.wbMapCaptureQuestions({
    questions: [{ qid: 'q-1', question: '怎么选？', root: '选', platforms: [{ name: '豆包', gap: 4 }], summary: { gap: 2, weakCount: 1 } }],
  })
  assert.equal(questions[0].qid, 'q-1')
  assert.equal(questions[0].question, '怎么选？')
  assert.deepEqual(questions[0].platforms, [{ name: '豆包', gap: 4 }])
  assert.deepEqual(Array.from(current.wbWeakPickedFromTicks(
    [{ qid: 'q-1', question: '旧问句' }, { qid: 'q-missing', question: '历史问句' }],
    [{ qid: 'q-1', question: '最新问句' }],
  )), ['最新问句', '历史问句'])
  assert.equal(current.wbWeakSelectionText([{ question: '最新问句' }], ['最新问句', '历史问句']), '1. 最新问句\n2. 历史问句')
})

test('tick writes use shared same-origin JSON requests and required headers', () => {
  const current = api()
  const put = current.wbTickPutRequest('acme', 'ent-1', { qid: 'q-1', question: '怎么选？' }, true)
  assert.equal(put.url, '/api/v1/capture-words/ticks')
  assert.equal(put.options.method, 'PUT')
  assert.equal(put.options.credentials, 'same-origin')
  assert.equal(put.options.headers['Content-Type'], 'application/json')
  assert.equal(put.options.headers['X-Requested-With'], 'XMLHttpRequest')
  assert.deepEqual(JSON.parse(put.options.body), { client: 'acme', enterprise: 'ent-1', qid: 'q-1', question: '怎么选？', ticked: true })

  const bulk = current.wbTickBulkRequest('acme', 'ent-1', [{ qid: 'q-1', question: '怎么选？' }], false)
  assert.equal(bulk.url, '/api/v1/capture-words/ticks/bulk')
  assert.equal(bulk.options.method, 'POST')
  assert.equal(bulk.options.headers['Content-Type'], 'application/json')
  assert.equal(bulk.options.headers['X-Requested-With'], 'XMLHttpRequest')
  assert.deepEqual(JSON.parse(bulk.options.body), {
    client: 'acme', enterprise: 'ent-1', items: [{ qid: 'q-1', question: '怎么选？' }], ticked: false,
  })
})
