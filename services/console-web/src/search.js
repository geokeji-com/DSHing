// 编辑器里的搜索 / 替换：命中处高亮（当前那处深一点），替换走普通编辑 —— 修订模式下照样留痕
// 搜索不分大小写；删除线（客户删掉的字）不算命中

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const searchKey = new PluginKey('search')

/** 全文找 query → [{ from, to }]；一段一段找，不跨段 */
export function findAll(doc, query, schema) {
  if (!query) return []
  const q = query.toLowerCase()
  const del = schema.marks.deletion
  const out = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const at = []
    node.forEach((c, off) => {
      if (!c.isText) { text += '\u0000'; at.push(pos + 1 + off); return }   // 换行等：挡住，不让命中跨过去
      const dead = del && del.isInSet(c.marks)
      for (let i = 0; i < c.text.length; i++) { text += dead ? '\u0000' : c.text[i]; at.push(pos + 1 + off + i) }
    })
    const lower = text.toLowerCase()
    for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) {
      out.push({ from: at[i], to: at[i + q.length - 1] + 1 })
    }
    return false
  })
  return out
}

export const Search = Extension.create({
  name: 'search',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: searchKey,
      state: {
        init: () => ({ query: '', cur: 0, matches: [] }),
        apply(tr, v, _old, state) {
          const m = tr.getMeta(searchKey)
          if (!m && !tr.docChanged) return v
          const query = m?.query ?? v.query
          const matches = findAll(state.doc, query, state.schema)
          const cur = Math.min(Math.max(m?.cur ?? v.cur, 0), Math.max(matches.length - 1, 0))
          return { query, cur, matches }
        },
      },
      props: {
        decorations(state) {
          const s = searchKey.getState(state)
          if (!s?.matches.length) return null
          return DecorationSet.create(state.doc, s.matches.map((r, i) =>
            Decoration.inline(r.from, r.to, { class: i === s.cur ? 'srch cur' : 'srch' })))
        },
      },
    })]
  },
})

export const searchState = (editor) => (editor && searchKey.getState(editor.state)) || { query: '', cur: 0, matches: [] }

export function setSearch(editor, patch) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, patch).setMeta('addToHistory', false))
}

/** 替换当前那处，然后停在它后面的下一处 */
export function replaceOne(editor, text) {
  const s = searchState(editor)
  const m = s.matches[s.cur]
  if (!m) return
  const tr = editor.state.tr
  if (text) tr.insertText(text, m.from, m.to); else tr.delete(m.from, m.to)
  editor.view.dispatch(tr)
  const end = tr.mapping.map(m.to)
  const next = searchState(editor).matches.findIndex((x) => x.from >= end)
  setSearch(editor, { cur: next === -1 ? 0 : next })
}

/** 全部替换（一次撤销能全撤回） → 替换了几处 */
export function replaceAll(editor, text) {
  const { matches } = searchState(editor)
  if (!matches.length) return 0
  const tr = editor.state.tr
  for (const m of [...matches].reverse()) { if (text) tr.insertText(text, m.from, m.to); else tr.delete(m.from, m.to) }
  editor.view.dispatch(tr)
  return matches.length
}
