import { useEffect, useRef, useState } from 'react'
import { App as AntApp, Button, Empty, Input, Modal, Segmented, Select, Upload } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { api } from './api'
import Reader from './Reader'
import KbReader from './KbReader'
import Avatar from './Avatar'
import Cover from './Cover'
import { fileKind, fmtChars, fmtDate } from './skillMeta'

const TABS = [
  { value: 'knowledge', label: '知识库' },
  { value: 'articles', label: '文章' },
  { value: 'archives', label: '档案' },
]

// 多品线示意（只改展示、不动文件）：文件名形如「<品线>竞品知识库」且品线 ≠ 客户名，
// 就归到这个品线组，组内只显示「竞品知识库」。同一客户推断出 ≥2 条品线才分组，
// 单品线客户（如「杭州民师竞品知识库」）保持平铺。多品线的正式规范以后再定。
function inferLine(n, client) {
  const m = /^(.+?)[-_｜|·\s]*(竞品知识库|竞品库|竞品)$/.exec(n.title)
  if (!m || m[1] === client || client.startsWith(m[1]) || m[1].startsWith(client)) return n
  return { ...n, line: m[1], short: m[2] }
}

// 客户资产：左 客户列表 ｜ 中 这个客户某类资产的文件列表 ｜ 右 阅读区
/** 可拖动的列宽：拖右边那条线，记在本机；双击恢复默认 */
function useColWidth(key, def, min, max) {
  const [w, setW] = useState(() => Math.min(max, Math.max(min, +localStorage.getItem(key) || def)))
  const drag = (e) => {
    e.preventDefault()
    const x0 = e.clientX, w0 = w
    let cur = w0
    const move = (ev) => { cur = Math.min(max, Math.max(min, w0 + ev.clientX - x0)); setW(cur) }
    const up = () => {
      localStorage.setItem(key, String(Math.round(cur)))
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up)
      document.body.classList.remove('col-resizing')
    }
    document.body.classList.add('col-resizing')
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }
  const reset = () => { setW(def); localStorage.removeItem(key) }
  return [w, drag, reset]
}

export default function Clients({ tree, reload, guardDirty, onDirty }) {
  const { message } = AntApp.useApp()
  const [wClients, dragClients, resetClients] = useColWidth('col_clients_w', 200, 150, 360)
  const [wFiles, dragFiles, resetFiles] = useColWidth('col_files_w', 280, 200, 520)
  const [client, setClient] = useState(null)
  const [tab, setTab] = useState('knowledge')
  const [path, setPath] = useState(null)

  const clients = tree?.clients ?? []
  useEffect(() => {
    if (!clients.some((c) => c.name === client)) setClient(clients[0]?.name ?? null)
  }, [tree])

  // 换客户 / 换页签 = 换了一批文件，阅读区一定跟着清空（避免左右对不上）
  const go = (fn) => { if (guardDirty()) { onDirty(false); setPath(null); fn() } }

  const cur = clients.find((c) => c.name === client)
  const notes = !cur ? [] : cur[tab] ?? []

  // ---------- 上传知识文档 ----------
  const [upOpen, setUpOpen] = useState(false)
  const [upClient, setUpClient] = useState(null)
  const [upNewClient, setUpNewClient] = useState('')
  const [upLine, setUpLine] = useState('')
  const [upFiles, setUpFiles] = useState([])
  const uidRef = useRef(0)

  const openUpload = () => {
    setUpClient(client ?? '__new__'); setUpNewClient(''); setUpLine(''); setUpFiles([])
    setUpOpen(true)
  }
  const doUpload = async () => {
    const useClient = upClient === '__new__' ? upNewClient.trim() : upClient
    if (!useClient) { message.warning('请填写客户名'); return }
    if (!upFiles.length) { message.warning('请选择要上传的 .md 文件'); return }
    const files = []
    for (const { file } of upFiles) files.push({ name: file.name, content: await file.text() })
    const send = (ov) => api.upload(useClient, upLine.trim(), ov, files)
    let r = await send(false)
    if (r.error === '同名文件已存在' && window.confirm('同名文件已存在：\n' + r.exists.join('、') + '\n覆盖吗？')) r = await send(true)
    if (!r.ok) { message.error(r.error || '上传失败'); return }
    setUpOpen(false)
    await reload()
    go(() => { setClient(useClient); setTab('knowledge') })
    message.success('已上传 ' + r.written.length + ' 个文件')
  }

  // ---------- 新建档案文档 ----------
  const [archOpen, setArchOpen] = useState(false)
  const [archName, setArchName] = useState('客户偏好.md')
  const newArchiveDoc = async () => {
    const name = (archName || '').trim()
    if (!client || !name) return
    if (!/\.md$/i.test(name)) { message.warning('文件名要以 .md 结尾'); return }
    const p = '客户档案/' + client + '/' + name
    const ex = await api.file(p)
    if (ex.content != null && !window.confirm('「' + name + '」已存在，覆盖吗？')) return
    const tpl = `# ${client} · ${name.replace(/\.md$/i, '')}\n\n` +
      `## 硬性要求\n\n-（例：无论什么类型的文章，正文必须提到「××奖」至少一次）\n\n` +
      `## 表达偏好\n\n-\n`
    const r = await api.save(p, tpl)
    if (!r.ok) { message.error(r.error || '创建失败'); return }
    setArchOpen(false); setArchName('客户偏好.md')
    await reload()
    setPath(p)
  }

  // ---------- 中栏列表：按业务线 / 入库日期分组 ----------
  const groups = (() => {
    if (tab === 'articles' && notes.some((n) => n.date)) {
      const m = new Map()
      for (const n of notes) { const k = n.date || '未知日期'; if (!m.has(k)) m.set(k, []); m.get(k).push(n) }
      return [...m.entries()].sort((a, b) => a[0] === '未知日期' ? 1 : b[0] === '未知日期' ? -1 : b[0].localeCompare(a[0]))
    }
    if (tab === 'knowledge') {
      const withLine = notes.map((n) => n.line ? { ...n, short: n.title } : inferLine(n, client))
      const lines = [...new Set(withLine.filter((n) => n.line).map((n) => n.line))]
      if (lines.length >= 2 || notes.some((n) => n.line)) {
        const out = []
        const root = withLine.filter((n) => !n.line)
        if (root.length) out.push(['品牌通用', root])
        for (const ln of lines.sort((a, b) => a.localeCompare(b, 'zh')))
          out.push([ln, withLine.filter((n) => n.line === ln)])
        return out
      }
    }
    return [[null, notes]]
  })()

  // 封面要的品线：知识库按同一套推断规则
  const kbLines = !cur ? [] : [...new Set(cur.knowledge.map((n) => n.line || inferLine(n, client).line).filter(Boolean))]

  const pendingOf = (c) => c.knowledge.filter((n) => n.status && n.status !== 'ok').length
  const submittedOf = (c) => c.knowledge.filter((n) => n.round?.state === 'submitted').length

  const emptyText = {
    knowledge: '还没有资料',
    articles: '还没有文章',
    archives: '还没有档案',
  }[tab]

  return (
    <div className="three">
      <nav className="col-clients" style={{ width: wClients }}>
        <div className="col-resize" title="拖动调整宽度" onMouseDown={dragClients} onDoubleClick={resetClients} />
        <div className="col-head">
          <span>客户</span>
          <Button type="text" size="small" icon={<PlusOutlined />} title="上传知识文档（可新建客户）" onClick={openUpload} />
        </div>
        <div className="col-scroll">
          {clients.map((c) => (
            <div key={c.name} className={'client' + (c.name === client ? ' on' : '')}
              onClick={() => c.name !== client && go(() => setClient(c.name))}>
              <span className="avatar-wrap">
                <Avatar name={c.name} size={26} />
                {submittedOf(c) > 0
                  ? <span className="avatar-badge by-client" title={submittedOf(c) + ' 份客户已提交'}>{submittedOf(c)}</span>
                  : pendingOf(c) > 0 && <span className="avatar-badge" title={pendingOf(c) + ' 份未确认'}>{pendingOf(c)}</span>}
              </span>
              <span className="client-name">{c.name}</span>
              <span className="client-n">{c.knowledge.length + c.articles.length + c.archives.length || ''}</span>
            </div>
          ))}
        </div>
      </nav>

      <div className="col-files" style={{ width: wFiles }}>
        <div className="col-resize" title="拖动调整宽度" onMouseDown={dragFiles} onDoubleClick={resetFiles} />
        <div className="files-head">
          <div className={'files-client' + (path ? ' link' : '')} title={path ? '回到客户封面' : undefined}
            onClick={() => path && guardDirty() && (onDirty(false), setPath(null))}>{client ?? '—'}</div>
          <Segmented block size="small" value={tab} onChange={(v) => go(() => setTab(v))}
            options={TABS.map((t) => ({ ...t, label: `${t.label} ${cur?.[t.value]?.length ?? 0}` }))} />
        </div>
        <div className="col-scroll">
          {notes.length === 0 ? (
            <Empty className="files-empty" image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ whiteSpace: 'pre-wrap' }}>{emptyText}</span>} />
          ) : groups.map(([label, items]) => (
            <div key={label ?? '_'} className="file-group">
              {label && <div className="group-label">{label}<span className="group-n">{items.length}</span></div>}
              {items.map((n) => (
                <div key={n.path} className={'file' + (path === n.path ? ' on' : '') + (n.status && n.status !== 'ok' ? ' st-' + n.status : '')} title={n.title}
                  onClick={() => n.path !== path && guardDirty() && (onDirty(false), setPath(n.path))}>
                  <FileKind title={n.title} tab={tab} />
                  <span className="file-main">
                    <span className="file-title">{n.short ?? n.title}</span>
                    <span className="file-meta">
                      {n.round?.state === 'submitted' && <span className="st-tag by-client">客户已提交</span>}
                      {n.round?.state !== 'submitted' && n.status && n.status !== 'ok' && <span className={'st-tag' + (n.clientEdit ? ' by-client' : '')}>{n.clientEdit ? '客户修改 · ' + n.clientEdit.by[0] : n.status === 'deleted' ? '删除待确认' : n.status === 'new' ? '未确认 · 新' : '未确认'}</span>}
                      {fmtChars(n.chars)}{n.updated && ' · ' + fmtDate(n.updated)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="files-foot">
          {tab === 'knowledge' && <Button block icon={<PlusOutlined />} onClick={openUpload}>上传知识文档</Button>}
          {tab === 'archives' && client && <Button block icon={<PlusOutlined />} onClick={() => setArchOpen(true)}>新建档案文档</Button>}
        </div>
      </div>

      <div className="col-reader">
        {!path && cur ? (
          <Cover key={cur.name} client={cur} lines={kbLines} pending={pendingOf(cur)}
            onTab={(k) => go(() => setTab(k))}
            onOpen={(n, t) => { setTab(t); setPath(n.path) }} />
        ) : path ? <KbReader key={path} path={path} onDirty={onDirty} onStatus={() => reload()}
          clientEdit={cur?.knowledge.find((n) => n.path === path)?.clientEdit ?? null}
          deletable={!path.startsWith('文章库/')}
          onDeleted={async () => { onDirty(false); setPath(null); await reload() }}
          onRenamed={async (p) => { onDirty(false); await reload(); setPath(p) }} />
        : <Reader key={path ?? 'none'} path={path} onDirty={onDirty} onStatus={() => reload()}
          deletable={!!path && (path.startsWith('知识库/') || path.startsWith('客户档案/'))}
          onDeleted={async () => { onDirty(false); setPath(null); await reload() }} />}
      </div>

      <Modal title="上传知识文档" open={upOpen} onOk={doUpload} onCancel={() => setUpOpen(false)}
        okText="上传" cancelText="取消" destroyOnClose>
        <div className="fld-label">客户</div>
        <Select style={{ width: '100%' }} value={upClient ?? undefined} onChange={setUpClient}
          options={[...clients.map((c) => ({ value: c.name, label: c.name })), { value: '__new__', label: '＋ 新建客户…' }]} />
        {upClient === '__new__' && (
          <Input style={{ marginTop: 8 }} placeholder="新客户名称" value={upNewClient} onChange={(e) => setUpNewClient(e.target.value)} />
        )}
        <div className="fld-label">业务线（可选）</div>
        <Input placeholder="留空 = 客户根目录" value={upLine} onChange={(e) => setUpLine(e.target.value)} />
        <div className="fld-label">选择 .md 文件（可多选）</div>
        <Upload multiple accept=".md,.markdown"
          beforeUpload={(_, fl) => {
            setUpFiles((prev) => {
              const have = new Set(prev.map((p) => p.file.name + ':' + p.file.size))
              return [...prev, ...fl.filter((f) => !have.has(f.name + ':' + f.size)).map((f) => ({ uid: `u${++uidRef.current}`, file: f }))]
            })
            return false
          }}
          onRemove={(item) => setUpFiles((fs) => fs.filter((p) => p.uid !== item.uid))}
          fileList={upFiles.map((p) => ({ uid: p.uid, name: p.file.name, size: p.file.size }))}>
          <Button>选择文件</Button>
        </Upload>
      </Modal>

      <Modal title="新建档案文档" open={archOpen} onOk={newArchiveDoc}
        onCancel={() => { setArchOpen(false); setArchName('客户偏好.md') }} okText="创建" cancelText="取消" destroyOnClose>
        <div className="fld-label">文件名（.md）</div>
        <Input value={archName} onChange={(e) => setArchName(e.target.value)} onPressEnter={newArchiveDoc} />
      </Modal>
    </div>
  )
}

function FileKind({ title, tab }) {
  const k = fileKind(title, tab)
  return <span className="kind-dot" title={k.label} style={{ background: k.bg, color: k.fg }}>{k.label.slice(0, 1)}</span>
}
