import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
function load(globals = {}) {
  let api
  const window = { __ModuleLoader__: { load({ factory }) { api = factory(() => ({})) } } }
  vm.runInNewContext(source.replace('return module.exports;', 'return {wbHumanizeToolNames, wbPrefoldSummary, wbInstallConversation};'), { window, ...globals })
  return api
}

test('tool humanizer covers prototype and production article/knowledge namespaces', () => {
  const { wbHumanizeToolNames: humanize } = load()
  for (const prefix of ['', 'sora-']) {
    for (const [name, label] of Object.entries({ write_article: '写入草稿', list_articles: '列文章', confirm: '确认入库', get: '读文章', read_article: '读文章' })) {
      assert.equal(humanize(`mcp__${prefix}articles__${name}`), `文章库 · ${label}`)
    }
    for (const [name, label] of Object.entries({ list_kb_files: '列文件清单', read_kb_file: '读文件', read_kb: '整库读取' })) {
      assert.equal(humanize(`mcp__${prefix}knowledge__${name}`), `知识库 · ${label}`)
    }
    assert.equal(humanize(`mcp__${prefix}knowledge__search_files`), '知识库 · search files')
    assert.equal(humanize(`mcp__${prefix}articles__search_articles`), '文章库 · search articles')
  }
  assert.equal(humanize('调用 mcp__articles__write_article 和 get_skill'), '调用 文章库 · 写入草稿 和 读取技能规则')
  assert.equal(humanize('mcp__other__read_kb get_skills'), 'mcp__other__read_kb get_skills')
  assert.equal(humanize('mcp__knowledge__read_kb_file_extra'), '知识库 · read kb file extra')
  assert.equal(humanize('文章库 · 写入草稿'), '文章库 · 写入草稿')
})

// A small DOM fixture records even redundant setters, which browsers may report
// as mutations. Tests exercise the actual observer callback and decoration code.
function fixture() {
  const trace = [], microtasks = new Map(), intervals = new Map(), observers = []
  let id = 0
  function write(op) { trace.push({ op, observed: observers.some(o => o.connected) }) }
  class Element {
    constructor(tag = 'div') { this.tag = tag; this.attrs = new Map(); this.childNodes = []; this.events = {}; this._className = ''; this._text = '' }
    get ownerDocument() { return document }
    get parentElement() { return this.parentNode }
    get children() { return this.childNodes }
    get firstChild() { return this.children[0] || null }
    get isConnected() { return this === document.body || !!this.parentNode?.isConnected }
    get textContent() { return this._text + this.children.map(c => c.textContent).join('') }
    set textContent(value) { write('text'); this.children.forEach(c => { c.parentNode = null }); this.childNodes = []; this._text = value }
    get className() { return this._className }
    set className(value) { write('class'); this._className = value }
    get classList() { return { contains: c => this.className.split(' ').includes(c), toggle: (c, on) => { const classes = this.className.split(' ').filter(x => x && x !== c); if (on) classes.push(c); this.className = classes.join(' ') } } }
    hasAttribute(name) { return this.attrs.has(name) }
    getAttribute(name) { return this.attrs.get(name) ?? null }
    setAttribute(name, value) { write('attribute'); this.attrs.set(name, value) }
    removeAttribute(name) { write('remove attribute'); this.attrs.delete(name) }
    appendChild(node) { return this.insertBefore(node, null) }
    insertBefore(node, before) { write('insert'); if (node.parentNode) node.parentNode.removeChild(node); const at = before ? this.children.indexOf(before) : this.children.length; this.children.splice(at, 0, node); node.parentNode = this; return node }
    removeChild(node) { write('remove'); this.children.splice(this.children.indexOf(node), 1); node.parentNode = null }
    addEventListener(name, fn) { this.events[name] = fn }
    matches(selector) {
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1))
      const attr = selector.match(/^\[([^=\]]+)(?:=['"]([^'"]+)['"])?\]$/)
      return attr ? this.hasAttribute(attr[1]) && (!attr[2] || this.getAttribute(attr[1]) === attr[2]) : this.tag === selector
    }
    querySelectorAll(selector) {
      const direct = selector.startsWith(':scope > ')
      if (direct) selector = selector.slice(9)
      return this.children.flatMap(c => [...(c.matches(selector) ? [c] : []), ...(direct ? [] : c.querySelectorAll(selector))])
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
    closest(selector) { return selector.split(',').some(s => this.matches(s)) ? this : this.parentNode?.closest(selector) || null }
  }
  const document = {
    body: new Element('body'),
    createElement: tag => new Element(tag),
    querySelector: selector => document.body.querySelector(selector),
    querySelectorAll: selector => document.body.querySelectorAll(selector),
    createTreeWalker(root) {
      const nodes = []
      function visit(el) {
        if (el._text) nodes.push({ parentElement: el, get data() { return el._text }, set data(value) { write('text data'); el._text = value } })
        el.children.forEach(visit)
      }
      visit(root)
      return { nextNode: () => nodes.shift() }
    },
  }
  function el(tag, text = '', attrs = {}) { const node = new Element(tag); node.textContent = text; for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node }
  const root = el('div', '', { 'data-slot': 'main.conversation' })
  document.body.appendChild(root)
  const api = load({
    document, NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this) }
      observe(target, options) { trace.push({ op: 'observe' }); this.connected = true; this.options = options }
      disconnect() { trace.push({ op: 'disconnect' }); this.connected = false }
    },
    queueMicrotask(fn) { microtasks.set(++id, fn) },
    setInterval(fn, ms) { intervals.set(++id, { fn, ms }); return id },
    clearInterval(id) { intervals.delete(id) },
  })
  function flush() { const tasks = [...microtasks.values()]; microtasks.clear(); tasks.forEach(fn => fn()) }
  return { api, el, root, document, trace, observers, microtasks, intervals, flush }
}
function prefill(f) {
  const parent = f.el('div', '', { 'data-chat-anchor-key': 'outer' })
  const anchor = f.el('div', '', { 'data-chat-anchor-key': 'prefill' })
  anchor.appendChild(f.el('span', '【装配台预填 · 初始上下文】\n客户：测试客户'))
  const tail = f.el('div', '主题：共 2 条。\n技能：写 3 篇。mcp__articles__write_article')
  const next = f.el('div', 'mcp__knowledge__read_kb_file', { 'data-chat-anchor-key': 'answer' })
  parent.appendChild(anchor); parent.appendChild(tail); parent.appendChild(next); f.root.appendChild(parent)
  return { parent, anchor, tail, next }
}
function assertGuarded(trace) {
  const writes = trace.filter(x => x.observed !== undefined)
  assert.ok(writes.length, 'fixture must actually write DOM')
  assert.ok(writes.every(x => !x.observed), 'all DOM writes happen while disconnected')
  assert.equal(trace[0].op, 'disconnect')
  assert.equal(trace.at(-1).op, 'observe')
}

test('fold observer callback disconnects before writing, coalesces mutations and reconnects after writes', () => {
  const f = fixture(), dispose = f.api.wbInstallConversation(), observer = f.observers[0]
  const { parent, anchor, tail, next } = prefill(f)
  f.trace.length = 0
  observer.callback(); observer.callback(); observer.callback()
  assert.equal(f.microtasks.size, 1, 'one microtask, no 3-second polling')
  assert.equal(f.intervals.size, 0)
  assert.equal(f.trace.length, 0, 'observer callback only schedules')
  f.flush()
  assertGuarded(f.trace)
  assert.equal(parent.hasAttribute('data-wb-prefold'), false, 'fold innermost message')
  assert.equal(anchor.getAttribute('data-wb-prefold'), '1')
  assert.equal(tail.getAttribute('data-wb-pref-tail'), '1')
  assert.equal(next.textContent, '知识库 · 读文件')
  assert.match(tail.textContent, /mcp__articles__write_article/, 'do not rewrite injected tool names')
  const head = anchor.querySelector('.wb_prefoldHead')
  assert.equal(head.children[0].textContent, '装配台简报 · 测试客户 · 2 条问句 · 共 3 篇 · 点击查看全文')
  assert.equal(head.children[1].textContent, '已注入')
  assert.equal(head.getAttribute('aria-expanded'), 'false')
  assert.ok(observer.options.characterData)
  assert.ok(!observer.options.attributeFilter.includes('style'))
  assert.ok(!observer.options.attributeFilter.includes('class'))
  f.trace.length = 0; observer.callback(); f.flush()
  assert.equal(f.trace.filter(x => x.observed !== undefined).length, 0, 'unchanged scan makes zero DOM writes')
  f.trace.length = 0; head.events.click()
  assertGuarded(f.trace)
  assert.equal(tail.hasAttribute('data-wb-pref-tail'), false)
  assert.equal(head.children[2].textContent, '▴')
  head.events.click()
  assert.equal(tail.getAttribute('data-wb-pref-tail'), '1')
  anchor.removeChild(head)
  observer.callback(); f.flush()
  assert.ok(anchor.querySelector('.wb_prefoldHead'), 'repair header removed by host rerender')
  dispose()
})

test('loader rotates while running, yields to official collapse on completion and cleans up on navigation', () => {
  const f = fixture()
  const row = f.el('button', '', { 'data-disclosure-row': '' })
  row.appendChild(f.el('span')); row.appendChild(f.el('span', '思考')); f.root.appendChild(row)
  const official = f.el('button', '2 次工具调用', { 'data-turn-process': '' }); f.root.appendChild(official)
  const stop = f.el('button', '', { 'aria-label': '停止生成' }); f.root.appendChild(stop)
  const dispose = f.api.wbInstallConversation(), observer = f.observers[0]
  assert.equal(f.root.getAttribute('data-wb-running'), '1')
  assert.ok(row.classList.contains('wb_thinkRow'))
  const label = f.root.querySelector('.wb_ldrT'), before = label.textContent
  const timer = [...f.intervals.values()][0]
  assert.equal(timer.ms, 2200)
  f.trace.length = 0; timer.fn(); assertGuarded(f.trace)
  assert.notEqual(label.textContent, before)
  f.root.removeChild(stop); f.trace.length = 0; observer.callback(); f.flush(); assertGuarded(f.trace)
  assert.equal(f.root.hasAttribute('data-wb-running'), false)
  assert.equal(f.root.querySelector('.wb_ldr'), null)
  assert.equal(f.intervals.size, 0)
  assert.equal(official.textContent, '2 次工具调用')
  f.root.appendChild(stop); observer.callback(); f.flush()
  assert.equal(f.intervals.size, 1)
  f.document.body.removeChild(f.root); observer.callback(); f.flush()
  assert.equal(f.intervals.size, 0)
  dispose()
  assert.equal(observer.connected, false)
  assert.equal(f.microtasks.size, 0)
})

test('reinstall replaces the observer and keeps existing fold clicks usable', () => {
  const f = fixture(), { anchor, tail } = prefill(f)
  const firstDispose = f.api.wbInstallConversation(), first = f.observers[0]
  const dispose = f.api.wbInstallConversation(), current = f.observers[1]
  assert.equal(first.connected, false)
  assert.equal(current.connected, true)
  firstDispose()
  anchor.querySelector('.wb_prefoldHead').events.click()
  assert.equal(tail.hasAttribute('data-wb-pref-tail'), false)
  current.callback(); dispose(); f.flush()
  assert.equal(current.connected, false)
})

test('observer reconnects even if host DOM changes unexpectedly during a scan', () => {
  const f = fixture(), dispose = f.api.wbInstallConversation(), observer = f.observers[0]
  f.root.querySelectorAll = () => { throw Error('host remount') }
  observer.callback()
  assert.throws(() => f.flush(), /host remount/)
  assert.equal(observer.connected, true)
  dispose()
})

test('loader renders inline as the last item of the chat flow column and stays last without loops', () => {
  const f = fixture()
  const flow = f.el('div', '', { 'data-chat-flow': '' }); f.root.appendChild(flow)
  flow.appendChild(f.el('div', 'I will start by loading the skill', { 'data-chat-anchor-key': 'a1' }))
  flow.appendChild(f.el('div', 'Skill · sora-single-brand'))
  const stop = f.el('button', '', { 'aria-label': '停止生成' }); f.root.appendChild(stop)
  const dispose = f.api.wbInstallConversation(), observer = f.observers[0]
  const ldr = f.root.querySelector('.wb_ldr')
  assert.equal(ldr.parentNode, flow, 'inside the message column, not the slot root')
  assert.equal(flow.children[flow.children.length - 1], ldr)
  assert.equal(f.root.getAttribute('data-wb-running'), '1')
  // host appends a new tool line after our row → one guarded move back to the end
  flow.appendChild(f.el('div', 'Skill · 知识库 · 列文件清单'))
  f.trace.length = 0; observer.callback(); f.flush(); assertGuarded(f.trace)
  assert.equal(flow.children[flow.children.length - 1], ldr)
  const inserts = f.trace.filter(t => t.op === 'insert').length
  assert.ok(inserts <= 1, 'at most one move per host change')
  // a quiet tick (no change) writes nothing that moves the row
  f.trace.length = 0; observer.callback(); f.flush()
  assert.equal(f.trace.filter(t => t.op === 'insert' || t.op === 'remove').length, 0)
  // run ends → row and running flag gone
  f.root.removeChild(stop); observer.callback(); f.flush()
  assert.equal(f.root.querySelector('.wb_ldr'), null)
  assert.equal(f.root.hasAttribute('data-wb-running'), false)
  dispose()
})
