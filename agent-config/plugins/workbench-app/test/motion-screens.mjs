/* Offline motion fixture; uses Playwright, esbuild, react and react-dom.
 * NODE_PATH=/path/to/deps node test/motion-screens.mjs [output-directory]
 * WB_BROWSER_EXECUTABLE_PATH may point to an installed Chromium.
 * All requests are intercepted; only fixture reads are allowed. */
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { build } = require('esbuild')
const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(process.argv[2] || '/tmp/workbench-motion-screens')
mkdirSync(out, { recursive: true })
const source = readFileSync(resolve(here, '../lib/client.js'), 'utf8')
const fixture = `
import React from 'react';import {createRoot} from 'react-dom/client';import * as ReactDOM from 'react-dom';
window.__ModuleLoader__={load({factory}){window.wb=factory(name=>name==='react'?React:ReactDOM)}};
${source.replace('return module.exports;', 'return {CSS,WbPresence,WbCollapse,WbSkeleton,MobileModal,MobileDrawer,ReviewTabBody,wbInstallConversation};')}
const h=React.createElement, wb=window.wb;
const style=document.createElement('style');style.textContent=wb.CSS;document.head.appendChild(style);
if(innerWidth<768)document.documentElement.setAttribute('data-wb-mobile','');
window.fixtureReads=[];window.fixtureWrites=[];
window.fetch=async(url,options={})=>{
 if(options.method&&options.method!=='GET'){window.fixtureWrites.push(url);throw Error('Fixture blocks writes')}
 window.fixtureReads.push(String(url));
 await new Promise(r=>setTimeout(r,60));
 return {ok:true,status:200,json:async()=>({ok:true,binding:{client:'Fixture',client_key:'CUS-fixture'},drafts:[],library:[]}),text:async()=>''};
};
function App(){
 const [surface,setSurface]=React.useState(''),[open,setOpen]=React.useState(false);
 window.fixtureOpen=setSurface;
 React.useEffect(()=>wb.wbInstallConversation(),[]);
 return h(React.Fragment,null,
  h('nav',null,['drawer','sheet','preset','editor'].map(name=>h('button',{key:name,onClick:()=>setSurface(name)},name))),
  h('div',{'data-slot':'main.conversation',className:'fixture_conversation'},h('div',{'data-slot':'conversation.view'},'Agent chat'),h('button',{'aria-label':'停止生成'},'停止生成')),
  h(wb.WbSkeleton,{label:'技能加载中…'}),
  h('button',{className:'wb_rvCheck','aria-busy':true,disabled:true},'检查中…'),
  h('button',{className:'wb_mChip',onClick:()=>setOpen(!open)},'collapse'),
  h(wb.WbCollapse,{open,className:'wb_rvCollapse'},h('div',{style:{height:100,padding:12}},'details')),
  h(wb.ReviewTabBody,{sessionId:'fixture',mobileInline:innerWidth<768,useTabInfo:()=>({navigation:{params:{client:'Fixture',client_key:'CUS-fixture'}}})}),
  h(wb.WbPresence,null,surface==='drawer'?h(wb.MobileDrawer,{close:()=>setSurface(''),compose:()=>{},openSession:()=>{},names:['Fixture'],groups:{Fixture:[{id:'fixture',title:'Fixture session'}]},me:{label:'Fixture',sub:''}}):null),
  h(wb.WbPresence,null,surface&&surface!=='drawer'?h(wb.MobileModal,{title:surface,full:surface==='editor',close:()=>setSurface('')},'Existing content'):null));
}
createRoot(document.getElementById('root')).render(h(App));`
const bundle = (await build({ stdin: { contents: fixture, resolveDir: dirname(require.resolve('react/package.json')), loader: 'js' }, bundle: true, write: false, format: 'iife', nodePaths: (process.env.NODE_PATH || '').split(':').filter(Boolean), define: { 'process.env.NODE_ENV': '"development"' } })).outputFiles[0].text
const browser = await chromium.launch({ headless: true, ...(process.env.WB_BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.WB_BROWSER_EXECUTABLE_PATH } : {}) })
const results = [], errors = []
try {
  for (const width of [375, 767, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 850 }, reducedMotion: 'no-preference' })
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', route => {
      if (route.request().url() !== 'http://motion.fixture.invalid/') { errors.push('Unexpected network request'); return route.abort() }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box;corner-shape:superellipse(1.5)}body{margin:0}nav{display:flex;gap:8px;padding:16px}.fixture_conversation{display:flex;flex-direction:column;overflow:hidden;margin-left:${width < 768 ? 0 : 240}px;width:calc(100% - ${width < 768 ? 0 : 240}px);border:1px solid #ddd}[data-slot='conversation.view']{padding:16px}.wb_rv{height:auto;max-height:400px}</style><div id="root"></div><script>${bundle.replace(/<\/script/gi, '<\\/script')}</script>` })
    })
    await page.goto('http://motion.fixture.invalid/')
    await page.locator('.wb_ldrSpin').waitFor()
    await page.waitForTimeout(260)
    const loader = await page.locator('.wb_ldr').evaluate(el => {
      const spin = el.querySelector('.wb_ldrSpin'), root = el.parentElement.getBoundingClientRect(), card = el.getBoundingClientRect(), arc = spin.getBoundingClientRect(), css = getComputedStyle(spin)
      return { left: card.left - root.left, right: root.right - card.right, arcInside: arc.left >= root.left && arc.right <= root.right, width: spin.offsetWidth, height: spin.offsetHeight, mask: css.maskImage, background: css.backgroundImage, overflow: getComputedStyle(el).overflow, corner: css.cornerShape, animation: css.animationName }
    })
    assert.ok(loader.left >= 16 && loader.right >= 16 && loader.arcInside, JSON.stringify(loader))
    assert.equal(loader.width, 18); assert.equal(loader.height, 18)
    assert.equal(loader.overflow, 'visible'); assert.equal(loader.animation, 'wbSpin')
    assert.match(loader.mask, /radial-gradient/); assert.match(loader.background, /conic-gradient/)
    assert.ok(loader.corner === 'round' || loader.corner === 'superellipse(1)')
    await page.screenshot({ path: resolve(out, `loader-${width}.png`) })
    results.push(`${width}: masked circular loader stays inside clipped conversation`)
    await page.getByRole('button', { name: 'collapse', exact: true }).click()
    await page.waitForTimeout(250)
    assert.equal(Math.round((await page.locator('.wb_rvCollapse').first().boundingBox()).height), 100)
    await page.getByRole('button', { name: 'collapse', exact: true }).click()
    await page.waitForTimeout(250)
    assert.equal((await page.locator('.wb_rvCollapse').first().boundingBox()).height, 0)
    if (width < 768) {
      for (const name of ['drawer', 'sheet', 'preset', 'editor']) {
        await page.getByRole('button', { name, exact: true }).click()
        await page.getByRole('dialog').waitFor()
        await page.waitForTimeout(240)
        await page.keyboard.press('Escape')
        assert.equal(await page.locator('.wb_mScrim[data-wb-leave="1"][inert]').count(), 1)
        await page.locator('.wb_mScrim').waitFor({ state: 'detached' })
        results.push(`${width}: ${name} enters and exits before unmount`)
      }
      await page.getByRole('button', { name: '草稿审核', exact: true }).click()
      await page.locator('.wb_mReview').waitFor()
      await page.getByRole('button', { name: '返回', exact: true }).click()
      assert.equal(await page.locator('.wb_mReview[data-wb-leave="1"]').count(), 1)
      await page.locator('.wb_mReview').waitFor({ state: 'detached' })
      await page.evaluate(() => fixtureOpen('sheet'))
      await page.getByRole('dialog').waitFor()
      await page.evaluate(() => fixtureOpen(''))
      await page.evaluate(() => fixtureOpen('sheet'))
      await page.waitForTimeout(300)
      assert.equal(await page.locator('.wb_mScrim:not([data-wb-leave])').count(), 1)
      await page.evaluate(() => fixtureOpen(''))
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.locator('.wb_mScrim').waitFor({ state: 'detached' })
    } else {
      await page.locator('.wb_rvHead').click()
      await page.waitForTimeout(250)
      assert.ok((await page.locator('.wb_rv .wb_rvCollapse').boundingBox()).height > 0)
      await page.locator('.wb_rvHead').click()
      await page.waitForTimeout(250)
      assert.equal((await page.locator('.wb_rv .wb_rvCollapse').boundingBox()).height, 0)
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const reduced = await page.evaluate(() => ({ arc: getComputedStyle(document.querySelector('.wb_ldrSpin')).animationName, shimmer: getComputedStyle(document.querySelector('.wb_skeletonLine'), '::after').animationName, busy: getComputedStyle(document.querySelector('.wb_rvCheck[aria-busy]'), '::before').animationName, collapse: getComputedStyle(document.querySelector('.wb_collapse')).transitionDuration, writes: window.fixtureWrites }))
    assert.deepEqual(reduced, { arc: 'none', shimmer: 'none', busy: 'none', collapse: '0s', writes: [] })
    results.push(`${width}: reduced motion stops arc, shimmer, busy indicators and transitions; zero writes`)
    await page.close()
  }
  assert.deepEqual(errors, [])
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ results, errors }, null, 2))
  console.log(`${results.length} motion checks passed; screenshots in ${out}`)
} finally { await browser.close() }
