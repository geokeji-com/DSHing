import { useEffect, useMemo, useState } from 'react'
import { App as AntApp, Drawer, Empty, Input, Modal, Spin, Switch } from 'antd'
import { api } from './api'
import { md } from './md'
import { splitFrontmatter } from './frontmatter'
import { diffStat, foldDiff, lineDiff } from './diff'

const fmtTime = (iso) => {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 状态提示条（淡黄）：放在阅读区顶部
export const STATUS_TEXT = {
  modified: '有未确认的修改。写手现在读的还是上一次确认的版本。',
  new: '新资料，还没确认过。写手现在看不到这份。',
  deleted: '已删除，待确认。确认后这份资料会从写手那边移除。',
}

// ---------- 确认版本 ----------
export function ConfirmModal({ open, path, status, onClose, onDone }) {
  const { message } = AntApp.useApp()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [stat, setStat] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(''); setNote(''); setStat(null)
    api.kbPending(path).then((r) => setStat(diffStat(r.published, r.edit)))
  }, [open, path])

  const submit = async () => {
    setBusy(true)
    const r = await api.kbConfirm(path, name, note)
    setBusy(false)
    if (!r.ok) { message.error(r.error || '确认失败'); return }
    message.success('已确认')
    onDone(r.status)
  }

  const changeText = status === 'deleted' ? '移除这份资料'
    : status === 'new' ? '新资料'
    : !stat ? '…'
    : stat.added + stat.removed === 0 ? '无变化'
    : <><span className="plus">+{stat.added}</span> <span className="minus">−{stat.removed}</span> 行</>

  return (
    <Modal title="确认版本" open={open} onCancel={onClose} onOk={submit} okText="确认" cancelText="取消"
      confirmLoading={busy} destroyOnClose>
      <div className="fld-label">名称</div>
      <Input placeholder="例：二期 · 续约" value={name}
        onChange={(e) => setName(e.target.value)} maxLength={40} />   {/* 回车不提交：中文输入法按回车上屏时会误触确认 */}
      <div className="fld-label">备注</div>
      <Input.TextArea value={note} autoSize={{ minRows: 2, maxRows: 4 }}
        onChange={(e) => setNote(e.target.value)} maxLength={300} />
      <div className="confirm-stat">改动　{changeText}</div>
    </Modal>
  )
}

// ---------- 历史 ----------
export function HistoryDrawer({ open, path, status, onClose }) {
  const [versions, setVersions] = useState(null)
  const [sel, setSel] = useState(null)            // 'pending' | sha
  const [view, setView] = useState(null)          // { content, prev }
  const [showDiff, setShowDiff] = useState(true)

  useEffect(() => {
    if (!open) return
    setVersions(null); setView(null)
    api.kbHistory(path).then((r) => {
      const vs = r.versions ?? []
      setVersions(vs)
      setSel(status && status !== 'ok' ? 'pending' : vs[0]?.sha ?? null)
    })
  }, [open, path])

  useEffect(() => {
    if (!open || !sel) return
    setView(null)
    if (sel === 'pending') api.kbPending(path).then((r) => setView({ content: r.edit, prev: r.published }))
    else api.kbVersion(path, sel).then((r) => setView(r))
  }, [sel, open])

  const cur = versions?.find((v) => v.sha === sel)
  const canDiff = view && view.prev != null && !(cur?.initial)

  return (
    <Drawer open={open} onClose={onClose} width="min(1100px, 92vw)" title="历史" destroyOnClose
      styles={{ body: { padding: 0, display: 'flex' } }}>
      <div className="hist-view">
        {!view ? <div className="reader-empty" style={{ display: 'flex', flex: 1 }}><Spin /></div> : (
          <>
            <div className="hist-bar">
              <span className="hist-bar-title">{sel === 'pending' ? '当前（未确认）' : cur?.name}</span>
              {canDiff && <label className="hist-toggle"><Switch size="small" checked={showDiff} onChange={setShowDiff} /> 显示改动</label>}
            </div>
            <div className="hist-scroll">
              {view.content == null ?  <Empty description="已删除" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                : canDiff && showDiff ? <DiffView a={view.prev} b={view.content} />
                : <div className="reader-page"><div className="md-view" dangerouslySetInnerHTML={{ __html: md(splitFrontmatter(view.content).body) }} /></div>}
            </div>
          </>
        )}
      </div>
      <div className="hist-list">
        {!versions ? <Spin /> : (
          <>
            {status && status !== 'ok' && (
              <div className={'hist-item pending' + (sel === 'pending' ? ' on' : '')} onClick={() => setSel('pending')}>
                <span className="hist-dot hollow" />
                <div className="hist-main">
                  <div className="hist-name">当前（未确认）</div>
                </div>
              </div>
            )}
            {versions.map((v) => (
              <div key={v.sha} className={'hist-item' + (sel === v.sha ? ' on' : '')} onClick={() => setSel(v.sha)}>
                <span className="hist-dot" />
                <div className="hist-main">
                  <div className="hist-name">{v.name}</div>
                  <div className="hist-meta">
                    {fmtTime(v.date)} · {v.author}
                    {!v.initial && (v.added + v.removed === 0
                      ? <span className="hist-nochange">内容无变化</span>
                      : <> · <span className="plus">+{v.added}</span> <span className="minus">−{v.removed}</span></>)}
                  </div>
                  {v.note && <div className="hist-note">{v.note}</div>}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </Drawer>
  )
}

function DiffView({ a, b }) {
  const rows = useMemo(() => foldDiff(lineDiff(a, b), 3), [a, b])
  if (!rows.some((r) => r.type === 'add' || r.type === 'del'))
    return <Empty description="无变化" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  return (
    <div className="diff">
      {rows.map((r, k) => r.type === 'gap'
        ? <div key={k} className="diff-gap">⋯ {r.n} 行没变</div>
        : <div key={k} className={'diff-row ' + r.type}><span className="diff-sign">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ''}</span>{r.text || ' '}</div>)}
    </div>
  )
}
