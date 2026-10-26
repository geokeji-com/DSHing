import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const reply = body => ({ok:true, status:200, json:async () => body})
function fixture(fetcher = () => new Promise(() => {})) {
  let api, now = 0, serial = 0, cursor = 0
  const timers = new Map(), requests = [], published = [], slots = [], effects = []
  const react = {
    createElement: (type, props, ...children) => ({type, props:props || {}, children:children.flat()}),
    useState(initial) {
      const at = cursor++
      if (!(at in slots)) slots[at] = initial
      return [slots[at], next => { slots[at] = typeof next === 'function' ? next(slots[at]) : next }]
    },
    useEffect(fn, deps) {
      const at = cursor++, previous = slots[at]
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) effects.push(() => {
        previous?.cleanup?.(); slots[at] = {deps, cleanup:fn()}
      })
    },
  }
  vm.runInNewContext(source.replace('return module.exports;', 'return {...module.exports, useWeakGaps, renderWeakPane};'), {
    window:{__ModuleLoader__:{load({factory}) { api = factory(() => react) }}},
    AbortController,
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, {fn, at:now + ms}); return id },
    clearTimeout(id) { timers.delete(id) },
    fetch(url, options) {
      assert.equal(options.method || 'GET', 'GET', 'no writes allowed')
      assert.match(url, /^\/api\/v1\/capture-words\?/)
      const request = {url, options, at:now}; requests.push(request)
      return fetcher(request, requests.length)
    },
  })
  return {api, requests, published, timers,
    start() { return api.wbLoadCapture('/api/v1/capture-words?client=fixture', value => published.push({...value, at:now})) },
    render(client = 'fixture', enterprise = 'line', enabled = true) {
      cursor = 0; const value = api.useWeakGaps(client, enterprise, enabled)
      effects.splice(0).forEach(fn => fn()); return value
    },
    dispose() { slots.forEach(slot => slot?.cleanup?.()) },
    async advance(ms) {
      await settle(); const end = now + ms
      for (;;) {
        const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!entry) break
        const [id, timer] = entry; timers.delete(id); now = timer.at; timer.fn(); await settle()
      }
      now = end; await settle()
    },
  }
}

test('capture retry policy has two exponential retries and does not retry permission/no-data errors', () => {
  const {api} = fixture()
  for (const error of ['timeout', 'network', 'unreachable']) {
    assert.equal(api.wbCaptureRetryDelay(error, 0), 1000)
    assert.equal(api.wbCaptureRetryDelay(error, 1), 2000)
    assert.equal(api.wbCaptureRetryDelay(error, 2), null)
  }
  for (const error of ['not-allowed', 'no-data', 'unknown', 'cancelled']) assert.equal(api.wbCaptureRetryDelay(error, 0), null)
})

test('hanging fetch that ignores AbortSignal reaches error at 15s and stops after two retries', async () => {
  const f = fixture(); f.start(); await f.advance(14999)
  assert.equal(f.published.at(-1).status, 'loading')
  await f.advance(1)
  assert.equal(f.published.at(-1).error, 'timeout')
  assert.equal(f.requests[0].options.signal.aborted, true)
  await f.advance(100000)
  assert.deepEqual(f.requests.map(r => r.at), [0, 16000, 33000])
  assert.deepEqual(f.published.filter(s => s.status === 'error').map(s => s.at), [15000, 31000, 48000])
  assert.equal(f.published.at(-1).status, 'error')
  assert.equal(f.timers.size, 0)
})

test('timeout also covers a hanging JSON body; late success cannot overwrite a newer retry', async () => {
  let resolveBody
  const body = {ok:true, questions:[{qid:'new', question:'Offline question'}]}
  const g = fixture((_, count) => count === 1 ? {ok:true, json:() => new Promise(resolve => { resolveBody = resolve })} : reply(body))
  const dispose = g.start(); await g.advance(16000)
  assert.equal(g.requests.length, 2)
  assert.equal(g.published.at(-1).body, body)
  const before = g.published.length
  resolveBody({ok:true, questions:[{qid:'stale'}]}); await settle()
  assert.equal(g.published.length, before)
  assert.equal(g.timers.size, 0)
  dispose()
})

test('network failure retries, successful data is preserved, and permission errors require manual retry', async () => {
  const body = {ok:true, questions:[{qid:'q', question:'Offline question'}]}
  const f = fixture((_, count) => count === 1 ? Promise.reject(Error('offline')) : reply(body))
  f.start(); await f.advance(1000)
  assert.equal(f.published.at(-1).body, body)
  assert.equal(f.timers.size, 0)
  const denied = fixture(() => ({ok:false, status:403, json:async () => ({})}))
  denied.start(); await denied.advance(100000)
  assert.equal(denied.requests.length, 1)
  assert.equal(denied.published.at(-1).error, 'not-allowed')
})

test('unmount aborts requests, clears retry timers, and suppresses stale settlements', async () => {
  for (const duringBackoff of [false, true]) {
    let resolve
    const f = fixture(() => new Promise(done => { resolve = done }))
    const dispose = f.start(); await f.advance(duringBackoff ? 15000 : 1)
    const before = f.published.length
    dispose(); resolve(reply({ok:true, questions:[]})); await f.advance(100000)
    assert.equal(f.requests.length, 1)
    assert.equal(f.requests[0].options.signal.aborted, true)
    assert.equal(f.published.length, before)
    assert.equal(f.timers.size, 0)
  }
  const f = fixture(), dispose = f.start(); dispose(); await settle()
  assert.equal(f.requests.length, 0, 'unmounted hooks cannot start a deferred fetch')
})

test('real gaps hook exposes retry UI, recovers on retry and cancels the previous client scope', async () => {
  let success = false
  const body = {ok:true, collectedAt:'fixture-time', computedAt:'computed', taskId:'task', clientId:'period', excluded:2,
    questions:[{qid:'q', question:'Offline question', summary:{gap:1}}]}
  const f = fixture(() => success ? reply(body) : new Promise(() => {}))
  f.render(); await f.advance(48000)
  const gaps = f.render()
  assert.equal(gaps.status, 'error')
  const tree = f.api.renderWeakPane({gaps, entry:{inWindow:true}})
  const button = tree.children[1].children[0]
  assert.equal(button.children[0], '重试')
  success = true; button.props.onClick(); f.render(); await settle()
  const ready = f.render()
  assert.equal(ready.status, 'ready')
  for (const key of ['collectedAt','computedAt','taskId','excluded']) assert.equal(ready[key], body[key])
  assert.equal(ready.capturePeriod, body.clientId)
  assert.deepEqual(JSON.parse(JSON.stringify(ready.questions)), body.questions)
  success = false; f.render('other', 'other-line'); await settle()
  assert.match(f.requests.at(-1).url, /client=other&enterprise=other-line/)
  f.render('other', 'other-line', false); await settle()
  assert.equal(f.requests.at(-1).options.signal.aborted, true)
  assert.equal(f.render('other', 'other-line', false).status, 'idle')
  f.dispose(); assert.equal(f.timers.size, 0)
})
