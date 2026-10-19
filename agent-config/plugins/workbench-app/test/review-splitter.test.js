import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const storageKey = 'wb-review-list-w'

function fixture({ stored, width = 900, mobile = false, mobileAttribute = false, storageThrows = false } = {}) {
  function target() {
    const listeners = new Map()
    return {
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn) },
      fire(name, values = {}) {
        const event = { preventDefault() { this.prevented = true }, ...values }
        for (const fn of listeners.get(name) || []) fn(event)
        return event
      },
      listenerCount() { return [...listeners.values()].reduce((n, fns) => n + fns.size, 0) },
    }
  }
  function element() {
    const classes = new Set(), attributes = new Map(), styles = new Map(), captures = new Set()
    return {
      ...target(), children: [],
      set className(value) { classes.clear(); value.split(' ').forEach(c => classes.add(c)) },
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
      style: { setProperty: (k, v) => styles.set(k, v), removeProperty: k => styles.delete(k), getPropertyValue: k => styles.get(k) || '' },
      setAttribute: (k, v) => attributes.set(k, String(v)),
      getAttribute: k => attributes.get(k) ?? null,
      hasAttribute: k => attributes.has(k),
      removeAttribute: k => attributes.delete(k),
      insertBefore(child, next) { child.parent = this; this.children.splice(this.children.indexOf(next), 0, child) },
      querySelector(selector) { return this.children.find(child => child.classList.contains(selector.slice(1))) },
      remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1) },
      focus() { this.focused = true },
      setPointerCapture: id => captures.add(id),
      hasPointerCapture: id => captures.has(id),
      releasePointerCapture: id => captures.delete(id),
    }
  }
  let api
  const media = { ...target(), matches: mobile }, window = target(), root = element(), body = element(), cols = element()
  cols.clientWidth = width
  for (const name of ['wb_reviewList', 'wb_reviewMain']) { const child = element(); child.className = name; cols.children.push(child) }
  if (mobileAttribute) root.setAttribute('data-wb-mobile', '')
  const values = new Map(stored === undefined ? [] : [[storageKey, stored]])
  const storage = {
    getItem(k) { if (storageThrows) throw Error('storage denied'); return values.get(k) ?? null },
    setItem(k, v) { if (storageThrows) throw Error('storage denied'); values.set(k, v) },
    removeItem(k) { if (storageThrows) throw Error('storage denied'); values.delete(k) },
  }
  const observers = []
  class Observer {
    constructor(fn) { this.fn = fn; observers.push(this) }
    observe(node) { this.node = node; this.active = true }
    disconnect() { this.active = false }
  }
  const frames = new Map(); let frameId = 0
  Object.assign(window, { requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId }, cancelAnimationFrame: id => frames.delete(id), __DSH_FORCE_LIGHT_THEME__: true, localStorage: storage, matchMedia: () => media,
    __ModuleLoader__: { load({ factory }) { api = factory(() => ({})) } } })
  vm.runInNewContext(source.replace('return module.exports;', 'return {...module.exports, wbMountReviewSplitter, CSS};'), {
    window, document: { documentElement: root, body, createElement: element },
    ResizeObserver: Observer, MutationObserver: Observer,
    fetch() { throw Error('Network forbidden in splitter tests') },
  })
  return {
    api, cols, root, body, media, window, values, observers,
    mount: () => api.wbMountReviewSplitter(cols),
    bar: () => cols.children.find(child => child.getAttribute('role') === 'separator'),
    frames,
    flush() { const fns = [...frames.values()]; frames.clear(); fns.forEach(fn => fn()) },
    resize() { window.fire('resize'); this.flush() },
  }
}

test('review list sizing clamps the default, minimum, maximum and shrinking container', () => {
  const { api } = fixture()
  const size = (value, width) => JSON.parse(JSON.stringify(api.wbReviewListSize(value, width)))
  assert.deepEqual(size(null, 900), { min: 112, max: 420, width: 152 })
  assert.deepEqual(size(999, 600), { min: 112, max: 320, width: 320 })
  assert.equal(size(10, 900).width, 112)
  assert.equal(size(420, 900).width, 420)
  assert.equal(size(300, 450).width, 170)
  assert.equal(size(152, 410).width, 130)
  assert.deepEqual(size(152, 0), { min: 112, max: 112, width: 112 })
  assert.deepEqual(size(420, 300), { min: 112, max: 112, width: 112 })
  for (const value of ['', ' ', 'invalid', Infinity, NaN, undefined]) assert.equal(size(value, 900).width, 152)
})

test('review splitter keyboard helper supports steps, Shift, limits and reset', () => {
  const { wbReviewListKey: key } = fixture().api
  assert.equal(key(152, 'ArrowLeft', false, 900), 144)
  assert.equal(key(152, 'ArrowRight', false, 900), 160)
  assert.equal(key(152, 'ArrowLeft', true, 900), 120)
  assert.equal(key(152, 'ArrowRight', true, 900), 184)
  assert.equal(key(112, 'ArrowLeft', true, 900), 112)
  assert.equal(key(410, 'ArrowRight', true, 900), 420)
  assert.equal(key(300, 'Home', false, 900), 112)
  assert.equal(key(152, 'End', false, 600), 320)
  assert.equal(key(300, 'Enter', true, 900), 152)
  assert.equal(key(300, 'Enter', false, 410), 130)
  assert.equal(key(300, 'Tab', false, 900), null)
})

test('mount restores persisted width with accessible bounds and clamps on resize without overwriting preference', () => {
  const f = fixture({ stored: '400', width: 600 }), dispose = f.mount(), bar = f.bar()
  assert.equal(bar.getAttribute('aria-label'), '调整文章列表宽度')
  assert.equal(bar.getAttribute('aria-orientation'), 'vertical')
  assert.equal(bar.tabIndex, 0)
  assert.equal(bar.getAttribute('aria-valuemin'), '112')
  assert.equal(bar.getAttribute('aria-valuemax'), '320')
  assert.equal(bar.getAttribute('aria-valuenow'), '320')
  assert.equal(f.cols.style.getPropertyValue('--wb-review-list-width'), '320px')
  f.cols.clientWidth = 430; f.resize()
  assert.equal(bar.getAttribute('aria-valuemax'), '150')
  assert.equal(bar.getAttribute('aria-valuenow'), '150')
  assert.equal(f.values.get(storageKey), '400')
  dispose()
  assert.equal(f.bar(), undefined)
  assert.equal(f.cols.style.getPropertyValue('--wb-review-list-width'), '')
  assert.ok(f.observers.every(o => !o.active))
  assert.equal(f.media.listenerCount(), 0)
  assert.equal(f.window.listenerCount(), 0)
})

test('keyboard persists changes; double-click and Enter reset the clamped default and clear storage', () => {
  const f = fixture({ stored: '240' }); f.mount()
  const bar = f.bar()
  assert.equal(bar.fire('keydown', { key: 'ArrowRight', shiftKey: true }).prevented, true)
  assert.equal(f.values.get(storageKey), '272')
  assert.equal(bar.fire('keydown', { key: 'Tab' }).prevented, undefined)
  bar.fire('dblclick')
  assert.equal(bar.getAttribute('aria-valuenow'), '152')
  assert.equal(f.values.has(storageKey), false)
  bar.fire('keydown', { key: 'End' })
  assert.equal(f.values.get(storageKey), '420')
  f.cols.clientWidth = 410; f.resize()
  bar.fire('keydown', { key: 'Enter' })
  assert.equal(bar.getAttribute('aria-valuenow'), '130')
  assert.equal(f.values.has(storageKey), false)
})

test('a fresh mount restores a drag preference and a reset survives reopening', () => {
  const f = fixture(), dispose = f.mount(), children = [...f.cols.children].filter(child => child !== f.bar())
  f.bar().fire('pointerdown', { button: 0, pointerId: 1, clientX: 152 })
  f.bar().fire('pointermove', { pointerId: 1, clientX: 240 })
  f.bar().fire('pointerup', { pointerId: 1 })
  dispose()
  assert.deepEqual(f.cols.children, children, 'article nodes survive mounting and disposal')
  const disposeAgain = f.mount()
  assert.equal(f.bar().getAttribute('aria-valuenow'), '240')
  f.bar().fire('dblclick')
  disposeAgain()
  f.mount()
  assert.equal(f.bar().getAttribute('aria-valuenow'), '152')
  assert.equal(f.values.has(storageKey), false)
})

test('a hidden (zero-width) container keeps the preference until real bounds exist', () => {
  const f = fixture({ width: 0, stored: '400' }); f.mount()
  assert.equal(f.bar().getAttribute('aria-valuenow'), '400')
  f.cols.clientWidth = 500; f.resize()
  assert.equal(f.bar().getAttribute('aria-valuenow'), '220')
  assert.equal(f.values.get(storageKey), '400')
})

test('missing, invalid or denied localStorage never prevents resizing or resetting', () => {
  for (const options of [{}, { stored: 'bad' }, { storageThrows: true }, { storageThrows: 'getter' }]) {
    const f = fixture(options)
    if (options.storageThrows === 'getter') Object.defineProperty(f.window, 'localStorage', { get() { throw Error('denied') } })
    f.mount()
    assert.equal(f.bar().getAttribute('aria-valuenow'), '152')
    f.bar().fire('keydown', { key: 'ArrowRight' })
    assert.equal(f.bar().getAttribute('aria-valuenow'), '160')
    assert.doesNotThrow(() => f.bar().fire('dblclick'))
    assert.equal(f.bar().getAttribute('aria-valuenow'), '152')
  }
})

test('pointer dragging captures only the active primary pointer, clamps and persists on release', () => {
  const f = fixture(); f.mount(); const bar = f.bar()
  const down = { button: 0, pointerId: 7, clientX: 152, pointerType: 'pen' }
  bar.fire('pointerdown', { ...down, button: 2 })
  bar.fire('pointerdown', { ...down, isPrimary: false })
  assert.equal(bar.hasPointerCapture(7), false)
  assert.equal(bar.fire('pointerdown', down).prevented, true)
  assert.equal(bar.hasPointerCapture(7), true)
  assert.equal(bar.focused, true)
  assert.equal(f.body.classList.contains('wb_reviewResizing'), true)
  bar.fire('pointermove', { pointerId: 8, clientX: 800 })
  assert.equal(bar.getAttribute('aria-valuenow'), '152')
  bar.fire('pointermove', { pointerId: 7, clientX: 250 })
  assert.equal(bar.getAttribute('aria-valuenow'), '250')
  assert.equal(f.values.has(storageKey), false)
  bar.fire('pointermove', { pointerId: 7, clientX: 999 })
  assert.equal(bar.getAttribute('aria-valuenow'), '420')
  bar.fire('pointerup', { pointerId: 8 })
  assert.equal(bar.hasPointerCapture(7), true)
  bar.fire('pointerup', { pointerId: 7 })
  assert.equal(bar.hasPointerCapture(7), false)
  assert.equal(f.body.classList.contains('wb_reviewResizing'), false)
  assert.equal(bar.classList.contains('is-dragging'), false)
  assert.equal(f.values.get(storageKey), '420')
})

test('cancel, lost capture, blur, unmount and mobile changes always restore drag state', () => {
  for (const end of ['pointercancel', 'lostpointercapture', 'blur', 'unmount', 'mobile']) {
    const f = fixture(), dispose = f.mount(), bar = f.bar()
    bar.fire('pointerdown', { button: 0, pointerId: 1, clientX: 152 })
    if (end === 'unmount') dispose()
    else if (end === 'mobile') { f.media.matches = true; f.media.fire('change'); f.flush() }
    else if (end === 'blur') f.window.fire('blur')
    else bar.fire(end, { pointerId: 1 })
    assert.equal(f.body.classList.contains('wb_reviewResizing'), false, end)
    assert.equal(bar.hasPointerCapture(1), false, end)
    assert.equal(bar.classList.contains('is-dragging'), false, end)
  }
})

test('cleanup preserves a pre-existing body resize class and is safe to repeat', () => {
  const f = fixture(); f.body.classList.add('wb_reviewResizing')
  const dispose = f.mount(), bar = f.bar()
  bar.fire('pointerdown', { button: 0, pointerId: 1, clientX: 152 })
  dispose(); dispose()
  assert.equal(f.body.classList.contains('wb_reviewResizing'), true)
  assert.ok(f.observers.every(o => !o.active))
  assert.equal(f.media.listenerCount(), 0)
  assert.equal(f.window.listenerCount(), 0)
})

test('both mobile signals omit the separator and preserve the original children and styles', () => {
  for (const options of [{ mobile: true }, { mobileAttribute: true }]) {
    const f = fixture({ ...options, stored: '400' }), children = [...f.cols.children]
    f.mount()
    assert.equal(f.bar(), undefined)
    assert.deepEqual(f.cols.children, children)
    assert.equal(f.cols.classList.contains('wb_reviewSplit'), false)
    assert.equal(f.cols.style.getPropertyValue('--wb-review-list-width'), '')
    f.media.matches = false; f.root.removeAttribute('data-wb-mobile'); f.media.fire('change'); f.window.fire('resize'); f.flush()
    assert.equal(f.bar().getAttribute('aria-valuenow'), '400')
    assert.equal(f.cols.children.length, 3, 'media and resize notifications cannot create duplicate bars')
    f.root.setAttribute('data-wb-mobile', ''); f.resize()
    assert.equal(f.bar(), undefined)
    assert.deepEqual(f.cols.children, children)
  }
})

test('shared review renderers use the splitter with Klein focus, iframe protection and global reduced motion', () => {
  const { CSS } = fixture().api
  assert.match(source, /h\(WbReviewColumns, null,/)
  assert.match(source, /createPortal\(props \? h\(ReviewTabBody,/)
  assert.match(source, /wrap\.wbDisposeSplitter = wbMountReviewSplitter\(bodyEl\)/)
  assert.match(CSS, /\.wb_reviewSplitter\{[^}]*flex:0 0 8px;[^}]*margin:0 -4px/)
  assert.match(CSS, /\.wb_reviewSplitter::after\{[^}]*width:1px;background:#eef0f3;transition:/)
  assert.match(CSS, /\.wb_reviewSplitter\.is-dragging::after\{width:2px;background:var\(--wb-klein\)/)
  assert.match(CSS, /\.wb_reviewSplitter:focus-visible\{outline:2px solid var\(--wb-klein\)/)
  assert.match(CSS, /body\.wb_reviewResizing \.wb_reviewMain iframe\{pointer-events:none!important/)
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)\{[^\n]+\[class\^='wb_'\]::after[^\n]+transition:none!important/)
})

test('unified shell .review-mount keeps its stacked card strip: no separator, no split class', () => {
  const f = fixture({ stored: '300' }), children = [...f.cols.children]
  f.cols.closest = selector => selector === '.review-mount' ? {} : null
  const dispose = f.mount()
  assert.equal(f.bar(), undefined)
  assert.deepEqual(f.cols.children, children)
  assert.equal(f.cols.classList.contains('wb_reviewSplit'), false)
  dispose()
})

test('loop safety: no observers, writes only on change, resize is rAF-coalesced', () => {
  const f = fixture({ stored: '200' }), dispose = f.mount(), bar = f.bar()
  assert.equal(f.observers.length, 0, 'splitter must not create Resize/MutationObservers')
  let writes = 0
  const set = f.cols.style.setProperty, attr = bar.setAttribute
  f.cols.style.setProperty = (...a) => { writes++; set(...a) }
  bar.setAttribute = (...a) => { writes++; attr(...a) }
  for (let i = 0; i < 50; i++) f.window.fire('resize')
  assert.equal(f.frames.size, 1, 'many resize events schedule one frame')
  f.flush()
  assert.equal(writes, 0, 'unchanged width writes nothing')
  f.cols.clientWidth = 430; f.resize()
  assert.ok(writes > 0 && writes <= 3)
  dispose(); assert.equal(f.frames.size, 0)
})
