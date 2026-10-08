/* Offline harness-contract fixture. No production URLs, cookies, or writes.
 * npm install --no-save playwright esbuild react react-dom
 * npx playwright install chromium
 * node test/mobile-screens.mjs [output-directory]
 * WB_BASELINE_REF overrides the pre-polish desktop comparison; WB_LIGHT_REF
 * overrides the pre-dark mobile/review comparison. All browser routes are in memory.
 */
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { isDeepStrictEqual, promisify } from 'node:util'
import { darkPalette, auditDarkPage } from './theme-audit.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { build } = require('esbuild')
const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(process.argv[2] || '/tmp/workbench-mobile-screens')
const lightRef = process.env.WB_LIGHT_REF || '1be6b0a5eded774af43fe82d7e791d15f3d8bc03'
const baselineRef = process.env.WB_BASELINE_REF || 'cc166cbc8c179cf598ccac03ac87eb4f3966fdb7'
mkdirSync(out, { recursive: true })
const source = readFileSync(resolve(here, '../lib/client.js'), 'utf8')
const baseline = (await promisify(execFile)('git', ['show', baselineRef + ':agent-config/plugins/workbench-app/lib/client.js'], { cwd: here, encoding: 'utf8' })).stdout
const lightSource = (await promisify(execFile)('git', ['show', lightRef + ':agent-config/plugins/workbench-app/lib/client.js'], { cwd: here, encoding: 'utf8' })).stdout
function fixture(plugin) {
  return `
import React from 'react';import {createRoot} from 'react-dom/client';import * as ReactDOM from 'react-dom';
window.__ModuleLoader__={load({factory}){window.wb=factory(name=>name==='react'?React:ReactDOM)}};
${plugin.replace('return module.exports;', 'return {apply, WorkbenchPage, SidebarNav, TaskBar, MobileQuickPrompts, ReviewTabBody, PickBar};')}
const h=React.createElement, query=new URLSearchParams(location.search);
const name=query.has('long')?'北京市海淀区超长名字测试教育科技集团有限公司（华北大区）':'Fixture client A';
const customers=[{id:'CUS-a',name,files:4,business_lines:[{id:'line-a',name:'Line A'},{id:'line-b',name:'Line B'}],service_periods:[{id:'period-a',name:query.has('duplicate')?name:'Period A',business_line_id:'line-a'},{id:'period-b',name:'Period B',business_line_id:'line-b'}]},{id:'CUS-b',name:'Fixture client B',business_lines:[],service_periods:[]}];
const ready=query.has('ready');
const todos=Array.from({length:query.has('many')?24:2},(_,i)=>({content:i?'Write article '+i:'Read knowledge',status:ready||i===0?'completed':query.has('wait')?'pending':'in_progress'}));
const nodes=[{kind:'user',content:[{type:'text',text:'Fixture task [任务编号：fixture-1]'}]},{kind:'tool-result',call:{name:'todo_write',argsRaw:JSON.stringify({todos})}},{kind:'tool-result',call:{name:'mcp__articles__write_article',argsRaw:JSON.stringify({title:'Fixture article'})}}];
const chat={legacy:{nodes,partial:null,runningCalls:[]}};
window.fixtureWrites=[];
window.fetch=async(url,opts)=>{
 if(opts?.method && opts.method!=='GET'){fixtureWrites.push(url);throw Error('Fixture blocked a write')}
 const path=new URL(url,location.href).pathname;
 const body=path.endsWith('/clients')?{ok:true,customers:query.has('empty')?[]:customers,workspace:{personal:{id:'fixture-personal',path:'/fixture/personal'},legacySharedIds:['fixture-legacy']}}
 :path.endsWith('/skills')?{ok:true,skills:[{name:'Fixture personal template',layer:'personal'},{name:'Fixture public template',layer:'public'}]}
 :path.endsWith('/articles')?{ok:true,articles:[]}
 :path.endsWith('/session-client')?{ok:true,index:{'fixture-session':{client_key:'CUS-a',client:name,topic:'Fixture task',bound_at:'2026-10-01'}},binding:{client_key:'CUS-a',client:name}}
 :path.endsWith('/client-map')?{ok:true,map:{}}
 :path.endsWith('/task-meta')?{ok:true,client:name,client_key:'CUS-a',savedAt:'2026-10-01',topic:'Fixture task',period:'Period A',skills:[]}
 :path.endsWith('/drafts')?{ok:true,drafts:[{title:'Fixture article',chars:123,updatedAt:'2026-10-02'}],library:ready?['Fixture article']:[]}
 :path.endsWith('/me')?{display_name:'Fixture user',email:'fixture@example.test'}:{ok:true};
 return {ok:true,status:200,json:async()=>body,text:async()=>'# Fixture article\\n\\nFixture article body'};
};
let show;
const services={layout:{selectPanel(){show('compose')}},uiWorkspace:{startSession(){show('chat')},async openWorkspace(id,beforeOpen){beforeOpen?.('fixture-session');show('chat')},openSession(){show('chat')}},sidebarRight:{openTab(){if(matchMedia('(max-width:767px)').matches)throw Error('Mobile opened desktop review')}},sidebarRightTabs:{register(){}}};
const ctx={...services,get(n){return services[n]},slots:{inject(){},register(){}},effect(fn){fn()}};
wb.apply(ctx,{defaultPanel:''});
function Conversation(){
 return h('div',{'data-slot':'main.conversation',className:'fixture_conversation'},
  h('div',{'data-slot':'conversation.session.header'},h(wb.TaskBar,{sessionId:'fixture-session',useChat:fn=>fn(chat),useSessions:fn=>fn({byId:{'fixture-session':{displayTitle:'Fixture task'}}})})),
  h('div',{className:'fixture_body'},h('div',{className:'fixture_scrollBody','data-conversation-scroll':''},
   h('div',{'data-slot':'conversation.session'},h('div',{className:'fixture_viewArea'},h('div',{'data-slot':'conversation.view'},
    Array.from({length:query.has('short')?1:12},(_,i)=>h('p',{'data-slot':'conversation.chat.node',key:i},'Fixture agent message '+i+' — 这是一条离线测试消息，用来验证滚动区域。')),
    h('p',{'data-slot':'conversation.chat.node','data-latest':''},'Latest fixture message — 请审核文章，再告诉我需要修改的内容。')))),
   h('div',{className:'fixture_composerSeat','data-composer-seat':''},
    h(wb.MobileQuickPrompts,{inputActions:{setDraft(){}}}),
    h('div',{'data-slot':'conversation.composer.bar'},h('div',{className:'fixture_root'},h('div',{className:'fixture_card'},
     h('div',{className:'fixture_scroll'},h('div',{contentEditable:true,role:'textbox',suppressContentEditableWarning:true},'Continue writing')),
     h('div',{className:'fixture_tools'},h('button',{'aria-label':'添加附件'},h('svg',{width:24,height:24}))),
     h('div',{className:'fixture_trailing'},h('button',{className:'fixture_primary','aria-label':'发送'},'↑')))))))));
}
function App(){
 const [view,setView]=React.useState(query.has('review')?'review':query.has('chat')?'chat':'compose');show=setView;window.fixtureShow=setView;
 return h(React.Fragment,null,
  h('div',{className:'fixture_frame',style:{display:'grid',gridTemplateColumns:'248px minmax(0,1fr) 0px',height:'100%'}},
   h('div',{className:'fixture_sidebarCol'}),h('div',{className:'fixture_centerCol'},view==='compose'?h(wb.WorkbenchPage,{ctx}):view==='review'?h(React.Fragment,null,h('div',{style:{height:'calc(100% - 60px)'}},h(wb.ReviewTabBody,{sessionId:'fixture-session',useChat:fn=>fn(chat)})),h(wb.PickBar)):h(Conversation)),h('div',{className:'fixture_rightbarCol'})),h(wb.SidebarNav,{wbCtx:ctx}));
}
createRoot(document.getElementById('root')).render(h(App));
`;
}
const bundles = await Promise.all([source, baseline, lightSource].map(plugin => build({stdin:{contents:fixture(plugin),resolveDir:dirname(require.resolve('react/package.json')),loader:'js'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"development"'},nodePaths:(process.env.NODE_PATH||'').split(':').filter(Boolean)})))
// Reproduce the upstream public scroll/seat contract: header above a flex body,
// transcript and sticky seat inside one scrollport. The old plain-text fixture
// had neither a scrollport nor message nodes, so it could not catch W2.
// The harness also applies superellipse corners globally, including to circles.
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>
*{box-sizing:border-box;corner-shape:superellipse(1.5)}body{margin:0}#root{height:100vh}button{cursor:pointer}dsh-tabbar{display:none}
.fixture_card button{border:0;padding:0}.fixture_card [contenteditable]{outline:none}.fixture_centerCol{min-height:0}.fixture_conversation{height:100%;display:flex;flex-direction:column;overflow:hidden}
.fixture_body{position:relative;display:flex;flex:1;flex-direction:column;min-height:0}
.fixture_scrollBody{display:flex;flex:1;flex-direction:column;min-height:0;overflow-y:auto;margin-right:2px;scrollbar-gutter:stable}
[data-slot='conversation.session']{display:flex;flex:1 0 auto;flex-direction:column}
.fixture_viewArea{flex:1 0 auto;min-height:auto}[data-slot='conversation.view']{padding:16px}
.fixture_composerSeat{display:flex;flex:none;flex-direction:column;position:sticky;bottom:0;background:white}
@media(max-width:767px){html{--dsh-tabbar-h:52px}#root{height:calc(100dvh - var(--dsh-tabbar-h))}dsh-tabbar{display:flex;position:fixed;bottom:0;left:0;right:0;height:52px;background:white;z-index:200}dsh-tabbar a{flex:1;text-align:center;padding:12px 0}html[data-dsh-chrome=flow]{--dsh-tabbar-h:0px}html[data-dsh-chrome=flow] dsh-tabbar{display:none}}
</style><div id="root"></div><dsh-tabbar>${['工作台','文章','投放','计划','更多'].map(x=>`<a href="#">${x}</a>`).join('')}</dsh-tabbar><script src="BUNDLE"></script>`
// Route fulfillment is entirely in-memory: no HTTP server or network host.
const base = 'http://workbench.fixture.invalid'
let browser
try { browser = await chromium.launch({headless:true}) } catch(error) {
 writeFileSync(out+'/run-status.json',JSON.stringify({status:'blocked',stage:'chromium-launch',message:error.message,baselineRef,lightRef,screenshots:[],network:'All fixture routes fulfilled in memory; no host contacted'},null,2))
 throw error
}
const errors = [], results = [], skipped = [], metrics = [], desktop = [], contrast = [], light = []
async function newPage(options) {
 const page = await browser.newPage({...options,serviceWorkers:'block'})
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',route=>{
  const url=new URL(route.request().url())
  if(url.origin!==base || !/^\/(?:baseline|light-ref|fixture)?(?:\.js)?$/.test(url.pathname)){
   errors.push('Blocked unexpected request: '+url.href);return route.abort()
  }
  const index=url.pathname.startsWith('/baseline')?1:url.pathname.startsWith('/light-ref')?2:0
  const script=url.pathname.endsWith('.js')
  return route.fulfill({contentType:script?'text/javascript; charset=utf-8':'text/html; charset=utf-8',body:script?bundles[index].outputFiles[0].text:html.replace('BUNDLE',index===1?'/baseline.js':index===2?'/light-ref.js':'/fixture.js')})
 })
 return page
}
function pass(name) { results.push(name) }
function firstSnapshotDifference(expected,actual,path='$') {
 if(isDeepStrictEqual(expected,actual))return null
 if(Array.isArray(expected)&&Array.isArray(actual)){
  for(let i=0;i<Math.max(expected.length,actual.length);i++){
   const difference=firstSnapshotDifference(expected[i],actual[i],path+'['+i+']')
   if(difference)return difference
  }
 }else if(expected&&actual&&typeof expected==='object'&&typeof actual==='object'){
  // Prefer an element/property over the full serialized DOM when both differ.
  const keys=[...new Set([...Object.keys(expected),...Object.keys(actual)])].sort((a,b)=>Number(a==='dom')-Number(b==='dom'))
  for(const key of keys){
   const difference=firstSnapshotDifference(expected[key],actual[key],path+'['+JSON.stringify(key)+']')
   if(difference)return difference
  }
 }
 let offset=0
 if(typeof expected==='string'&&typeof actual==='string'){
  while(offset<Math.min(expected.length,actual.length)&&expected[offset]===actual[offset])offset++
  path+=' (character '+offset+')'
 }
 const brief=value=>{
  if(value===undefined)return '<missing>'
  const text=typeof value==='string'?JSON.stringify(value.slice(Math.max(0,offset-40))):JSON.stringify(value)
  return text.length>180?text.slice(0,180)+'…':text
 }
 return path+': expected '+brief(expected)+'; actual '+brief(actual)
}
function assertSnapshotsEqual(actual,expected,name,file) {
 if(isDeepStrictEqual(actual,expected))return
 const difference=firstSnapshotDifference(expected,actual), path=resolve(out,file)
 writeFileSync(path,JSON.stringify({expected,actual,firstDifference:difference},null,2))
 assert.fail(name+'; first difference: '+difference+'; snapshots: '+path)
}
async function assertRoundCircles(page,selector,name) {
 const shapes=await page.locator(selector).evaluateAll(elements=>CSS.supports('corner-shape','round')?elements.map(el=>getComputedStyle(el).getPropertyValue('corner-shape').trim()):null)
 if(shapes===null){skipped.push(name+' (corner-shape unsupported)');return}
 assert.ok(shapes.length>0,name+': circles must exist')
 // CSS Borders 4 computes round as superellipse(1); accept either serialization.
 for(const shape of shapes)assert.equal(shape==='superellipse(1)'?'round':shape,'round',name)
 pass(name)
}
async function settle(page) { await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); }
async function screenshot(page,name) { await page.screenshot({path:out+'/'+name+'.png'}) }
async function noOverflow(page) { assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),page.viewportSize().width) }
async function viewport(page,height,offsetTop=0,scale=1) {
 await page.evaluate(({height,offsetTop,scale})=>{Object.defineProperties(visualViewport,{height:{configurable:true,value:height},offsetTop:{configurable:true,value:offsetTop},scale:{configurable:true,value:scale}});visualViewport.dispatchEvent(new Event('resize'))},{height,offsetTop,scale})
 await settle(page)
}
async function chatMetrics(page) {
 return page.evaluate(()=>{
  const rect=el=>el.getBoundingClientRect(), top=rect(document.querySelector('.wb_mTop')), composer=rect(document.querySelector('[data-composer-seat]')), scroll=document.querySelector('[data-conversation-scroll]'), last=document.querySelector('[data-latest]'), latest=rect(last), pinned=document.querySelector('.wb_mPinned');
  const visible=latest.bottom>Math.max(top.bottom,rect(scroll).top)&&latest.top<composer.top;
  const hitY=Math.max(latest.top,top.bottom,rect(scroll).top)+Math.min(8,latest.height/2);
  return {top:top.bottom,composerTop:composer.top,composerBottom:composer.bottom,scrollTop:rect(scroll).top,scrollBottom:rect(scroll).bottom,scrollHeight:scroll.clientHeight,scrollPadding:getComputedStyle(scroll).paddingBottom,pinned:pinned?rect(pinned).height:null,pinnedVisible:pinned?getComputedStyle(pinned).display!=='none':true,latestTop:latest.top,latestBottom:latest.bottom,visible,hit:visible&&last.contains(document.elementFromPoint(latest.x+10,hitY)),bottomGap:scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop};
 })
}
async function assertKeyboard(page,height,offset=0) {
 const m=await chatMetrics(page);metrics.push({width:page.viewportSize().width,keyboardHeight:height,offset,...m})
 assert.equal(m.pinned,0);assert.equal(m.scrollTop,m.top);assert.equal(m.pinnedVisible,false);assert.equal(m.composerBottom,height+offset)
 assert.ok(m.scrollHeight>0);assert.equal(m.scrollBottom,m.composerTop);assert.equal(m.scrollPadding,'0px')
 assert.ok(m.visible,'latest message must be visible');assert.ok(m.hit,'latest message must be unobscured');assert.ok(Math.abs(m.bottomGap)<=1)
 await noOverflow(page)
}
async function snapshot(page) {
 if(page.viewportSize().width>=768){
  // SidebarNav schedules ensureGrip after 600 ms and repeats tick every 4000 ms
  // in client.js (including both references). Let a full tick run after each
  // navigation/state/viewport/theme change, then require the real injection.
  // Keep the grip in both DOM and style/geometry comparisons.
  await page.waitForTimeout(4000)
  await page.waitForFunction(()=>{
   const col=document.querySelector('[class*="rightbarCol"]')
   return !col||!!col.querySelector('.wb_grip')
  },null,{timeout:12000})
 }
 await page.evaluate(()=>{document.activeElement?.blur();document.querySelectorAll('[data-conversation-scroll]').forEach(el=>el.scrollTop=0)})
 await settle(page)
 return page.evaluate(()=>{
  const tree=document.documentElement.cloneNode(true);tree.querySelectorAll('style,script,head').forEach(el=>el.remove());
  // DOM comparison ignores only semantically empty styles and declaration order.
  for(const el of [tree,...tree.querySelectorAll('[style]')]){if(el.hasAttribute('style')){const s=el.style,keys=Array.from(s).sort();if(!keys.length)el.removeAttribute('style');else el.setAttribute('style',keys.map(k=>k+':'+s.getPropertyValue(k)+(s.getPropertyPriority(k)?' !important':'')).join(';'))}}
  const elements=Array.from(document.body.querySelectorAll('*')).filter(el=>!['STYLE','SCRIPT'].includes(el.tagName));
  return {dom:tree.outerHTML,elements:elements.map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {tag:el.tagName,class:el.className,rect:[r.x,r.y,r.width,r.height],styles:Object.fromEntries(Array.from(s).filter(k=>!k.startsWith('--')).map(k=>[k,s.getPropertyValue(k)]))}})};
 })
}
async function dark(page) {
 await page.addStyleTag({content:darkPalette})
 const station=await page.evaluate(()=>{const station=document.documentElement.getAttribute('data-dsh-station');document.documentElement.setAttribute('data-dsh-station','workbench');document.body.setAttribute('data-ds-dark-theme','');return station})
 await settle(page)
 return station
}
async function inspectDark(page,name) {
 await settle(page);await noOverflow(page);await screenshot(page,name)
 contrast.push(await auditDarkPage(page,name))
 writeFileSync(out+'/contrast.json',JSON.stringify(contrast,null,2))
}
async function lightStates(page,mobile) {
 const states={}
 await page.locator(mobile?'.wb_mStart:not(:disabled)':'.wb_nv').waitFor()
 if(!mobile)await page.getByText('Fixture client A',{exact:true}).first().waitFor({state:'attached'});await page.waitForTimeout(150)
 states.assembly=await snapshot(page)
 if(mobile){
  await page.locator('.wb_mContext').click();states.sheet=await snapshot(page)
  await page.getByRole('button',{name:'确定',exact:true}).click()
  await page.getByRole('button',{name:'打开会话抽屉'}).click();states.drawer=await snapshot(page)
  await page.locator('.wb_mSession').click();await page.getByRole('button',{name:/去审核/}).waitFor();states.chat=await snapshot(page)
  await page.locator('.wb_mProgress summary').click();states.progress=await snapshot(page);await page.locator('.wb_mProgress summary').click()
  await page.getByRole('button',{name:/去审核/}).click();await page.locator('.wb_mReviewItem').waitFor();states.review=await snapshot(page)
  await page.locator('.wb_mReviewItem').click();await page.getByText('Fixture article body',{exact:true}).waitFor();states.article=await snapshot(page)
 }else{
  await page.evaluate(()=>fixtureShow('review'));await page.locator('.wb_ri').waitFor();states.review=await snapshot(page)
  await page.locator('.wb_ri').click();await page.getByText('Fixture article body',{exact:true}).waitFor();states.article=await snapshot(page)
 }
 return states
}
try {
 for (const [width,height,kb] of [[375,667,400],[393,852,511],[430,932,591]]) {
  const page=await newPage({viewport:{width,height},deviceScaleFactor:3,isMobile:true,hasTouch:true})
  await page.goto(base);await page.locator('.wb_mStart:not(:disabled)').waitFor()
  const geometry=await page.evaluate(()=>{const frame=document.querySelector('[class*="_frame"]'),btn=document.querySelector('.wb_mStart'),r=btn.getBoundingClientRect(),bar=document.querySelector('dsh-tabbar').getBoundingClientRect();return {cols:getComputedStyle(frame).gridTemplateColumns,nav:!!document.querySelector('.wb_nv'),bottom:r.bottom,bar:bar.top,hit:btn.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})
  await noOverflow(page);assert.equal(geometry.nav,false);assert.ok(geometry.cols.startsWith('0px '+width+'px'));assert.ok(geometry.bottom<=geometry.bar);assert.equal(geometry.hit,true)
  await screenshot(page,'a-'+width);pass(width+': assembly and action geometry')
  await page.locator('.wb_mContext').click()
  const rows=await page.locator('.wb_mClient').evaluateAll(rows=>rows.map(row=>{const r=row.getBoundingClientRect(),b=row.querySelector('b').getBoundingClientRect(),c=row.querySelector('.wb_mRadio'),s=getComputedStyle(c);return {height:r.height,title:b.y-r.y,check:[c.offsetWidth,c.offsetHeight,s.borderRadius]}}))
  assert.ok(rows.every(row=>row.height>=56));assert.deepEqual(rows[0],rows[1]);assert.deepEqual(rows[0].check,[26,26,'50%'])
  await assertRoundCircles(page,'.wb_mClient>.wb_mRadio',width+': client radios keep round corners under harness superellipse')
  await page.getByRole('button',{name:'Line B',exact:true}).click();assert.equal(await page.getByRole('button',{name:'✓ Period B',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Period A',exact:true}).count(),0)
  await screenshot(page,'a-sheet-'+width);await page.getByRole('button',{name:'确定',exact:true}).click();pass(width+': uniform client rows and period linkage')
  await page.getByRole('button',{name:'自己输入',exact:true}).click()
  const topic=page.locator('.wb_mTopic');await topic.fill('A topic\nAnother line\nThird line\nFourth line')
  assert.ok((await topic.boundingBox()).height>72)
  await topic.fill(Array(40).fill('Long topic line').join('\n'))
  const textarea=await topic.evaluate(el=>({height:el.offsetHeight,scroll:el.scrollHeight,resize:getComputedStyle(el).resize,font:getComputedStyle(el).fontSize}))
  assert.ok(textarea.height<=Math.ceil(height*.4));assert.ok(textarea.scroll>textarea.height);assert.equal(textarea.resize,'none');assert.equal(textarea.font,'16px')
  await screenshot(page,'topic-'+width);await topic.fill('Short');assert.equal((await topic.boundingBox()).height,72);pass(width+': textarea grows, caps, scrolls and shrinks')
  await page.getByRole('button',{name:'打开会话抽屉'}).click();assert.equal((await page.locator('.wb_mDrawer').boundingBox()).width,328)
  await assertRoundCircles(page,'.wb_mStatus',width+': status dots keep round corners under harness superellipse')
  await assertRoundCircles(page,'.wb_mAccount .wb_mAvatar',width+': account avatar keeps round corners under harness superellipse')
  const search=page.getByRole('searchbox');assert.equal((await search.boundingBox()).height,44);assert.equal(await page.locator('.wb_mSearch>svg').count(),1)
  assert.equal(await search.evaluate(el=>getComputedStyle(el).fontSize),'16px');assert.equal(await page.locator('.wb_mGroup small').first().evaluate(el=>getComputedStyle(el).fontSize),'13px')
  assert.equal((await page.locator('.wb_mGroup>svg').first().boundingBox()).width,24)
  await screenshot(page,'b-'+width);await page.mouse.click(width-8,400);assert.equal(await page.locator('.wb_mDrawer').count(),0);pass(width+': drawer controls and scrim')
  await page.getByRole('button',{name:'打开会话抽屉'}).click();await page.locator('.wb_mSession').click();await page.getByRole('button',{name:/去审核/}).waitFor();await settle(page)
  assert.equal(await page.locator('html').getAttribute('data-dsh-chrome'),'flow');assert.equal(await page.locator('dsh-tabbar').isVisible(),false)
  const rest=await chatMetrics(page);metrics.push({width,state:'rest',...rest});assert.ok(rest.pinned<=56);assert.ok(rest.scrollTop-rest.top<=56,'all pinned chrome under top bar must fit in 56px');assert.ok(rest.visible);assert.equal(rest.scrollBottom,rest.composerTop)
  const summary=page.locator('.wb_mProgress summary');assert.ok((await summary.boundingBox()).height>=44);assert.equal(await summary.locator('svg').count(),1);assert.equal(await summary.evaluate(el=>getComputedStyle(el).fontSize),'16px')
  await screenshot(page,'c-'+width);await summary.click();assert.equal(await page.locator('.wb_mProgress').getAttribute('open'),'');assert.ok((await page.locator('.wb_mChecklist').boundingBox()).height<=height*.4)
  await assertRoundCircles(page,'.wb_mProgress .wb_ticon',width+': progress icons keep round corners under harness superellipse')
  await screenshot(page,'c-progress-'+width);await summary.click();assert.equal(await page.locator('.wb_mProgress').getAttribute('open'),null);await noOverflow(page);pass(width+': compact pinned row and progress toggle')
  await page.getByRole('button',{name:'会话更多操作'}).click()
  const menu=await page.locator('.wb_mSheet').evaluate(el=>{const title=el.querySelector('h2').getBoundingClientRect();return [...el.querySelectorAll('.wb_mMenuRow')].map(row=>{const r=row.getBoundingClientRect(),s=getComputedStyle(row);return {left:r.x+parseFloat(s.paddingLeft)-title.x,height:r.height,border:s.borderTopWidth}})})
  assert.ok(menu.every(row=>row.left===0&&row.height>=52));assert.ok(menu.slice(1).every(row=>row.border==='1px'))
  await screenshot(page,'menu-'+width);await page.getByRole('button',{name:'关闭',exact:true}).click();pass(width+': action sheet alignment and separators')
  await page.getByRole('button',{name:/去审核/}).click();await page.locator('.wb_mReviewItem').click();await page.getByText('Fixture article body',{exact:true}).waitFor()
  assert.equal(await page.locator('.wb_mArticle h1').count(),1);assert.equal(await page.getByRole('button',{name:'确认入库',exact:true}).isEnabled(),true)
  await screenshot(page,'review-'+width);await page.locator('.wb_mReview').getByRole('button',{name:'返回',exact:true}).click();await page.locator('.wb_mReview').getByRole('button',{name:'返回',exact:true}).click();pass(width+': article title and review navigation')
  await page.getByRole('textbox').focus();await viewport(page,kb);await assertKeyboard(page,kb);await screenshot(page,'c-keyboard-'+width);pass(width+': keyboard shows latest message')
  await viewport(page,kb-24,24);await assertKeyboard(page,kb-24,24);await screenshot(page,'c-keyboard-offset-'+width);pass(width+': visual viewport pan and resize')
  await viewport(page,height);const restored=await chatMetrics(page);assert.equal(restored.pinned,56);assert.ok(restored.visible);assert.ok(Math.abs(restored.bottomGap)<=1);pass(width+': keyboard dismissal restores pinned row')
  await page.evaluate(()=>document.documentElement.dataset.dshKeyboard='open');await settle(page);await assertKeyboard(page,height)
  await page.evaluate(()=>delete document.documentElement.dataset.dshKeyboard);await settle(page);assert.equal((await chatMetrics(page)).pinned,56);pass(width+': shared shell keyboard signal')
  // A user reading older messages should not be forced down on every resize.
  await page.evaluate(()=>document.querySelector('[data-conversation-scroll]').scrollTop=0)
  await viewport(page,height-40);assert.equal(await page.locator('[data-conversation-scroll]').evaluate(el=>el.scrollTop),0)
  await viewport(page,height);await page.getByRole('textbox').focus();await viewport(page,kb);await assertKeyboard(page,kb)
  await page.getByRole('textbox').fill('Continue writing\nAnother line\nOne more line');await settle(page);await assertKeyboard(page,kb)
  pass(width+': reading position and growing composer')
  await viewport(page,height);await page.getByRole('button',{name:'返回',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-dsh-chrome'),null)
  await page.goto(base+'/?chat&ready&many&short');await page.getByRole('button',{name:/查看文章/}).waitFor();await settle(page)
  assert.ok((await chatMetrics(page)).pinned<=56);await page.locator('.wb_mProgress summary').click();const list=await page.locator('.wb_mChecklist').evaluate(el=>({height:el.offsetHeight,scroll:el.scrollHeight}));assert.ok(list.height<=Math.ceil(height*.4));assert.ok(list.scroll>list.height)
  await screenshot(page,'c-ready-progress-'+width);await page.getByRole('textbox').focus();await viewport(page,kb);assert.equal((await chatMetrics(page)).pinned,0);assert.ok((await chatMetrics(page)).visible);await screenshot(page,'c-short-keyboard-'+width);pass(width+': completed progress, scrollable overlay and short transcript')
  assert.deepEqual(await page.evaluate(()=>fixtureWrites),[]);await page.close()
 }
 // Long and duplicate names use the real components and the same fixture APIs.
 const page=await newPage({viewport:{width:375,height:667},deviceScaleFactor:3,isMobile:true,hasTouch:true})
 await page.goto(base+'/?long');await page.locator('.wb_mStart:not(:disabled)').waitFor()
 const long=await page.locator('.wb_mContext').evaluate(el=>{const t=el.querySelector('b'),r=el.getBoundingClientRect(),c=el.querySelector('svg').getBoundingClientRect();return {height:t.offsetHeight,clamp:getComputedStyle(t).webkitLineClamp,center:r.y+r.height/2-c.y-c.height/2}})
 assert.ok(long.height<=48);assert.equal(long.clamp,'2');assert.equal(long.center,0);await noOverflow(page);await screenshot(page,'long-context')
 await page.getByRole('button',{name:'打开会话抽屉'}).click();const group=page.locator('.wb_mGroup').first();assert.equal(await group.locator('b').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');assert.equal(await group.locator('b').evaluate(el=>getComputedStyle(el).textOverflow),'ellipsis');assert.equal(await group.locator('svg').evaluate(el=>el.closest('.wb_mDrawer').getBoundingClientRect().right-el.getBoundingClientRect().right),16)
 await screenshot(page,'long-drawer');pass('long names clamp and drawer chevron stays inset')
 await page.goto(base+'/?duplicate');await page.locator('.wb_mStart:not(:disabled)').waitFor();assert.equal(await page.locator('.wb_mContext b').textContent(),'Fixture client A · Line A');await page.locator('.wb_mContext').click();await screenshot(page,'duplicate-sheet');pass('duplicate context label with sheet open')
 await page.goto(base+'/?empty');await page.getByText('还没有分配给你的客户',{exact:true}).waitFor();assert.equal(await page.locator('.wb_mStart').isDisabled(),true);assert.equal(await page.locator('.wb_mContext b').evaluate(el=>getComputedStyle(el).webkitLineClamp),'2');await page.locator('.wb_mContext').click();assert.equal(await page.getByRole('button',{name:'确定',exact:true}).isDisabled(),true);await screenshot(page,'empty');pass('empty client context and disabled actions')
 // Prove this fixture exposes the old keyboard regression, not just the fix.
 await page.goto(base+'/baseline?chat');await page.getByRole('button',{name:'去审核',exact:true}).waitFor();await page.evaluate(()=>{const el=document.querySelector('[data-conversation-scroll]');el.scrollTop=el.scrollHeight});await page.getByRole('textbox').focus();await viewport(page,400)
 const before=await chatMetrics(page);assert.equal(before.visible,false);assert.equal(before.pinnedVisible,true);metrics.push({width:375,state:'baseline-keyboard',...before});await screenshot(page,'baseline-keyboard-375');pass('baseline reproduces W2 blank message area');await page.close()
 // Exact desktop DOM, standard computed-style and rectangle equality to base.
 for (const width of [768,1024,1440]) {
  const height=width===1440?900:852, pair=[]
  for (const prefix of ['/baseline','']) {
   const p=await newPage({viewport:{width,height}});await p.goto(base+prefix);await p.locator('.wb_nv').waitFor();await p.getByText('Fixture client A',{exact:true}).first().waitFor({state:'attached'});await p.waitForTimeout(150)
   assert.equal((await p.locator('.wb_nv').boundingBox()).width,248);assert.equal(await p.locator('.wb_mAssembly').count(),0)
   const compose=await snapshot(p);await screenshot(p,(prefix?'baseline-':'')+'desktop-'+width)
   await p.locator('.wb_nvItem').click();await p.locator('.wb_taskbar, .wb_task').waitFor();await p.waitForTimeout(150);const chat=await snapshot(p)
   await screenshot(p,(prefix?'baseline-':'')+'desktop-chat-'+width);pair.push({compose,chat})
   if(!prefix){await p.setViewportSize({width:393,height:852});await p.locator('.wb_mPinned').waitFor();await viewport(p,511);await p.setViewportSize({width,height});await p.locator('.wb_taskbar, .wb_task').waitFor();await settle(p);const restored=await snapshot(p);writeFileSync(out+'/desktop-roundtrip-'+width+'.json',JSON.stringify({before:chat,after:restored}));assertSnapshotsEqual(restored,chat,'desktop roundtrip differs at '+width,'desktop-roundtrip-'+width+'-diff.json');pass(width+': mobile keyboard to desktop restores DOM/styles/geometry')}
   await p.close()
  }
  writeFileSync(out+'/desktop-'+width+'.json',JSON.stringify(pair));assertSnapshotsEqual(pair[1],pair[0],'desktop baseline differs at '+width,'desktop-'+width+'-diff.json');desktop.push({width,states:['compose','chat'],nodes:pair[0].compose.elements.length+pair[0].chat.elements.length,differences:0});pass(width+': desktop equals baseline DOM/styles/geometry')
 }
 // Compare every standard computed property/rectangle with the immutable pre-dark source,
 // including mobile surfaces absent from the older desktop regression baseline.
 for(const width of [393,1440]){
  const pair=[]
  for(const prefix of ['/light-ref','']){
   const p=await newPage({viewport:{width,height:width===393?852:900},...(width===393?{deviceScaleFactor:3,isMobile:true,hasTouch:true}:{})})
   await p.goto(base+prefix);pair.push(await lightStates(p,width===393));await p.close()
  }
  writeFileSync(out+'/light-'+width+'.json',JSON.stringify(pair))
  assertSnapshotsEqual(pair[1],pair[0],'light identity differs at '+width,'light-'+width+'-diff.json')
  light.push({width,states:Object.keys(pair[0]),differences:0});pass(width+': light identity against pre-dark source')
 }
 // The fixture uses real components for review and PickBar as well as assembly/chat.
 const d=await newPage({viewport:{width:1440,height:900}})
 await d.goto(base);await d.locator('.wb_nvItem').waitFor();await d.waitForTimeout(150)
 const lightBefore=await snapshot(d), desktopStation=await dark(d);await inspectDark(d,'dark-desktop-assembly-1440')
 assert.equal(await d.locator('.wb_nv').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(27, 27, 28)')
 await d.evaluate(station=>{document.body.removeAttribute('data-ds-dark-theme');if(station===null)document.documentElement.removeAttribute('data-dsh-station');else document.documentElement.setAttribute('data-dsh-station',station)},desktopStation)
 assertSnapshotsEqual(await snapshot(d),lightBefore,'desktop live toggle restores light DOM/styles/geometry','desktop-live-toggle-diff.json')
 pass('desktop live dark/light switch without reload');await dark(d)
 await d.locator('.wb_nvItem').hover();await inspectDark(d,'dark-desktop-sidebar-hover-1440')
 await d.locator('.wb_nvItem').click();await d.locator('.wb_taskbar, .wb_task').waitFor();await inspectDark(d,'dark-desktop-chat-1440')
 await d.evaluate(()=>fixtureShow('review'));await d.locator('.wb_ri').waitFor();await inspectDark(d,'dark-desktop-review-empty-1440')
 await d.locator('.wb_pkChip').click();await d.locator('.wb_ri').click();await d.getByText('Fixture article body',{exact:true}).waitFor();await inspectDark(d,'dark-desktop-review-1440')
 await d.goto(base+'/?review&ready');await d.locator('.wb_ri.done').waitFor();await dark(d);await d.locator('.wb_ri.done').click();await d.getByText('Fixture article body',{exact:true}).waitFor();await inspectDark(d,'dark-desktop-review-done-1440');await d.close()
 const m=await newPage({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true})
 await m.goto(base);await m.locator('.wb_mStart:not(:disabled)').waitFor();await m.waitForTimeout(150)
 const mobileLight=await snapshot(m), mobileStation=await dark(m);await inspectDark(m,'dark-mobile-assembly-393')
 await m.evaluate(station=>{document.body.removeAttribute('data-ds-dark-theme');if(station===null)document.documentElement.removeAttribute('data-dsh-station');else document.documentElement.setAttribute('data-dsh-station',station)},mobileStation)
 assertSnapshotsEqual(await snapshot(m),mobileLight,'mobile live toggle restores light DOM/styles/geometry','mobile-live-toggle-diff.json')
 pass('mobile live dark/light switch without reload');await dark(m)
 await m.locator('.wb_mStyles .wb_mChip').first().click();await inspectDark(m,'dark-mobile-selected-style-393')
 await m.locator('.wb_mAdd').click();await inspectDark(m,'dark-mobile-reference-editor-393')
 await m.getByRole('textbox',{name:'参考链接或正文'}).fill('https://example.test/reference');await m.getByRole('button',{name:'完成',exact:true}).click();await inspectDark(m,'dark-mobile-reference-393')
 await m.getByRole('button',{name:/用模板/}).click();await m.getByRole('button',{name:'Fixture personal template',exact:true}).click();await inspectDark(m,'dark-mobile-templates-393')
 await m.locator('.wb_mExtra').click();await inspectDark(m,'dark-mobile-extra-editor-393');await m.getByRole('button',{name:'完成',exact:true}).click()
 await m.getByRole('button',{name:'自己输入',exact:true}).click();await inspectDark(m,'dark-mobile-topic-393')
 await m.locator('.wb_mContext').click();await inspectDark(m,'dark-mobile-sheet-393');await m.getByRole('button',{name:'确定',exact:true}).click()
 await m.getByRole('button',{name:'打开会话抽屉'}).click();await inspectDark(m,'dark-mobile-drawer-393')
 await m.locator('.wb_mSession').click();await m.getByRole('button',{name:/去审核/}).waitFor();await inspectDark(m,'dark-mobile-chat-393')
 await m.locator('.wb_mProgress summary').click();await inspectDark(m,'dark-mobile-progress-393');await m.locator('.wb_mProgress summary').click()
 await m.getByRole('button',{name:'会话更多操作'}).click();await inspectDark(m,'dark-mobile-menu-393');await m.getByRole('button',{name:'重命名',exact:true}).click();await inspectDark(m,'dark-mobile-rename-393');await m.getByRole('button',{name:'关闭',exact:true}).click()
 await m.getByRole('button',{name:/去审核/}).click();await m.locator('.wb_mReviewItem').waitFor();await inspectDark(m,'dark-mobile-review-393')
 await m.locator('.wb_mReviewItem').click();await m.getByText('Fixture article body',{exact:true}).waitFor();await inspectDark(m,'dark-mobile-article-393')
 await m.goto(base+'/?chat&wait');await m.getByRole('button',{name:/去审核/}).waitFor();await dark(m);await m.locator('.wb_mProgress summary').click();await inspectDark(m,'dark-mobile-progress-wait-393')
 await m.goto(base+'/?chat&ready');await m.getByRole('button',{name:/查看文章/}).waitFor();await dark(m);await inspectDark(m,'dark-mobile-chat-ready-393')
 await m.goto(base+'/?empty');await m.getByText('还没有分配给你的客户',{exact:true}).waitFor();await dark(m);await inspectDark(m,'dark-mobile-disabled-393')
 await m.locator('.wb_mContext').click();await inspectDark(m,'dark-mobile-empty-sheet-393')
 assert.deepEqual(await m.evaluate(()=>fixtureWrites),[]);await m.close()
 const violations=contrast.flatMap(r=>[...r.failures,...r.nearWhite].map(v=>({page:r.name,...v})))
 assert.deepEqual(violations,[],'dark contrast/near-white violations; see contrast.json')
 pass('dark text, placeholders, state indicators and surface audit: '+contrast.length+' pages')
 assert.deepEqual(errors,[])
 const report={passed:results.length,skipped,errors,mobileDPR:3,baselineRef,lightRef,light,contrast:contrast.map(({name,checked,states,failures,nearWhite,intentional})=>({name,texts:checked.length,states:states.length,failures,nearWhite,intentional})),screenshots:out,checks:results,metrics,desktop}
 writeFileSync(out+'/run-status.json',JSON.stringify({status:'passed'},null,2));writeFileSync(out+'/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:results.length,skipped,errors,desktop,screenshots:out}))
} catch(error) {
 writeFileSync(out+'/run-status.json',JSON.stringify({status:'failed',message:error.message,completed:results,screenshots:out},null,2));throw error
} finally { await browser.close() }
