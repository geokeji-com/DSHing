// 分享（原型级防护 —— 正式版交技术同事）
//
// 一份知识库文件最多一个分享：长期链接 /s/<id> + 6 位密码，客户收藏后一直有效，我们可以随时关闭。
// 一个分享上同时只有「一轮」修改（round）：
//   open       客户打开了，还没人动笔（协同草稿 = 最新确认版）
//   editing    客户在改（实时协同 + 修订痕迹，见 collab.mjs / 前端 trackchanges.js）
//   submitted  客户点了提交：客户端锁住；我们看着痕迹编辑，确认版本时定稿
// 定稿后 round 清掉、locked 保持 true，直到我们「开放编辑」。
//
// 已做：连错 5 次锁 10 分钟、HttpOnly Cookie、会话落盘、后台接口不认分享 Cookie。
// 未做：密码明文存 .shares.json、无 CSRF 防护、称呼不核实。

import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const MAX_FAILS = 5, LOCK_MS = 10 * 60_000

export function createShares({ data }) {
  const FILE = join(data, '.shares.json')
  const SFILE = join(data, '.share-sessions.json')
  let shares = null                       // { [id]: { id, path, password, createdAt, active, locked, round, lastBy } }
  let sessions = null                     // token → { shareId, name }
  const fails = new Map()                 // ip → { n, until }

  const load = async () => {
    if (shares) return shares
    try { shares = JSON.parse(await readFile(FILE, 'utf8')) } catch { shares = {} }
    return shares
  }
  const persist = () => writeFile(FILE, JSON.stringify(shares, null, 2), 'utf8')
  const loadSessions = async () => {
    if (sessions) return sessions
    try { sessions = new Map(Object.entries(JSON.parse(await readFile(SFILE, 'utf8')))) } catch { sessions = new Map() }
    return sessions
  }
  const persistSessions = () => writeFile(SFILE, JSON.stringify(Object.fromEntries(sessions)), 'utf8')
  const rid = (n) => randomBytes(n * 2).toString('base64url').replace(/[-_]/g, '').slice(0, n)
  // 6 位，去掉易混的 0/O/1/l/I
  const pw = () => [...randomBytes(6)].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')

  async function create(path) {
    await load()
    const old = Object.values(shares).find((s) => s.path === path && s.active)
    if (old) return old
    const s = { id: rid(8), path, password: pw(), createdAt: new Date().toISOString(), active: true, locked: false, round: null, lastBy: [] }
    shares[s.id] = s
    await persist()
    return s
  }

  async function forPath(path) {
    await load()
    return Object.values(shares).find((s) => s.path === path && s.active) ?? null
  }

  async function close(id) {
    await load()
    if (!shares[id]) return false
    shares[id].active = false
    shares[id].round = null
    await loadSessions()
    for (const [t, v] of sessions) if (v.shareId === id) sessions.delete(t)
    await persist(); await persistSessions()
    return true
  }

  async function get(id) {
    await load()
    const s = shares[id]
    return s && s.active ? s : null
  }

  /** 返回 { token } 或 { error, locked? } */
  async function login(id, password, name, ip) {
    const f = fails.get(ip)
    if (f && f.until > Date.now()) return { error: `错误次数太多，${Math.ceil((f.until - Date.now()) / 60000)} 分钟后再试`, locked: true }
    const s = await get(id)
    if (!s || String(password).trim().toLowerCase() !== s.password.toLowerCase()) {
      const n = (f && f.until <= Date.now() && f.until ? 0 : f?.n ?? 0) + 1
      fails.set(ip, { n, until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 })
      return { error: n >= MAX_FAILS ? '错误次数太多，10 分钟后再试' : `密码不对（还能试 ${MAX_FAILS - n} 次）` }
    }
    fails.delete(ip)
    await loadSessions()
    const token = rid(24)
    sessions.set(token, { shareId: id, name: String(name || '').trim().slice(0, 20) || '客户' })
    await persistSessions()
    return { token }
  }

  /** 从 cookie 里认出这个分享的访问者 → { shareId, name, token } */
  async function who(req, id) {
    if (!/^[A-Za-z0-9]+$/.test(String(id))) return null
    const m = new RegExp(`(?:^|;\\s*)s_${id}=([A-Za-z0-9]+)`).exec(req.headers.cookie ?? '')
    await loadSessions()
    const v = m && sessions.get(m[1])
    if (!v || v.shareId !== id || !(await get(id))) return null
    return { ...v, token: m[1] }
  }

  // ---------- 一轮修改 ----------
  async function update(id, fn) {
    const s = await get(id)
    if (!s) return null
    fn(s)
    await persist()
    return s
  }
  const startRound = (id) => update(id, (s) => {
    s.round = { state: 'open', by: [], startedAt: Date.now(), initialized: false, initBy: null, initAt: 0 }
  })
  /** 谁来把最新确认版灌进协同草稿：同一时间只指派一个人，15 秒没灌完就换人 */
  const claimInit = (id, token) => update(id, (s) => {
    const r = s.round
    if (!r || r.initialized) return
    if (!r.initBy || r.initBy === token || Date.now() - r.initAt > 15_000) { r.initBy = token; r.initAt = Date.now() }
  })
  const markInited = (id) => update(id, (s) => { if (s.round) s.round.initialized = true })
  /** 客户动笔：open → editing，记下是谁。返回 true = 状态有变化 */
  async function touch(id, name) {
    const s = await get(id)
    const r = s?.round
    if (!r || !r.initialized || r.state === 'submitted') return false
    if (r.state === 'editing' && r.by.includes(name)) return false
    if (r.state === 'open') r.state = 'editing'
    if (!r.by.includes(name)) r.by.push(name)
    await persist()
    return true
  }
  const submit = (id, by) => update(id, (s) => {
    if (!s.round) return
    s.round.state = 'submitted'; s.round.submittedBy = by; s.round.submittedAt = Date.now()
    s.locked = true
  })
  /** 定稿 / 重置：round 清掉；定稿时把这一轮的修改人记到 lastBy（确认版本的备注用） */
  const endRound = (id, { keepBy } = {}) => update(id, (s) => {
    if (keepBy && s.round?.by?.length) s.lastBy = [...new Set([...(s.lastBy ?? []), ...s.round.by])]
    s.round = null
  })
  const reopen = (id) => update(id, (s) => { s.locked = false })
  const lock = (id) => update(id, (s) => { s.locked = true })

  /** 控制台列表用：本轮状态（还没人动笔的不算） */
  async function roundInfo(path) {
    const s = await forPath(path)
    return s?.round && s.round.state !== 'open' ? { state: s.round.state, by: s.round.by } : null
  }
  /** 确认版本的备注 & 列表标签用：已定稿、未确认的那一轮是谁改的 */
  const clientEdit = async (path) => {
    const s = await forPath(path)
    return s?.lastBy?.length ? { by: s.lastBy } : null
  }
  const clearEdit = async (path) => {
    const s = await forPath(path)
    if (s?.lastBy?.length) { s.lastBy = []; await persist() }
  }

  return { create, forPath, close, get, login, who, startRound, claimInit, markInited, touch, submit, endRound, reopen, lock, roundInfo, clientEdit, clearEdit }
}
