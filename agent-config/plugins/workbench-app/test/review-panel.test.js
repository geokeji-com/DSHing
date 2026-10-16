import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

test('review panel counts writes from both articles MCP server names', () => {
  const m = source.match(/var WB_WRITE_TOOL_RE = (\/.+\/);/)
  assert.ok(m, 'shared write-tool regex exists')
  const re = eval(m[1])
  assert.ok(re.test('mcp__articles__write_article'))
  assert.ok(re.test('mcp__sora-articles__write_article'))
  assert.ok(!re.test('mcp__articles__read_article'))
  assert.equal(source.includes('call.name === "mcp__sora-articles__write_article"'), false)
})

test('task bar has an explicit 文章审核 open/refresh button wired to the review tab', () => {
  assert.match(source, /文章审核 ›/)
  assert.match(source, /openTab\("wb-review", \{ params: \{ client: meta\.client, meta: metaId \} \}\)/)
  assert.match(source, /wb:review-refresh/)
  assert.match(source, /\[client, sessionId, metaId, at, writeCount, rvTick\]/)
})

test('both review confirmation requests carry session and client binding fields', () => {
  const bodies = [...source.matchAll(/fetch\(WB_API\.confirmDraft,[\s\S]*?body: JSON\.stringify\(\{([\s\S]*?)\}\)/g)]
    .map(match => match[1])
  assert.equal(bodies.length, 2)
  for (const body of bodies) {
    assert.match(body, /client:\s*client/)
    assert.match(body, /client_key:/)
    assert.match(body, /session_id:/)
    assert.match(body, /title:\s*title/)
  }
})

test('every WB_API key used by the browser is defined', () => {
  const referenced = new Set([...source.matchAll(/WB_API\.([A-Za-z_$][\w$]*)/g)].map(match => match[1]))
  const start = source.indexOf('var WB_API = {')
  const end = source.indexOf('\n\t\t};', start)
  assert.ok(start >= 0 && end > start, 'WB_API registry exists')
  const registry = source.slice(start, end)
  for (const key of referenced) assert.match(registry, new RegExp('\\b' + key + '\\s*:'), key)
})
