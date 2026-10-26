import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
let api
vm.runInNewContext(source, {
  window: { __ModuleLoader__: { load({ factory }) { api = factory(() => ({})) } } },
})
const state = (values = {}) => ({ sessionId: 'session-a', count: 3, hidden: false, confirmed: false, ...values })
const input = (values = {}) => ({ sessionId: 'session-a', count: 3, shown: false, ...values })

const cases = [
  { name: 'history articles open on the first viewing', before: null, action: 'open', after: state() },
  { name: 'an open is unconfirmed until the tab is observed', before: state(), action: 'open', after: state() },
  { name: 'a shown tab confirms the open', before: state(), shown: true, action: 'none', after: state({ confirmed: true }) },
  { name: 'a confirmed tab disappearing means hide', before: state({ confirmed: true }), action: 'none', after: state({ hidden: true, confirmed: true }) },
  { name: 'hide sticks through further checks and run end', before: state({ hidden: true, confirmed: true }), action: 'none', after: state({ hidden: true, confirmed: true }) },
  { name: 'a new article clears hide and opens without confirmation', before: state({ count: 2, hidden: true, confirmed: true }), action: 'open', after: state() },
  { name: 'a new article already shown confirms without reopening', before: state({ count: 2, hidden: true, confirmed: true }), shown: true, action: 'none', after: state({ confirmed: true }) },
  { name: 'a different session starts a fresh viewing', before: state({ sessionId: 'session-b', hidden: true, confirmed: true }), action: 'open', after: state() },
  { name: 'zero articles never open', before: null, count: 0, action: 'none', after: state({ count: 0 }) },
  { name: 'zero articles do not wait for a seat', before: null, count: 0, shown: null, action: 'none', after: state({ count: 0 }) },
  { name: 'an unknown seat waits without confirming', before: null, shown: null, action: 'wait', after: state() },
  { name: 'a confirmed tab with an unknown seat is not a hide', before: state({ confirmed: true }), shown: null, action: 'wait', after: state({ confirmed: true }) },
  { name: 'hide does not wait for an unknown seat', before: state({ hidden: true, confirmed: true }), shown: null, action: 'none', after: state({ hidden: true, confirmed: true }) },
]
for (const row of cases) {
  test(`pin step: ${row.name}`, () => {
    const before = row.before && Object.freeze(row.before)
    const result = api.wbReviewPinStep(before, input({ count: row.count ?? 3, shown: 'shown' in row ? row.shown : false }))
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { state: row.after, action: row.action })
    if (before) assert.notEqual(result.state, before, 'the helper never mutates the previous state')
  })
}

test('pin step: switching away and back clears a hidden viewing', () => {
  const hidden = state({ hidden: true, confirmed: true })
  const away = api.wbReviewPinStep(hidden, input({ sessionId: 'session-b', count: 0 }))
  assert.equal(away.action, 'none')
  const back = api.wbReviewPinStep(away.state, input())
  assert.equal(back.action, 'open')
  assert.equal(back.state.hidden, false)
})

test('review shown reads the bound session layout, including inactive review tabs', () => {
  const ctrl = { bind() {}, binding: null, active: () => ({ kind: 'other' }) }
  assert.equal(api.wbReviewShown(ctrl, 'session-a'), null)
  const layout = { expanded: true, tabs: { review: { id: 'review', kind: 'wb-review' }, other: { id: 'other', kind: 'other' } } }
  ctrl.binding = { sessionId: 'session-b', surfaces: { 'session-a': { layout } } }
  assert.equal(api.wbReviewShown(ctrl, 'session-a'), null)
  ctrl.binding.sessionId = 'session-a'
  assert.equal(api.wbReviewShown(ctrl, 'session-a'), true)
  layout.expanded = false
  assert.equal(api.wbReviewShown(ctrl, 'session-a'), false)
  layout.expanded = true
  delete layout.tabs.review
  assert.equal(api.wbReviewShown(ctrl, 'session-a'), false)
  delete ctrl.binding.surfaces['session-a']
  assert.equal(api.wbReviewShown(ctrl, 'session-a'), false)
})

test('review shown tolerates other controllers and never throws', () => {
  const shown = ctrl => api.wbReviewShown(ctrl, 'session-a')
  assert.equal(shown(null), false)
  assert.equal(shown({}), false)
  assert.equal(shown({ isExpanded: () => true }), false)
  assert.equal(shown({ isExpanded: () => false, active: () => ({ kind: 'wb-review' }) }), false)
  assert.equal(shown({ isExpanded: () => true, active: () => ({ kind: 'wb-review' }) }), true)
  assert.equal(shown({ isExpanded: () => true, active: () => ({ kind: 'other' }) }), false)
  assert.equal(shown({ isExpanded: () => true, active: () => undefined }), false)
  assert.equal(shown({ bind() {}, get binding() { throw Error('unavailable') } }), null)
  assert.equal(shown({ isExpanded() { throw Error('unavailable') } }), null)
})
