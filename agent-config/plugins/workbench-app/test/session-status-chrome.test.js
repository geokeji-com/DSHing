import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const plain = value => JSON.parse(JSON.stringify(value))
function load(title = '生文 Agent') {
  let api, cursor = 0, mutation = false
  const slots = [], effects = [], observers = [], writes = [], frames = new Map()
  let frameId = 0, now = 0
  function frame() { const pending = [...frames.values()]; frames.clear(); now += 16; pending.forEach(fn => fn()) }
  const document = { head: {}, body: {}, get title() { return title }, set title(value) { title = value; writes.push(value); mutation = true } }
  const media = { matches: false }
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial } },
    useEffect(fn, deps) {
      const index = cursor++, previous = slots[index]
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
        previous?.cleanup?.()
        slots[index] = { deps }
        effects.push(() => { slots[index].cleanup = fn() })
      }
    },
  }
  const window = { matchMedia: () => media, __ModuleLoader__: { load({ factory }) {
    api = factory(name => name === 'react' ? react : { createPortal: element => element })
  } } }
  function evaluate() { vm.runInNewContext(source.replace('return module.exports;', `return {CSS, wbTitleLoopState, wbNeedsViewCount, wbGroupStatus, wbTabTitleState,
    wbNavState, wbNavRunState, wbNavStatus, wbNavSelect, wbNavEmit, wbNavNeedsViewCount, wbNavWatchTitle,
    WbRunIndicator, WbGroupIndicator, SidebarNav, MobileDrawer, MobileDrawerEntry, MobileTopBar,
    subscriberCount() { return wbNavSubs.length; }};`), {
    window, document, Date: class extends Date { static now() { return now } },
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId }, cancelAnimationFrame(id) { frames.delete(id) },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this) }
      observe(target, options) { this.target = target; this.options = options; this.active = true }
      disconnect() { this.active = false }
    },
  })
  }
  evaluate()
  api.wbNavState.uid = 'fixture-user'
  api.wbNavRunState()
  return { api, document, observers, writes, frames, frame, window,
    reload() { evaluate(); return api },
    mutations() { mutation = false; observers.filter(observer => observer.active).forEach(observer => observer.callback()) },
    render(component, props = {}, runEffects = true) {
      cursor = 0
      const element = component(props)
      if (runEffects) effects.splice(0).forEach(fn => fn())
      return element
    },
    flush() {
      let turns = 0
      while (mutation || frames.size) {
        assert.ok(++turns < 30, 'title observer must settle without a write loop')
        mutation = false
        observers.filter(observer => observer.active).forEach(observer => observer.callback())
        frame()
      }
    },
    dispose() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}
function seed(api) {
  const nav = api.wbNavState, run = api.wbNavRunState()
  nav.map = Object.fromEntries(['done', 'failed', 'attention', 'running', 'review', 'idle', 'unknown'].map(id => [id, { client: '示例客户', topic: id }]))
  nav.sessions = Object.fromEntries(['done', 'failed', 'attention', 'running', 'review', 'idle', 'outside'].map(id => [id, { id, running: id === 'running' }]))
  run.unread = { done: 1, failed: 1, running: 1, review: 1, outside: 1, unknown: 1 }
  run.observed.failed = { snapshot: { lastAgentError: 'fixture failure' } }
  run.observed.attention = { pending: 'approval' }
  nav.statusInfo.review = { drafts_pending: 2 }
}
function find(element, predicate) {
  if (!element || typeof element !== 'object') return undefined
  if (predicate(element)) return element
  return element.children?.map(child => find(child, predicate)).find(Boolean)
}
const byClass = name => element => element.props.className === name

test('title count uses only done, failed and attention, regardless of the unread flag', () => {
  const { api } = load()
  const statuses = ['done', 'failed', 'attention', 'running', 'review', 'idle'].map(kind => ({ kind, unread: kind === 'review' }))
  assert.equal(api.wbNeedsViewCount(statuses), 3)
  assert.equal(api.wbNeedsViewCount([]), 0)
  seed(api)
  assert.equal(api.wbNavStatus('outside').kind, 'done')
  assert.equal(api.wbNavNeedsViewCount(), 3, 'only navigation members count; missing summaries stay idle')
  api.wbNavState.q = 'no search matches'
  api.wbNavState.open['示例客户'] = false
  assert.equal(api.wbNavNeedsViewCount(), 3, 'search and collapse do not acknowledge sessions')
  api.wbNavSelect('done')
  assert.equal(api.wbNavNeedsViewCount(), 2)
})

test('tab title captures plain or prefixed bases once and restores the exact base on zero', () => {
  const { api } = load()
  for (const initial of ['生文 Agent · 项目  ', '(12) 生文 Agent · 项目  ', '', '(notes) 标题']) {
    const base = initial.replace(/^\(\d+\) /, '')
    const first = api.wbTabTitleState(initial, 3)
    assert.deepEqual(plain(first), { base, title: '(3) ' + base })
    const next = api.wbTabTitleState(first.title, 8, first)
    assert.deepEqual(plain(next), { base, title: '(8) ' + base })
    assert.deepEqual(plain(api.wbTabTitleState(next.title, 0, next)), { base, title: base })
  }
  const captured = api.wbTabTitleState('(4) (2) Host title', 1)
  assert.equal(api.wbTabTitleState(captured.title, 0, captured).title, '(2) Host title', 'do not strip the captured base again')
})

test('title follows nav changes and host renames, ignores its own writes, and cleans up', () => {
  const f = load('(9) 原始标题'), { api, document } = f
  seed(api)
  const dispose = api.wbNavWatchTitle()
  assert.equal(document.title, '(3) 原始标题')
  f.flush()
  const writes = f.writes.length
  api.wbNavEmit(); f.flush()
  assert.equal(f.writes.length, writes, 'unchanged count must not rewrite the title')
  document.title = '宿主更新 · 会话 A  '
  f.flush()
  assert.equal(document.title, '(3) 宿主更新 · 会话 A  ')
  assert.equal(f.observers[0].target, document.head)
  assert.deepEqual(plain(f.observers[0].options), { childList: true, subtree: true, characterData: true })
  api.wbNavState.map = {}
  api.wbNavEmit(); f.flush()
  assert.equal(document.title, '宿主更新 · 会话 A  ')
  document.title = '零计数时的宿主标题'
  f.flush()
  assert.equal(document.title, '零计数时的宿主标题')
  seed(api); api.wbNavEmit(); f.flush()
  assert.equal(document.title, '(3) 零计数时的宿主标题')
  dispose(); f.flush()
  assert.equal(document.title, '零计数时的宿主标题')
  assert.equal(api.subscriberCount(), 0)
  assert.equal(f.observers[0].active, false)
  api.wbNavEmit()
  assert.equal(document.title, '零计数时的宿主标题')
})

test('title cleanup leaves a newer host title intact even before the observer runs', () => {
  const f = load(), { api, document } = f
  seed(api)
  const dispose = api.wbNavWatchTitle()
  document.title = '宿主刚改的标题'
  dispose(); f.flush()
  assert.equal(document.title, '宿主刚改的标题')
})

test('collapsed group priority is attention > running > failed > review > done, in any row order', () => {
  const { api } = load()
  const statuses = ['attention', 'running', 'failed', 'review', 'done'].map(kind => Object.freeze({ kind }))
  for (let i = 0; i < statuses.length; i++) {
    const children = Object.freeze([{ kind: 'idle' }, ...statuses.slice(i).reverse()])
    assert.equal(api.wbGroupStatus(children, false), statuses[i])
    assert.equal(api.wbGroupStatus(children, true), null)
    for (let j = i + 1; j < statuses.length; j++) {
      assert.equal(api.wbGroupStatus([statuses[i], statuses[j]], false), statuses[i])
      assert.equal(api.wbGroupStatus([statuses[j], statuses[i]], false), statuses[i])
    }
  }
  assert.equal(api.wbGroupStatus([], false), null)
  assert.equal(api.wbGroupStatus([{ kind: 'idle' }], false), null)
})

test('desktop and mobile groups render a labelled shared indicator only when collapsed', () => {
  for (const mobile of [false, true]) {
    const f = load(), { api } = f
    seed(api)
    const items = Object.keys(api.wbNavState.map).map(id => ({ id, title: id }))
    const component = mobile ? api.MobileDrawer : api.SidebarNav
    const props = mobile ? { names: ['示例客户'], groups: { 示例客户: items }, me: { label: 'Fixture user' } } : {}
    for (const open of [true, false]) {
      api.wbNavState.open['示例客户'] = open
      const tree = f.render(component, props, false)
      const group = find(tree, byClass(mobile ? 'wb_mGroup' : 'wb_nvGroupName'))
      assert.equal(group.props['aria-expanded'], open)
      const indicator = find(group, element => element.type === api.WbGroupIndicator)
      const rendered = api.WbGroupIndicator(indicator.props)
      if (open) assert.equal(rendered, null)
      else {
        assert.equal(rendered.props.title, '等你确认')
        assert.equal(rendered.props['aria-label'], '等你确认')
        assert.equal(rendered.children[0].type, api.WbRunIndicator)
        assert.equal(rendered.children[0].props.status.kind, 'attention')
      }
      assert.equal(api.wbNavState.open['示例客户'], open, 'status must not auto-expand a group')
    }
    assert.equal(api.WbGroupIndicator({ open: false, items: [{ id: 'idle' }] }), null)
  }
})

test('mobile drawer icon and menu entry share the title count and react while the drawer is closed', () => {
  for (const icon of [true, false]) {
    const f = load(), { api } = f
    seed(api)
    let closedMenu = false
    const props = { icon, beforeOpen() { closedMenu = true } }
    const label = icon ? '打开会话抽屉' : '会话列表'
    let entry = f.render(api.MobileDrawerEntry, props)
    assert.equal(api.wbNavState.drawer, false)
    assert.equal(entry.props['aria-label'], label + '，有 3 个会话需要查看')
    assert.equal(find(entry, byClass('wb_mEntryDot')).props['aria-hidden'], true)
    api.wbNavSelect('done'); api.wbNavSelect('failed')
    api.wbNavRunState().observed.attention = {}
    api.wbNavEmit()
    entry = f.render(api.MobileDrawerEntry, props)
    assert.equal(api.wbNavNeedsViewCount(), 0)
    assert.equal(entry.props['aria-label'], label)
    assert.equal(find(entry, byClass('wb_mEntryDot')), undefined, 'running and review do not keep the dot')
    api.wbNavRunState().observed.attention = { pending: 'question' }
    api.wbNavEmit()
    entry = f.render(api.MobileDrawerEntry, props)
    assert.equal(entry.props['aria-label'], label + '，有 1 个会话需要查看')
    assert.ok(find(entry, byClass('wb_mEntryDot')))
    entry.props.onClick()
    assert.equal(closedMenu, true)
    assert.equal(api.wbNavState.drawer, true)
    f.dispose()
    assert.equal(api.subscriberCount(), 0)
  }
})

test('mobile top bar keeps back navigation separate from the drawer entry', () => {
  const { api } = load()
  assert.equal(api.MobileTopBar({ title: '任务' }).children[0].type, api.MobileDrawerEntry)
  const back = () => {}
  const button = api.MobileTopBar({ title: '任务', back }).children[0]
  assert.equal(button.props['aria-label'], '返回')
  assert.equal(button.props.onClick, back)
  assert.equal(find(button, byClass('wb_mEntryDot')), undefined)
})

test('entry dot and group indicators use the mockup dimensions, tokens and existing motion', () => {
  const { api } = load()
  const dot = api.CSS.match(/\.wb_mEntryDot\{([^}]+)\}/)[1]
  for (const rule of ['width:8px', 'height:8px', 'background:var(--wb-bad)', 'box-shadow:0 0 0 1.5px #fff']) assert.ok(dot.includes(rule), rule)
  assert.match(api.CSS, /\.wb_nvGroupName\{display:flex;align-items:center;gap:6px/)
  assert.match(api.CSS, /\.wb_groupStatus\{[^}]*margin-left:auto/)
  for (const tone of ['klein', 'ok', 'bad', 'warn']) assert.ok(api.CSS.includes('.wb_groupStatus [data-tone=' + tone + ']{color:var(--wb-' + tone + ');}'))
  assert.equal(api.WbRunIndicator({ status: { kind: 'running' } }).children[0].props.className, 'wb_ldrSpin wb_runSpin')
  assert.match(api.CSS, /@media \(prefers-reduced-motion: reduce\)\{[^\n]+animation:none!important;transition:none!important/)
})


test('title mutations yield to one frame and queued work is cancelled on disposal', () => {
  const f = load(), {api} = f; seed(api)
  const dispose = api.wbNavWatchTitle(); f.flush()
  f.document.title = 'Host rename'
  const writes = f.writes.length
  f.mutations(); api.wbNavEmit(); api.wbNavEmit()
  assert.equal(f.writes.length, writes, 'observer delivery must not synchronously fight the host')
  assert.equal(f.frames.size, 1)
  dispose()
  assert.equal(f.frames.size, 0)
  f.flush()
  assert.equal(f.document.title, 'Host rename')
})

test('two live module instances hand title ownership over without fighting different counts', () => {
  const f = load(), old = f.api; seed(old)
  const disposeOld = old.wbNavWatchTitle(); f.flush()
  const next = f.reload(); seed(next); next.wbNavState.map = {}
  assert.equal(old.subscriberCount(), 0, 'loading a new module immediately disposes the old owner')
  assert.equal(f.observers.filter(o => o.active).length, 0)
  const disposeNew = next.wbNavWatchTitle(); f.flush()
  assert.equal(old.subscriberCount(), 0)
  assert.equal(next.subscriberCount(), 1)
  assert.equal(f.observers.filter(o => o.active).length, 1)
  assert.equal(f.document.title, '生文 Agent')
  disposeOld(); old.wbNavWatchTitle(); old.wbNavEmit(); f.flush()
  assert.equal(old.subscriberCount(), 0, 'an old module remount cannot reclaim ownership')
  assert.equal(f.observers.filter(o => o.active).length, 1, 'stale cleanup cannot disconnect the new owner')
  seed(next); next.wbNavEmit(); f.flush()
  assert.equal(f.document.title, '(3) 生文 Agent')
  disposeNew(); f.flush()
  assert.equal(f.document.title, '生文 Agent')
})

test('own title writes and unrelated head mutations do not schedule another frame', () => {
  const f = load(); seed(f.api)
  const dispose = f.api.wbNavWatchTitle()
  const writes = f.writes.length
  for (let i = 0; i < 20; i++) f.mutations()
  assert.equal(f.frames.size, 0)
  assert.equal(f.writes.length, writes)
  dispose()
})

test('title loop guard ignores own writes, resets after quiet time and stays disabled after contention', () => {
  const {api} = load(), step = api.wbTitleLoopState
  let guard = step(undefined, 'Host', undefined, 0)
  for (let i = 0; i < 20; i++) guard = step(guard, '(1) Host', '(1) Host', i)
  assert.equal(guard.rewrites, 0)
  guard = step(guard, 'Host', '(1) Host', 1100)
  assert.equal(guard.rewrites, 1)
  guard = step(guard, 'Other host', '(1) Host', 2200)
  assert.equal(guard.rewrites, 1)
  for (let i = 0; i < 7; i++) guard = step(guard, 'Host', '(1) Host', 2201 + i)
  assert.equal(guard.disabled, true)
  assert.equal(step(guard, 'Later host', '(1) Host', 99999), guard)
})

test('a persistent host title writer triggers page-lifetime backoff, including after remount', () => {
  const f = load(); seed(f.api)
  f.api.wbNavWatchTitle(); f.flush()
  for (let i = 0; i < 12; i++) { f.document.title = 'Host owns title'; f.mutations(); f.frame() }
  assert.equal(f.window.__wbTitleBackoff, true)
  assert.equal(f.api.subscriberCount(), 0)
  assert.equal(f.frames.size, 0)
  assert.equal(f.observers.filter(o => o.active).length, 0)
  const before = f.writes.length
  const next = f.reload(); seed(next); next.wbNavWatchTitle(); next.wbNavEmit(); f.flush()
  assert.equal(f.writes.length, before)
  assert.equal(f.document.title, 'Host owns title')
})
