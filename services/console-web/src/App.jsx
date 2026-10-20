import { useEffect, useRef, useState } from 'react'
import { App as AntApp } from 'antd'
import { api } from './api'
import Clients from './Clients'
import Skills from './Skills'

// 顶层只有两个模块：客户资产（内容）和技能库（工具），各用各的布局
const MODULES = [
  { key: 'clients', label: '客户资产' },
  { key: 'skills', label: '技能库' },
]

export default function App() {
  const { message } = AntApp.useApp()
  const [tree, setTree] = useState(null)
  const [mod, setMod] = useState('clients')

  // 阅读区有未保存修改时，任何「切走」动作先问一句
  const dirtyRef = useRef(false)
  const onDirty = (v) => { dirtyRef.current = v }
  const guardDirty = () => !dirtyRef.current || window.confirm('有未保存的修改，确定要切走吗？')

  const reload = async () => {
    const t = await api.tree()
    if (!t || !Array.isArray(t.clients)) { message.error(t?.error || '加载失败'); return }
    setTree(t)
  }
  useEffect(() => { reload().catch((e) => message.error(String(e))) }, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">云上生文<span>资料台</span></div>
        <div className="modules">
          {MODULES.map((m) => (
            <button key={m.key} className={'module' + (mod === m.key ? ' on' : '')}
              onClick={() => { if (m.key !== mod && guardDirty()) { onDirty(false); setMod(m.key) } }}>
              {m.label}
            </button>
          ))}
        </div>
      </header>
      <main className="stage">
        {mod === 'clients'
          ? <Clients tree={tree} reload={reload} guardDirty={guardDirty} onDirty={onDirty} />
          : <Skills tree={tree} guardDirty={guardDirty} onDirty={onDirty} />}
      </main>
    </div>
  )
}
