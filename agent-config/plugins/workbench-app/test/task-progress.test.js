import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const write = (title, extra = {}) => ({ kind: 'tool-result', call: {
  name: 'mcp__sora-articles__write_article', argsRaw: JSON.stringify({ title }),
}, ...extra })
const batch = (completed, rounds = 12) => ({ rounds, records: Array.from({ length: rounds }, (_, i) => ({
  round: i + 1, status: i < completed ? 'ok' : 'pending', title: i < completed ? `文章 ${i + 1}` : '',
})) })
const prodMeta = { skills: ['sora-review×1', 'sora-selection×1', 'sora-single-brand×10'], rounds: 12 }

// Render the real progress rows without running effects or exposing any network/send API.
function load(meta = {}) {
  let api
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(value) { return [value?.status === 'idle' && 'meta' in value ? { ...value, meta } : value, () => {}] },
    useRef: value => ({ current: value }), useEffect() {}, useLayoutEffect() {},
  }
  vm.runInNewContext(source.replace('return module.exports;', `return { ...module.exports,
    TaskBar, MobileChatHeader, wbWrittenTitles, wbMobileProgress, wbBatches, wbBatchKey
  };`), {
    window: { __ModuleLoader__: { load({ factory }) { api = factory(() => react) } } },
  })
  return api
}

function findRow(tree) {
  if (!tree || typeof tree !== 'object') return null
  if (tree.props?.className === 'wb_trow') {
    return [tree.children[0].props['data-s'], tree.children[1].children[0]]
  }
  for (const child of (Array.isArray(tree) ? tree : tree.children || [])) {
    const row = findRow(child)
    if (row) return row
  }
  return null
}

function checkProgress({ meta, currentBatch, nodes = [], total, done, finished, row }) {
  const api = load(meta)
  if (currentBatch) api.wbBatches[api.wbBatchKey('session')] = { batch: currentBatch }
  const progress = api.wbWriteProgress(meta, currentBatch, api.wbWrittenTitles(nodes))
  assert.deepEqual({ ...progress }, { total, done, finished })
  const legacy = { nodes, partial: null, runningCalls: [] }
  const desktop = api.TaskBar({ sessionId: 'session', useChat: select => select({ legacy }) })
  const mobile = api.MobileChatHeader({ sessionId: 'session', nodes, legacy, meta })
  assert.deepEqual(findRow(desktop), row, 'desktop row')
  assert.deepEqual(findRow(mobile), row, 'mobile row')
}

test('requested total prefers the current batch, then meta rounds, then cart quantities', () => {
  const api = load()
  for (const [meta, currentBatch, expected] of [
    [prodMeta, { rounds: 5 }, 5],
    [prodMeta, null, 12],
    [{ rounds: 7, skills: ['a×12'] }, null, 7],
    [{ skills: prodMeta.skills }, null, 12],
    [{ rounds: 0, skills: ['a×2', 'b', 'c×3'] }, null, 6],
    [{ rounds: -1, skills: ['a'] }, null, 1],
    [{ skills: ['a'] }, null, 1],
    [{ skills: [] }, null, 0],
    [undefined, undefined, 0],
  ]) assert.equal(api.wbRequestedTotal(meta, currentBatch), expected)
})

test('production cart with 12 successful batch articles shows 12/12 and finished on both screens', () => {
  checkProgress({ meta: prodMeta, currentBatch: batch(12), total: 12, done: 12, finished: true,
    row: ['done', '草稿已写完：12/12 篇（草稿区待审）'] })
})

test('five successful records out of twelve show 5/12 and run, excluding failed and pending records', () => {
  const currentBatch = batch(5)
  currentBatch.records[5] = { round: 6, status: 'failed', title: '失败文章' }
  currentBatch.records[6].title = '待写文章'
  checkProgress({ meta: prodMeta, currentBatch, total: 12, done: 5, finished: false,
    row: ['run', '写作中 · 已写 5/12 篇（草稿区待审）'] })
})

test('single-shot without a batch falls back to one article per skill', () => {
  checkProgress({ meta: { skills: ['a'] }, nodes: [write('单篇')], total: 1, done: 1, finished: true,
    row: ['done', '草稿已写完：1/1 篇（草稿区待审）'] })
})

test('rewrites across turns count once; failed, untitled, malformed and unfinished writes do not count', () => {
  checkProgress({ meta: { rounds: 3 }, nodes: [write('文章'), { kind: 'user' }, write('文章'),
    write('文章.md'), write('失败', { isError: true }), write('尚未完成', { kind: 'tool-call' }), write(''),
    write('', { call: { name: 'mcp__articles__write_article', argsRaw: '{' } }),
    write('', { call: { name: 'mcp__articles__write_article', argsRaw: '{"file":"第二篇.md"}' } }),
  ], total: 3, done: 2, finished: false, row: ['run', '写作中 · 已写 2/3 篇（草稿区待审）'] })
})

test('a newer batch excludes earlier-batch session writes and deduplicates its successful titles', () => {
  const currentBatch = batch(5)
  currentBatch.records[4].title = currentBatch.records[0].title
  checkProgress({ meta: { rounds: 2, skills: ['old×2'] }, currentBatch,
    nodes: Array.from({ length: 20 }, (_, i) => write(`旧批次 ${i}`)),
    total: 12, done: 4, finished: false, row: ['run', '写作中 · 已写 4/12 篇（草稿区待审）'] })
  const api = load()
  assert.equal(api.wbWriteProgress(prodMeta, batch(0), api.wbWrittenTitles([write('旧批次')])).done, 0)
})

test('displayed progress is clamped for both session writes and batch records', () => {
  for (const currentBatch of [null, { ...batch(3, 3), rounds: 2 }]) {
    checkProgress({ meta: { rounds: 2 }, currentBatch, nodes: [write('一'), write('二'), write('三')],
      total: 2, done: 2, finished: true, row: ['done', '草稿已写完：2/2 篇（草稿区待审）'] })
  }
})

test('unknown requested total omits the denominator and remains unfinished', () => {
  checkProgress({ meta: {}, nodes: [write('文章')], total: 0, done: 1, finished: false,
    row: ['run', '写作中 · 已写 1 篇（草稿区待审）'] })
})

test('mobile draft and library counts keep their session scope when progress uses a newer batch', () => {
  const api = load()
  const rows = api.wbMobileProgress([write('旧草稿'), write('已入库')], null,
    [{ title: '旧草稿' }, { title: '其他会话' }], { 已入库: true }, prodMeta, batch(5))
  assert.deepEqual(Array.from(rows, row => Array.from(row)), [
    ['run', '写作中 · 已写 5/12 篇（草稿区待审）'], ['wait', '1 篇草稿待审核'], ['done', '已入库 1 篇'],
  ])
})
