import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const questions = [{ qid: 'q1', question: '怎么选产品？' }, { qid: 'q2', question: '产品值得信任吗？' }]
const catalog = [
  { name: 'sora-selection', description: '帮助用户做选型决策。当用户需要选购时触发。' },
  { name: 'sora-trust', description: '用事实建立信任。' },
]
function assembly({ failOpen = false } = {}) {
  let api, cursor = 0, current
  const states = [], requests = [], storage = new Map()
  const react = {
    createElement() {}, useRef: value => ({ current: value }), useEffect() {},
    useState(initial) {
      const at = cursor++
      if (!(at in states)) {
        let value = typeof initial === 'function' ? initial() : initial
        if (value?.customers) value = { ...value, status: 'ready', customers: [{ id: 'CUS-test', name: '测试客户' }] }
        if (value?.key === '') value = { key: 'CUS-test', line: '', period: '' }
        if (value?.skills) value = { ...value, status: 'ready', skills: catalog }
        if (value?.questions) value = { ...value, status: 'ready', questions, collectedAt: '2026-10-13' }
        states[at] = value
      }
      return [states[at], next => { states[at] = typeof next === 'function' ? next(states[at]) : next }]
    },
  }
  const workspace = { async openWorkspace(id, beforeOpen) { if (failOpen) throw Error('offline'); beforeOpen('session-test') } }
  const instrumented = source
    .replace('return module.exports;', 'return {...module.exports, WorkbenchPage, wbCacheWorkspace, skillDesc, skillDisplay};')
    .replace('function startDrag(event) {', 'if (props.capture) return props.capture({composePrompt, dispatch, addOne, minusOne, pickedEntries, pickedTotal, pickedLabel, setWeakPicked, setMode, setTopic, setBase}); function startDrag(event) {')
  vm.runInNewContext(instrumented, {
    window: { matchMedia: query => ({ matches: query.includes('reduced-motion') }), dispatchEvent() {}, __ModuleLoader__: { load({ factory }) { api = factory(() => react) } } },
    Event,
    sessionStorage: { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k) ?? null, removeItem: k => storage.delete(k) },
    fetch: async (url, options) => { requests.push({ url, options }); return { json: async () => ({ ok: true, id: 'meta-test' }) } },
  })
  api.wbCacheWorkspace({ workspace: { personal: { id: 'personal-test', path: '/personal/test' }, legacySharedIds: [] } })
  function render() { cursor = 0; api.WorkbenchPage({ ctx: { get: () => workspace }, capture: value => { current = value } }); return current }
  render()
  return { api, render, requests, storage }
}

test('cart increments/decrements quantities, labels counts and dispatches them with the production client key', async () => {
  const f = assembly()
  let a = f.render()
  a.addOne('sora-selection'); a.addOne('sora-selection'); a.addOne('sora-trust')
  a = f.render()
  assert.equal(a.pickedTotal(), 3)
  assert.equal(a.pickedLabel(), '选型决策×2、信任构建×1（共 3 篇）')
  a.minusOne('sora-selection'); a = f.render()
  assert.equal(a.pickedTotal(), 2)
  a.minusOne('sora-trust'); a.minusOne('sora-trust'); a = f.render()
  assert.equal(a.pickedTotal(), 1, 'decrement never goes negative')
  await a.dispatch()
  const payload = JSON.parse(f.requests.find(r => r.url === '/api/workbench/task-meta').options.body)
  assert.equal(payload.client_key, 'CUS-test')
  assert.deepEqual(payload.skills, ['sora-selection×1'])
  const binding = JSON.parse(f.storage.get('wb-pending-bind'))
  assert.equal(binding.client_key, 'CUS-test')
  assert.equal(binding.meta_id, 'meta-test')
  assert.equal(f.render().pickedTotal(), 0, 'clear cart after session opens')
  const retry = assembly({ failOpen: true }); retry.render().addOne('sora-trust')
  await retry.render().dispatch()
  assert.equal(retry.render().pickedTotal(), 1, 'failed session opening retains cart for retry')
})

test('prompt uses shared capture-word ticks, prototype allocation wording and the draft gate', () => {
  const f = assembly()
  let a = f.render()
  a.setWeakPicked(f.api.wbWeakPickedFromTicks([{ qid: 'q2', question: '旧问句' }, { qid: 'saved', question: '历史勾选问句' }], questions))
  a.addOne('sora-selection'); a.addOne('sora-selection'); a.addOne('sora-trust')
  a = f.render()
  const prompt = a.composePrompt()
  assert.match(prompt, /主题：写下面这些薄弱问句（共 2 条，每条一行）——\n1\. 产品值得信任吗？\n2\. 历史勾选问句/)
  assert.doesNotMatch(prompt, /怎么选产品？|旧问句/)
  assert.ok(prompt.includes('技能：sora-selection —— 请通过技能工具（skill provider）调用这个 skill，按它的规则写，写 2 篇。'))
  assert.ok(prompt.includes('已选文章类型的特性（匹配依据）：sora-selection（选型决策）：帮助用户做选型决策。；sora-trust（信任构建）：用事实建立信任。'))
  assert.ok(prompt.includes('选题分配（动笔前的第一步）：把上面主题里列出的全部问句/主题按意图归类合并成语义组，为每个语义组匹配最合适的文章类型，先产出分配表再写作。分配表一行一篇：「第 N 篇｜文章类型｜覆盖的问句｜一句话理由」。规则：全部问句都必须被覆盖，语义相同或相近的问句合并成一篇；各类型的篇数按上面点选的数量执行；补充要求里另有安排时，以补充要求为准。分配表完成后直接按表写作，无需停下确认。'))
  assert.ok(prompt.includes('新文章用文章库的 write_article 写入，必须带 draft:true，进入草稿区等待人工确认，仅当用户明确说「直接入库」时例外。'))
  assert.ok(prompt.includes(' —— 先读全知识库再动笔：用 list_kb_files 列出文件清单，逐个 read_kb_file 读取全文；read_kb 的整库读取在内容较大时会截断，不使用。'))
  assert.ok(prompt.includes('网页获取仅适用于公网 http/https 地址，本机地址与 file: 协议不在其适用范围。'))
  assert.match(prompt, /行为守则（硬规则，违反即返工）/)
})

test('single article keeps the prototype allocation condition; free topics and supplementary copy remain verbatim', () => {
  const f = assembly(); let a = f.render()
  a.setMode('free'); a.setTopic('  自己的选题  '); a.setBase('写 4 篇'); a.addOne('sora-trust')
  a = f.render()
  assert.match(a.composePrompt(), /主题：自己的选题/)
  assert.match(a.composePrompt(), /补充要求：写 4 篇/)
  assert.doesNotMatch(a.composePrompt(), /选题分配（动笔前/)
  a.addOne('sora-trust'); a = f.render()
  assert.match(a.composePrompt(), /分配表完成后直接按表写作，无需停下确认/)
  assert.equal(f.api.skillDesc('missing', catalog), '')
  assert.equal(f.api.skillDesc('long', [{ name: 'long', description: '长'.repeat(100) }]).length, 90)
  assert.equal(f.api.skillDisplay('sora-selection×3'), '选型决策×3')
})


test('session selection snapshots qids and client; feature capability gates structured write context', async () => {
  const f = assembly(); let a = f.render()
  a.setWeakPicked(['产品值得信任吗？']); a = f.render()
  await a.dispatch()
  const bind = JSON.parse(f.storage.get('wb-pending-bind'))
  assert.deepEqual(bind.questions, [{ qid: 'q2', question: '产品值得信任吗？', client_key: 'CUS-test' }])
  assert.equal(bind.collected_at, '2026-10-13')
  assert.equal(f.api.wbQuestionLinkPrompt('sid', bind, { ok: true }), '')
  assert.equal(f.api.wbQuestionLinkPrompt('sid', bind, { article_question_links: { version: 2 } }), '')
  const text = f.api.wbQuestionLinkPrompt('sid', bind, { article_question_links: { version: 1 } })
  assert.match(text, /question_context/)
  assert.match(text, /assignment/)
  assert.match(text, /q2/)
  assert.doesNotMatch(text, /q1/)
  assert.match(text, /没有分配表时仅带 session_id/)
})


test('session snapshot preserves selected historical capture ticks and excludes unselected questions', () => {
  const f = assembly()
  const rows = f.api.wbSelectedSessionQuestions(questions, [{qid:'old',question:'历史问句'}, {qid:'q2',question:'产品值得信任吗？'}], ['产品值得信任吗？','历史问句'], 'CUS-test')
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    {qid:'q2', question:'产品值得信任吗？',client_key:'CUS-test'},
    {qid:'old', question:'历史问句',client_key:'CUS-test'},
  ])
})
