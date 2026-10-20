import { useEffect, useRef, useState } from 'react'
import { App as AntApp, Button, Input, Popconfirm, Spin, Switch } from 'antd'
import { CheckCircleOutlined, HistoryOutlined } from '@ant-design/icons'
import { api } from './api'
import { splitFrontmatter } from './frontmatter'
import { ConfirmModal, HistoryDrawer } from './Versions'
import ShareButton from './ShareButton'
import InlineDiff from './InlineDiff'
import KbEditor, { SAVE_TEXT, useKbDoc } from './KbEditor'
import ShareRound from './ShareRound'

// 客户资产的阅读区 = 直接可编辑的文档（和客户分享页同一个编辑器），自动保存
//   知识库：存进编辑区，未确认整页淡黄；右上角 分享 / 历史 / 确认版本 / 删除
//   文章 / 客户档案：直接存正式文件（没有确认流程），只有编辑器 + 删除（档案）
export default function KbReader({ path, deletable, onDeleted, onRenamed, onDirty, onStatus, clientEdit }) {
  const versioned = path.startsWith('知识库/')
  const { message } = AntApp.useApp()
  const [status, setStatus] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [marks, setMarks] = useState(null)        // 「显示改动」时：{ a: 上次确认, b: 现在 }
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [naming, setNaming] = useState(null)       // 改名中：输入框里的值
  const statusRef = useRef(null)
  const [share, setShare] = useState(null)        // /api/share 的返回（没分享 = { share: null }）
  const loadShare = () => versioned ? api.shareGet(path).then((r) => setShare(r.error ? { share: null } : r)) : setShare({ share: null })
  const changeStatus = (st) => { statusRef.current = st; setStatus(st); onStatus?.(path, st) }

  const kb = useKbDoc(
    (base, content) => api.save(path, content, base),
    (r) => {
      if (!r?.ok) { message.error(r?.error || '保存失败'); return }
      if (r.conflicts) message.warning('有人同时改了同一处，已按你的为准')
      if (versioned && r.status && r.status !== statusRef.current) changeStatus(r.status)
    },
  )

  // 自动保存，切走时没存完的会立刻存掉 —— 不需要外层拦「未保存」
  useEffect(() => { onDirty?.(false) }, [])

  useEffect(() => {
    let alive = true
    api.file(path).then((r) => {
      if (!alive) return
      if (r.error) { message.error(r.error); return }
      statusRef.current = r.status ?? null
      setStatus(r.status ?? null)
      kb.reset(r.content)
      setLoaded(true)
    })
    loadShare()
    return () => { alive = false }
  }, [path])

  // 分享出去的资料：每 4 秒看一眼这一轮的状态（客户开始改 / 提交了，我们这边要跟着切）
  useEffect(() => {
    if (!share?.share) return
    const t = setInterval(() => api.shareGet(path).then((r) => {
      if (r.error) return
      setShare((old) => JSON.stringify(old) === JSON.stringify(r) ? old : r)
    }), 4000)
    return () => clearInterval(t)
  }, [share?.share?.id])

  // 定稿后：重新读编辑区内容 + 分享状态
  const afterRound = async (what) => {
    await loadShare()
    if (what === 'done') {
      const f = await api.file(path)
      kb.reset(f.content); changeStatus(f.status ?? null)
    }
  }

  if (!loaded || !share) return <div className="reader reader-empty"><Spin /></div>
  // 这一轮有人动过笔（客户编辑中 / 已提交）→ 协同视图；还没人动笔 = 照常编辑
  const roundOn = !!share.share && !!share.round && share.round.initialized && share.round.state !== 'open'
  const clientHolds = !!share.share && !share.share.locked && share.round?.state !== 'submitted'

  const cur = kb.baseRef.current ?? ''
  const { meta, body } = splitFrontmatter(cur)
  const fname = path.split('/').pop().replace(/\.md$/i, '')
  const words = body.replace(/\s/g, '').length
  const pending = versioned && status && status !== 'ok'

  // 删除：直接生效，不进历史。还在分享的知识库，弹窗里一起把客户链接关掉
  const doDelete = async () => {
    await kb.flush()
    if (share.share) {
      const c = await api.shareClose(share.share.id)
      if (c.error) { message.error(c.error); return }
    }
    const r = await api.del(path)
    if (!r.ok) { message.error(r.error || '删除失败'); return }
    message.success('已删除')
    onDeleted?.()
  }

  // 改名：点标题直接改，回车 / 失焦生效；不进历史、不用确认
  const doRename = async () => {
    const name = (naming ?? '').trim()
    setNaming(null)
    if (!name || name === fname) return
    await kb.flush()
    const r = await api.rename(path, name)
    if (!r.ok) { message.error(r.error || '改名失败'); return }
    onRenamed?.(r.path)
  }
  const canRename = deletable && !share.share
  const discard = async () => {
    const r = await api.kbDiscard(path)
    if (!r.ok) { message.error(r.error || '操作失败'); return }
    if (r.status == null) { message.success('已放弃'); onDeleted?.(); return }
    const f = await api.file(path)
    kb.reset(f.content); setMarks(null)
    changeStatus(r.status)
    message.success('已放弃')
  }
  const openConfirm = async () => { await kb.flush(); setConfirmOpen(true) }
  const toggleMarks = async (on) => {
    if (!on) { setMarks(null); return }
    await kb.flush()
    const p = await api.kbPending(path)
    setMarks({ a: splitFrontmatter(p.published ?? '').body, b: splitFrontmatter(p.edit ?? '').body })
  }

  const metaCard = meta.length > 0 && (
    <dl className="meta-card">
      {meta.map((m) => <div key={m.key} className="meta-row"><dt>{m.key}</dt><dd>{m.value || '—'}</dd></div>)}
    </dl>
  )

  return (
    <div className={'reader' + (pending ? ' unconfirmed st-' + status : '')}>
      <div className="reader-bar">
        <div className="reader-title" title={path}>
          {naming != null
            ? <Input size="small" className="title-input" value={naming} autoFocus maxLength={80}
                onChange={(e) => setNaming(e.target.value)} onBlur={doRename}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); if (e.key === 'Escape') setNaming(null) }} />
            : <span className={canRename ? 'title-name editable' : 'title-name'} title={canRename ? '点击改名' : share.share ? '分享中，不能改名' : path}
                onClick={() => canRename && setNaming(fname)}>{fname}</span>}
          <span className="reader-sub">{words >= 10000 ? (words / 10000).toFixed(1) + ' 万字' : words + ' 字'}</span>
          {pending && <span className="st-badge">{status === 'deleted' ? '删除待确认'
            : clientEdit ? '未确认 · ' + clientEdit.by.join('、') : status === 'new' ? '未确认 · 新' : '未确认'}</span>}
          {pending && status === 'modified' && (
            <label className="st-marks"><Switch size="small" checked={!!marks} onChange={toggleMarks} />改动</label>
          )}
          {pending && (
            <Popconfirm title={status === 'deleted' ? '撤销删除？' : status === 'new' ? '放弃这份新资料？' : '放弃未确认的修改？'}
              okText="确定" okButtonProps={{ danger: status !== 'deleted' }} cancelText="取消" onConfirm={discard}>
              <a className="st-discard">{status === 'deleted' ? '撤销' : '放弃'}</a>
            </Popconfirm>
          )}
        </div>
        {status !== 'deleted' && !roundOn && <span className={'save-st' + (kb.state === 'error' ? ' error' : '')}>{SAVE_TEXT[kb.state]}</span>}
        {versioned && !/竞品/.test(fname) && status !== 'deleted' && <ShareButton path={path} title={fname} share={share} dirty={status !== 'ok'} onChange={(r) => r.share === null ? setShare({ share: null }) : setShare(r)} />}
        {versioned && <Button type="text" icon={<HistoryOutlined />} onClick={() => setHistOpen(true)}>历史</Button>}
        {versioned && !roundOn && <Button type={pending ? 'primary' : 'default'} icon={<CheckCircleOutlined />}
          className={pending ? 'btn-confirm' : ''} onClick={openConfirm} disabled={clientHolds && !!share.round?.initialized}>确认版本</Button>}
        {deletable && (
          <Popconfirm title="删除这个文件？" description={share.share ? '客户链接会一起关闭' : '删除后不可恢复'}
            okText={share.share ? '关闭链接并删除' : '删除'} okButtonProps={{ danger: true }} cancelText="取消" onConfirm={doDelete}>
            <Button type="text" danger>删除</Button>
          </Popconfirm>
        )}
      </div>
      {roundOn ? (
        <ShareRound path={path} share={share} base={cur} onFinalized={afterRound} onConfirm={() => setConfirmOpen(true)} />
      ) : marks ? (
        <div className="kbe-scroll"><div className="kbe-page fade-in">{metaCard}<InlineDiff a={marks.a} b={marks.b} /></div></div>
      ) : (
        <KbEditor key={status === 'deleted' ? 'ro' : 'rw'} doc={kb} readOnly={status === 'deleted' || (clientHolds && !!share.round?.initialized)} before={metaCard} />
      )}
      {versioned && <ConfirmModal open={confirmOpen} path={path} status={status} onClose={() => setConfirmOpen(false)}
        onDone={(st) => {
          setConfirmOpen(false); setMarks(null)
          if (status === 'deleted') { onDeleted?.(); return }
          changeStatus(st)
        }} />}
      {versioned && <HistoryDrawer open={histOpen} path={path} status={status} onClose={() => setHistOpen(false)} />}
    </div>
  )
}
