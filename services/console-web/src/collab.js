// 前端连协同服务（/collab）：一个分享的这一轮修改 = 一个 Yjs 文档
//   客户：凭分享页 Cookie（浏览器自动带）
//   我们：凭控制台 /api/share 返回的 staffKey
import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'

const wsUrl = (shareId, key) => {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/collab?s=${encodeURIComponent(shareId)}${key ? '&k=' + encodeURIComponent(key) : ''}`
}

/**
 * useCollab(shareId, { key, doc, enabled, onMessage }) → { ydoc, provider, synced, status, readOnly }
 * enabled=false 时不连；onMessage(payload) 收服务端广播（状态变了等）
 */
export function useCollab(shareId, { key, doc, enabled = true, onMessage } = {}) {
  const [conn, setConn] = useState(null)
  const [synced, setSynced] = useState(false)
  const [status, setStatus] = useState('connecting')
  const [readOnly, setReadOnly] = useState(false)

  useEffect(() => {
    if (!enabled || !shareId || !doc) { setConn(null); setSynced(false); return }
    const ydoc = new Y.Doc()
    const provider = new HocuspocusProvider({
      url: wsUrl(shareId, key),
      name: doc,                               // share:<id>:<轮次>，服务端给
      document: ydoc,
      token: 'cookie',                         // 身份在握手时认，这里随便给个值让 provider 走认证流程
      onSynced: () => setSynced(true),
      onStatus: ({ status: s }) => setStatus(s),
      onAuthenticated: ({ scope }) => setReadOnly(scope === 'readonly'),
      onStateless: ({ payload }) => { try { onMessage?.(JSON.parse(payload)) } catch { /* 不是我们的消息 */ } },
    })
    setConn({ ydoc, provider })
    return () => { provider.destroy(); ydoc.destroy(); setSynced(false) }
  }, [shareId, key, doc, enabled])

  return { ...(conn ?? {}), synced, status, readOnly }
}
