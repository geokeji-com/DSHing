/* Offline harness-contract fixture. No production URLs, cookies, or writes.
 * npm install --no-save playwright esbuild react react-dom
 * npx playwright install chromium
 * node test/mobile-screens.mjs [output-directory]
 */
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { build } = require('esbuild')
const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(process.argv[2] || '/tmp/workbench-mobile-screens')
mkdirSync(out, { recursive: true })
const plugin = readFileSync(resolve(here, '../lib/client.js'), 'utf8').replace('return module.exports;', 'return {apply, WorkbenchPage, SidebarNav, TaskBar};')
const fixture = `
import React from 'react';import {createRoot} from 'react-dom/client';import * as ReactDOM from 'react-dom';
window.__ModuleLoader__={load({factory}){window.wb=factory(name=>name==='react'?React:ReactDOM)}};
${plugin}
const h=React.createElement;
const customers=[{id:'CUS-a',name:'Fixture client A',files:4,business_lines:[{id:'line-a',name:'Line A'},{id:'line-b',name:'Line B'}],service_periods:[{id:'period-a',name:'Period A',business_line_id:'line-a'},{id:'period-b',name:'Period B',business_line_id:'line-b'}]},{id:'CUS-b',name:'Fixture client B',business_lines:[],service_periods:[]}];
const nodes=[{kind:'user',content:[{type:'text',text:'Fixture task [任务编号：fixture-1]'}]},{kind:'tool-result',call:{name:'todo_write',argsRaw:JSON.stringify({todos:[{content:'Read knowledge',status:'completed'},{content:'Write article',status:'in_progress'}]})}},{kind:'tool-result',call:{name:'mcp__articles__write_article',argsRaw:JSON.stringify({title:'Fixture article'})}}];
const chat={legacy:{nodes,partial:null,runningCalls:[]}};
window.fetch=async(url,opts)=>{if(opts?.method==='POST')throw Error('Fixture blocked a write');let path=new URL(url,location.href).pathname;let body=path.endsWith('/clients')?{ok:true,customers:location.search.includes('empty')?[]:customers}:path.endsWith('/skills')?{ok:true,skills:[{name:'Fixture personal template',layer:'personal'},{name:'Fixture public template',layer:'public'}]}:path.endsWith('/articles')?{ok:true,articles:[]}:path.endsWith('/session-client')?{ok:true,index:{'fixture-session':{client_key:'CUS-a',client:'Fixture client A',topic:'Fixture task',bound_at:'2026-10-01'}},binding:{client_key:'CUS-a',client:'Fixture client A'}}:path.endsWith('/client-map')?{ok:true,map:{}}:path.endsWith('/task-meta')?{ok:true,client:'Fixture client A',client_key:'CUS-a',savedAt:'2026-10-01',topic:'Fixture task',period:'Period A',skills:[]}:path.endsWith('/drafts')?{ok:true,drafts:[{title:'Fixture article',chars:123,updatedAt:'2026-10-02'}],library:[]}:path.endsWith('/me')?{display_name:'Fixture user',email:'fixture@example.test'}:{ok:true};return {ok:true,status:200,json:async()=>body,text:async()=>'Fixture article body'};};
let show;
const services={layout:{selectPanel(){show('compose')}},uiWorkspace:{openSession(){show('chat')}},sidebarRight:{openTab(){if(matchMedia('(max-width:767px)').matches)throw Error('Mobile opened desktop review')}},sidebarRightTabs:{register(){}}};
const ctx={...services,get(n){return services[n]},slots:{inject(){},register(){}},effect(fn){fn()}};
wb.apply(ctx,{defaultPanel:''});
function App(){const [view,setView]=React.useState('compose');show=setView;return h(React.Fragment,null,h('div',{className:'fixture_frame',style:{display:'grid',gridTemplateColumns:'248px minmax(0,1fr) 0px',height:'100%'}},h('div',{className:'fixture_sidebarCol'}),h('div',{className:'fixture_centerCol'},view==='compose'?h(wb.WorkbenchPage,{ctx}):h('div',{'data-slot':'main.conversation'},h(wb.TaskBar,{sessionId:'fixture-session',useChat:fn=>fn(chat),useSessions:fn=>fn({byId:{'fixture-session':{displayTitle:'Fixture task'}}})}),h('div',{className:'fixture_scrollBody'},'Fixture agent text'),h('div',{className:'fixture_composerSeat','data-composer-seat':''},h('div',{'data-slot':'conversation.composer.bar'},h('div',{contentEditable:true,role:'textbox',suppressContentEditableWarning:true},'Continue writing'))))),h('div',{className:'fixture_rightbarCol'})),h(wb.SidebarNav,{wbCtx:ctx}));}
createRoot(document.getElementById('root')).render(h(App));
`;
const bundle = await build({stdin:{contents:fixture,resolveDir:dirname(require.resolve('react/package.json')),loader:'js'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"development"'},nodePaths:(process.env.NODE_PATH||'').split(':').filter(Boolean)})
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>*{box-sizing:border-box}body{margin:0}#root{height:100vh}button{cursor:pointer}dsh-tabbar{display:none}@media(max-width:767px){html{--dsh-tabbar-h:52px}#root{height:calc(100dvh - var(--dsh-tabbar-h))}dsh-tabbar{display:flex;position:fixed;bottom:0;left:0;right:0;height:52px;background:white;z-index:200}dsh-tabbar a{flex:1;text-align:center;padding:12px 0}html[data-dsh-chrome=flow]{--dsh-tabbar-h:0px}html[data-dsh-chrome=flow] dsh-tabbar{display:none}}</style><div id="root"></div><dsh-tabbar>${['工作台','文章','投放','计划','更多'].map(x=>`<a href="#">${x}</a>`).join('')}</dsh-tabbar><script src="/fixture.js"></script>`
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html)})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({headless:true})
const errors=[]
let checks=0
try{
 const page=await browser.newPage({viewport:{width:393,height:852}})
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base);await page.locator('.wb_mStart:not(:disabled)').waitFor()
 const geometry=await page.evaluate(()=>{const frame=document.querySelector('[class*="_frame"]'),btn=document.querySelector('.wb_mStart'),r=btn.getBoundingClientRect(),bar=document.querySelector('dsh-tabbar').getBoundingClientRect();return {width:document.documentElement.scrollWidth,cols:getComputedStyle(frame).gridTemplateColumns,nav:!!document.querySelector('.wb_nv'),bottom:r.bottom,bar:bar.top,hit:btn.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})
 assert.equal(geometry.width,393);assert.equal(geometry.nav,false);assert.ok(geometry.cols.startsWith('0px 393px'));assert.ok(geometry.bottom<=geometry.bar);assert.equal(geometry.hit,true);checks++
 await page.screenshot({path:out+'/a.png'})
 await page.locator('.wb_mContext').click();await page.getByRole('button',{name:'Line B',exact:true}).click();assert.equal(await page.getByRole('button',{name:'✓ Period B',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Period A',exact:true}).count(),0);await page.screenshot({path:out+'/a-sheet.png'});await page.getByRole('button',{name:'确定',exact:true}).click();checks++
 await page.getByRole('button',{name:'打开会话抽屉'}).click();assert.equal((await page.locator('.wb_mDrawer').boundingBox()).width,328);await page.screenshot({path:out+'/b.png'});await page.mouse.click(380,400);assert.equal(await page.locator('.wb_mDrawer').count(),0);checks++
 await page.getByRole('button',{name:'打开会话抽屉'}).click();await page.locator('.wb_mSession').click();await page.getByRole('button',{name:'去审核',exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('data-dsh-chrome'),'flow');assert.equal(await page.locator('dsh-tabbar').isVisible(),false);await page.screenshot({path:out+'/c.png'});checks++
 await page.getByRole('button',{name:'去审核',exact:true}).click();await page.locator('.wb_mReviewItem').click();await page.getByText('Fixture article body',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'确认入库',exact:true}).isEnabled(),true);await page.screenshot({path:out+'/review.png'});await page.locator('.wb_mReview').getByRole('button',{name:'返回',exact:true}).click();await page.locator('.wb_mReview').getByRole('button',{name:'返回',exact:true}).click();checks++
 await page.getByRole('textbox').focus();await page.evaluate(()=>{Object.defineProperties(window.visualViewport,{height:{configurable:true,value:516},offsetTop:{configurable:true,value:0}});visualViewport.dispatchEvent(new Event('resize'))});const composer=await page.locator('[data-composer-seat]').boundingBox();assert.ok(composer.y+composer.height<=516);await page.screenshot({path:out+'/c-keyboard.png'});checks++
 await page.getByRole('button',{name:'返回',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-dsh-chrome'),null)
 for(const width of [768,1024,1440,393]){await page.setViewportSize({width,height:width===1440?900:852});await page.waitForTimeout(120);if(width>=768){assert.equal((await page.locator('.wb_nv').boundingBox()).width,248);assert.equal(await page.locator('.wb_mAssembly').count(),0)}else assert.equal(await page.locator('.wb_nv').count(),0);await page.screenshot({path:out+'/width-'+width+'.png'});checks++}
 await page.goto(base+'/?empty');await page.getByText('还没有分配给你的客户',{exact:true}).waitFor();assert.equal(await page.locator('.wb_mStart').isDisabled(),true);await page.locator('.wb_mContext').click();assert.equal(await page.getByRole('button',{name:'确定',exact:true}).isDisabled(),true);await page.screenshot({path:out+'/empty.png'});checks++
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks,errors,screenshots:out}))
}finally{await browser.close();server.close()}
