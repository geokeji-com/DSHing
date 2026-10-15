import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function api(reactHooks = {}, globals = {}) {
  let value
  const react = { createElement() {}, useRef() {}, useState() {}, useEffect() {}, ...reactHooks }
  const window = { __ModuleLoader__: { load({ factory }) { value = factory(() => react) } } }
  vm.runInNewContext(source.replace('return module.exports;', 'return {...module.exports, useWeakSelection, useWeakTicks};'), { window, console: { warn() {}, log() {} }, ...globals })
  return value
}

test('capture-words routes replace the legacy weak table sources', () => {
  assert.match(source, /\/api\/v1\/capture-words\/clients/)
  assert.match(source, /WB_API\.weakGaps\s*\+\s*"\?client=/)
  assert.match(source, /\/api\/v1\/capture-words\/ticks/)
  assert.doesNotMatch(source, /\/api\/v1\/capture-words\/ticks\/bulk/)
  assert.doesNotMatch(source, /\/api\/workbench\/weak-(?:dir|gaps)/)
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

// Run the actual selection hook through state/effect updates, including reloads.
function selection(storage = new Map(), unavailable = false) {
  const states = [], dependencies = []
  let cursor = 0, effects = [], dirty = false
  const current = api({
    useState(initial) {
      const at = cursor++
      if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial
      return [states[at], next => { states[at] = typeof next === 'function' ? next(states[at]) : next; dirty = true }]
    },
    useEffect(effect, deps) {
      const at = cursor++
      if (!dependencies[at] || deps.some((dep, i) => dep !== dependencies[at][i])) effects.push(effect)
      dependencies[at] = deps
    },
  }, {
    sessionStorage: {
      getItem(key) { if (unavailable) throw Error('blocked'); return storage.get(key) ?? null },
      setItem(key, value) { if (unavailable) throw Error('blocked'); storage.set(key, value) },
    },
    fetch() { assert.fail('local selection must never fetch') },
  })
  return { storage, render(key, suggestion = null) {
    let result
    for (let i = 0; i < 10; i++) {
      cursor = 0; effects = []; dirty = false
      result = current.useWeakSelection(key, suggestion)
      effects.forEach(effect => effect())
      if (!dirty) return result
    }
    assert.fail('selection did not settle')
  } }
}

test('local selection survives reload, ignores later shared ticks, and preserves explicit clear', () => {
  const f = selection(), key = 'draft-user-a-client-a'
  assert.deepEqual(Array.from(f.render(key)[0]), [])
  assert.deepEqual(Array.from(f.render(key, ['共享建议'])[0]), ['共享建议'])
  assert.deepEqual(Array.from(f.render(key, ['后来勾选'])[0]), ['共享建议'])
  f.render(key)[1](['本地选择'])
  f.render(key)
  const reloaded = selection(f.storage)
  assert.deepEqual(Array.from(reloaded.render(key, ['共享建议'])[0]), ['本地选择'])
  reloaded.render(key)[1]([])
  reloaded.render(key)
  assert.deepEqual(Array.from(selection(f.storage).render(key, ['共享建议'])[0]), [])
})

test('changing the draft scope cannot save the previous selection into another user/client/line/period', () => {
  const f = selection()
  const scopes = [
    ['user-a', 'client-a', 'line-a', 'period-a'],
    ['user-b', 'client-a', 'line-a', 'period-a'],
    ['user-a', 'client-b', 'line-a', 'period-a'],
    ['user-a', 'client-a', 'line-b', 'period-a'],
    ['user-a', 'client-a', 'line-a', 'period-b'],
  ].map(parts => 'wb-weak-selection-' + JSON.stringify(parts))
  scopes.forEach((key, i) => {
    assert.deepEqual(Array.from(f.render(key)[0]), [])
    f.render(key)[1](['选择 ' + i]); f.render(key)
  })
  scopes.forEach((key, i) => assert.deepEqual(Array.from(f.render(key, ['共享建议'])[0]), ['选择 ' + i]))
})

test('selection tolerates corrupt or unavailable sessionStorage and edits before tick loading finishes', () => {
  for (const value of ['{broken', '{}', '[1]']) {
    const f = selection(new Map([['draft', value]]))
    assert.deepEqual(Array.from(f.render('draft', ['建议'])[0]), ['建议'])
  }
  const f = selection(new Map(), true)
  f.render('draft')[1](['先选的'])
  assert.deepEqual(Array.from(f.render('draft', ['稍后加载的共享建议'])[0]), ['先选的'])
  f.render('draft')[1]([])
  assert.deepEqual(Array.from(f.render('draft', ['刷新建议'])[0]), [])
})

test('shared ticks remain read-only for hints and initial suggestions', async () => {
  const effects = [], requests = []
  let value
  const current = api({
    useState(initial) { value = initial; return [value, next => { value = next }] },
    useEffect(effect) { effects.push(effect) },
  }, {
    fetch: async (url, options) => {
      requests.push({ url, options })
      return { ok: true, json: async () => ({ ok: true, ticks: [{ qid: 'q-1', question: '共享建议' }] }) }
    },
    setInterval() { return 1 }, clearInterval() {},
  })
  const ticks = current.useWeakTicks('acme', 'ent-1', true)
  const cleanup = effects[0]()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(ticks.put, undefined)
  assert.equal(ticks.bulk, undefined)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/api/v1/capture-words/ticks?client=acme&enterprise=ent-1')
  assert.equal(requests[0].options.method || 'GET', 'GET')
  assert.equal(value.ticks[0].question, '共享建议')
  cleanup()
})
