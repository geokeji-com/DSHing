import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
let api
vm.runInNewContext(source.replace('return module.exports;', 'return {wbToolRowModel, WB_TOOLVIEW_KEYS, CSS};'), {
  window: { __ModuleLoader__: { load({ factory }) { api = factory(() => ({})) } } },
})

test('business MCP tools are claimed through the official keyed toolview slot', () => {
  assert.match(source, /ctx\.slots\.inject\("tool\.call\.toolview", function\* \(\)/)
  assert.match(source, /name: "tool\.call\.toolview", key: WB_TOOLVIEW_KEYS\[i\]/)
  for (const key of ['mcp__sora-knowledge__read_kb_file', 'mcp__knowledge__list_kb_files', 'mcp__sora-articles__write_article', 'mcp__articles__read_article']) {
    assert.ok(api.WB_TOOLVIEW_KEYS.includes(key), key)
  }
  // Official keys stay with their owners.
  for (const key of ['skill', 'todo_write', 'web_fetch', 'read']) assert.ok(!api.WB_TOOLVIEW_KEYS.includes(key), key)
})

test('running call: library, label and argument detail without output', () => {
  const m = api.wbToolRowModel('mcp__sora-knowledge__read_kb_file', { callId: 'c1', name: 'x', argsRaw: '{"client":"星辰口腔","file":"品牌/资质.md"}', subCalls: [] })
  assert.equal(m.lib, '知识库')
  assert.equal(m.label, '读文件')
  assert.equal(m.detail, '资质.md')
  assert.equal(m.state, 'running')
  assert.equal(m.output, null)
})

test('settled call: ok / error / interrupted states and text output', () => {
  const base = { kind: 'tool-result', callId: 'c2', call: { name: 'n', argsRaw: '{"title":"成都正畸哪家好"}' }, subCalls: [] }
  const ok = api.wbToolRowModel('mcp__sora-articles__write_article', { ...base, content: [{ type: 'text', text: 'saved' }], isError: false })
  assert.equal(ok.lib, '文章库')
  assert.equal(ok.label, '写入草稿')
  assert.equal(ok.detail, '成都正畸哪家好')
  assert.equal(ok.state, 'ok')
  assert.equal(ok.output, 'saved')
  const err = api.wbToolRowModel('mcp__articles__write_article', { ...base, content: [], isError: true, error: { name: 'Tool', code: 'boom' } })
  assert.equal(err.state, 'error')
  assert.equal(err.output, 'Tool: boom')
  const stopped = api.wbToolRowModel('mcp__articles__list_articles', { ...base, content: [], isError: true, error: { name: 'Tool', code: 'interrupted' } })
  assert.equal(stopped.state, 'stopped')
  assert.equal(stopped.label, '列文章')
})

test('malformed args and unknown names degrade instead of throwing', () => {
  const m = api.wbToolRowModel('mcp__sora-knowledge__new_tool', { callId: 'c3', argsRaw: '{not json', subCalls: [] })
  assert.equal(m.label, 'new tool')
  assert.equal(m.detail, '')
})

test('tool card styles ship with the workbench stylesheet', () => {
  for (const sel of ['.wb_tool{', '.wb_toolRow{', ".wb_tool[data-wb-tool='running'] .wb_toolDot", '.wb_toolOut{']) assert.ok(api.CSS.includes(sel), sel)
})
