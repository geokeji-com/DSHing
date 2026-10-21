import { BookOutlined, FileTextOutlined, IdcardOutlined } from '@ant-design/icons'
import Avatar from './Avatar'
import { fileKind, fmtChars, fmtDate } from './skillMeta'

// 客户封面：选了客户、还没打开文件时右边显示这一页（代替空白提示）
export default function Cover({ client, lines, pending, onTab, onOpen }) {
  const kb = client.knowledge
  const kbChars = kb.reduce((s, n) => s + (n.chars ?? 0), 0)
  const all = [...kb, ...client.articles, ...client.archives]
  const latest = all.map((n) => n.updated).filter(Boolean).sort().pop()
  const recent = [...client.articles].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 5)
  const recentKb = [...kb].sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '')).slice(0, 5)

  const stats = [
    { key: 'knowledge', icon: <BookOutlined />, label: '知识库', n: kb.length, unit: '份', sub: kbChars ? fmtChars(kbChars) : '还没有资料' },
    { key: 'articles', icon: <FileTextOutlined />, label: '文章', n: client.articles.length, unit: '篇', sub: client.articles.length ? '已入库' : '还没有入库' },
    { key: 'archives', icon: <IdcardOutlined />, label: '档案', n: client.archives.length, unit: '份', sub: client.archives.length ? '写作约束' : '还没建' },
  ]

  const list = recent.length ? recent : recentKb
  return (
    <div className="cover">
      <div className="cover-inner">
        <div className="cover-hero rise" style={{ '--i': 0 }}>
          <Avatar name={client.name} size={64} />
          <div>
            <div className="cover-name">{client.name}</div>
            <div className="cover-sub">
              {lines.length > 1 ? `${lines.length} 条品线` : '单品线'}
              {latest && <> · 最近更新 {fmtDate(latest)}</>}
            </div>
          </div>
        </div>

        {pending > 0 && (
          <button className="cover-pending rise" style={{ '--i': 1 }} onClick={() => onTab('knowledge')}>
            <span className="cp-dot" />
            {(() => { const by = [...new Set(kb.flatMap((n) => n.clientEdit?.by ?? []))]
              return `${pending} 份未确认` + (by.length ? ` · ${by.join('、')}` : '') })()}
            <span className="cp-go">→</span>
          </button>
        )}

        <div className="cover-stats">
          {stats.map((s, i) => (
            <button key={s.key} className="stat rise" style={{ '--i': i + 1 }} onClick={() => onTab(s.key)}>
              <div className="stat-top"><span className="stat-icon">{s.icon}</span>{s.label}</div>
              <div className="stat-n">{s.n}<span>{s.unit}</span></div>
              <div className="stat-sub">{s.sub}</div>
            </button>
          ))}
        </div>

        {lines.length > 1 && (
          <div className="cover-row rise" style={{ '--i': 4 }}>
            <div className="cover-label">品线</div>
            <div className="line-chips">
              {lines.map((l) => <span key={l} className="line-chip">{l}</span>)}
            </div>
          </div>
        )}

        {list.length > 0 && (
          <div className="cover-row rise" style={{ '--i': 5 }}>
            <div className="cover-label">{recent.length ? '最近入库' : '知识资料'}</div>
            <div className="cover-list">
              {list.map((n) => {
                const k = fileKind(n.title, recent.length ? 'articles' : 'knowledge')
                return (
                  <div key={n.path} className="cover-item" onClick={() => onOpen(n, recent.length ? 'articles' : 'knowledge')}>
                    <span className="kind-dot" style={{ background: k.bg, color: k.fg }}>{k.label.slice(0, 1)}</span>
                    <span className="cover-item-title">{n.title}</span>
                    <span className="cover-item-meta">{fmtChars(n.chars)}{n.updated && ' · ' + fmtDate(n.updated)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
