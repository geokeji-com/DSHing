import test from 'node:test'
import assert from 'node:assert/strict'

import {
  mergeDraftLists,
  normalizeLibraryArticles,
  resolveServer,
  resolveTool,
} from '../lib/impl.js'

function fakeContext(names) {
  return { tools: { schemas: () => names.map(name => ({ name })) } }
}

test('resolves formal MCP names when config prefers the sora alias', () => {
  const ctx = fakeContext([
    'mcp__articles__list_articles',
    'mcp__articles__read_article',
    'mcp__articles__write_article',
    'mcp__knowledge__list_clients',
  ])
  assert.equal(resolveServer(ctx, 'sora-articles', ['articles']), 'articles')
  assert.deepEqual(
    resolveTool(ctx, 'sora-articles', ['articles'], 'write_article', [/write_article/i]),
    { server: 'articles', tool: 'write_article' },
  )
  assert.deepEqual(
    resolveTool(ctx, 'sora-knowledge', ['knowledge'], '', [/client/i]),
    { server: 'knowledge', tool: 'list_clients' },
  )
})

test('does not let a wrong preferred tool hide the fallback tool', () => {
  const ctx = fakeContext([
    'mcp__sora-articles__read_article',
    'mcp__articles__list_articles',
  ])
  assert.deepEqual(
    resolveTool(ctx, 'sora-articles', ['articles'], 'list_articles', [/^list_articles$/i, /^list/i]),
    { server: 'articles', tool: 'list_articles' },
  )
})

test('merges local and Support draft/ready metadata without duplicate titles', () => {
  const mcp = normalizeLibraryArticles([
    { title: '远端草稿', status: 'draft', chars: 12, updated_at: '2026-09-29T01:00:00Z' },
    { title: '远端正式', status: 'ready', chars: 20, updated_at: '2026-09-29T02:00:00Z' },
    { title: '本地草稿', status: 'draft' },
  ])
  const merged = mergeDraftLists(
    [{ title: '本地草稿', chars: 4, updatedAt: '2026-09-29T03:00:00Z' }],
    [{ title: '本地正式', chars: 8, updatedAt: '2026-09-29T04:00:00Z' }],
    mcp,
  )
  assert.deepEqual(new Set(merged.drafts.map(item => item.title)), new Set(['本地草稿', '本地正式', '远端草稿']))
  assert.deepEqual(merged.library.sort(), ['本地正式', '远端正式'])
})
