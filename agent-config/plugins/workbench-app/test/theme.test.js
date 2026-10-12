import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
let css
vm.runInNewContext(source.replace('return module.exports;', 'return CSS;'), {
  window: { matchMedia: () => ({ matches: false }), __ModuleLoader__: { load({ factory }) { css = factory(() => ({})) } } },
})


test('the workbench has one light palette and no dark media or token branches', () => {
  assert.doesNotMatch(source, /prefers-color-scheme/)
  assert.doesNotMatch(css, /color-scheme\s*:\s*dark/i)
  assert.doesNotMatch(css, /\[data-dsh-theme\s*=\s*["']dark|data-ds-dark-theme\]/)
  assert.match(css, /html,body\{color-scheme:light!important;\}/)
})

test('the host theme resolver is forced to light and remains observed', () => {
  assert.match(source, /setAttribute\("data-dsh-theme",\s*"light"\)/)
  assert.match(source, /removeAttribute\("data-ds-dark-theme"\)/)
  assert.match(source, /classList\.remove\("dark"\)/)
  assert.match(source, /MutationObserver\(normalize\)/)
  assert.match(source, /color-scheme.*light/)
})

test('mobile weak-question gap chips cannot inherit underlines', () => {
  assert.match(css, /\.wb_mWeakGaps\{[^}]*display:flex/)
  assert.match(css, /\.wb_mWeakGap\{[^}]*display:inline-flex[^}]*text-decoration:none!important/)
  assert.match(css, /\.wb_mWeakGapLabel,html\[data-wb-mobile\] \.wb_mWeakGap \.wb_gapNum\{[^}]*text-decoration:none!important/)
})

test('mobile literal colors stay in shared light tokens', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  for (const [, selectors, body] of rules) {
    if (!selectors.trim().startsWith('html[data-wb-mobile]')) continue
    assert.doesNotMatch(body, /color-scheme\s*:\s*dark/i)
  }
})
