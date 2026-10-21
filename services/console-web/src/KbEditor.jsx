import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { Focus } from '@tiptap/extensions'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { TrackChanges, Insertion, Deletion, Formatted, CHANGE_LABEL, changeAt, colorOf, resolveChange } from './trackchanges'
import { Extension } from '@tiptap/core'
import {
  BoldOutlined, CloseOutlined, ItalicOutlined, OrderedListOutlined, RedoOutlined, SearchOutlined, StrikethroughOutlined, TableOutlined,
  UnderlineOutlined, UndoOutlined, UnorderedListOutlined,
} from '@ant-design/icons'
import { Search, replaceAll, replaceOne, searchState, setSearch } from './search'
import TableTools from './TableTools'
import { md } from './md'
import { htmlToMd, mergeBack } from './htmlmd'
import { splitFrontmatter } from './frontmatter'

// 知识库所见即所得编辑器 —— 控制台和客户分享页共用，长得一样、用法一样
// 存的仍是 Markdown：编辑器内容 → htmlToMd → mergeBack（没改的行原样保留，看改动才干净）

// 客户页没有「删除线」格式：删除本身就显示成删除线，两者并存客户分不清。快捷键也一起挡掉
const NoStrikeKey = Extension.create({ name: 'noStrikeKey', priority: 1000, addKeyboardShortcuts: () => ({ 'Mod-Shift-s': () => true, 'Mod-Shift-x': () => true }) })

// 快捷键提示按系统显示：Mac 用 ⌘，其他用 Ctrl
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const key = (k) => IS_MAC ? k.replace(/Mod\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥') : k.replace(/Mod\+/g, 'Ctrl+')

const fmOf = (t) => { const { body } = splitFrontmatter(t); return { fm: t.slice(0, t.length - body.length), body } }

/**
 * 自动保存 + 多人合并的状态（防抖 1 秒存一次）
 * save(base, content) → { ok, text, conflicts }：base = 编辑器当前对应的版本，服务端拿它做三方合并
 */
export function useKbDoc(save, onSaved) {
  const baseRef = useRef(null)            // 编辑器此刻对应的 Markdown 全文
  const [base, setBase] = useState(null)
  const [rev, setRev] = useState(0)       // +1 = 把 base 重新灌进编辑器（别人改了 / 合并出了新内容）
  const [state, setState] = useState('saved')   // saved | pending | saving | error
  const pending = useRef(null)            // (base) => 要保存的全文
  const timer = useRef(null)
  const saving = useRef(false)
  const saveRef = useRef(save); saveRef.current = save
  const onSavedRef = useRef(onSaved); onSavedRef.current = onSaved

  const reset = (text) => { baseRef.current = text; setBase(text); setRev((x) => x + 1); pending.current = null; setState('saved') }

  const flush = async () => {
    clearTimeout(timer.current)
    if (saving.current || !pending.current) return
    const get = pending.current
    pending.current = null
    const b = baseRef.current
    const content = get(b)
    if (content === b) { setState('saved'); return }
    saving.current = true
    setState('saving')
    let r
    try { r = await saveRef.current(b, content) } catch (e) { r = { error: String(e) } }
    saving.current = false
    if (!r?.ok) {
      pending.current ??= get
      setState('error')
      onSavedRef.current?.(r)
      timer.current = setTimeout(flush, 4000)
      return
    }
    baseRef.current = content
    // 服务端合进了别人的修改：没在打字就刷新编辑器；在打字就等下一次保存一起合
    if (r.text !== content && !pending.current) { baseRef.current = r.text; setBase(r.text); setRev((x) => x + 1) }
    setState(pending.current ? 'pending' : 'saved')
    onSavedRef.current?.(r)
    if (pending.current) flush()
  }

  const onEdit = (get) => {
    pending.current = get
    setState('pending')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 1000)
  }

  // 离开页面 / 切文件：没存的立刻存掉
  useEffect(() => () => {
    clearTimeout(timer.current)
    const get = pending.current
    if (get && baseRef.current != null) {
      const c = get(baseRef.current)
      if (c !== baseRef.current) saveRef.current(baseRef.current, c)
    }
  }, [])

  const idle = () => !pending.current && !saving.current
  return { base, rev, state, reset, onEdit, flush, idle, baseRef }
}

export const SAVE_TEXT = { saved: '已保存', pending: '编辑中…', saving: '保存中…', error: '保存失败，重试中' }

const BLOCKS = [['p', '正文'], ['h1', '标题 1'], ['h2', '标题 2'], ['h3', '标题 3'], ['h4', '标题 4'], ['h5', '标题 5']]

/**
 * 两种模式：
 *   普通：doc = useKbDoc() 的返回值，自动保存 Markdown
 *   协同：collab = { provider, ydoc, user: { name }, track: bool }，内容走 Yjs 实时同步、修订痕迹
 * before = 正文上方额外内容；readOnly：只看；onEditor(editor) 把编辑器实例交给外层（定稿用）
 */
export default function KbEditor({ doc, collab, readOnly, before, onEditor }) {
  const scrollRef = useRef(null)
  const pageRef = useRef(null)
  const firstRev = useRef(doc?.rev)
  const [toc, setToc] = useState([])
  const [active, setActive] = useState(-1)
  // 目录宽度：拖右边那条线调整，记在本机（控制台和分享页共用一个值）
  const [tocW, setTocW] = useState(() => Math.min(480, Math.max(160, +localStorage.getItem('kb_toc_w') || 240)))
  const dragTocW = (e) => {
    e.preventDefault()
    const x0 = e.clientX, w0 = tocW
    let w = w0
    const move = (ev) => { w = Math.min(480, Math.max(160, w0 + ev.clientX - x0)); setTocW(w) }
    const up = () => {
      localStorage.setItem('kb_toc_w', String(Math.round(w)))
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up)
      document.body.classList.remove('col-resizing')
    }
    document.body.classList.add('col-resizing')
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }

  const pastingPlain = useRef(false)
  const [here, setHere] = useState(null)        // 光标所在的那处修订（审阅时显示 保留 / 撤销）
  const trackRef = useRef(!!collab?.track); trackRef.current = !!collab?.track && !readOnly
  const editor = useEditor({
    extensions: [
      // 协同模式下撤销重做由 Collaboration 自己管（只撤销自己的修改）
      StarterKit.configure({ link: { openOnClick: false }, ...(collab ? { undoRedo: false } : {}) }),
      TableKit.configure({ table: { resizable: false } }),
      Focus.configure({ mode: 'deepest' }),          // 光标所在段落加 .has-focus → 淡淡的底色
      Search,
      ...(collab ? [
        Collaboration.configure({ document: collab.ydoc }),
        ...(collab.caret === false ? [] : [CollaborationCaret.configure({ provider: collab.provider, user: { name: collab.user.name, color: colorOf(collab.user.name) } })]),
        TrackChanges.configure({ user: () => collab.user.name, enabled: () => trackRef.current }),
        ...(collab.track ? [NoStrikeKey] : []),
      ] : [Insertion, Deletion, Formatted]),
    ],
    ...(collab ? {} : { content: md(fmOf(doc.baseRef.current ?? '').body) }),
    editable: !readOnly,
    editorProps: {
      // 粘贴一律按纯文字进来（飞书 / 网页带来的字体、颜色、空行都不要）；换行 = 分段
      handlePaste: (view, event) => {
        if (pastingPlain.current) return false
        const text = event.clipboardData?.getData('text/plain')
        if (!text) return false
        pastingPlain.current = true
        try { view.pasteText(text, event) } finally { pastingPlain.current = false }
        return true
      },
    },
    onUpdate: ({ editor: e }) => {
      if (!collab) doc.onEdit((b) => { const { fm, body } = fmOf(b); return fm + mergeBack(body, htmlToMd(e.getHTML())) })
      readToc(e)
    },
    onCreate: ({ editor: e }) => { readToc(e); onEditor?.(e) },
    onSelectionUpdate: ({ editor: e }) => setHere(collab?.review && e.isEditable ? changeAt(e.state, e.state.selection.from) : null),
    onTransaction: ({ editor: e, transaction: t }) => { if (t.docChanged && collab?.review) setHere(e.isEditable ? changeAt(e.state, e.state.selection.from) : null) },
  }, [collab?.ydoc])

  // 目录：编辑器里的 h1-h3，按出现顺序；跳转用同样顺序的 DOM 节点
  function readToc(e) {
    const out = []
    e.state.doc.descendants((n) => {
      if (n.type.name === 'heading' && n.attrs.level <= 3) out.push({ level: n.attrs.level, text: n.textContent })
      return n.type.name !== 'heading'
    })
    setToc(out)
  }

  // 外部换了内容（别人改了 / 合并结果）→ 灌回编辑器，光标尽量留在原处（协同模式不需要）
  useEffect(() => {
    if (collab || !editor || doc.rev === firstRev.current) return
    const { from, to } = editor.state.selection
    editor.commands.setContent(md(fmOf(doc.baseRef.current ?? '').body), { emitUpdate: false })
    const max = editor.state.doc.content.size - 1
    editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) })
    readToc(editor)
  }, [doc?.rev])

  useEffect(() => { editor?.setEditable(!readOnly) }, [readOnly, editor])

  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => !e ? null : {
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      ul: e.isActive('bulletList'), ol: e.isActive('orderedList'),
      block: ((l) => l ? 'h' + l : 'p')([1, 2, 3, 4, 5].find((l) => e.isActive('heading', { level: l }))),
      undo: e.can().undo?.() ?? false, redo: e.can().redo?.() ?? false,
      table: e.isActive('table'),
      search: searchState(e),
    },
  })

  // 搜索 / 替换条
  const [find, setFind] = useState(null)          // null = 关；{ replace: bool }
  const [rep, setRep] = useState('')
  const findRef = useRef(null)
  const openFind = (replace) => {
    const sel = editor && editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
    if (sel && sel.length < 80 && !sel.includes('\n')) setSearch(editor, { query: sel, cur: 0 })
    setFind({ replace: replace && !readOnly })
    setTimeout(() => { findRef.current?.focus(); findRef.current?.select() }, 0)
  }
  const closeFind = () => { setFind(null); if (editor) { setSearch(editor, { query: '' }); editor.commands.focus() } }
  const goMatch = (d) => {
    const s = searchState(editor)
    if (!s.matches.length) return
    const cur = (s.cur + d + s.matches.length) % s.matches.length
    setSearch(editor, { cur })
    const m = s.matches[cur]
    const el = editor.view.domAtPos(m.from).node
    ;(el.nodeType === 3 ? el.parentElement : el)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  // Ctrl/⌘+F 搜索；替换：Windows Ctrl+H，Mac ⌘⇧H（⌘H 在 Mac 上是隐藏窗口）
  const onKeyDown = (e) => {
    const mod = IS_MAC ? e.metaKey : e.ctrlKey
    if (!mod || !editor) return
    const k = e.key.toLowerCase()
    if (k === 'f' && !e.shiftKey) { e.preventDefault(); openFind(false) }
    else if (k === 'h' && (IS_MAC ? e.shiftKey : !e.shiftKey)) { e.preventDefault(); openFind(true) }
  }

  const heads = () => scrollRef.current?.querySelectorAll('.kbe-doc h1, .kbe-doc h2, .kbe-doc h3') ?? []
  const topOf = (el) => el.getBoundingClientRect().top - scrollRef.current.getBoundingClientRect().top + scrollRef.current.scrollTop
  const jump = (k) => { const el = heads()[k]; if (el) scrollRef.current.scrollTo({ top: topOf(el) - 16, behavior: 'smooth' }) }
  const onScroll = () => {
    const box = scrollRef.current
    let cur = -1
    heads().forEach((el, k) => { if (topOf(el) - box.scrollTop <= 60) cur = k })
    setActive(cur)
  }
  const minLv = Math.min(...toc.map((h) => h.level))

  const chain = () => editor.chain().focus()
  const tools = st && [
    { key: 'bold', icon: <BoldOutlined />, tip: '加粗 ' + key('Mod+B'), on: st.bold, run: () => chain().toggleBold().run() },
    { key: 'italic', icon: <ItalicOutlined />, tip: '斜体 ' + key('Mod+I'), on: st.italic, run: () => chain().toggleItalic().run() },
    { key: 'underline', icon: <UnderlineOutlined />, tip: '下划线 ' + key('Mod+U'), on: st.underline, run: () => chain().toggleUnderline().run() },
    ...(collab?.track ? [] : [{ key: 'strike', icon: <StrikethroughOutlined />, tip: '删除线', on: st.strike, run: () => chain().toggleStrike().run() }]),
    'sep',
    { key: 'ul', icon: <UnorderedListOutlined />, tip: '无序列表', on: st.ul, run: () => chain().toggleBulletList().run() },
    { key: 'ol', icon: <OrderedListOutlined />, tip: '有序列表', on: st.ol, run: () => chain().toggleOrderedList().run() },
    'sep',
    { key: 'undo', icon: <UndoOutlined />, tip: '撤销 ' + key('Mod+Z'), off: !st.undo, run: () => chain().undo().run() },
    { key: 'redo', icon: <RedoOutlined />, tip: '重做 ' + key(IS_MAC ? 'Mod+Shift+Z' : 'Mod+Y'), off: !st.redo, run: () => chain().redo().run() },
    'sep',
    // 表格：工具栏只管插入；加减行列在表格边上（「+」）和右键菜单里，见 TableTools
    { key: 'table', icon: <TableOutlined />, tip: '插入表格', off: st.table, run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    'grow',
    { key: 'find', icon: <SearchOutlined />, tip: '搜索 ' + key('Mod+F') + ' · 替换 ' + key(IS_MAC ? 'Mod+Shift+H' : 'Mod+H'), on: !!find, run: () => openFind(false) },
  ]
  const s = st?.search ?? { matches: [], cur: 0, query: '' }

  return (
    <div className="kbe" onKeyDownCapture={onKeyDown}>
      {readOnly && st && !find && (
        <button type="button" className="kbe-find-fab seg-tool" title={'搜索 ' + key('Mod+F')} onClick={() => openFind(false)}><SearchOutlined /></button>
      )}
      {!readOnly && st && (
        <div className="kbe-tools" onMouseDown={(e) => e.target.tagName !== 'SELECT' && e.preventDefault()}>
          <select className="seg-block" value={st.block} title="段落格式"
            onChange={(e) => {
              const v = e.target.value
              if (v === 'p') chain().setParagraph().run()
              else chain().setHeading({ level: +v[1] }).run()
            }}>
            {BLOCKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {tools.map((t, k) => t === 'sep' ? <span key={k} className="seg-sep" />
            : t === 'grow' ? <span key={k} className="seg-grow" />
            : <button key={t.key} type="button" title={t.tip} disabled={t.off}
              className={'seg-tool' + (t.on ? ' on' : '')} onClick={t.run}>{t.icon}</button>)}
        </div>
      )}
      {find && st && (
        <div className="kbe-find rise" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeFind() } }}>
          <div className="find-tabs">
            <span className={!find.replace ? 'on' : ''} onClick={() => openFind(false)}>查找</span>
            {!readOnly && <span className={find.replace ? 'on' : ''} onClick={() => openFind(true)}>替换</span>}
            <span className="seg-grow" />
            <button type="button" className="seg-tool" title="关闭 Esc" onClick={closeFind}><CloseOutlined /></button>
          </div>
          {find.replace && <div className="find-label">查找</div>}
          <div className="find-box">
            <input ref={findRef} placeholder="在文档内查找" value={s.query}
              onChange={(e) => setSearch(editor, { query: e.target.value, cur: 0 })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goMatch(e.shiftKey ? -1 : 1) } }} />
            <span className="find-n">{s.matches.length ? s.cur + 1 : 0} / {s.matches.length}</span>
          </div>
          {find.replace && (
            <>
              <div className="find-label">替换为</div>
              <div className="find-box">
                <input placeholder="请输入文字" value={rep} onChange={(e) => setRep(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(editor, rep) } }} />
              </div>
            </>
          )}
          <div className="find-btns">
            {find.replace && (
              <>
                <button type="button" className="find-btn primary" disabled={!s.matches.length} onClick={() => replaceAll(editor, rep)}>全部替换</button>
                <button type="button" className="find-btn" disabled={!s.matches.length} onClick={() => replaceOne(editor, rep)}>替换</button>
              </>
            )}
            <button type="button" className="find-btn" disabled={!s.matches.length} onClick={() => goMatch(-1)}>上一处</button>
            <button type="button" className="find-btn" disabled={!s.matches.length} onClick={() => goMatch(1)}>下一处</button>
          </div>
        </div>
      )}
      <div className="kbe-scroll" ref={scrollRef} onScroll={onScroll}>
        {toc.length >= 4 && (
          <nav className="kbe-toc" style={{ width: tocW }}>
            <div className="toc-resize" title="拖动调整宽度" onMouseDown={dragTocW}
              onDoubleClick={() => { setTocW(240); localStorage.removeItem('kb_toc_w') }} />
            <div className="toc-label">目录</div>
            {toc.map((h, k) => (
              <div key={k} className={'toc-item' + (active === k ? ' on' : '')}
                style={{ paddingLeft: 10 + (h.level - minLv) * 12 }} title={h.text} onClick={() => jump(k)}>
                {h.text}
              </div>
            ))}
          </nav>
        )}
        <div className="kbe-page" ref={pageRef}>
          {before}
          <TableTools editor={editor} pageRef={pageRef} />
          <EditorContent editor={editor} className={'md-view kbe-doc' + (collab ? ' collab' : '')} />
          {here && collab?.review && (
            <div className="tc-pop">
              <span className="tc-who" style={{ color: colorOf(here.by) }}>{here.by}</span>
              {CHANGE_LABEL[here.type]}
              <button type="button" onMouseDown={(e) => { e.preventDefault(); resolveChange(editor, here, true); setHere(null) }}>保留</button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); resolveChange(editor, here, false); setHere(null) }}>撤销</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
