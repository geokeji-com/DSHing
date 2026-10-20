import { useEffect, useRef, useState } from 'react'
import { App as AntApp, Button, Empty, Input, Popconfirm, Spin } from 'antd'
import { CheckCircleOutlined, HistoryOutlined } from '@ant-design/icons'
import { api } from './api'
import { md, outline } from './md'
import { splitFrontmatter } from './frontmatter'
import { ConfirmModal, HistoryDrawer, STATUS_TEXT } from './Versions'
import ShareButton from './ShareButton'
import { Switch } from 'antd'
import InlineDiff from './InlineDiff'

// 阅读区：默认只读预览（正文限宽、frontmatter 收进信息卡），点「编辑」才出现源码和保存
// onDirty(bool)：告诉外层有没有未保存修改，切走前由外层拦
// 知识库文件（versioned）：带确认状态 —— 未确认整页淡黄 + 右上角「历史 / 确认版本」
// onStatus(path, status)：状态变了通知外层刷新列表角标
export default function Reader({ path, deletable, onDeleted, onDirty, empty, hideMeta, onStatus, clientEdit }) {
  const { message } = AntApp.useApp()
  const [doc, setDoc] = useState(null)        // { path, content }
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(null)   // 大纲当前高亮
  const [status, setStatus] = useState(null)   // 知识库：ok / modified / new / deleted；其他文件 null
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [marks, setMarks] = useState(false)      // 正文里直接标出未确认的改动
  const [published, setPublished] = useState(null)
  const versioned = !!path && path.startsWith('知识库/')
  const changeStatus = (st) => { setStatus(st); onStatus?.(path, st) }
  const scrollRef = useRef(null)

  const dirty = doc != null && draft !== doc.content
  useEffect(() => { onDirty?.(dirty) }, [dirty])

  useEffect(() => {
    setDoc(null); setDraft(''); setEditing(false); setStatus(null); setPublished(null)
    if (!path) return
    let alive = true
    setLoading(true)
    api.file(path).then((r) => {
      if (!alive) return
      setLoading(false)
      if (r.error) { message.error(r.error); return }
      setDoc({ path, content: r.content })
      setDraft(r.content)
      setStatus(r.status ?? null)
      if (r.status === 'modified') api.kbPending(path).then((p) => alive && setPublished(p.published))
    })
    return () => { alive = false }
  }, [path])

  const save = async () => {
    if (!dirty) return
    const r = await api.save(doc.path, draft)
    if (r.ok) {
      setDoc({ path: doc.path, content: draft })
      if (r.status) changeStatus(r.status)
      message.success(r.status && r.status !== 'ok' ? '已保存，记得确认版本' : '已保存')
    } else message.error(r.error || '保存失败')
  }

  // ⌘/Ctrl + S 保存
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save() }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  })

  const doDelete = async () => {
    const r = await api.del(doc.path)
    if (!r.ok) { message.error(r.error || '删除失败'); return }
    if (r.status === 'deleted') {      // 知识库：删除待确认，留在原地显示状态
      changeStatus('deleted'); setEditing(false)
      message.success('已删除，确认后写手那边才会移除')
      return
    }
    message.success('已删除')
    onDeleted?.()
  }

  const discard = async () => {
    const r = await api.kbDiscard(doc.path)
    if (!r.ok) { message.error(r.error || '操作失败'); return }
    if (r.status == null) { message.success('已放弃'); onDeleted?.(); return }
    const f = await api.file(doc.path)
    setDoc({ path: doc.path, content: f.content }); setDraft(f.content)
    changeStatus(r.status); setEditing(false)
    message.success('已放弃未确认的修改')
  }

  const cancelEdit = () => {
    if (dirty && !window.confirm('放弃未保存的修改吗？')) return
    setDraft(doc.content); setEditing(false)
  }

  if (!path) return <div className="reader reader-empty">{empty ?? <Empty description="从左边选一个文件" image={Empty.PRESENTED_IMAGE_SIMPLE} />}</div>
  if (loading || !doc) return <div className="reader reader-empty"><Spin /></div>

  const { meta, body } = splitFrontmatter(draft)
  // 大纲：只取 h1-h3；标题太少（<4）就不显示，短文没必要
  const toc = outline(body).filter((h) => h.level <= 3)
  const showToc = toc.length >= 4
  const minLv = Math.min(...toc.map((h) => h.level))
  // 元素在滚动容器内容里的绝对位置（不依赖 offsetParent）
  const topOf = (el) => el.getBoundingClientRect().top - scrollRef.current.getBoundingClientRect().top + scrollRef.current.scrollTop
  const jump = (id) => {
    const el = scrollRef.current?.querySelector('#' + id)
    if (el) scrollRef.current.scrollTo({ top: topOf(el) - 24, behavior: 'smooth' })
  }
  const onScroll = () => {
    const box = scrollRef.current
    if (!box || !showToc) return
    let cur = null
    for (const h of toc) {
      const el = box.querySelector('#' + h.id)
      if (el && topOf(el) - box.scrollTop <= 80) cur = h.id
      else if (el) break
    }
    setActive(cur)
  }
  const fname = doc.path.split('/').pop().replace(/\.md$/i, '')
  const words = body.replace(/\s/g, '').length

  return (
    <div className={'reader' + (versioned && status && status !== 'ok' ? ' unconfirmed st-' + status : '')}>
      <div className="reader-bar">
        <div className="reader-title" title={doc.path}>
          {fname}
          <span className="reader-sub">{words >= 10000 ? (words / 10000).toFixed(1) + ' 万字' : words + ' 字'}</span>
          {versioned && status && status !== 'ok' && <span className="st-badge">{status === 'deleted' ? '删除待确认' : status === 'new' ? '未确认 · 新' : '未确认'}</span>}
        </div>
        {versioned && !editing && !/竞品/.test(fname) && status !== 'deleted' && <ShareButton path={doc.path} title={fname} />}
        {versioned && !editing && <Button type="text" icon={<HistoryOutlined />} onClick={() => setHistOpen(true)}>历史</Button>}
        {editing ? (
          <>
            <Button onClick={cancelEdit}>完成</Button>
            <Button type="primary" disabled={!dirty} onClick={save}>保存</Button>
          </>
        ) : (
          <>
            {versioned && <Button type={status && status !== 'ok' ? 'primary' : 'default'} icon={<CheckCircleOutlined />}
              className={status && status !== 'ok' ? 'btn-confirm' : ''} onClick={() => setConfirmOpen(true)}>确认版本</Button>}
            {deletable && status !== 'deleted' && (
              <Popconfirm title="确定删除这个文件吗？" description={versioned ? '先删编辑区，确认版本后写手那边才移除。' : '删除后不可恢复。'}
                okText="删除" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={doDelete}>
                <Button type="text" danger>删除</Button>
              </Popconfirm>
            )}
            {status !== 'deleted' && <Button onClick={() => setEditing(true)}>编辑</Button>}
          </>
        )}
      </div>
      {versioned && status && status !== 'ok' && (
        <div className="st-banner">
          <span>{clientEdit ? <><b>客户 {clientEdit.by.join('、')}</b> 修改了这份资料。写手现在读的还是上一次确认的版本。</> : STATUS_TEXT[status]}</span>
          {status === 'modified' && published != null && !editing && (
            <label className="st-marks"><Switch size="small" checked={marks} onChange={setMarks} /> 显示改动</label>
          )}
          <Popconfirm title={status === 'new' ? '放弃这份新资料？' : '放弃未确认的修改？'}
            description={status === 'new' ? '编辑区里的这份会被删掉。' : '回到上一次确认的版本。'}
            okText="放弃" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={discard}>
            <a className="st-discard">{status === 'deleted' ? '撤销删除' : '放弃修改'}</a>
          </Popconfirm>
        </div>
      )}
      {editing ? (
        <Input.TextArea className="md-edit" value={draft} spellCheck={false}
          onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <div className="reader-scroll" ref={scrollRef} onScroll={onScroll}>
          {showToc && (
            <nav className="toc">
              <div className="toc-label">目录</div>
              {toc.map((h) => (
                <div key={h.id} className={'toc-item' + (active === h.id ? ' on' : '')}
                  style={{ paddingLeft: 10 + (h.level - minLv) * 12 }} title={h.text} onClick={() => jump(h.id)}>
                  {h.text}
                </div>
              ))}
            </nav>
          )}
          <div className="reader-page fade-in" key={doc.path}>
            {meta.length > 0 && !hideMeta && (
              <dl className="meta-card">
                {meta.map((m) => (
                  <div key={m.key} className="meta-row"><dt>{m.key}</dt><dd>{m.value || '—'}</dd></div>
                ))}
              </dl>
            )}
            {marks && published != null && status === 'modified'
              ? <InlineDiff a={splitFrontmatter(published).body} b={body} />
              : <div className="md-view" dangerouslySetInnerHTML={{ __html: md(body) }} />}
          </div>
        </div>
      )}
      {versioned && (
        <>
          <ConfirmModal open={confirmOpen} path={doc.path} status={status} onClose={() => setConfirmOpen(false)}
            onDone={(st) => {
              setConfirmOpen(false)
              if (status === 'deleted') { onDeleted?.(); return }
              changeStatus(st)
            }} />
          <HistoryDrawer open={histOpen} path={doc.path} status={status} onClose={() => setHistOpen(false)} />
        </>
      )}
    </div>
  )
}
