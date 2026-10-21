import { useEffect, useRef, useState } from 'react'
import { PlusOutlined } from '@ant-design/icons'
import { CellSelection } from '@tiptap/pm/tables'

// 表格操作（照飞书）：鼠标移到表格上方 / 左侧边缘 → 行列分界处出现「+」，点一下在那里插入行/列；
// 右键单元格 → 插入 / 删除行列、删除表格；左上角小方块 = 选中整张表（再按退格就删掉）
export default function TableTools({ editor, pageRef }) {
  const [hov, setHov] = useState(null)     // { box, cols:[x], rows:[y], kind, k, el }
  const [menu, setMenu] = useState(null)   // { x, y }
  const hovRef = useRef(null); hovRef.current = hov

  useEffect(() => {
    const page = pageRef.current
    if (!page || !editor) return
    const rel = (r) => { const p = page.getBoundingClientRect(); return { left: r.left - p.left, top: r.top - p.top, right: r.right - p.left, bottom: r.bottom - p.top } }

    const onMove = (e) => {
      if (!editor.isEditable) { if (hovRef.current) setHov(null); return }
      if (e.target.closest?.('.tbl-ui')) return              // 在「+」上，保持不动
      const p = page.getBoundingClientRect()
      const x = e.clientX - p.left, y = e.clientY - p.top
      let found = null
      for (const el of page.querySelectorAll('.kbe-doc table')) {
        const b = rel(el.getBoundingClientRect())
        if (x >= b.left - 28 && x <= b.right + 8 && y >= b.top - 28 && y <= b.bottom + 8) { found = [el, b]; break }
      }
      if (!found) { if (hovRef.current) setHov(null); return }
      const [el, box] = found
      const firstRow = el.querySelector('tr')
      const cells = [...(firstRow?.children ?? [])]
      const cols = [box.left, ...cells.map((c) => rel(c.getBoundingClientRect()).right)]
      const rows = [box.top, ...[...el.querySelectorAll('tr')].map((r) => rel(r.getBoundingClientRect()).bottom)]
      let kind = null, k = -1
      const near = (arr, v) => arr.reduce((bi, a, i) => Math.abs(a - v) < Math.abs(arr[bi] - v) ? i : bi, 0)
      if (y < box.top && x >= box.left - 4) { kind = 'col'; k = near(cols, x) }
      else if (x < box.left && y >= box.top - 4) { kind = 'row'; k = near(rows, y) }
      setHov({ el, box, cols, rows, kind, k })
    }
    const onLeave = () => setHov(null)

    const onMenu = (e) => {
      if (!editor.isEditable) return
      const cell = e.target.closest?.('.kbe-doc td, .kbe-doc th')
      if (!cell) return
      e.preventDefault()
      // 右键处不在已选中的格子里 → 光标挪到这一格
      const sel = editor.state.selection
      const pos = editor.view.posAtDOM(cell, 0)
      const inSel = sel instanceof CellSelection && pos >= sel.from && pos <= sel.to
      if (!inSel) editor.chain().focus().setTextSelection(pos + 1).run()
      setMenu({ x: e.clientX, y: e.clientY })
    }

    const onUpdate = () => setHov(null)          // 表格变了（加减行列 / 删掉）：位置作废，等鼠标再动
    editor.on('update', onUpdate)
    page.addEventListener('mousemove', onMove)
    page.addEventListener('mouseleave', onLeave)
    page.addEventListener('contextmenu', onMenu)
    return () => {
      page.removeEventListener('mousemove', onMove)
      page.removeEventListener('mouseleave', onLeave)
      page.removeEventListener('contextmenu', onMenu)
      editor.off('update', onUpdate)
    }
  }, [editor, pageRef])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', onKey) }
  }, [menu])

  // 光标放进某一格再执行命令
  const inCell = (cellEl, cmd) => {
    if (!cellEl) return
    const pos = editor.view.posAtDOM(cellEl, 0)
    cmd(editor.chain().focus().setTextSelection(pos + 1)).run()
  }
  const insert = () => {
    const { el, kind, k } = hov
    const rows = [...el.querySelectorAll('tr')]
    if (kind === 'col') {
      const cells = [...rows[0].children]
      if (k === 0) inCell(cells[0], (c) => c.addColumnBefore())
      else inCell(cells[k - 1], (c) => c.addColumnAfter())
    } else {
      if (k === 0) inCell(rows[0].children[0], (c) => c.addRowBefore())
      else inCell(rows[k - 1].children[0], (c) => c.addRowAfter())
    }
  }
  const selectTable = () => {
    const { el } = hov
    const cells = el.querySelectorAll('td, th')
    const a = editor.view.posAtDOM(cells[0], 0), b = editor.view.posAtDOM(cells[cells.length - 1], 0)
    const $a = editor.state.doc.resolve(a), $b = editor.state.doc.resolve(b)
    const cellPos = ($p) => { for (let d = $p.depth; d > 0; d--) if (/^table(Cell|Header)$/.test($p.node(d).type.name)) return $p.before(d); return null }
    const ca = cellPos($a), cb = cellPos($b)
    if (ca == null || cb == null) return
    editor.view.focus()
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, ca, cb)))
  }

  const run = (fn) => (e) => { e.preventDefault(); setMenu(null); fn(editor.chain().focus()).run() }
  const MENU = [
    ['上方插入行', (c) => c.addRowBefore()], ['下方插入行', (c) => c.addRowAfter()],
    ['左侧插入列', (c) => c.addColumnBefore()], ['右侧插入列', (c) => c.addColumnAfter()],
    'sep',
    ['删除行', (c) => c.deleteRow()], ['删除列', (c) => c.deleteColumn()],
    'sep',
    ['删除表格', (c) => c.deleteTable(), true],
  ]

  return (
    <>
      {hov && (
        <div className="tbl-ui">
          {/* 左上角：选中整张表 */}
          <button type="button" className="tbl-grip" title="选中表格" style={{ left: hov.box.left - 22, top: hov.box.top - 22 }}
            onMouseDown={(e) => { e.preventDefault(); selectTable() }} />
          {hov.cols.map((x, i) => <span key={'c' + i} className="tbl-dot" style={{ left: x - 2, top: hov.box.top - 13 }} />)}
          {hov.rows.map((y, i) => <span key={'r' + i} className="tbl-dot" style={{ left: hov.box.left - 13, top: y - 2 }} />)}
          {hov.kind === 'col' && (
            <>
              <span className="tbl-line v" style={{ left: hov.cols[hov.k] - 1, top: hov.box.top, height: hov.box.bottom - hov.box.top }} />
              <button type="button" className="tbl-plus" title="插入列" style={{ left: hov.cols[hov.k] - 9, top: hov.box.top - 20 }}
                onMouseDown={(e) => { e.preventDefault(); insert() }}><PlusOutlined /></button>
            </>
          )}
          {hov.kind === 'row' && (
            <>
              <span className="tbl-line h" style={{ top: hov.rows[hov.k] - 1, left: hov.box.left, width: hov.box.right - hov.box.left }} />
              <button type="button" className="tbl-plus" title="插入行" style={{ top: hov.rows[hov.k] - 9, left: hov.box.left - 20 }}
                onMouseDown={(e) => { e.preventDefault(); insert() }}><PlusOutlined /></button>
            </>
          )}
        </div>
      )}
      {menu && (
        <div className="tbl-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {MENU.map((m, i) => m === 'sep' ? <div key={i} className="tbl-menu-sep" />
            : <div key={m[0]} className={'tbl-menu-item' + (m[2] ? ' danger' : '')} onMouseDown={run(m[1])}>{m[0]}</div>)}
        </div>
      )}
    </>
  )
}
