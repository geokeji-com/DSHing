// 修订模式（track changes）：开着的时候，这一轮每个人的改动都带「谁改的」标记，用作者颜色显示。
//
//   insertion { by, at }          新加的内容（作者颜色 + 实线下划线）
//   deletion  { by, at }          删掉的内容（作者颜色的删除线，不真删）。删自己这一轮刚加的字 = 真删
//   formatted { by, at, before }  改了格式的字（加粗/斜体/下划线/删除线/代码；作者颜色虚线）。before = 原来的格式，撤销时恢复
//   段落属性 tcBy/tcAt/tcBefore    改了段落样式（正文↔标题、标题级别、列表）；左侧作者颜色细竖线。tcBefore 形如 'p' / 'h2' / 'ul:p'
// 文字增删在 dispatchTransaction 里改写；格式和段落样式在 appendTransaction 里补标记。
// 中文输入法：组字过程中不改写事务（否则拼音会被打断），组字结束后再给这段字补上 insertion。
// 实时协同同步过来的事务（y-sync）、撤销重做都不处理 —— 作者标记已经在内容里了。

import { Extension, Mark } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { AddMarkStep, Mapping, RemoveMarkStep, ReplaceAroundStep, ReplaceStep } from '@tiptap/pm/transform'
import { Fragment, Slice } from '@tiptap/pm/model'

export const trackKey = new PluginKey('trackChanges')

const attrs = { by: { default: '' }, at: { default: 0 } }
const parseAttrs = (el) => ({ by: el.getAttribute('data-by') || '', at: +el.getAttribute('data-at') || 0 })
const fmtTime = (t) => {
  if (!t) return ''
  const d = new Date(t), p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const domAttrs = (a) => ({
  'data-by': a.by, 'data-at': String(a.at), class: 'tc',
  title: a.by ? `${a.by} · ${fmtTime(a.at)}` : null,
  style: `--tc: ${colorOf(a.by)}`,
})

/** 作者 → 颜色：同一个名字永远同一种颜色（客户页、控制台、光标头像都用这个） */
const PALETTE = ['#2f6feb', '#d9632b', '#2a9a55', '#7b4bd6', '#c8416e', '#178a99', '#b7861a', '#5b6dd6', '#cf4a3a', '#3f8f3a']
export function colorOf(name) {
  let h = 0
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export const Insertion = Mark.create({
  name: 'insertion',
  inclusive: false,
  excludes: 'deletion',
  addAttributes: () => attrs,
  parseHTML: () => [{ tag: 'ins[data-by]', getAttrs: parseAttrs }],
  renderHTML: ({ mark }) => ['ins', domAttrs(mark.attrs), 0],
})

export const Deletion = Mark.create({
  name: 'deletion',
  inclusive: false,
  excludes: 'insertion',
  addAttributes: () => attrs,
  parseHTML: () => [{ tag: 'del[data-by]', getAttrs: parseAttrs }],
  renderHTML: ({ mark }) => ['del', domAttrs(mark.attrs), 0],
})

export const Formatted = Mark.create({
  name: 'formatted',
  inclusive: false,
  addAttributes: () => ({ ...attrs, before: { default: '' } }),
  parseHTML: () => [{ tag: 'span.tc-fmt[data-by]', getAttrs: (el) => ({ ...parseAttrs(el), before: el.getAttribute('data-before') || '' }) }],
  renderHTML: ({ mark: { attrs: a } }) => ['span', { ...domAttrs(a), class: 'tc tc-fmt', 'data-before': a.before,
    title: a.by ? `${a.by} · 改了格式 · ${fmtTime(a.at)}` : null }, 0],
})

/** 参与留痕的格式；链接不算 */
const FORMAT = new Set(['bold', 'italic', 'underline', 'strike', 'code'])
const fmtKey = (marks) => marks.filter((m) => FORMAT.has(m.type.name)).map((m) => m.type.name).sort().join(',')

/** 一个段落的「样式」：类型 + 所在列表，如 'p' / 'h2' / 'ul:p' / 'ol:h3' */
function blockDesc($p) {
  const n = $p.parent
  const t = n.type.name === 'heading' ? 'h' + n.attrs.level : n.type.name === 'paragraph' ? 'p' : n.type.name
  for (let d = $p.depth - 1; d > 0; d--) {
    const a = $p.node(d).type.name
    if (a === 'bulletList') return 'ul:' + t
    if (a === 'orderedList') return 'ol:' + t
  }
  return t
}
const NO_BLOCK = { tcBy: null, tcAt: 0, tcBefore: null }

// 同一分钟的修改用同一个时间戳：连续打字的字能并成一段，不会碎成一个字一个标记
const minute = () => Math.floor(Date.now() / 60000) * 60000

/** TrackChanges.configure({ user: () => '小罗', enabled: () => true }) —— 都是函数，随时可变 */
export const TrackChanges = Extension.create({
  name: 'trackChanges',
  addOptions: () => ({ user: () => '', enabled: () => true }),
  addExtensions: () => [Insertion, Deletion, Formatted],
  addGlobalAttributes: () => [{
    types: ['paragraph', 'heading'],
    attributes: {
      tcBy: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-tcb') || null,
        renderHTML: (a) => a.tcBy ? { 'data-tcb': a.tcBy, style: `--tc: ${colorOf(a.tcBy)}`, title: `${a.tcBy} · 改了段落样式 · ${fmtTime(a.tcAt)}` } : {},
      },
      tcAt: { default: 0, parseHTML: (el) => +el.getAttribute('data-tcb-at') || 0, renderHTML: (a) => a.tcAt ? { 'data-tcb-at': String(a.tcAt) } : {} },
      tcBefore: { default: null, parseHTML: (el) => el.getAttribute('data-tcb-before'), renderHTML: (a) => a.tcBefore ? { 'data-tcb-before': a.tcBefore } : {} },
    },
  }],
  addStorage: () => ({ ime: null }),      // 组字中插入的范围 { from, to }

  dispatchTransaction({ transaction: tr, next }) {
    const { options: opts, storage, editor } = this
    if (!tr.docChanged || !opts.enabled() || tr.getMeta('y-sync$') || tr.getMeta(trackKey)) { next(tr); return }
    // 输入法组字中：原样放行，记下插入的范围，组字结束再补标记
    if (editor.view?.composing || tr.getMeta('composition') != null) {
      let r = storage.ime && { from: tr.mapping.map(storage.ime.from, -1), to: tr.mapping.map(storage.ime.to, 1) }
      tr.steps.forEach((step, i) => {
        const rest = tr.mapping.slice(i + 1)
        step.getMap().forEach((_a, _b, s, e) => {
          if (e <= s) return
          const ms = rest.map(s, -1), me = rest.map(e, 1)
          r = r ? { from: Math.min(r.from, ms), to: Math.max(r.to, me) } : { from: ms, to: me }
        })
      })
      storage.ime = r
      next(tr)
      return
    }
    next(track(editor.state, tr, opts.user(), minute()) ?? tr)
  },

  addProseMirrorPlugins() {
    const ext = this
    return [new Plugin({
      key: trackKey,
      appendTransaction: (trs, oldState, newState) => {
        if (!ext.options.enabled()) return null
        const user = trs.filter((t) => t.docChanged)
        if (!user.length || user.some((t) => t.getMeta('y-sync$') || t.getMeta(trackKey))) return null
        return trackFormat(user, oldState, newState, ext.options.user(), minute())
      },
      props: {
        handleDOMEvents: {
          compositionend: (view) => {
            // 等 ProseMirror 把最后一下组字读进文档再标
            setTimeout(() => {
              const r = ext.storage.ime
              ext.storage.ime = null
              if (!r || !ext.options.enabled()) return
              const { state } = view
              const { insertion, deletion } = state.schema.marks
              const from = Math.max(0, r.from), to = Math.min(state.doc.content.size, r.to)
              if (to <= from) return
              const tr = state.tr
              const mark = insertion.create({ by: ext.options.user(), at: minute() })
              state.doc.nodesBetween(from, to, (node, pos) => {
                if (!node.isText) return true
                if (insertion.isInSet(node.marks) || deletion.isInSet(node.marks)) return false
                tr.addMark(Math.max(pos, from), Math.min(pos + node.nodeSize, to), mark)
                return false
              })
              if (tr.docChanged) view.dispatch(tr.setMeta(trackKey, true).setMeta('addToHistory', false))
            }, 30)
            return false
          },
        },
      },
    })]
  },
})

/**
 * 把一个纯文字增删的事务改写成「留痕」事务。返回 null = 不改写（结构性操作，直接生效）。
 * 只对 ReplaceStep 组成的事务动手；每一步的位置先换回事务开始前的文档，再映射到改写后的文档上。
 */
function track(state, tr, by, at) {
  if (!tr.steps.length || !tr.steps.every((s) => s instanceof ReplaceStep && !s.structure)) return null
  const { insertion, deletion } = state.schema.marks
  const out = state.tr
  out.setMeta(trackKey, true)
  for (const k of ['uiEvent', 'paste']) if (tr.getMeta(k) != null) out.setMeta(k, tr.getMeta(k))
  let cursor = null

  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i]
    const back = new Mapping(tr.mapping.maps.slice(0, i)).invert()   // 注：mapping.slice(0,0) 在这版里不是空的
    const map = (p, bias) => out.mapping.map(back.map(p, bias), bias)
    let from = map(step.from, -1), to = map(step.to, 1)
    const slice = step.slice

    if (to > from) {
      // 删除范围里一个字都没有（比如回退合并两段）：结构变化不丢内容，照常执行
      let hasText = false
      out.doc.nodesBetween(from, to, (n) => { if (n.isText) hasText = true; return !hasText })
      if (!hasText) {
        out.replace(from, to, slice)
        cursor = from + slice.size
        continue
      }
      const own = []
      out.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText) return true
        const s = Math.max(pos, from), e = Math.min(pos + node.nodeSize, to)
        const ins = insertion.isInSet(node.marks)
        if (ins && ins.attrs.by === by) own.push([s, e])                 // 自己这一轮刚加的：真删
        else if (!deletion.isInSet(node.marks)) out.addMark(s, e, deletion.create({ by, at }))
        return false
      })
      for (const [s, e] of own.reverse()) out.delete(s, e)
      from = map(step.from, -1); to = map(step.to, 1)
      cursor = from
    }

    if (slice.size) {
      // 「把 A 改成 B」= A 加删除线 + 紧跟在后面插入 B
      const at2 = Math.max(from, to)
      const size0 = out.doc.content.size
      out.replace(at2, at2, markSlice(slice, insertion.create({ by, at }), deletion))
      cursor = at2 + (out.doc.content.size - size0)
    }
  }

  if (cursor != null) {
    try {
      const $c = out.doc.resolve(Math.min(cursor, out.doc.content.size))
      out.setSelection(TextSelection.near($c, tr.steps[tr.steps.length - 1].slice.size ? -1 : 1))
    } catch { /* 用默认映射 */ }
  }
  if (tr.scrolledIntoView) out.scrollIntoView()
  return out
}

/**
 * 格式 / 段落样式的改动 → 补一个留痕事务（不改内容，只加标记）。
 * 改回原样 = 标记自动消失；自己这一轮新加的字/段落不另记。
 */
function trackFormat(trs, oldState, newState, by, at) {
  const { insertion, deletion, formatted } = newState.schema.marks
  const entries = []
  const maps = []
  for (const t of trs) t.steps.forEach((step, i) => { entries.push({ step, docBefore: t.docs[i], k: maps.length }); maps.push(t.mapping.maps[i]) })
  const out = newState.tr
  const blocks = new Set()

  for (const { step, docBefore, k } of entries) {
    const after = new Mapping(maps.slice(k + 1))
    if ((step instanceof AddMarkStep || step instanceof RemoveMarkStep) && FORMAT.has(step.mark.type.name)) {
      docBefore.nodesBetween(step.from, step.to, (node, pos) => {
        if (!node.isText) return true
        if (insertion.isInSet(node.marks) || deletion.isInSet(node.marks)) return false
        const prev = formatted.isInSet(node.marks)
        const before = prev ? prev.attrs.before : fmtKey(node.marks)
        const a = after.map(Math.max(pos, step.from), 1), b = after.map(Math.min(pos + node.nodeSize, step.to), -1)
        if (b <= a) return false
        out.doc.nodesBetween(a, b, (n, p) => {
          if (!n.isText) return true
          const s = Math.max(p, a), e = Math.min(p + n.nodeSize, b)
          if (fmtKey(n.marks) === before) out.removeMark(s, e, formatted)
          else out.addMark(s, e, formatted.create({ by, at, before }))
          return false
        })
        return false
      })
    } else if (step instanceof ReplaceAroundStep) {
      const m = new Mapping(maps.slice(k))
      blocks.add([m.map(step.from, -1), m.map(step.to, 1)])
    }
  }

  if (blocks.size) {
    const inv = new Mapping(maps).invert()
    const seen = new Set()
    for (const [a, b] of blocks) {
      newState.doc.nodesBetween(a, Math.min(b, newState.doc.content.size), (node, pos) => {
        if (!node.isTextblock) return true
        if (seen.has(pos) || !('tcBy' in node.attrs)) return false
        seen.add(pos)
        const $o = oldState.doc.resolve(inv.map(pos + 1, 1))
        if (!$o.parent.isTextblock) return false
        const before = $o.parent.attrs.tcBefore ?? blockDesc($o)
        const now = blockDesc(newState.doc.resolve(pos + 1))
        let any = false, own = true
        node.forEach((c) => { if (c.isText) { any = true; const i = insertion.isInSet(c.marks); if (!(i && i.attrs.by === by)) own = false } })
        if (before === now || !any || own) {
          if (node.attrs.tcBy) out.setNodeMarkup(pos, null, { ...node.attrs, ...NO_BLOCK })
        } else out.setNodeMarkup(pos, null, { ...node.attrs, tcBy: by, tcAt: at, tcBefore: before })
        return false
      })
    }
  }
  if (!out.docChanged) return null
  return out.setMeta(trackKey, true)
}

/** 给插入的内容里所有文字加 insertion（去掉粘贴进来自带的旧痕迹） */
function markSlice(slice, mark, deletion) {
  const walk = (frag) => {
    const nodes = []
    frag.forEach((n) => {
      if (n.isText) nodes.push(n.mark(mark.addToSet(n.marks.filter((m) => m.type !== mark.type && m.type !== deletion && m.type.name !== 'formatted'))))
      else nodes.push(n.copy(walk(n.content)))
    })
    return Fragment.fromArray(nodes)
  }
  return new Slice(walk(slice.content), slice.openStart, slice.openEnd)
}

// ---------- 统计 / 定稿 / 逐处处理 ----------

/** 每处修订（连续的同一个人的同一类算一处）→ [{ from, to, type, by, at }]，type = insertion | deletion | formatted | block */
export function listChanges(doc, schema) {
  const { insertion, deletion, formatted } = schema.marks
  const out = []
  let last = null
  doc.descendants((node, pos) => {
    if (node.isTextblock && node.attrs.tcBy) out.push({ from: pos, to: pos + node.nodeSize, type: 'block', by: node.attrs.tcBy, at: node.attrs.tcAt })
    if (!node.isText) { last = null; return true }
    const m = insertion.isInSet(node.marks) || deletion.isInSet(node.marks) || formatted.isInSet(node.marks)
    if (!m) { last = null; return false }
    if (last && last.type === m.type.name && last.by === m.attrs.by && last.to === pos) last.to = pos + node.nodeSize
    else { last = { from: pos, to: pos + node.nodeSize, type: m.type.name, by: m.attrs.by, at: m.attrs.at }; out.push(last) }
    return false
  })
  return out
}

export const CHANGE_LABEL = { insertion: '新增', deletion: '删除', formatted: '格式', block: '段落样式' }

export function changesByAuthor(doc, schema) {
  const map = new Map()
  for (const c of listChanges(doc, schema)) map.set(c.by, (map.get(c.by) ?? 0) + 1)
  return [...map].map(([by, n]) => ({ by, n }))
}

/** 整篇定稿：删除线的真删，其余标记去掉、内容按当前留下 */
export function acceptAll(editor) {
  const { state } = editor
  const { insertion, formatted } = state.schema.marks
  const tr = state.tr
  for (const c of listChanges(state.doc, state.schema).reverse()) if (c.type === 'deletion') tr.delete(c.from, c.to)
  tr.removeMark(0, tr.doc.content.size, insertion)
  tr.removeMark(0, tr.doc.content.size, formatted)
  const blocks = []
  tr.doc.descendants((n, p) => { if (n.isTextblock && n.attrs.tcBy) blocks.push([p, n]); return !n.isTextblock })
  for (const [p, n] of blocks) tr.setNodeMarkup(p, null, { ...n.attrs, ...NO_BLOCK })
  if (tr.docChanged) editor.view.dispatch(tr.setMeta(trackKey, true))
}

/** 光标所在的那一处修订（字上的优先，其次所在段落） */
export function changeAt(state, pos) {
  const all = listChanges(state.doc, state.schema)
  return all.find((c) => c.type !== 'block' && pos >= c.from && pos <= c.to)
    ?? all.find((c) => c.type === 'block' && pos > c.from && pos < c.to) ?? null
}

/** 处理一处：keep = 保留（按改后的留下）；否则撤销（恢复原样） */
export function resolveChange(editor, ch, keep) {
  const { state } = editor
  const { schema } = state
  const tr = state.tr.setMeta(trackKey, true)

  if (ch.type === 'formatted') {
    if (!keep) {
      state.doc.nodesBetween(ch.from, ch.to, (n, p) => {
        if (!n.isText) return true
        const f = schema.marks.formatted.isInSet(n.marks)
        if (!f) return false
        const s = Math.max(p, ch.from), e = Math.min(p + n.nodeSize, ch.to)
        const want = new Set(f.attrs.before ? f.attrs.before.split(',') : [])
        for (const name of FORMAT) {
          const type = schema.marks[name]
          if (!type) continue
          if (want.has(name)) tr.addMark(s, e, type.create())
          else tr.removeMark(s, e, type)
        }
        return false
      })
    }
    tr.removeMark(ch.from, ch.to, schema.marks.formatted)
    editor.view.dispatch(tr)
    return
  }

  if (ch.type === 'block') {
    const node = state.doc.nodeAt(ch.from)
    if (!node) return
    if (keep) { editor.view.dispatch(tr.setNodeMarkup(ch.from, null, { ...node.attrs, ...NO_BLOCK })); return }
    const before = node.attrs.tcBefore || 'p'
    const [wantList, t] = before.includes(':') ? before.split(':') : [null, before]
    if (t === 'p') tr.setNodeMarkup(ch.from, schema.nodes.paragraph, {})
    else if (/^h\d$/.test(t)) tr.setNodeMarkup(ch.from, schema.nodes.heading, { level: +t[1] })
    else tr.setNodeMarkup(ch.from, null, { ...node.attrs, ...NO_BLOCK })
    editor.view.dispatch(tr)
    // 列表：放回原来的列表 / 移出列表
    const now = blockDesc(editor.state.doc.resolve(ch.from + 1))
    const curList = now.includes(':') ? now.split(':')[0] : null
    if (curList === wantList) return
    const c = editor.chain().setMeta(trackKey, true).setTextSelection(ch.from + 1)
    if (!wantList) c.liftListItem('listItem').run()
    else (wantList === 'ul' ? c.toggleBulletList() : c.toggleOrderedList()).run()
    return
  }

  if ((ch.type === 'insertion') === keep) tr.removeMark(ch.from, ch.to, schema.marks[ch.type])
  else tr.delete(ch.from, ch.to)
  editor.view.dispatch(tr)
}
