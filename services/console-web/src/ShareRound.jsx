import { useEffect, useState } from 'react'
import { App as AntApp, Button, Modal, Spin } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'
import { api } from './api'
import KbEditor from './KbEditor'
import { useCollab } from './collab'
import { acceptAll, changesByAuthor, colorOf, listChanges } from './trackchanges'
import { htmlToMd, mergeBack } from './htmlmd'
import { splitFrontmatter } from './frontmatter'
import Avatar from './Avatar'

// 控制台里「分享出去的资料」的这一轮修改：
//   客户编辑中 → 我们只读看着（实时）
//   客户已提交 → 我们带着彩色修订痕迹正常编辑；点「确认版本」= 定稿（还有痕迹先弹窗）→ 写进编辑区 → 原来的确认弹窗
export default function ShareRound({ path, share, base, onFinalized, onConfirm }) {
  const { message, modal } = AntApp.useApp()
  const [editor, setEditor] = useState(null)
  const [people, setPeople] = useState([])
  const [, setTick] = useState(0)
  const submitted = share.round?.state === 'submitted'
  const col = useCollab(share.share.id, { key: share.staffKey, doc: share.round?.doc, onMessage: (m) => { if (m.type === 'round') onFinalized?.('refresh') } })

  useEffect(() => {
    if (!col.provider) return
    const aw = col.provider.awareness
    const read = () => setPeople([...new Set([...aw.getStates().values()].map((s) => s.user?.name).filter(Boolean))])
    aw.on('change', read); read()
    return () => aw.off('change', read)
  }, [col.provider])

  // 每次改动后刷新顶栏的修订计数
  useEffect(() => {
    if (!editor) return
    const f = () => setTick((t) => t + 1)
    editor.on('update', f)
    return () => { editor.off('update', f) }
  }, [editor])

  // 定稿：痕迹处理掉 → 转回 Markdown（没改的行保留原文）→ 交给服务端写进编辑区
  const finalize = async () => {
    acceptAll(editor)
    const { body } = splitFrontmatter(base)
    const fm = base.slice(0, base.length - body.length)
    const content = fm + mergeBack(body, htmlToMd(editor.getHTML()))
    const r = await api.shareFinalize(share.share.id, content)
    if (!r.ok) { message.error(r.error || '定稿失败'); return false }
    return true
  }

  const confirm = () => {
    const left = listChanges(editor.state.doc, editor.schema).length
    const go = async () => { if (await finalize()) { onFinalized?.('done'); onConfirm?.() } }
    if (!left) { go(); return }
    modal.confirm({
      title: `还有 ${left} 处修订未处理`, icon: null,
      okText: '按当前确认', cancelText: '去处理',
      onOk: go,
      onCancel: () => {
        const first = listChanges(editor.state.doc, editor.schema)[0]
        if (first) editor.chain().focus().setTextSelection(first.from).scrollIntoView().run()
      },
    })
  }

  if (!col.ydoc) return <div className="reader reader-empty"><Spin /></div>
  const stats = editor ? changesByAuthor(editor.state.doc, editor.schema) : []

  return (
    <>
      <div className="round-bar">
        <span className="round-state">{submitted ? `已提交 · ${share.round.submittedBy ?? ''}` : '客户编辑中'}</span>
        {stats.map((x) => <span key={x.by} className="round-who"><span className="dot" style={{ background: colorOf(x.by) }} />{x.by} · 修改 {x.n} 处</span>)}
        <span className="round-grow" />
        <div className="share-people">
          {people.map((p) => <span key={p} className="person" title={p}><Avatar name={p} size={24} radius={12} /></span>)}
        </div>
        {submitted && <Button type="primary" icon={<CheckCircleOutlined />} className="btn-confirm" onClick={confirm} disabled={!editor}>确认版本</Button>}
      </div>
      <KbEditor key={share.share.id + (submitted ? ':rw' : ':ro')}
        collab={{ provider: col.provider, ydoc: col.ydoc, user: { name: share.staffName }, caret: false, track: false, review: submitted }}
        readOnly={!submitted} onEditor={setEditor} />
    </>
  )
}
