import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp, Button, Drawer, Input, Spin } from 'antd'
import { HistoryOutlined, LockOutlined } from '@ant-design/icons'
import Avatar from './Avatar'
import { md } from './md'
import { splitFrontmatter } from './frontmatter'
import KbEditor from './KbEditor'
import { useCollab } from './collab'
import { changesByAuthor, colorOf } from './trackchanges'

// 客户看到的分享页：只有这一份资料，多人实时一起改，修订痕迹按人上色；改完由任意一人提交一次，提交后锁住。
const api = (id, op, body) => fetch(`/api/s/${id}/${op}`, body === undefined ? {} : {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }))

export default function SharePage({ id }) {
  const [meta, setMeta] = useState(null)
  useEffect(() => { api(id, 'meta').then(setMeta) }, [id])
  // 标签页标题 = 资料名（不带「资料台」，客户看不到我们内部的叫法）
  useEffect(() => { document.title = meta?.title || '' }, [meta?.title])

  if (!meta) return <div className="share-center"><Spin /></div>
  if (meta.error) return <div className="share-center"><div className="share-gone">链接已失效</div></div>
  if (!meta.me) return <Gate id={id} meta={meta} onIn={() => api(id, 'meta').then(setMeta)} />
  return <Doc id={id} meta={meta} />
}

function Gate({ id, meta, onIn }) {
  const { message } = AntApp.useApp()
  const [pw, setPw] = useState('')
  const [name, setName] = useState(localStorage.getItem('share_name') || '')
  const go = async () => {
    if (!name.trim()) { message.warning('请填称呼'); return }
    const r = await api(id, 'login', { password: pw, name })
    if (!r.ok) { message.error(r.error || '进不去'); return }
    localStorage.setItem('share_name', name.trim())
    onIn()
  }
  return (
    <div className="share-center">
      <div className="gate rise">
        <Avatar name={meta.client} size={56} />
        <div className="gate-title">{meta.title}</div>
        <div className="gate-sub">{meta.client}</div>
        <Input size="large" prefix={<LockOutlined />} placeholder="访问密码" value={pw}
          onChange={(e) => setPw(e.target.value)} onPressEnter={go} autoFocus />
        <Input size="large" placeholder="你的称呼" value={name}
          onChange={(e) => setName(e.target.value)} onPressEnter={go} maxLength={20} />
        <Button type="primary" size="large" block onClick={go}>进入</Button>
      </div>
    </div>
  )
}

function Doc({ id, meta }) {
  const { message, modal } = AntApp.useApp()
  const [st, setSt] = useState(null)              // /state 的返回
  const [people, setPeople] = useState([])
  const [verOpen, setVerOpen] = useState(false)
  const [editor, setEditor] = useState(null)
  const seeded = useRef(false)

  const refresh = () => api(id, 'state').then((r) => { if (!r.error) setSt(r) })
  useEffect(() => { refresh() }, [id])

  const live = !!st?.round && !st.locked && st.round.state !== 'submitted'
  const col = useCollab(id, { doc: st?.round?.doc, enabled: !!st?.round, onMessage: (m) => { if (m.type === 'round') refresh() } })

  // 在线的人：协同的 awareness
  useEffect(() => {
    if (!col.provider) return
    const aw = col.provider.awareness
    const read = () => setPeople([...new Set([...aw.getStates().values()].map((s) => s.user?.name).filter(Boolean))])
    aw.on('change', read); read()
    return () => aw.off('change', read)
  }, [col.provider])

  // 这一轮的协同草稿还是空的、而且轮到我：把最新内容灌进去（一轮只灌一次，不留痕）
  useEffect(() => {
    if (!editor || !col.synced || !st?.round?.initMe || seeded.current) return
    seeded.current = true
    if (!editor.state.doc.textContent.trim()) {
      editor.chain().setMeta('trackChanges$', true).setContent(md(splitFrontmatter(st.seed ?? '').body)).run()
    }
    // 等灌进去的内容真正到了服务端再报「灌好了」，否则服务端会把灌草稿当成这个人在改
    const done = () => api(id, 'inited', {}).then(refresh)
    const p = col.provider
    if (!p?.hasUnsyncedChanges) { done(); return }
    const f = ({ number }) => { if (number === 0) { p.off('unsyncedChanges', f); done() } }
    p.on('unsyncedChanges', f)
  }, [col.synced, st?.round?.initMe, editor])

  // 别人在灌草稿时稍等
  useEffect(() => {
    if (!st?.round || st.round.initialized) return
    const t = setTimeout(refresh, 1500)
    return () => clearTimeout(t)
  }, [st])

  const submit = () => {
    const stats = editor ? changesByAuthor(editor.state.doc, editor.schema) : []
    const total = stats.reduce((s, x) => s + x.n, 0)
    const others = people.filter((p) => p !== meta.me)
    modal.confirm({
      title: '提交这一轮修改？',
      icon: null,
      content: (
        <div className="submit-sum">
          <div>{total ? `共 ${total} 处` : '没有修改'}</div>
          {stats.map((x) => <div key={x.by}><span className="dot" style={{ background: colorOf(x.by) }} />{x.by} · 修改 {x.n} 处</div>)}
          {others.length > 0 && <div className="submit-warn">{others.join('、')} 还在线</div>}
        </div>
      ),
      okText: '提交', cancelText: '取消',
      onOk: async () => {
        // 把还没同步出去的字先发完
        col.provider?.forceSync?.()
        await new Promise((r) => setTimeout(r, 400))
        const r = await api(id, 'submit', {})
        if (!r.ok) { message.warning(r.error || '提交失败'); refresh(); return }
        message.success('已提交')
        refresh()
      },
    })
  }

  if (!st) return <div className="share-center"><Spin /></div>

  const label = st.round?.state === 'submitted'
    ? `已提交${st.round.submittedBy ? ' · ' + st.round.submittedBy : ''}`
    : st.locked ? '已确认' : null
  const waiting = st.round && !st.round.initialized && !st.round.initMe

  return (
    <div className="share">
      <header className="share-top">
        <Avatar name={meta.client} size={30} />
        <div className="share-title">{meta.title}<span>{meta.client}</span></div>
        {label && <span className="share-state">{label}</span>}
        <div className="share-people">
          {people.map((p) => (
            <span key={p} className={'person' + (p === meta.me ? ' me' : '')} title={p + (p === meta.me ? '（你）' : '')}>
              <Avatar name={p} size={26} radius={13} />
            </span>
          ))}
        </div>
        <Button type="text" icon={<HistoryOutlined />} onClick={() => setVerOpen(true)}>版本</Button>
        {live && <Button type="primary" onClick={submit}>提交</Button>}
      </header>

      {waiting || (st.round && !col.ydoc)
        ? <div className="share-center"><Spin /></div>
        : st.round
          ? <KbEditor key={id} collab={{ provider: col.provider, ydoc: col.ydoc, user: { name: meta.me }, track: true }}
              readOnly={!live} onEditor={setEditor} />
          : <PublishedView text={st.published} />}

      <Versions id={id} open={verOpen} onClose={() => setVerOpen(false)} />
    </div>
  )
}

/** 锁定、没有进行中的一轮：只读看最新确认版（和编辑时同一套排版、带目录） */
function PublishedView({ text }) {
  const doc = useMemo(() => ({ baseRef: { current: text ?? '' }, rev: 0, onEdit: () => {} }), [text])
  return <KbEditor key={text?.length} doc={doc} readOnly />
}

/** 确认过的版本（干净内容） */
function Versions({ id, open, onClose }) {
  const [list, setList] = useState(null)
  const [sel, setSel] = useState(null)
  const [text, setText] = useState(null)
  useEffect(() => {
    if (!open) return
    api(id, 'versions').then((r) => { setList(r.versions ?? []); setSel(r.versions?.[0]?.sha ?? null) })
  }, [open])
  useEffect(() => {
    if (!sel) return
    setText(null)
    fetch(`/api/s/${id}/version?sha=${sel}`).then((r) => r.json()).then((r) => setText(r.content ?? ''))
  }, [sel])
  const fmt = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
  return (
    <Drawer open={open} onClose={onClose} width="min(1000px, 92vw)" title="版本" destroyOnClose
      styles={{ body: { padding: 0, display: 'flex' } }}>
      <div className="hist-view">
        <div className="hist-scroll">
          {text == null ? <div className="share-center"><Spin /></div>
            : <div className="reader-page"><div className="md-view" dangerouslySetInnerHTML={{ __html: md(splitFrontmatter(text).body) }} /></div>}
        </div>
      </div>
      <div className="hist-list">
        {(list ?? []).map((v) => (
          <div key={v.sha} className={'hist-item' + (sel === v.sha ? ' on' : '')} onClick={() => setSel(v.sha)}>
            <span className="hist-dot" />
            <div className="hist-main"><div className="hist-name">{v.name}</div><div className="hist-meta">{fmt(v.date)}</div></div>
          </div>
        ))}
      </div>
    </Drawer>
  )
}
