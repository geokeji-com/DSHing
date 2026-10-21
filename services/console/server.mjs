// 内容控制台 —— 看 / 改 三个库（零依赖，只用 node:http）
//
// 界面框架（按「归属 + 事情」组织）：
//   客户区：知识库 / 文章 / 客户档案  →  顶栏选客户，三个页签都是这个客户的东西
//   全局区：技能库                    →  按三层分组（公共 / 中间层 / 个人）
//
// 物理存储：
//   <DATA>/知识库/<客户>[/<业务线>]/*.md   （一级子目录 = 业务线）
//   <DATA>/文章库/<客户>/*.md
//   <DATA>/客户档案/<客户>/*.md           （客户的特有偏好，跟客户走）
//   <DATA>/技能库/<层>/<技能>/**      （层 = 公共 / 中间层 / 个人）
//
// 接口：
//   GET  /                  → 页面
//   GET  /api/tree          → 树
//   GET  /api/file?path=…   → 文件内容
//   PUT  /api/file          → 保存 { path, content }
//   POST /api/upload        → 上传知识文档 { client, line?, overwrite?, files:[{name,content}] }
//   DELETE /api/file?path=… → 删除文件（仅限 知识库/ 与 客户档案/ 下的文件）
//
// 登录：HTTP Basic Auth（配了 AUTH_USER / AUTH_PASS 才启用）

import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { readFile, readdir, writeFile, stat, mkdir, unlink, rename } from 'node:fs/promises'
import { join, dirname, resolve, sep, posix, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createKbStore } from './kbstore.mjs'
import { createShares } from './shares.mjs'
import { merge3 } from './merge3.mjs'
import { createCollab } from './collab.mjs'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const DATA = resolve(process.env.DATA_DIR ?? '/data')
const PORT = Number(process.env.PORT ?? 8793)
const HOST = process.env.HOST ?? '0.0.0.0'
const MAX_BODY = 5 * 1024 * 1024

const AUTH_USER = process.env.AUTH_USER ?? ''
const AUTH_PASS = process.env.AUTH_PASS ?? ''

const KB = '知识库'
const ART = '文章库'
const SKILL = '技能库'
const ARCHIVE = '客户档案'
const SKILL_LAYERS = ['公共', '中间层', '个人']

// 知识库：编辑区 → 确认 → 正式区（写手只读正式区），详见 kbstore.mjs
const kbs = createKbStore({ data: DATA, kb: KB, author: AUTH_USER || 'console' })
// 分享页（原型，只在本机跑；SHARES=1 才开，服务器上默认关）
const SHARES_ON = process.env.SHARES === '1'
const shares = createShares({ data: DATA })
const collab = createCollab({ data: DATA, shares, staffName: AUTH_USER || '服务方' })

/**
 * 知识库保存：前端带上 base（编辑器打开 / 上次保存时的全文）。磁盘上的已经不是 base = 别人在这期间存过，
 * 做按行三方合并：改的不是同一处就两边都留；同一处以这次为准，返回 conflicts 让前端提示。
 */
async function kbSaveMerged(path, content, base) {
  const disk = (await kbs.readFor(path)) ?? ''
  const { text, conflicts } = typeof base === 'string' && base !== disk ? merge3(base, content, disk) : { text: content, conflicts: 0 }
  await kbs.write(path, text)
  return { text, conflicts }
}

// ---------- 路径 ----------
function resolveInside(relPath) {
  const clean = posix.normalize('/' + String(relPath ?? '')).replace(/^\/+/, '')
  if (!clean || clean.startsWith('..') || clean.includes('\0')) throw new Error('非法路径')
  const abs = resolve(DATA, clean)
  if (abs !== DATA && !abs.startsWith(DATA + sep)) throw new Error('路径越界')
  return { abs, rel: clean }
}

async function listDir(abs) {
  try {
    return (await readdir(abs, { withFileTypes: true })).filter((e) => !e.name.startsWith('.'))
  } catch {
    return []
  }
}

/** 路径组件白名单校验：客户名 / 业务线名 / 上传的文件名都过这一关 */
function safeName(s) {
  const v = String(s ?? '').trim()
  if (!v || v.startsWith('.') || /[/\\\0]/.test(v) || v.includes('..')) return null
  return v
}

/** 递归列出目录下所有文件，返回相对该目录的路径 */
async function walk(dir, prefix = '') {
  const out = []
  for (const e of await listDir(dir)) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await walk(join(dir, e.name), rel)))
    else if (e.isFile()) out.push(rel)
  }
  return out.sort((a, b) => a.localeCompare(b, 'zh'))
}

/** 时间戳 → 本地日期 YYYY-MM-DD（容器时区在 docker-compose 里设成 Asia/Shanghai） */
function localDate(t) {
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/** 文件的字数（去空白）+ 修改日期：控制台封面和文件列表的小字用。只读。 */
async function fileInfo(abs) {
  try {
    const [text, st] = await Promise.all([readFile(abs, 'utf8'), stat(abs)])
    return { chars: text.replace(/\s/g, '').length, updated: localDate(st.mtime) }
  } catch {
    return { chars: null, updated: null }
  }
}

/**
 * 列某客户的 .md；title 去掉后缀，界面上不显示扩展名。
 *
 * date = **入库日期**，取文件的创建时间（birthtime）。为什么不用修改时间：
 * 改稿只动 mtime，那会让老文章跳到新的日期组里 —— 我们要的是「什么时候入库的」。
 * 文件系统拿不到创建时间时退回 mtime；都拿不到就不给 date，界面退化成平铺。
 */
async function listNotes(baseDir, section, client) {
  const dir = join(DATA, baseDir, client)
  const files = (await listDir(dir)).filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
  const out = []
  for (const e of files) {
    let date = null
    try {
      const st = await stat(join(dir, e.name))
      const t = st.birthtime && st.birthtime.getTime() > 0 ? st.birthtime : st.mtime
      if (t && t.getTime() > 0) date = localDate(t)
    } catch {
      // 拿不到时间就留 null
    }
    out.push({ title: e.name.replace(/\.md$/i, ''), path: `${section}/${client}/${e.name}`, date,
      ...(await fileInfo(join(dir, e.name))) })
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
}

/**
 * 列某客户的知识文档 —— 知识库支持「业务线」：客户目录下的一级子目录就是一个业务线，
 * 例如 知识库/华西生物/医疗器械/*.md。没有子目录的客户（现状）行为完全不变。
 * line = null 表示客户根目录的文件（界面上归到「基础资料」组）。
 */
async function listKbNotes(client) {
  // 编辑区 ∪ 正式区：编辑区有的按编辑区算；只剩正式区的 = 删除待确认
  const seen = new Map()
  for (const base of [kbs.EDIT, kbs.PUB]) {
    const dir = join(base, client)
    for (const e of await listDir(dir)) {
      if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        if (!seen.has(e.name)) seen.set(e.name, { name: e.name, line: null, abs: join(dir, e.name) })
        continue
      }
      if (!e.isDirectory()) continue
      // 只看一层：业务线目录下的再往深不展开（约定如此，避免列表失控）
      for (const f of await listDir(join(dir, e.name))) {
        if (!f.isFile() || !f.name.toLowerCase().endsWith('.md')) continue
        const key = e.name + '/' + f.name
        if (!seen.has(key)) seen.set(key, { name: f.name, line: e.name, abs: join(dir, e.name, f.name) })
      }
    }
  }
  const out = []
  for (const [key, v] of seen) {
    const path = `${KB}/${client}/${key}`
    const status = await kbs.status(path)
    out.push({ title: v.name.replace(/\.md$/i, ''), path, line: v.line, status,
      clientEdit: status === 'ok' ? null : await shares.clientEdit(path),
      round: await shares.roundInfo(path), ...(await fileInfo(v.abs)) })
  }
  return out.sort((a, b) => {
    if ((a.line ?? '') !== (b.line ?? '')) return (a.line ?? '').localeCompare(b.line ?? '', 'zh')
    return a.title.localeCompare(b.title, 'zh')
  })
}

/**
 * 读技能目录下 SKILL.md 的 frontmatter description（技能卡片的简介用）。
 * 只认最常见的两种写法：单行 `description: xxx` 和折叠块 `description: >`（后面缩进行）。
 */
async function skillDesc(dir) {
  const text = await readFile(join(dir, 'SKILL.md'), 'utf8').catch(() => '')
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!fm) return ''
  const lines = fm[1].split(/\r?\n/)
  const i = lines.findIndex((l) => /^description:/.test(l))
  if (i < 0) return ''
  const first = lines[i].replace(/^description:\s*/, '').trim()
  if (first && !/^[>|][-+]?$/.test(first)) return first.replace(/^["']|["']$/g, '')
  const out = []
  for (const l of lines.slice(i + 1)) {
    if (!/^\s+/.test(l)) break
    out.push(l.trim())
  }
  return out.join('')
}

const isKb = (p) => String(p ?? '').replace(/^\/+/, '').startsWith(KB + '/')

// ---------- 树 ----------
async function buildTree() {
  const artDir = join(DATA, ART)
  const archDir = join(DATA, ARCHIVE)
  const names = new Set()
  for (const n of await kbs.clients()) names.add(n)
  for (const e of await listDir(artDir)) if (e.isDirectory()) names.add(e.name)
  // 只有客户档案的客户也算客户（先建档、后传资料是正常顺序）
  for (const e of await listDir(archDir)) if (e.isDirectory()) names.add(e.name)

  const clients = []
  for (const name of [...names].sort((a, b) => a.localeCompare(b, 'zh'))) {
    clients.push({
      name,
      knowledge: await listKbNotes(name),
      articles: await listNotes(ART, ART, name),
      archives: await listNotes(ARCHIVE, ARCHIVE, name),
    })
  }

  // 技能：按三层分组
  const skills = []
  for (const layer of SKILL_LAYERS) {
    for (const e of await listDir(join(DATA, SKILL, layer))) {
      if (!e.isDirectory()) continue
      const rels = await walk(join(DATA, SKILL, layer, e.name))
      skills.push({
        name: e.name,
        layer,
        desc: await skillDesc(join(DATA, SKILL, layer, e.name)),
        files: rels.map((r) => ({ title: r, path: `${SKILL}/${layer}/${e.name}/${r}` })),
      })
    }
  }
  // 兼容：技能直接放在技能库根下（旧结构）
  for (const e of await listDir(join(DATA, SKILL))) {
    if (!e.isDirectory() || SKILL_LAYERS.includes(e.name)) continue
    const rels = await walk(join(DATA, SKILL, e.name))
    skills.push({
      name: e.name,
      layer: '公共',
      desc: await skillDesc(join(DATA, SKILL, e.name)),
      files: rels.map((r) => ({ title: r, path: `${SKILL}/${e.name}/${r}` })),
    })
  }

  // 技能库**根目录**下的文件：公共基座（通用写作规则.md）这类，不属于任何一层，
  // 所有技能共用。控制台必须能看见它，否则改它还得 SSH —— 那就白做控制台了。
  const skillRootFiles = (await listDir(join(DATA, SKILL)))
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map((e) => ({ title: e.name.replace(/\.md$/i, ''), path: `${SKILL}/${e.name}` }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh'))

  // 客户档案跟客户走（每个客户一组），不再单列一个全局区

  return { clients, skills, skillRootFiles, layers: SKILL_LAYERS }
}

// ---------- 登录 ----------
function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

function authed(req) {
  if (!AUTH_USER || !AUTH_PASS) return true
  const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization ?? '')
  if (!m) return false
  const raw = Buffer.from(m[1], 'base64').toString('utf8')
  const i = raw.indexOf(':')
  if (i < 0) return false
  return safeEqual(raw.slice(0, i), AUTH_USER) && safeEqual(raw.slice(i + 1), AUTH_PASS)
}

// ---------- HTTP ----------
function send(res, code, type, body) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}
const sendJson = (res, code, obj) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj))

function readBody(req) {
  return new Promise((ok, fail) => {
    const chunks = []
    let n = 0
    req.on('data', (c) => {
      n += c.length
      if (n > MAX_BODY) { fail(new Error('内容太大')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')))
    req.on('error', fail)
  })
}

const server = createServer(async (req, res) => {
  // 分享页走自己的登录（链接 + 密码），不吃后台的 Basic Auth
  if (SHARES_ON && /^\/(s\/|api\/s\/)/.test(req.url)) return handleShare(req, res)
  // 分享页要加载前端静态文件（/assets/*，只有打包后的代码，不含任何数据）——客户没有后台账号，这里放行
  const assetsOpen = SHARES_ON && req.method === 'GET' && req.url.startsWith('/assets/')
  if (!assetsOpen && !authed(req)) {
    res.writeHead(401, {
      'www-authenticate': 'Basic realm="DSH Console", charset="UTF-8"',
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    })
    return res.end('需要登录')
  }

  const url = new URL(req.url, 'http://x')
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile(join(ROOT, 'public', 'index.html'))
      return send(res, 200, 'text/html; charset=utf-8', html)
    }

    // 构建后的前端静态资源（/assets/…，React + antd 版页面）
    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      const rel = posix.normalize('/' + url.pathname).replace(/^\/+/, '')
      const pubRoot = join(ROOT, 'public')
      const abs = resolve(pubRoot, rel)
      if (!abs.startsWith(pubRoot + sep)) return sendJson(res, 400, { error: '路径越界' })
      const type = {
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
        '.map': 'application/json',
      }[extname(abs).toLowerCase()] ?? 'application/octet-stream'
      const buf = await readFile(abs).catch(() => null)
      if (buf == null) return sendJson(res, 404, { error: 'not found' })
      return send(res, 200, type, buf)
    }

    if (req.method === 'GET' && url.pathname === '/api/tree') {
      return sendJson(res, 200, await buildTree())
    }

    if (req.method === 'GET' && url.pathname === '/api/file') {
      const rel = url.searchParams.get('path')
      const { abs, rel: clean } = resolveInside(rel)
      if (isKb(clean)) {
        const text = await kbs.readFor(clean)
        if (text == null) return sendJson(res, 404, { error: '文件不存在' })
        return sendJson(res, 200, { path: clean, content: text, status: await kbs.status(clean) })
      }
      const text = await readFile(abs, 'utf8').catch(() => null)
      if (text == null) return sendJson(res, 404, { error: '文件不存在' })
      return sendJson(res, 200, { path: rel, content: text })
    }

    if (req.method === 'PUT' && url.pathname === '/api/file') {
      const body = JSON.parse(await readBody(req))
      const { abs, rel } = resolveInside(body.path)
      if (typeof body.content !== 'string') return sendJson(res, 400, { error: 'content 必须是字符串' })
      // 知识库只写编辑区（写手看不到），确认后才进正式区
      if (isKb(rel)) {
        const { text, conflicts } = await kbSaveMerged(rel, body.content, body.base)
        return sendJson(res, 200, { ok: true, path: rel, text, conflicts, status: await kbs.status(rel) })
      }
      // 文章 / 客户档案：直接写正式文件（没有确认流程），但和知识库一样带 base 做三方合并，
      // 防止两个人同时开着同一篇、后存的把先存的整篇盖掉
      const disk = await readFile(abs, 'utf8').catch(() => null)
      const { text, conflicts } = typeof body.base === 'string' && disk != null && body.base !== disk
        ? merge3(body.base, body.content, disk) : { text: body.content, conflicts: 0 }
      // 新建文件时父目录可能还不存在（如 客户档案/<新客户>/），一并建出来
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, text, 'utf8')
      const info = await stat(abs)
      return sendJson(res, 200, { ok: true, path: rel, text, conflicts, bytes: info.size, at: info.mtime.toISOString() })
    }

    // 知识文档上传：{ client, line?, overwrite?, files:[{ name, content }] }
    // 知识库不需要审核；重名默认拒绝（409 带清单），界面确认后带 overwrite 重发。
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const body = JSON.parse(await readBody(req))
      const client = safeName(body.client)
      if (!client) return sendJson(res, 400, { error: '客户名不合法' })
      let line = null
      if (body.line != null && String(body.line).trim()) {
        line = safeName(body.line)
        if (!line) return sendJson(res, 400, { error: '业务线名不合法' })
      }
      const list = Array.isArray(body.files) ? body.files : []
      if (!list.length) return sendJson(res, 400, { error: '没有要上传的文件' })
      const files = list.map((f) => ({
        raw: String(f?.name ?? '').trim(),
        name: safeName(f?.name),
        content: f?.content,
      }))
      for (const f of files) {
        if (!f.name || !f.name.toLowerCase().endsWith('.md')) {
          return sendJson(res, 400, { error: `只支持 .md 文件：${f.raw || '(空文件名)'}` })
        }
        if (typeof f.content !== 'string') return sendJson(res, 400, { error: `${f.name} 缺少内容` })
      }
      const dirRel = [KB, client, ...(line ? [line] : [])].join('/')
      // 上传进编辑区：新文件是「未确认」，写手要等确认后才看得到
      const dirAbs = join(kbs.EDIT, client, ...(line ? [line] : []))
      if (!body.overwrite) {
        const exists = []
        for (const f of files) {
          try { await stat(join(dirAbs, f.name)); exists.push(f.name) } catch { /* 不存在，好 */ }
        }
        if (exists.length) return sendJson(res, 409, { error: '同名文件已存在', exists })
      }
      await mkdir(dirAbs, { recursive: true })
      for (const f of files) await writeFile(join(dirAbs, f.name), f.content, 'utf8')
      return sendJson(res, 200, { ok: true, dir: dirRel, written: files.map((f) => f.name) })
    }

    // 删除文件（仅限 知识库/ 与 客户档案/ 下的文件；界面上有二次确认）
    if (req.method === 'DELETE' && url.pathname === '/api/file') {
      const { abs, rel } = resolveInside(url.searchParams.get('path'))
      const deletable = rel.startsWith(KB + '/') || rel.startsWith(ARCHIVE + '/')
      if (!deletable) return sendJson(res, 400, { error: '只能删除知识库或客户档案里的文件' })
      // 知识库：编辑区、正式区一起删，直接生效（不进历史）；还在分享给客户的先关链接
      if (isKb(rel)) {
        if (SHARES_ON && await shares.forPath(rel)) return sendJson(res, 409, { error: '先关闭客户链接' })
        await kbs.removeNow(rel)
        return sendJson(res, 200, { ok: true, path: rel })
      }
      const st = await stat(abs).catch(() => null)
      if (!st || !st.isFile()) return sendJson(res, 404, { error: '文件不存在' })
      await unlink(abs)
      return sendJson(res, 200, { ok: true, path: rel })
    }

    // 改名 { path, name }：知识库 / 客户档案。不进历史、不用确认；分享中的不能改（客户链接认文件）
    if (req.method === 'POST' && url.pathname === '/api/file/rename') {
      const body = JSON.parse(await readBody(req))
      const { abs, rel } = resolveInside(body.path)
      if (!isKb(rel) && !rel.startsWith(ARCHIVE + '/')) return sendJson(res, 400, { error: '只能改知识库或客户档案的文件名' })
      let name = String(body.name ?? '').trim().replace(/\.md$/i, '')
      if (!name || /[\/\\\0]/.test(name) || name.startsWith('.')) return sendJson(res, 400, { error: '文件名不合法' })
      name += '.md'
      const to = rel.slice(0, rel.lastIndexOf('/') + 1) + name
      if (to === rel) return sendJson(res, 200, { ok: true, path: rel })
      if (isKb(rel)) {
        if (SHARES_ON && await shares.forPath(rel)) return sendJson(res, 409, { error: '分享中的资料不能改名' })
        await kbs.rename(rel, to)
      } else {
        const t = resolveInside(to)
        if (await stat(t.abs).catch(() => null)) return sendJson(res, 409, { error: '同名文件已存在' })
        await rename(abs, t.abs)
      }
      return sendJson(res, 200, { ok: true, path: to })
    }

    // ---------- 知识库版本 ----------
    // 确认版本 { path, name?, note? }：编辑区 → 正式区，记一版（内容没变也记）
    if (req.method === 'POST' && url.pathname === '/api/kb/confirm') {
      const body = JSON.parse(await readBody(req))
      const { rel } = resolveInside(body.path)
      if (!isKb(rel)) return sendJson(res, 400, { error: '只有知识库有版本' })
      if ((await kbs.status(rel)) == null) return sendJson(res, 404, { error: '文件不存在' })
      const ce = await shares.clientEdit(rel)
      const note = [body.note, ce && `客户修改：${ce.by.join('、')}`].filter(Boolean).join('\n')
      const r = await kbs.confirm(rel, { name: body.name, note, by: AUTH_USER || '' })
      await shares.clearEdit(rel)
      return sendJson(res, 200, { ...r, status: await kbs.status(rel) })
    }
    // 放弃未确认的修改 { path }
    if (req.method === 'POST' && url.pathname === '/api/kb/discard') {
      const body = JSON.parse(await readBody(req))
      const { rel } = resolveInside(body.path)
      if (!isKb(rel)) return sendJson(res, 400, { error: '只有知识库有版本' })
      await kbs.discard(rel)
      return sendJson(res, 200, { ok: true, status: await kbs.status(rel) })
    }
    // 未确认的改动：编辑区 vs 正式区（确认弹窗的 +/- 和「当前（未确认）」视图用）
    if (req.method === 'GET' && url.pathname === '/api/kb/pending') {
      const { rel } = resolveInside(url.searchParams.get('path'))
      if (!isKb(rel)) return sendJson(res, 400, { error: '只有知识库有版本' })
      return sendJson(res, 200, await kbs.pending(rel))
    }
    if (req.method === 'GET' && url.pathname === '/api/kb/history') {
      const { rel } = resolveInside(url.searchParams.get('path'))
      if (!isKb(rel)) return sendJson(res, 400, { error: '只有知识库有版本' })
      return sendJson(res, 200, { versions: await kbs.history(rel) })
    }
    if (req.method === 'GET' && url.pathname === '/api/kb/version') {
      const { rel } = resolveInside(url.searchParams.get('path'))
      if (!isKb(rel)) return sendJson(res, 400, { error: '只有知识库有版本' })
      return sendJson(res, 200, await kbs.version(rel, url.searchParams.get('sha') ?? ''))
    }

    // ---------- 分享管理（后台） ----------
    // 一份资料一个长期链接；share.locked=false = 客户那边可以改（我们这边只读），true = 我们这边处理
    if (SHARES_ON && url.pathname.startsWith('/api/share')) {
      const view = async (sh) => sh && { share: { id: sh.id, password: sh.password, locked: !!sh.locked, createdAt: sh.createdAt },
        round: sh.round && { state: sh.round.state, by: sh.round.by, initialized: sh.round.initialized, submittedBy: sh.round.submittedBy ?? null, doc: collab.docName(sh.id, sh.round) },
        staffKey: await collab.key(), staffName: AUTH_USER || '服务方' }
      if (req.method === 'GET' && url.pathname === '/api/share') {
        return sendJson(res, 200, (await view(await shares.forPath(url.searchParams.get('path')))) ?? { share: null })
      }
      const body = JSON.parse(await readBody(req))
      if (req.method === 'POST' && url.pathname === '/api/share') {
        const { rel } = resolveInside(body.path)
        if (!isKb(rel)) return sendJson(res, 400, { error: '只能分享知识库' })
        if (/竞品/.test(rel.split('/').pop())) return sendJson(res, 400, { error: '竞品资料不对客户开放' })
        let sh = await shares.forPath(rel)
        if (!sh) {
          if ((await kbs.status(rel)) !== 'ok') return sendJson(res, 409, { error: '有未确认的改动，先确认版本' })
          sh = await shares.create(rel); await shares.startRound(sh.id)
        }
        return sendJson(res, 200, await view(await shares.get(sh.id)))
      }
      const sh = await shares.get(body.id)
      if (!sh) return sendJson(res, 404, { error: '分享不存在' })
      if (req.method === 'DELETE' && url.pathname === '/api/share') {
        const r0 = sh.round
        await shares.close(sh.id); await collab.closeRound(sh.id, r0)
        return sendJson(res, 200, { ok: true })
      }
      // 开放编辑：交给客户改（新开一轮，从最新确认版开始；内部还有没确认的改动就不让开）
      if (req.method === 'POST' && url.pathname === '/api/share/reopen') {
        if ((await kbs.status(sh.path)) !== 'ok') return sendJson(res, 409, { error: '有未确认的改动，先确认版本' })
        if (!sh.round) await shares.startRound(sh.id)
        await shares.reopen(sh.id); collab.notify(sh.id, { type: 'round' })
        return sendJson(res, 200, await view(await shares.get(sh.id)))
      }
      // 收回：客户还在改就当作提交（我们接着处理痕迹）；还没人动过笔就直接结束这一轮。两种都把链接锁住
      if (req.method === 'POST' && url.pathname === '/api/share/take') {
        if (sh.round?.initialized && sh.round.by.length) {
          await shares.submit(sh.id, AUTH_USER || '服务方')
          await collab.refreshReadOnly(sh.id); collab.notify(sh.id, { type: 'round' })
        } else {
          const r0 = sh.round
          await shares.endRound(sh.id); await shares.lock(sh.id); await collab.closeRound(sh.id, r0)
        }
        return sendJson(res, 200, await view(await shares.get(sh.id)))
      }
      // 定稿：客户提交后，我们改完、点确认版本时 → 前端把草稿转回 Markdown 交上来，写进编辑区，这一轮结束
      if (req.method === 'POST' && url.pathname === '/api/share/finalize') {
        if (sh.round?.state !== 'submitted') return sendJson(res, 409, { error: '客户还没提交' })
        if (typeof body.content !== 'string') return sendJson(res, 400, { error: 'content 必须是字符串' })
        await kbs.write(sh.path, body.content)
        const r0 = sh.round
        await shares.endRound(sh.id, { keepBy: true })
        await collab.closeRound(sh.id, r0)
        return sendJson(res, 200, { ok: true, status: await kbs.status(sh.path) })
      }
    }

    sendJson(res, 404, { error: 'not found' })
  } catch (error) {
    sendJson(res, 400, { error: String(error?.message ?? error) })
  }
})

// ---------- 分享页（客户） ----------
async function handleShare(req, res) {
  const url = new URL(req.url, 'http://x')
  try {
    // 页面：同一个前端，靠路径 /s/<id> 进入分享视图
    // 标题换成资料名：客户的标签页、把链接贴进聊天软件时的预览，都不出现「资料台」
    if (req.method === 'GET' && /^\/s\/[A-Za-z0-9]+\/?$/.test(url.pathname)) {
      const sh = await shares.get(url.pathname.split('/')[2])
      const name = sh ? sh.path.split('/').pop().replace(/\.md$/i, '') : ''
      const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
      const html = String(await readFile(join(ROOT, 'public', 'index.html'))).replace(/<title>[^<]*<\/title>/, `<title>${esc(name)}</title>`)
      return send(res, 200, 'text/html; charset=utf-8', html)
    }
    const m = /^\/api\/s\/([A-Za-z0-9]+)\/(\w+)$/.exec(url.pathname)
    if (!m) return sendJson(res, 404, { error: 'not found' })
    const [, id, op] = m
    const s = await shares.get(id)
    if (!s) return sendJson(res, 404, { error: '链接已失效' })

    if (op === 'login' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req))
      // 真实 IP：nginx 会带 X-Real-IP；本机直连就用 socket 地址
      const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '')
      const { token, error, locked } = await shares.login(id, body.password, body.name, ip)
      if (!token) return sendJson(res, locked ? 429 : 401, { error })
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'set-cookie': `s_${id}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`,
      })
      return res.end(JSON.stringify({ ok: true }))
    }

    const me = await shares.who(req, id)
    if (op === 'meta') {
      return sendJson(res, 200, { title: s.path.split('/').pop().replace(/\.md$/i, ''),
        client: s.path.split('/')[1], me: me?.name ?? null })
    }
    if (!me) return sendJson(res, 401, { error: '需要密码' })

    // 当前状态：锁没锁、这一轮到哪一步、最新确认版；轮到我来初始化协同草稿时带上 seed
    if (op === 'state' && req.method === 'GET') {
      let cur = s
      if (!cur.locked && !cur.round) cur = await shares.startRound(id)
      if (cur.round && !cur.round.initialized) cur = await shares.claimInit(id, me.token)
      const r = cur.round
      const initMe = !!r && !r.initialized && r.initBy === me.token && r.state !== 'submitted'
      const published = (await kbs.pending(cur.path)).published ?? ''
      return sendJson(res, 200, {
        locked: !!cur.locked,
        round: r && { state: r.state, by: r.by, initialized: r.initialized, initMe, submittedBy: r.submittedBy ?? null, doc: collab.docName(id, r) },
        published, seed: initMe ? published : null,      // 每一轮都从最新确认版开始
      })
    }
    if (op === 'inited' && req.method === 'POST') {
      await shares.markInited(id); collab.notify(id, { type: 'round' })
      return sendJson(res, 200, { ok: true })
    }
    // 提交：整轮一次，提交后所有人只读（服务端也拒绝再写）
    if (op === 'submit' && req.method === 'POST') {
      if (s.locked || !s.round) return sendJson(res, 409, { error: '已经提交过了' })
      if (s.round.state !== 'submitted') {
        await shares.submit(id, me.name); await collab.refreshReadOnly(id); collab.notify(id, { type: 'round' })
      }
      return sendJson(res, 200, { ok: true })
    }
    // 客户能看所有确认过的版本（干净内容，没有修订痕迹）
    if (op === 'versions' && req.method === 'GET') {
      const vs = await kbs.history(s.path)
      return sendJson(res, 200, { versions: vs.map((v) => ({ sha: v.sha, name: v.name, date: v.date })) })
    }
    if (op === 'version' && req.method === 'GET') {
      const v = await kbs.version(s.path, url.searchParams.get('sha') ?? '')
      return sendJson(res, 200, { content: v.content })
    }
    return sendJson(res, 404, { error: 'not found' })
  } catch (error) {
    return sendJson(res, 400, { error: String(error?.message ?? error) })
  }
}

// 实时协同的 WebSocket（/collab）：客户凭分享 Cookie，我们凭控制台拿到的 staff key
async function collabAuth(req) {
  const u = new URL(req.url, 'http://x')
  if (u.pathname !== '/collab') return null
  const id = u.searchParams.get('s') || ''
  const k = u.searchParams.get('k')
  if (k) return safeEqual(k, await collab.key()) ? { kind: 'staff', shareId: id, name: AUTH_USER || '服务方' } : null
  const me = await shares.who(req, id)
  return me ? { kind: 'client', shareId: id, name: me.name } : null
}

await kbs.init()
if (SHARES_ON) collab.attach(server, collabAuth)
server.listen(PORT, HOST, () => {
  console.log(`[dsh-console] http://${HOST}:${PORT}  data=${DATA}`)
  if (!AUTH_USER || !AUTH_PASS) console.warn('[dsh-console] ⚠️  未配 AUTH_USER / AUTH_PASS —— 无登录，只适合本机隧道访问')
})
