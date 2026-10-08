import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
let css
vm.runInNewContext(source.replace('return module.exports;', 'return CSS;'), {
 window: { matchMedia: () => ({matches:false}), __ModuleLoader__: { load({factory}) { css = factory(() => ({})) } } },
})
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([,selectors,body]) =>
 selectors.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(selector => ({selector:selector.trim(),body})))
function withoutVars(value) {
 let out='', depth=0
 for(let i=0;i<value.length;i++){
  if(!depth&&value.startsWith('var(',i)){depth=1;i+=3;continue}
  if(depth){if(value[i]==='(')depth++;else if(value[i]===')')depth--;continue}
  out+=value[i]
 }
 return out
}

test('sidebar, pick and review literal colors have property-specific dark overrides', () => {
 let checked=0
 for(const {selector,body} of rules){
  if(selector.includes('[data-ds-dark-theme]')||! /\.wb_(nv|rv|pk|rt|ri|rf)/.test(selector))continue
  for(const [,property,value] of body.matchAll(/(?:^|;)\s*([\w-]+)\s*:([^;]+)/g)){
   if(!/#[\da-f]{3,8}\b/i.test(withoutVars(value)))continue
   const overrides=rules.filter(r=>r.selector===`body[data-ds-dark-theme] ${selector}`).map(r=>r.body).join(';')
   const name=property.startsWith('border')?'border(?:-[a-z]+)?':property
   assert.match(overrides,new RegExp(`(?:^|;)\\s*${name}\\s*:`),`${selector}: ${property} needs a dark override`)
   checked++
  }
 }
 assert.ok(checked>60,'guard must inspect all legacy color declarations')
})
test('Harness body attribute is the only dark switch and sidebar follows native tokens', () => {
 assert.match(css,/body\[data-ds-dark-theme\] \.wb_nv\{/)
 for(const token of ['--dsw-specific-sidebar-fill','--dsw-alias-border-l2','--dsw-alias-label-primary','--dsw-alias-label-secondary','--dsw-alias-label-tertiary','--dsw-specific-sidebar-nav-item-hover','--dsw-specific-sidebar-nav-item-active'])assert.ok(css.includes(`var(${token},`),token)
 assert.doesNotMatch(source,/prefers-color-scheme/)
 assert.match(css,/body\[data-ds-dark-theme\] \.wb_nv\{[^}]*color-scheme:dark/)
})
test('mobile literal colors only occur inside palette fallbacks; blue ink and fill stay distinct', () => {
 for(const {selector,body} of rules){
  if(!selector.startsWith('html[data-wb-mobile]'))continue
  assert.doesNotMatch(withoutVars(body),/#[\da-f]{3,8}\b|rgba?\(/i,selector)
 }
 assert.match(css,/--wb-accent-ink:var\(--dsh-blue-ink,/)
 assert.match(css,/\.wb_mPrimary\{[^}]*background:var\(--wb-accent\)/)
 assert.match(css,/\.wb_mLink\{[^}]*color:var\(--wb-accent-ink\)/)
})
