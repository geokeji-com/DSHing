import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
function fixture() {
  let api, cursor = 0, nextTimer = 0
  const slots = [], effects = [], timers = new Map(), listeners = new Set()
  const media = { matches: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
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
  const window = {
    matchMedia: () => media,
    getComputedStyle: () => ({ getPropertyValue: () => '220ms' }),
    __ModuleLoader__: { load({ factory }) { api = factory(name => name === 'react' ? React : {}) } },
  }
  vm.runInNewContext(source.replace('return module.exports;', 'return {CSS, WbPresence, WbCollapse, WbSkeleton, wbAfterMotion, renderWeakPane, Empty};'), {
    window, document: { body: {} },
    setTimeout(fn, ms) { timers.set(++nextTimer, { fn, ms }); return nextTimer },
    clearTimeout(id) { timers.delete(id) },
  })
  return {
    api, media, timers, listeners, React,
    render(children) { cursor = 0; const el = api.WbPresence({ children }); effects.splice(0).forEach(fn => fn()); return el },
    finish() { [...timers.values()].forEach(timer => timer.fn()) },
    dispose() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}
const { api } = fixture()

test('loader is an inline 12px masked Klein Blue arc row in the message column, independent of host corner shape', () => {
  assert.match(api.CSS, /--wb-klein:#002FA7/)
  assert.match(api.CSS, /--wb-motion:200ms; --wb-motion-fast:150ms; --wb-motion-panel:220ms; --wb-ease:cubic-bezier\(0\.2, 0, 0, 1\)/)
  const loader = api.CSS.match(/\.wb_ldr\{([^}]+)\}/)[1]
  for (const token of ['display:inline-flex', 'align-self:flex-start', 'margin:0', 'border:0', 'background:none', 'box-shadow:none', 'height:26px']) assert.ok(loader.includes(token), token)
  const arc = api.CSS.match(/\.wb_ldrSpin\{([^}]+)\}/)[1]
  for (const token of ['width:12px', 'height:12px', 'corner-shape:round', 'conic-gradient', 'var(--wb-klein)', '-webkit-mask:radial-gradient', ';mask:radial-gradient']) assert.ok(arc.includes(token), token)
  assert.doesNotMatch(arc, /border-top-color|border:2px solid/)
  assert.match(api.CSS, /\[data-chat-flow\]:has\(> \.wb_ldr\) > \[class\*='_turnStatus'\]\{display:none !important;\}/)
})

test('motion hooks cover waiting, surfaces, controls, collapse and reduced motion including pseudo elements', () => {
  for (const hook of ['wb_skeletonLine::after', 'wb_mScrim', 'wb_mSheet', 'wb_mEditor', 'wb_mDrawer', 'wb_mReview', 'wb_reviewWrap', 'wb_rv', 'wb_rvCollapse', 'wb_confirmMask', 'wb_zoomMask', 'wb_nvItem', 'wb_mSession', 'wb_mSegment', 'wb_mChip', 'wb_go', 'wb_reviewMsg', 'wb_nvRenameError', 'wb_refBd', 'data-disclosure-row', 'dsh-tabbar a:active']) assert.ok(api.CSS.includes(hook), hook)
  assert.doesNotMatch(api.CSS, /interpolate-size|data-wb-pref-tail/)
  assert.match(api.CSS, /\[data-wb-prefold\]\[data-wb-open\] > :not\(\.wb_prefoldHead\)\{animation:wbFade/)
  assert.match(api.CSS, /@media \(prefers-reduced-motion: reduce\)\{\[data-slot='main\.conversation'\] \.wb_prefoldHead,[^}]*animation:none !important; transition:none !important;/)
  assert.match(api.CSS, /\.wb_mProgress\[open\] \.wb_mChecklist,\[data-slot='main\.conversation'\] \[data-disclosure-row\]\{animation:wbFade/)
  const reduced = api.CSS.match(/@media \(prefers-reduced-motion: reduce\)\{\[class\^='wb_'\][^\n]+/)[0]
  for (const hook of ['.wb_mProgress *', 'button[data-turn-process]', '[data-disclosure-row]', '.wb_mProgress::details-content']) assert.ok(reduced.includes(hook), hook)
  assert.match(api.CSS, /@media \(prefers-reduced-motion: reduce\)\{[^\n]+animation:none!important;transition:none!important/)
  assert.match(api.CSS, /\[class\^='wb_'\]::before,\[class\^='wb_'\]::after/)
  assert.match(api.CSS, /\.wb_ldrSpin\{transform:none;/)
  assert.match(api.CSS, /button\[class\*='wb_'\]\[aria-busy='true'\]::before/)
  assert.doesNotMatch(api.CSS, /transition:all|will-change/)
})

test('waiting skeleton is labelled, decorative blocks are hidden and empty/error states stay distinct', () => {
  const skeleton = api.WbSkeleton({ label: '技能加载中…' })
  assert.equal(skeleton.props.role, 'status')
  assert.equal(skeleton.props['aria-busy'], true)
  assert.equal(skeleton.props.children[0].props.children[0], '技能加载中…')
  assert.equal(skeleton.props.children[1].props['aria-hidden'], true)
  assert.equal(skeleton.props.children[1].props.children[0].length, 3)
  const args = { entry: null, dirStatus: 'loading', unmapped: [], clientName: '测试客户' }
  assert.equal(api.renderWeakPane(args).props.loading, true)
  assert.equal(api.renderWeakPane({ ...args, dirStatus: 'ready' }).props.loading, false)
  assert.equal(api.renderWeakPane({ ...args, entry: {}, gaps: { status: 'loading' } }).props.loading, true)
  assert.equal(api.renderWeakPane({ ...args, entry: {}, gaps: { status: 'ready', questions: [] } }).props.loading, undefined)
})

test('surfaces retain their last content during exit and cancel disposal on rapid reopen', () => {
  const f = fixture(), first = f.React.createElement('section', { className: 'wb_mReview' }, '草稿审核')
  assert.equal(f.render(null), null)
  assert.equal(f.timers.size, 0, 'closed surfaces do not schedule work')
  assert.equal(f.render(first).props['data-wb-leave'], undefined)
  const exiting = f.render(null)
  assert.equal(exiting.props['data-wb-leave'], '1')
  assert.equal(exiting.props.inert, true, 'closing content cannot accept actions')
  assert.equal(exiting.props['aria-hidden'], true)
  assert.equal(exiting.props.children[0], '草稿审核')
  assert.equal([...f.timers.values()][0].ms, 220)
  assert.equal(f.render(first).props['data-wb-leave'], undefined)
  assert.equal(f.timers.size, 0, 'reopening cancels stale exit')
  f.render(null); f.finish()
  assert.equal(f.render(null), null)
  assert.equal(f.listeners.size, 0)
})

test('reduced motion removes exit delay, including changes while closing; unmount cleans up', () => {
  const f = fixture(), panel = f.React.createElement('div', {})
  f.render(panel); f.render(null)
  f.media.matches = true
  for (const listener of [...f.listeners]) listener()
  assert.equal(f.render(null), null)
  assert.equal(f.timers.size, 0)
  f.render(panel); f.render(null)
  assert.equal(f.render(null), null)
  assert.equal(f.timers.size, 0)
  f.media.matches = false; f.render(panel); f.render(null); f.dispose()
  assert.equal(f.timers.size, 0)
  assert.equal(f.listeners.size, 0)
})

test('collapsed content is inert and hidden from assistive technology while its height eases', () => {
  const closed = api.WbCollapse({ open: false, children: 'details' })
  assert.equal(closed.props['data-open'], '0')
  assert.equal(closed.props.inert, true)
  assert.equal(closed.props['aria-hidden'], true)
  const open = api.WbCollapse({ open: true, children: 'details' })
  assert.equal(open.props['data-open'], '1')
  assert.equal(open.props.inert, undefined)
  assert.equal(open.props['aria-hidden'], false)
})
