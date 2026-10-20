import { useMemo, useState } from 'react'
import { Button, Empty, Input, Tabs, Tag } from 'antd'
import { ArrowLeftOutlined, FileTextOutlined, SearchOutlined } from '@ant-design/icons'
import Reader from './Reader'
import { skillName, skillTint, splitDesc } from './skillMeta'

// 技能库：卡片市场 → 点进详情（说明 / 附属文件）
export default function Skills({ tree, guardDirty, onDirty }) {
  const [layer, setLayer] = useState('全部')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)          // { kind: 'skill', name } | { kind: 'root', path }

  const skills = tree?.skills ?? []
  const rootFiles = tree?.skillRootFiles ?? []

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return skills.filter((s) => (layer === '全部' || s.layer === layer) &&
      (!kw || [s.name, skillName(s.name), s.desc].join(' ').toLowerCase().includes(kw)))
  }, [skills, layer, q])

  const go = (v) => { if (guardDirty()) { onDirty(false); setSel(v) } }

  if (sel?.kind === 'skill') {
    const s = skills.find((x) => x.name === sel.name)
    if (s) return <SkillDetail skill={s} onBack={() => go(null)} guardDirty={guardDirty} onDirty={onDirty} />
  }
  if (sel?.kind === 'root') {
    return (
      <div className="skill-detail">
        <div className="detail-top">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => go(null)}>技能库</Button>
        </div>
        <div className="detail-reader"><Reader path={sel.path} onDirty={onDirty} /></div>
      </div>
    )
  }

  const layers = ['全部', ...(tree?.layers ?? [])]
  const count = (l) => l === '全部' ? skills.length : skills.filter((s) => s.layer === l).length

  return (
    <div className="market">
      <div className="market-inner">
        <div className="market-head">
          <h1>技能库</h1>
        </div>
        <div className="market-filter">
          {layers.map((l) => (
            <button key={l} className={'pill' + (layer === l ? ' on' : '')} onClick={() => setLayer(l)}>
              {l}<span className="pill-n">{count(l)}</span>
            </button>
          ))}
          <Input className="market-search" allowClear prefix={<SearchOutlined />} placeholder="搜索技能"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {shown.length === 0
          ? <Empty description="没有匹配的技能" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          : (
            <div className="card-grid">
              {shown.map((s) => <SkillCard key={s.layer + '/' + s.name} skill={s} onClick={() => go({ kind: 'skill', name: s.name })} />)}
            </div>
          )}

        {rootFiles.length > 0 && layer === '全部' && !q && (
          <>
            <div className="market-section">所有技能共用</div>
            <div className="card-grid">
              {rootFiles.map((f) => (
                <div key={f.path} className="skill-card" onClick={() => go({ kind: 'root', path: f.path })}>
                  <div className="skill-icon" style={{ background: '#eef0f3', color: '#5b6470' }}><FileTextOutlined /></div>
                  <div className="skill-body">
                    <div className="skill-title">{f.title}</div>
                    <div className="skill-desc">公共基座，所有写作技能都会带上这份规则</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SkillIcon({ name, size }) {
  const t = skillTint(name)
  return (
    <div className={'skill-icon' + (size === 'lg' ? ' lg' : '')} style={{ background: t.bg, color: t.fg }}>
      {skillName(name).slice(0, 1)}
    </div>
  )
}

function SkillCard({ skill, onClick }) {
  const { summary } = splitDesc(skill.desc)
  return (
    <div className="skill-card" onClick={onClick}>
      <SkillIcon name={skill.name} />
      <div className="skill-body">
        <div className="skill-title">
          <span className="skill-cn">{skillName(skill.name)}</span>
          <Tag bordered={false} className="layer-tag">{skill.layer}</Tag>
        </div>
        <div className="skill-desc">{summary || '（还没有简介）'}</div>
        <div className="skill-foot">{skill.name}</div>
      </div>
    </div>
  )
}

function SkillDetail({ skill, onBack, guardDirty, onDirty }) {
  const { summary, triggers } = splitDesc(skill.desc)
  const main = skill.files.find((f) => f.title === 'SKILL.md')
  const extras = skill.files.filter((f) => f !== main)
  const [tab, setTab] = useState('doc')
  const [extra, setExtra] = useState(extras[0]?.path ?? null)

  const pick = (p) => { if (p !== extra && guardDirty()) { onDirty(false); setExtra(p) } }
  const switchTab = (k) => { if (guardDirty()) { onDirty(false); setTab(k) } }

  return (
    <div className="skill-detail">
      <div className="detail-top">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>技能库</Button>
      </div>
      <div className="detail-hero">
        <SkillIcon name={skill.name} size="lg" />
        <div className="hero-body">
          <div className="hero-title">
            {skillName(skill.name)}
            <Tag bordered={false} className="layer-tag">{skill.layer}</Tag>
            <span className="hero-code">{skill.name}</span>
          </div>
          {summary && <div className="hero-desc">{summary}</div>}
          {triggers.length > 0 && (
            <div className="hero-triggers">
              <span className="hero-label">触发词</span>
              {triggers.map((t) => <Tag key={t}>{t}</Tag>)}
            </div>
          )}
        </div>
      </div>
      <Tabs className="detail-tabs" activeKey={tab} onChange={switchTab}
        items={[
          { key: 'doc', label: '说明' },
          { key: 'files', label: `附属文件（${extras.length}）`, disabled: extras.length === 0 },
        ]} />
      <div className="detail-reader">
        {tab === 'doc' ? (
          <Reader path={main?.path ?? null} onDirty={onDirty} hideMeta
            empty={<Empty description="这个技能没有 SKILL.md" image={Empty.PRESENTED_IMAGE_SIMPLE} />} />
        ) : (
          <div className="files-split">
            <div className="files-list">
              {extras.map((f) => (
                <div key={f.path} className={'item' + (extra === f.path ? ' on' : '')} title={f.title} onClick={() => pick(f.path)}>
                  {f.title}
                </div>
              ))}
            </div>
            <Reader path={extra} onDirty={onDirty} />
          </div>
        )}
      </div>
    </div>
  )
}
