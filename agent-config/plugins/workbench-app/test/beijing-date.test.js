import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
let api
const window = { matchMedia: () => ({ matches: false }), __ModuleLoader__: { load({ factory }) { api = factory(() => ({})) } } }
vm.runInNewContext(source.replace('return module.exports;', 'return {beijingStamp, collectedDay};'), { window })

test('UTC timestamps display Beijing dates across midnight and year boundaries', () => {
  for (const [input, expected] of [
    ['2026-10-14T15:59:00Z', '10-14 23:59'],
    ['2026-10-14T16:00:00Z', '10-15 00:00'],
    ['2026-10-14T18:20:00Z', '10-15 02:20'],
    ['2026-10-14T23:59:00Z', '10-15 07:59'],
    ['2026-10-15T00:00:00Z', '10-15 08:00'],
    ['2026-12-31T18:20:00.000Z', '01-01 02:20'],
    ['2026-10-15T02:20:00+08:00', '10-15 02:20'],
    ['2026-10-14T14:20:00-0400', '10-15 02:20'],
  ]) {
    assert.equal(api.beijingStamp(input).slice(5, 16).replace('T', ' '), expected)
    assert.equal(api.collectedDay(input).slice(5, 10), expected.slice(0, 5))
  }
})

test('zone-less local dates and timestamps are preserved, and missing/invalid values are safe', () => {
  for (const value of ['2026-10-15', '2026-10-15T02:20:00', '2026-10-15 02:20:00', 'invalid', '']) {
    assert.equal(api.beijingStamp(value), value)
    assert.equal(api.collectedDay(value), value.slice(0, 10))
  }
  assert.equal(api.beijingStamp(null), '')
  assert.equal(api.collectedDay(undefined), '')
  assert.equal(api.beijingStamp('invalidT02:20Z'), 'invalidT02:20Z')
  assert.match(source, /collectedDay\(it.at\).slice\(5, 10\)/)
  assert.match(source, /collectedDay\(it.at\).slice\(5,10\)/)
  assert.match(source, /beijingStamp\(d.updatedAt\).slice\(5, 16\)/)
})
