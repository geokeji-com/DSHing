import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
function load() {
  let api
  const media = { matches: false }
  const window = { matchMedia: () => media, __ModuleLoader__: { load({ factory }) { api = factory(() => ({})) } } }
  vm.runInNewContext(source.replace('return module.exports;', 'return {periodsFor, firstPeriodId, splitRefs, buildTaskMetaPayload, wbKeyboardInset, wbMobileViewport, wbStripLeadingTitle, wbContextLabel, wbSessionStatus, wbMobileProgress, wbNavTakeFrame};'), {window})
  return { api, media }
}
const { api } = load()

test('mobile line selection keeps customer-wide periods and excludes other lines', () => {
  const customer = {service_periods:[{id:'a', business_line_id:'line-a'},{id:'b',business_line_id:'line-b'},{id:'all',business_line_id:null}]}
  assert.deepEqual(Array.from(api.periodsFor(customer,'line-b'), p=>p.id), ['b','all'])
  assert.equal(api.firstPeriodId(customer,'line-a'),'a')
  assert.equal(api.firstPeriodId(null,''),'')
})
test('references still use the existing prompt parser and client key payload', () => {
  const refs = api.splitRefs('https://example.test/ref\nReference body\n\nMore text')
  assert.deepEqual(Array.from(refs.urls), ['https://example.test/ref'])
  assert.equal(refs.body,'Reference body\nMore text')
  const payload=api.buildTaskMetaPayload({client_key:'CUS-fixture',client:'Fixture client',refs})
  assert.equal(payload.client_key,'CUS-fixture')
  assert.equal(payload.refs,refs)
})
test('visual viewport accounts for scrolling, resizing, and pinch zoom', () => {
  assert.equal(api.wbKeyboardInset(852,{height:516,offsetTop:0,scale:1}),336)
  assert.equal(api.wbKeyboardInset(852,{height:516,offsetTop:50,scale:1}),286)
  assert.equal(api.wbKeyboardInset(516,{height:516,offsetTop:0,scale:1}),0)
  assert.equal(api.wbKeyboardInset(852,{height:420,offsetTop:0,scale:2}),0)
  assert.equal(api.wbKeyboardInset(852,null),0)
})
test('drawer states are based on evidence, unknown is never labelled stopped', () => {
  assert.equal(api.wbSessionStatus(null).label,'状态未同步')
  assert.equal(api.wbSessionStatus({running:false}).label,'已停止')
  assert.equal(api.wbSessionStatus({running:true,pending:2}).tone,'blue')
  assert.equal(api.wbSessionStatus({pending:2,confirmed:1}).tone,'orange')
  assert.equal(api.wbSessionStatus({confirmed:1}).tone,'green')
})
test('mobile frame forcing exits before accessing the DOM', () => {
  const {api,media}=load();media.matches=true
  assert.doesNotThrow(()=>api.wbNavTakeFrame())
})


test('mobile progress uses the latest todo list, not earlier success or failed writes', () => {
  const todo=(status,isError=false)=>({kind:'tool-result',isError,call:{name:'todo_write',argsRaw:JSON.stringify({todos:[{content:'Current task',status}]})}})
  assert.equal(api.wbMobileProgress([todo('completed'),todo('in_progress'),todo('completed',true)],null,[],{})[0][0],'run')
  const cleared={kind:'tool-result',call:{name:'todo_write',argsRaw:'{"todos":[]}'}}
  assert.equal(api.wbMobileProgress([todo('completed'),cleared],null,[],{}).length,0)
})
test('mobile progress counts unique written articles without treating template count as a quota', () => {
  const write={kind:'tool-result',call:{name:'mcp__articles__write_article',argsRaw:'{"title":"Article"}'}}
  const rows=api.wbMobileProgress([write,write],{partial:null,runningCalls:[]},[{title:'Article'}],{Article:true})
  assert.equal(rows[0][1],'本会话已写 1 篇文章')
  assert.equal(rows[1][1],'已入库 1 篇')
})


test('leading duplicate H1 is removed after whitespace and punctuation-width normalization', () => {
  assert.equal(api.wbStripLeadingTitle('# 少儿编程？ 看 AI IDE\n\n正文', ' 少儿编程?  看 AI IDE '), '正文')
  assert.equal(api.wbStripLeadingTitle('\uFEFF\n# 标题（测试）：一 \t ###\r\n \t\r\n正文\r\n', '标题(测试):一'), '正文\r\n')
  assert.equal(api.wbStripLeadingTitle('# Title', 'Title'), '')
  assert.equal(api.wbStripLeadingTitle('# Title\nBody\n# Title', 'Title'), 'Body\n# Title')
})
test('different headings, later headings, and non-H1 markdown remain untouched', () => {
  for (const body of ['# Different\n\nBody', '## Title\nBody', 'Intro\n# Title', '```md\n# Title\n```', '#Title\nBody', '    # Title\nBody']) {
    assert.equal(api.wbStripLeadingTitle(body, 'Title'), body)
  }
  assert.equal(api.wbStripLeadingTitle('# Title!\nBody', 'Title'), '# Title!\nBody')
  assert.equal(api.wbStripLeadingTitle('# Title\nBody', ''), '# Title\nBody')
})
test('context labels skip empty and duplicate client, line, and period parts in order', () => {
  assert.equal(api.wbContextLabel(['华熙生物', '', ' 华熙生物 ']), '华熙生物')
  assert.equal(api.wbContextLabel(['客户（北京）', '客户(北京)', ' 第二期 ']), '客户（北京） · 第二期')
  assert.equal(api.wbContextLabel(['Client  A', 'Line', ' Client\tA ']), 'Client A · Line')
  assert.equal(api.wbContextLabel(['Client', 'Line', 'Line']), 'Client · Line')
  assert.equal(api.wbContextLabel(['Client', 'Line', 'Period']), 'Client · Line · Period')
  assert.equal(api.wbContextLabel([null, undefined, '   ']), '')
})
test('pinned chat chrome follows mobile keyboard state and ignores zoom or desktop', () => {
  const state=(mobile,height,vv,shell)=>JSON.parse(JSON.stringify(api.wbMobileViewport(mobile,height,vv,shell)))
  assert.deepEqual(state(true,667,{height:667,offsetTop:0,scale:1}), {inset:0,keyboard:false,pinned:true})
  assert.deepEqual(state(true,667,{height:400,offsetTop:0,scale:1}), {inset:267,keyboard:true,pinned:false})
  assert.deepEqual(state(true,852,{height:511,offsetTop:40,scale:1}), {inset:301,keyboard:true,pinned:false})
  assert.deepEqual(state(true,511,{height:511,offsetTop:0,scale:1},'open'), {inset:0,keyboard:true,pinned:false})
  assert.deepEqual(state(true,852,{height:400,offsetTop:0,scale:2}), {inset:0,keyboard:false,pinned:true})
  assert.deepEqual(state(false,852,{height:400,offsetTop:0,scale:1},'open'), {inset:0,keyboard:false,pinned:false})
})
