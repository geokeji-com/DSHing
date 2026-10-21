// 实时协同（Yjs + Hocuspocus），挂在控制台同一个 HTTP 服务的 /collab 上 —— 不占新端口，nginx 不用改
//
// 一个分享的一轮修改 = 一个协同文档 share:<id>:<轮次>，落盘 <DATA>/.collab/<id>-<轮次>.ydoc。
// 文档名带轮次：上一轮刚结束、内存里的旧文档还没卸载时开新一轮，也不会串内容。
// 写手读的 Markdown 完全不碰这里；定稿时由前端把草稿转回 Markdown 交给 /api/kb/round/close。
//
// 身份在 WebSocket 握手时认（不是 Hocuspocus 的 token）：
//   客户 = 分享页的 HttpOnly Cookie（/collab?s=<id>）
//   我们 = 控制台登录后拿到的 staff key（/collab?s=<id>&k=<key>）
// 只读：客户在提交后只读；我们在客户编辑中只读、提交后可写。

import { Hocuspocus } from '@hocuspocus/server'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export function createCollab({ data, shares, staffName }) {
  const DIR = join(data, '.collab')
  const KEYFILE = join(data, '.collab-staff-key')
  const file = (name) => join(DIR, name.slice(6).replace(':', '-') + '.ydoc')
  const docName = (id, round) => `share:${id}:${round.startedAt}`
  const idOf = (name) => name.split(':')[1]
  let staffKey = null

  async function key() {
    if (staffKey) return staffKey
    staffKey = (await readFile(KEYFILE, 'utf8').catch(() => '')).trim()
    if (!staffKey) { staffKey = randomBytes(24).toString('base64url'); await writeFile(KEYFILE, staffKey, 'utf8') }
    return staffKey
  }

  const readOnlyFor = (s, kind) => kind === 'client'
    ? s.locked || s.round.state === 'submitted'
    : s.round.state !== 'submitted'

  const hp = new Hocuspocus({
    name: 'dsh-console',
    quiet: true,
    debounce: 1500,
    maxDebounce: 8000,
    async onConnect({ context, documentName, connectionConfig }) {
      const s = await shares.get(context.shareId)
      if (!s?.round || documentName !== docName(context.shareId, s.round)) throw new Error('forbidden')
      connectionConfig.readOnly = readOnlyFor(s, context.kind)
    },
    async onLoadDocument({ document, documentName }) {
      const buf = await readFile(file(documentName)).catch(() => null)
      if (buf) Y.applyUpdate(document, new Uint8Array(buf))
    },
    async onStoreDocument({ document, documentName }) {
      const s = await shares.get(idOf(documentName))
      if (!s?.round || documentName !== docName(s.id, s.round)) return   // 这一轮已经结束，别把文件写回来
      await mkdir(DIR, { recursive: true })
      await writeFile(file(documentName), Buffer.from(Y.encodeStateAsUpdate(document)))
    },
    async onChange({ documentName, context }) {
      if (context?.kind !== 'client') return
      if (await shares.touch(idOf(documentName), context.name)) notifyDoc(documentName, { type: 'round' })
    },
  })

  const docsOf = (id) => [...hp.documents.values()].filter((d) => idOf(d.name) === id)
  const notifyDoc = (name, payload) => hp.documents.get(name)?.broadcastStateless(JSON.stringify(payload))

  /** 给这个分享的协同文档里所有人发一条消息（前端 onStateless 收） */
  function notify(id, payload) { for (const d of docsOf(id)) d.broadcastStateless(JSON.stringify(payload)) }

  /** 状态变了：按新状态重新设每个连接的只读 */
  async function refreshReadOnly(id) {
    const s = await shares.get(id)
    if (!s?.round) return
    for (const d of docsOf(id)) for (const c of d.getConnections()) c.readOnly = readOnlyFor(s, c.context?.kind)
  }

  /** 这一轮结束（定稿 / 收回 / 关链接）：通知、断开所有人、删草稿。round = 结束前的那一轮 */
  async function closeRound(id, round) {
    notify(id, { type: 'round' })
    for (const d of docsOf(id)) hp.closeConnections(d.name)
    if (round) await unlink(file(docName(id, round))).catch(() => {})
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 })

  /** 挂到 http.Server 上。auth(req) → context | null */
  function attach(server, auth) {
    server.on('upgrade', async (req, socket, head) => {
      let ctx = null
      try { ctx = await auth(req) } catch { ctx = null }
      if (!ctx) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const conn = hp.handleConnection(ws, req, ctx)
        ws.on('message', (d) => conn.handleMessage(new Uint8Array(d)))
        ws.on('pong', () => conn.touch())
        const ping = setInterval(() => { if (ws.readyState === 1) ws.ping() }, 20_000)
        ws.on('close', (code, reason) => { clearInterval(ping); conn.handleClose({ code, reason: String(reason) }) })
        ws.on('error', () => {})
      })
    })
  }

  return { attach, key, notify, refreshReadOnly, closeRound, docName, staffName }
}
