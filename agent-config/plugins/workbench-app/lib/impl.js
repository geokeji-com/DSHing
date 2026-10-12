/* dsh-workbench — 宿主半边的**实现**（被 lib/index.js 按 mtime 热加载）。
 *
 * 为什么单独一个文件：宿主插件的代码改了，DSH 要重启才生效（模块被 import 缓存），
 * 而客户端半边是热重载的。所以真正的逻辑放在这里，index.js 每次请求按 mtime
 * 重新 import 它 —— 从此改这个文件不用重启。
 *
 * 浏览器做不到的事：调 MCP、列技能。全部走 DSH 自己已经挂好的东西，
 * **不自己配地址、不碰任何 token**：
 *
 *   客户    → `ctx.tools.execute('mcp__sora-knowledge__list_clients')`
 *   文章库  → `ctx.tools.execute('mcp__sora-articles__list_articles')`
 *   技能    → `ctx.skills.list()`（dsh-skill-remote 注册的 provider）
 *
 * 好处：用户在「设置 → MCP」里换地址/换服务器，或者换技能服务，工作台自动跟着走。
 *
 * ── 环境约定（见工作区 ENVIRONMENT.md）──────────────────────────────
 * 这三个服务都跑在用户自己电脑上、走 Cloudflare 快速通道，**地址随时会变**。
 * 连不上时**不要乱排查、不要换地址试** —— 先问用户要新地址。
 * 本文件里的判定只做一件事：把"连不上"如实报出来，别猜。
 *
 * 路由：
 *   GET /api/workbench/clients              → { ok, customers: [{id,name,meta,business_lines,service_periods}] }
 *   GET /api/workbench/skills               → { ok, skills:  [{name,description,whenToUse,source,provider}] }
 *   GET /api/workbench/articles?client=NAME → { ok, articles:[{id,title}] }
 *   GET /api/workbench/mcp                  → 诊断：这台 Host 挂了哪些 MCP、各有哪些工具
 */

import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, renameSync, copyFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execFileP = promisify(execFile)

const CLIENTS_PATH = '/api/workbench/clients'
const SKILLS_PATH = '/api/workbench/skills'
const ARTICLES_PATH = '/api/workbench/articles'
const MCP_INFO_PATH = '/api/workbench/mcp'
const TASK_META_PATH = '/api/workbench/task-meta'
const TASK_META_DIR = '/home/dsh/.dsh/workbench-meta'
const TASK_STATUS_PATH = '/api/workbench/task-status'
const DRAFTS_PATH = '/api/workbench/drafts'
const DRAFT_PATH = '/api/workbench/draft'
const CONFIRM_DRAFT_PATH = '/api/workbench/confirm-draft'
const CHECK_PATH = '/api/workbench/check'
/* 文章硬检脚本（09-30 上线）：独立 Node 工具，git 仓库 DSHing/文章硬检/。
 * 只查草稿区（draftDir）现存的文件 —— 已入库的不再拦。 */
const HARDCHECK_SCRIPT = '/home/dsh/DSHing/文章硬检/硬检.mjs'
const WORKSPACE_ROOT = '/home/dsh/生文'
const ASSIGN_GROUP_PATH = '/api/workbench/assign-client-group'
const CLIENT_MAP_PATH = '/api/workbench/client-map'
const CLIENT_MAP_FILE = '/home/dsh/.dsh/workbench-meta/client-map.json'
const LIBRARY_ROOT = '/srv/dsh-data/文章库'

/* ---- 薄弱问句 / 捕捉词（2026-10-12 改接 DSH）---------------------------
 * 数据来自 dsh-cloud 的「捕捉词」只读接口（与 Support 薄弱问句页同一份 v4 口径）：
 *   GET /api/v1/capture-words/clients        当前用户可见的客户 + 各期（业务线）
 *   GET /api/v1/capture-words?client=&enterprise=  本期问句（qid / status / 差额 / 该在哪补）
 * 宿主只做转发：把浏览器带来的 DSH 登录 cookie（dsh_sid）原样转给 dsh-cloud，
 * 权限完全由 dsh-cloud 按登录用户判定（运营只看到分配给自己的客户）。
 * 不再有共享密钥、不再有「客户名 → 企业 ID」硬编码映射表、宿主侧不缓存跨用户数据。 */
const WEAK_DIR_PATH = '/api/workbench/weak-dir'
const WEAK_GAPS_PATH = '/api/workbench/weak-gaps'
const WEAK_RAW_PATH = '/api/workbench/weak-raw'
/** dsh-cloud 地址：工作台宿主和 dsh-web 在同一台机器上，走本机回环。 */
const DSH_BASE = (firstString(process.env.WORKBENCH_DSH_BASE) || 'http://127.0.0.1:8787').replace(/\/+$/, '')
const DSH_CAPTURE_CLIENTS = '/api/v1/capture-words/clients'
const DSH_CAPTURE_WORDS = '/api/v1/capture-words'
/** 单次请求预算。 */
const DSH_TIMEOUT_MS = 20000

/** 默认服务器名；在 cordis.patch.yml 的 config 里可改。 */
const DEFAULT_KNOWLEDGE_SERVER = 'sora-knowledge'
const DEFAULT_LIBRARY_SERVER = 'sora-articles'

/** 一次工具调用的预算。 */
const TOOL_TIMEOUT_MS = 15000

/* ---------------------------------------------------------------- 工具注册表 */

/** 某个 MCP server 在本 Host 上注册了哪些工具（去掉 `mcp__<server>__` 前缀）。 */
function toolsOf(ctx, server) {
  const prefix = `mcp__${server}__`
  return ctx.tools.schemas()
    .map(schema => schema.name)
    .filter(name => name.startsWith(prefix))
    .map(name => name.slice(prefix.length))
    .sort()
}

/** 挑一个工具：优先用户指定的，其次按名字猜（hierarchy → list → 第一个）。 */
function pickTool(ctx, server, configured, hints) {
  const names = toolsOf(ctx, server)
  if (configured !== '' && names.indexOf(configured) >= 0) return configured
  for (const hint of hints) {
    const hit = names.filter(name => hint.test(name))
    if (hit.length > 0) return hit[0]
  }
  return names.length > 0 ? names[0] : ''
}

/**
 * 调一次 MCP 工具。
 * @param ctx - host context。
 * @param server - MCP server 名。
 * @param tool - 工具短名。
 * @param args - 工具入参。
 * @returns `{ ok: true, value }`，或 `{ ok: false, error, detail }`。
 */
async function callTool(ctx, server, tool, args) {
  try {
    const result = await ctx.tools.execute({
      callId: `workbench-${tool}-${String(Date.now())}`,
      name: `mcp__${server}__${tool}`,
      arguments: args,
      signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
    })
    if (result !== null && typeof result === 'object' && result.isError === true) {
      return { ok: false, error: 'mcp-error', detail: failureText(result) }
    }
    const value = payloadOf(result)
    if (value === null) return { ok: false, error: 'bad-reply', detail: failureText(result) }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, error: 'mcp-error', detail: String(error && error.message ? error.message : error) }
  }
}

/** 从 content 数组里找第一块能当 JSON 解析的文本。 */
function jsonFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return null
  for (const block of blocks) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      try { return JSON.parse(block.text) } catch { /* 不是 JSON，看下一块 */ }
    }
  }
  return null
}

/**
 * 拆掉 mcp-client 的规范包装。
 *
 * DSH 的 MCP 桥把一次 tools/call 的产物包成
 * `{ content: [...], structuredContent: ... }`（见 mcp-client 的 createOutput），
 * 业务数据在 structuredContent 里，或者退一步在 content 的 JSON 文本块里。
 * 直接拿 `result.value` 当业务数据会全部认不出来 —— 这个坑踩过一次。
 * @param value - result.value。
 * @returns 业务数据本身。
 */
function unwrapMcp(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value
  const structured = value.structuredContent
  if (structured !== undefined && structured !== null) {
    if (Array.isArray(structured)) return structured
    if (typeof structured === 'object'
      && (Array.isArray(structured.customers) || Array.isArray(structured.clients) || Array.isArray(structured.items))) {
      return structured
    }
  }
  if (Array.isArray(value.content)) {
    const parsed = jsonFromBlocks(value.content)
    if (parsed !== null) return parsed
  }
  return value
}

/** 工具产物：先拆包装，再退回 harness 自己的 content 文本块。 */
function payloadOf(result) {
  if (result === null || typeof result !== 'object') return null
  const value = result.value
  if (value !== undefined && value !== null) return unwrapMcp(value)
  return jsonFromBlocks(result.content)
}

/** 认不出形状时，把"收到了什么"说清楚，别让人靠猜。 */
function describe(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(${String(value.length)})`
  if (typeof value !== 'object') return typeof value
  const keys = Object.keys(value)
  return `object{${keys.slice(0, 8).join(',')}${keys.length > 8 ? ',…' : ''}}`
}

/** 失败时给人看的一句话。 */
function failureText(result) {
  if (result === null || typeof result !== 'object') return '工具没有任何返回'
  const blocks = Array.isArray(result.content) ? result.content : []
  const texts = blocks
    .filter(block => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
  if (texts.length > 0) return texts.join(' ')
  if (result.error !== undefined && result.error !== null) {
    return typeof result.error === 'string' ? result.error : JSON.stringify(result.error)
  }
  return '工具报错，但没有说明'
}

/* ------------------------------------------------------------------ 归一化 */

function firstString() {
  for (let index = 0; index < arguments.length; index++) {
    const value = arguments[index]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

/* ------------------------------------------------------ 薄弱问句（外部接口） */

/** 宽松取数：认 number，也认数字字符串；认不出返回 null（**不当 0**）。 */
function numberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/** 从浏览器请求里取 DSH 登录 cookie（只取 dsh_sid，别的 cookie 不外传）。 */
function dshSessionCookie(req) {
  const header = req && req.headers ? String(req.headers.cookie || '') : ''
  for (const part of header.split(';')) {
    const item = part.trim()
    if (item.startsWith('dsh_sid=') && item.length > 'dsh_sid='.length) return item
  }
  return ''
}

/** 以当前登录用户身份调 dsh-cloud 一次。返回 { ok, status, json } 或 { ok:false, error, detail }。绝不抛异常。 */
async function dshGet(req, path) {
  const cookie = dshSessionCookie(req)
  if (cookie === '') return { ok: false, error: 'not-logged-in', detail: '没拿到 DSH 登录状态，请从 DSH 页面重新进入工作台。' }
  try {
    const response = await fetch(`${DSH_BASE}${path}`, {
      method: 'GET',
      headers: { accept: 'application/json', cookie, 'accept-encoding': 'identity' },
      signal: AbortSignal.timeout(DSH_TIMEOUT_MS),
    })
    let json = null
    try { json = await response.json() } catch { json = null }
    return { ok: true, status: response.status, json }
  } catch (error) {
    return { ok: false, error: 'unreachable', detail: `连不上 DSH 数据服务：${String(error && error.message ? error.message : error)}` }
  }
}

/** dsh-cloud 返回码 → 人话。 */
function dshErrorText(status, json) {
  const detail = json !== null && typeof json === 'object' && typeof json.detail === 'string' ? json.detail : ''
  if (status === 401) return '登录已过期，请刷新 DSH 页面后再试'
  if (status === 403) return detail || '这个客户没有分配给你'
  if (status === 404) return detail || '这个客户还没有这一期的数据'
  return detail || `数据服务返回 HTTP ${String(status)}`
}

/** 当前用户可见的客户（来自 dsh-cloud，按登录用户过滤）。返回 { ok, customers } 或 { ok:false, error, detail, status }。 */
async function dshClients(req) {
  const called = await dshGet(req, DSH_CAPTURE_CLIENTS)
  if (!called.ok) return called
  if (called.status !== 200 || called.json === null || !Array.isArray(called.json.customers)) {
    return { ok: false, error: called.status === 401 ? 'not-logged-in' : 'dsh-failed', status: called.status, detail: dshErrorText(called.status, called.json) }
  }
  return { ok: true, customers: called.json.customers }
}

/** 把标量字段拼成一句人话（files / chars 这种），没有就不写。 */function metaOf(item) {
  const bits = []
  if (Number.isFinite(item.files)) bits.push(`${String(item.files)} 个文件`)
  if (Number.isFinite(item.chars)) bits.push(`${String(Math.round(item.chars / 1000))}k 字`)
  return bits.join(' · ')
}

/**
 * 客户名单归一化。两种真实形状都认：
 *   - 测试版 `[{ client, files, chars }]`
 *   - 生产版 `{ customers: [{ client_key, display_name, business_lines, service_periods }] }`
 * 缺的层级就是空数组，**不编**。
 * @param raw - 工具返回值。
 * @returns 归一化后的客户数组，或 null。
 */
function normalize(raw) {
  const list = Array.isArray(raw) ? raw : (raw !== null && typeof raw === 'object' && Array.isArray(raw.customers) ? raw.customers : null)
  if (list === null) return null
  const out = []
  for (const item of list) {
    if (item === null || typeof item !== 'object') {
      // 也可能就是一堆客户名字符串
      if (typeof item === 'string' && item.trim() !== '') {
        out.push({ id: item.trim(), name: item.trim(), meta: '', business_lines: [], service_periods: [] })
      }
      continue
    }
    const name = firstString(item.display_name, item.client, item.name, item.title, item.client_key)
    if (name === '') continue
    out.push({
      id: firstString(item.client_key, item.client, item.id) || name,
      name,
      meta: metaOf(item),
      business_lines: Array.isArray(item.business_lines) ? item.business_lines : [],
      service_periods: Array.isArray(item.service_periods) ? item.service_periods : [],
    })
  }
  return out
}

/** 文章列表可以是字符串数组，也可以是对象数组；统一成 {id,title}。 */
function normalizeArticles(raw) {
  const list = Array.isArray(raw) ? raw : (raw !== null && typeof raw === 'object' && Array.isArray(raw.items) ? raw.items : null)
  if (list === null) return null
  const out = []
  for (const item of list) {
    if (typeof item === 'string') {
      if (item.trim() !== '') out.push({ id: item.trim(), title: item.trim() })
      continue
    }
    if (item === null || typeof item !== 'object') continue
    const title = firstString(item.title, item.name, item.file, item.id)
    if (title === '') continue
    out.push({ id: firstString(item.id, item.key, title) || title, title })
  }
  return out
}

function sendJson(res, body) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function methodNotAllowed(res) {
  res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ ok: false, error: 'method-not-allowed' }))
}

/* 归一化函数导出，只为离线自检用（宿主加载器只用 apply）：
 *   node --input-type=module -e "import('./lib/index.js').then(m => …)" */
export { normalize, normalizeArticles, payloadOf }

/**
 * 造出这一版实现的路由处理函数。壳（lib/index.js）每个请求调一次，
 * 所以这里可以随便改、不用重启。
 * @param ctx - host plugin context（需要 webServer / tools / skills）。
 * @param config - this row's config from cordis.patch.yml。
 * @returns `{ handlers: { [path]: (req, res) => Promise<void> } }`。
 */
export function create(ctx, config) {
  const cfg = config !== null && typeof config === 'object' ? config : {}
  const knowledgeServer = firstString(cfg.knowledgeServer) || DEFAULT_KNOWLEDGE_SERVER
  const libraryServer = firstString(cfg.libraryServer) || DEFAULT_LIBRARY_SERVER
  const clientsTool = firstString(cfg.clientsTool)
  const articlesTool = firstString(cfg.articlesTool) || 'list_articles'

  const hostCtx = ctx
  const handlers = {}

    /* ---- 诊断：这台 Host 挂了哪些 MCP、各有哪些工具 ---------------- */
    handlers[MCP_INFO_PATH] = (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const servers = new Map()
      for (const name of hostCtx.tools.schemas().map(schema => schema.name)) {
        const match = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(name)
        if (match === null) continue
        if (!servers.has(match[1])) servers.set(match[1], [])
        servers.get(match[1]).push(match[2])
      }
      sendJson(res, {
        ok: true,
        configured: { knowledgeServer, libraryServer, clientsTool, articlesTool },
        servers: [...servers.entries()]
          .map(([server, tools]) => ({ server, tools: tools.sort() }))
          .sort((a, b) => a.server.localeCompare(b.server)),
        toolCount: hostCtx.tools.schemas().length,
      })
    }

    /* ---- 薄弱问句：可查客户目录（来自 dsh-cloud，按登录用户过滤）-----------
     * 形状保持不变：customers[{ id(默认期企业 ID), clientKey, name, collectedAt, inWindow, lines[] }]。
     * 前端按客户名和知识库客户对上（两边都来自 DSH，名字一致）。 */
    handlers[WEAK_DIR_PATH] = async (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const listed = await dshClients(req)
      if (!listed.ok) { sendJson(res, { ok: false, error: listed.error, detail: listed.detail }); return }
      const customers = []
      const unmapped = []
      for (const item of listed.customers) {
        const lines = Array.isArray(item.lines) ? item.lines : []
        const name = firstString(item.name, item.clientKey)
        if (lines.length === 0) { unmapped.push(name); continue }
        const primary = lines.find(line => line.is_default) || lines[0]
        customers.push({
          id: firstString(primary.enterprise_id),
          clientKey: firstString(item.clientKey),
          name,
          meta: '',
          collectedAt: '',
          inWindow: true,
          /* 多期/多业务线客户：前端拿这个填「业务线」下拉。单期客户是空数组。 */
          lines: lines.length > 1
            ? lines.map(line => ({ name: firstString(line.name, line.enterprise_id), id: firstString(line.enterprise_id), collectedAt: '', inWindow: true }))
            : [],
        })
      }
      sendJson(res, { ok: true, customers, unmapped, insightsError: null, source: 'dsh' })
    }

    /* ---- 诊断：原样返回 dsh-cloud 的客户目录（只含当前用户可见的客户）------ */
    handlers[WEAK_RAW_PATH] = async (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const listed = await dshClients(req)
      sendJson(res, listed.ok ? { ok: true, base: DSH_BASE, customers: listed.customers } : { ok: false, error: listed.error, detail: listed.detail })
    }

    /* ---- 薄弱问句：某个客户本期全部问句（转发 dsh-cloud 捕捉词接口）---------
     * 前端只传企业 ID（client_id）；宿主在当前用户可见的客户里找到它属于哪个客户，
     * 找不到就是没权限 —— 不猜、不外查。 */
    handlers[WEAK_GAPS_PATH] = async (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url ?? '/', 'http://dsh.invalid')
      const enterpriseId = (url.searchParams.get('client_id') ?? '').trim()
      if (enterpriseId === '') { sendJson(res, { ok: false, error: 'bad-request', detail: '缺少 client_id 参数' }); return }
      const listed = await dshClients(req)
      if (!listed.ok) { sendJson(res, { ok: false, error: listed.error, detail: listed.detail }); return }
      let clientKey = ''
      for (const item of listed.customers) {
        if ((Array.isArray(item.lines) ? item.lines : []).some(line => firstString(line.enterprise_id) === enterpriseId)) { clientKey = firstString(item.clientKey); break }
      }
      if (clientKey === '') { sendJson(res, { ok: false, error: 'not-allowed', detail: '这个客户没有分配给你。' }); return }
      const called = await dshGet(req, `${DSH_CAPTURE_WORDS}?client=${encodeURIComponent(clientKey)}&enterprise=${encodeURIComponent(enterpriseId)}`)
      if (!called.ok) { sendJson(res, { ok: false, error: called.error, detail: called.detail }); return }
      if (called.status !== 200 || called.json === null) {
        sendJson(res, { ok: false, error: called.status === 403 ? 'not-allowed' : called.status === 404 ? 'no-data' : 'dsh-failed', status: called.status, detail: dshErrorText(called.status, called.json) })
        return
      }
      const body = called.json
      const questions = Array.isArray(body.questions) ? body.questions : []
      if (questions.length === 0) {
        sendJson(res, { ok: false, error: 'no-data', status: 404, detail: '这个客户这一期还没有薄弱问句数据（可能还在计算）。' })
        return
      }
      sendJson(res, {
        ok: true,
        client: firstString(body.client, clientKey),
        clientKey,
        clientId: enterpriseId,
        collectedAt: firstString(body.collectedAt),
        taskId: firstString(body.taskId),
        excluded: null,
        algoVersion: firstString(body.algo_version),
        runId: firstString(body.run_id),
        counts: body.counts || null,
        /* 每条：qid / question / root / status(weak|behind|lead) / platforms[{name,gap,status}] /
         * summary{gap,weakCount} / sources_top（该在哪补前 3）。gap 单位百分点，正数 = 我们落后。 */
        questions,
      })
    }

    /* ---- 知识库：客户名单（不缓存）-------------------------------- */
    handlers[CLIENTS_PATH] = async (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const tool = pickTool(hostCtx, knowledgeServer, clientsTool, [/hierarch/i, /(list|space|customer|client)/i])
      if (tool === '') {
        sendJson(res, {
          ok: false,
          error: 'mcp-missing',
          detail: `没找到 ${knowledgeServer} 的工具。设置 → MCP 里确认这台服务器已连接。`,
          available: hostCtx.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('mcp__')).sort(),
        })
        return
      }
      const called = await callTool(hostCtx, knowledgeServer, tool, {})
      if (!called.ok) {
        sendJson(res, { ok: false, error: called.error, detail: called.detail, server: knowledgeServer, tool })
        return
      }
      const customers = normalize(called.value)
      if (customers === null) {
        sendJson(res, { ok: false, error: 'bad-reply', detail: `认不出 ${tool} 的返回形状（收到 ${describe(called.value)}）`, server: knowledgeServer, tool })
        return
      }
      /* 知识库不给产品线时，用 DSH 里该客户的各期（业务线）补上 —— 业务线是**选的**，
       * 而企业 ID 绑在业务线上（华熙生物四条线各一个企业）。取不到就不补，不影响名单。 */
      const dshListed = await dshClients(req)
      const dshLinesByName = new Map()
      if (dshListed.ok) {
        for (const item of dshListed.customers) dshLinesByName.set(firstString(item.name), Array.isArray(item.lines) ? item.lines : [])
      }
      for (const customer of customers) {
        if (Array.isArray(customer.business_lines) && customer.business_lines.length > 0) continue
        const lines = dshLinesByName.get(firstString(customer.name)) || []
        if (lines.length > 1) {
          customer.business_lines = lines.map(line => ({ id: firstString(line.name, line.enterprise_id), name: firstString(line.name, line.enterprise_id) }))
        }
      }
      sendJson(res, { ok: true, customers, server: knowledgeServer, tool })
    }

    /* ---- 文章库：某个客户已有的文章 -------------------------------- */
    handlers[ARTICLES_PATH] = async (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url ?? '/', 'http://dsh.invalid')
      const client = (url.searchParams.get('client') ?? '').trim()
      if (client === '') {
        sendJson(res, { ok: false, error: 'bad-request', detail: '缺少 client 参数' })
        return
      }
      const tool = pickTool(hostCtx, libraryServer, articlesTool, [/list/i, /article/i])
      if (tool === '') {
        sendJson(res, {
          ok: false,
          error: 'mcp-missing',
          detail: `没找到 ${libraryServer} 的工具。设置 → MCP 里确认这台服务器已连接。`,
        })
        return
      }
      const called = await callTool(hostCtx, libraryServer, tool, { client })
      if (!called.ok) {
        sendJson(res, { ok: false, error: called.error, detail: called.detail, server: libraryServer, tool })
        return
      }
      const articles = normalizeArticles(called.value)
      if (articles === null) {
        sendJson(res, { ok: false, error: 'bad-reply', detail: `认不出 ${tool} 的返回形状（收到 ${describe(called.value)}）`, server: libraryServer, tool })
        return
      }
      sendJson(res, { ok: true, articles, client, server: libraryServer, tool })
    }

    /* ---- 客户分组（2026-09-26）：左侧栏"工作区"当客户分组用 ----------
     * 装配台发起 → PromptRelay 拿到空白会话 id 后调这里：
     * 找 title=客户 的工作区（没有就建一个），把会话 attach 进去。
     * 左侧树就变成「客户 → 会话」，不再是无分组的工作区平铺。 */
    handlers[ASSIGN_GROUP_PATH] = async (req, res) => {
      if (req.method !== 'POST') { methodNotAllowed(res); return }
      let body = ''
      req.on('data', chunk => { body += chunk })
      await new Promise(resolve => req.on('end', resolve))
      let parsed = {}
      try { parsed = JSON.parse(body || '{}') } catch { parsed = {} }
      const sessionId = String(parsed.session ?? '')
      const client = String(parsed.client ?? '').replace(/[/\\]/g, '')
      const topic = String(parsed.topic ?? '').slice(0, 120)
      if (!sessionId || !client) { sendJson(res, { ok: false, error: 'no-args' }); return }
      try {
        let map = {}
        try { map = JSON.parse(readFileSync(CLIENT_MAP_FILE, 'utf8')) } catch { map = {} }
        map[sessionId] = { client, topic, at: new Date().toISOString() }
        mkdirSync(dirname(CLIENT_MAP_FILE), { recursive: true })
        writeFileSync(CLIENT_MAP_FILE, JSON.stringify(map, null, 2))
        sendJson(res, { ok: true })
      } catch (error) {
        sendJson(res, { ok: false, error: 'map-failed', detail: String(error && error.message ? error.message : error) })
      }
    }

    /* 自绘侧栏（2026-09-26）：左侧栏整体自绘，"客户"只是前端分组。
     * 会话清单来自官方 sessions 服务；这里是"会话→客户"的业务映射表。 */
    handlers[CLIENT_MAP_PATH] = async (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      try {
        const map = JSON.parse(readFileSync(CLIENT_MAP_FILE, 'utf8'))
        sendJson(res, { ok: true, map })
      } catch {
        sendJson(res, { ok: true, map: {} })
      }
    }

    /* ---- 技能：dsh-skill-remote 注册的 provider 目录 ---------------- */
    handlers[SKILLS_PATH] = async (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      try {
        const summaries = await hostCtx.skills.list({ cwd: process.cwd(), signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) })
        sendJson(res, {
          ok: true,
          skills: summaries.map(summary => {
            /* 技能分层（2026-09-23，配合 dsh-skill-remote f4d25a3）：
             * 服务端按「公共 / 中间层 / 个人」三层存技能，provider 把 layer
             * 放进 metadata.layer（source 也带）。取不到就空串，前端归「其他」。 */
            const metaLayer = summary.metadata !== null && typeof summary.metadata === 'object'
              && typeof summary.metadata.layer === 'string' ? summary.metadata.layer : ''
            const layer = metaLayer !== '' ? metaLayer
              : (typeof summary.source === 'string' && summary.source !== 'remote' ? summary.source : '')
            return {
              name: String(summary.name ?? ''),
              description: String(summary.description ?? ''),
              whenToUse: typeof summary.whenToUse === 'string' ? summary.whenToUse : '',
              provider: String(summary.provider ?? ''),
              layer,
              modelInvocable: summary.invocation === undefined ? true : summary.invocation.modelInvocable === true,
            }
          }).filter(skill => skill.name !== ''),
        })
      } catch (error) {
        sendJson(res, {
          ok: false,
          error: 'skills-unavailable',
          detail: String(error && error.message ? error.message : error),
        })
      }
    }

    /* ---- 任务参数存取（C1 顶部任务条的数据源，2026-09-23）------------
     * 装配台发起时 POST 一份装配参数，拿到 id；预填消息尾部带 [任务编号：id]，
     * 会话页顶部的任务条凭 id 读回参数展示。存 /home/dsh/.dsh/workbench-meta/
     * （不在工作区内容里，agent 碰不到 —— 它没有文件工具）。 */
    handlers[TASK_META_PATH] = async (req, res) => {
      if (req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        await new Promise(resolve => req.on('end', resolve))
        let parsed
        try { parsed = JSON.parse(body || '{}') } catch { parsed = {} }
        const id = 'wbtm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
        try {
          mkdirSync(TASK_META_DIR, { recursive: true })
          writeFileSync(
            join(TASK_META_DIR, id + '.json'),
            JSON.stringify({ ...parsed, savedAt: new Date().toISOString() }, null, 2),
          )
          sendJson(res, { ok: true, id })
        } catch (error) {
          sendJson(res, { ok: false, error: 'save-failed', detail: String(error && error.message ? error.message : error) })
        }
        return
      }
      if (req.method === 'GET') {
        const url = new URL(req.url, 'http://localhost')
        const id = String(url.searchParams.get('id') ?? '')
        if (!/^wbtm-[a-z0-9-]+$/.test(id)) { sendJson(res, { ok: false, error: 'bad-id' }); return }
        try {
          const raw = readFileSync(join(TASK_META_DIR, id + '.json'), 'utf8')
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(raw)
        } catch {
          sendJson(res, { ok: false, error: 'not-found' })
        }
        return
      }
      methodNotAllowed(res)
    }

    /* ---- 任务进程的客观卡点（2026-09-23）--------------------------
     * 按客户名探测两个位置：工作区目录（产物）与文章库（入库）。
     * 只报事实：目录是否存在 / 文件数 / 最近 24h 新增数。 */
    handlers[TASK_STATUS_PATH] = (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url, 'http://localhost')
      const client = String(url.searchParams.get('client') ?? '').replace(/[/\\]/g, '')
      if (!client) { sendJson(res, { ok: false, error: 'no-client' }); return }
      /* 2026-09-24：卡点按「本任务」算 —— since = 任务发起时刻（meta.savedAt）。
       * 不传 since 才退回 24h 窗口。上一单的入库不再冒充本任务的进度。 */
      const sinceRaw = url.searchParams.get('since') ?? ''
      const sinceParsed = Date.parse(sinceRaw)
      const since = Number.isFinite(sinceParsed) && sinceParsed > 0 ? sinceParsed : Date.now() - 24 * 3600 * 1000
      function probe(root) {
        const dir = join(root, client)
        try {
          const entries = readdirSync(dir, { withFileTypes: true })
          const files = entries.filter(e => e.isFile()).map(e => e.name)
          let recent = 0
          for (const name of files) {
            try { if (statSync(join(dir, name)).mtimeMs > since) recent += 1 } catch { }
          }
          /* 明细清单：前端拿它跟会话消息流的 write 调用做交集，
           * "本任务新增 N 篇"才真的归属本会话（时刻口径会串）。 */
          const list = files.filter(n => n.toLowerCase().endsWith('.md')).map(n => n.replace(/\.md$/i, ''))
          return { exists: true, files: files.length, recent, list }
        } catch {
          return { exists: false, files: 0, recent: 0, list: [] }
        }
      }
      sendJson(res, { ok: true, workspace: probe(WORKSPACE_ROOT), library: probe(LIBRARY_ROOT) })
    }

    /* ---- 草稿区（2026-09-24）：write(draft:true) 落「文章库/<客户>/草稿/」，
     * 人在工作台预览 → 确认 → 宿主把文件挪到正式位置（rename，查重幂等）。
     * 卷共享，入库动作不经过 MCP 容器。 */
    const draftDir = client => join(LIBRARY_ROOT, String(client).replace(/[/\\]/g, ''), '草稿')
    const safeFile = name => {
      const s = String(name ?? '')
      if (!s || s.includes('/') || s.includes('\\') || s.includes('..')) throw new Error('bad file name')
      return s.endsWith('.md') ? s : s + '.md'
    }
    handlers[DRAFTS_PATH] = (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url, 'http://localhost')
      const client = String(url.searchParams.get('client') ?? '').replace(/[/\\]/g, '')
      if (!client) { sendJson(res, { ok: false, error: 'no-client' }); return }
      try {
        const dir = draftDir(client)
        const out = []
        for (const name of readdirSync(dir)) {
          if (!name.toLowerCase().endsWith('.md')) continue
          const st = statSync(join(dir, name))
          out.push({ title: name.replace(/\.md$/i, ''), chars: st.size, updatedAt: new Date(st.mtimeMs).toISOString() })
        }
        out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        /* 正式库同名清单：前端用它把已入库的稿标绿锁定 */
        const library = []
        try {
          const libDir = join(LIBRARY_ROOT, client)
          for (const name of readdirSync(libDir)) {
            if (!name.toLowerCase().endsWith('.md')) continue
            const clean = name.replace(/\.md$/i, '')
            library.push(clean)
            /* 草稿区没有、正式库有的（入库时复制的）也列出来，带真实入库
             * 时间 —— 前端统一按"本任务发起时刻"过滤，旧任务的进不来。 */
            if (!out.some(d => d.title === clean)) {
              const lst = statSync(join(libDir, name))
              out.push({ title: clean, chars: lst.size, updatedAt: new Date(lst.mtimeMs).toISOString() })
            }
          }
        } catch { /* 客户还没有正式库目录 */ }
        sendJson(res, { ok: true, drafts: out, library })
      } catch { sendJson(res, { ok: true, drafts: [] }) }
    }
    /* 草稿：GET 读正文；PUT 保存审校面板里手改过的正文。
     * 写只落草稿区（覆盖同名文件）—— 正式库只能靠 confirm-draft 复制过去，
     * 这里绝不碰；路径照样过 safeFile + 只认草稿区已存在的文件。 */
    handlers[DRAFT_PATH] = (req, res) => {
      if (req.method === 'GET') {
        const url = new URL(req.url, 'http://localhost')
        const client = String(url.searchParams.get('client') ?? '').replace(/[/\\]/g, '')
        try {
          const file = safeFile(url.searchParams.get('title'))
          const text = readFileSync(join(draftDir(client), file), 'utf8')
          res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' })
          res.end(text)
        } catch { sendJson(res, { ok: false, error: 'not-found' }, 404) }
        return
      }
      if (req.method !== 'PUT') { methodNotAllowed(res); return }
      let body = ''
      req.on('data', c => { body += c; if (body.length > 4e6) req.destroy() })
      req.on('end', () => {
        try {
          const { client, title, text } = JSON.parse(body || '{}')
          const cl = String(client ?? '').replace(/[/\\]/g, '')
          if (!cl) { sendJson(res, { ok: false, error: 'no-client' }, 400); return }
          if (typeof text !== 'string') { sendJson(res, { ok: false, error: 'no-text' }, 400); return }
          const dst = join(draftDir(cl), safeFile(title))
          if (!existsSync(dst)) { sendJson(res, { ok: false, error: 'draft-missing' }, 404); return }
          writeFileSync(dst, text, 'utf8')
          sendJson(res, { ok: true, bytes: Buffer.byteLength(text, 'utf8') })
        } catch (e) {
          sendJson(res, { ok: false, error: 'save-failed', detail: String(e && e.message ? e.message : e) }, 500)
        }
      })
    }
    handlers[CONFIRM_DRAFT_PATH] = (req, res) => {
      if (req.method !== 'POST') { methodNotAllowed(res); return }
      let body = ''
      req.on('data', c => { body += c; if (body.length > 1e6) req.destroy() })
      req.on('end', () => {
        try {
          const { client, title } = JSON.parse(body || '{}')
          const src = join(draftDir(client), safeFile(title))
          if (!existsSync(src)) { sendJson(res, { ok: false, error: 'draft-missing' }, 404); return }
          /* 正式库重名不再拒绝（2026-10-10）：自动把时间缀到文件名上，
           * 例如《geo公司哪家好》→《geo公司哪家好-20261010-153045.md》。
           * 同一秒撞车（基本不可能）再退到 -2、-3。原文件永远不被覆盖。 */
          const dir = join(LIBRARY_ROOT, String(client).replace(/[/\\]/g, ''))
          const raw = safeFile(title)
          const base = raw.toLowerCase().endsWith('.md') ? raw.slice(0, -3) : raw
          const p2 = n => String(n).padStart(2, '0')
          const d = new Date()
          const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
          let dst = join(dir, `${base}.md`)
          if (existsSync(dst)) {
            dst = join(dir, `${base}-${stamp}.md`)
            let n = 2
            while (existsSync(dst)) { dst = join(dir, `${base}-${stamp}-${n}.md`); n += 1 }
          }
          mkdirSync(dirname(dst), { recursive: true })
          /* 原型约定：入库后工作区草稿暂时不删（跟定期自动清理一起做）——
           * 复制不移动，R 区还能看到已入库的稿（绿勾锁定）。 */
          copyFileSync(src, dst)
          sendJson(res, { ok: true, movedTo: dst, finalTitle: basename(dst, '.md') })
        } catch (e) { sendJson(res, { ok: false, error: 'confirm-failed', detail: String(e && e.message ? e.message : e) }, 500) }
      })
    }

    /* 硬检：前端点名要查哪几篇（界面看到几篇查几篇，不扫目录）。
     * 逐篇定位草稿区文件，拼给硬检脚本 --json，透传结构化结果。 */
    handlers[CHECK_PATH] = (req, res) => {
      if (req.method !== 'POST') { methodNotAllowed(res); return }
      let body = ''
      req.on('data', c => { body += c; if (body.length > 1e6) req.destroy() })
      req.on('end', async () => {
        try {
          const { client, titles } = JSON.parse(body || '{}')
          const cl = String(client ?? '').replace(/[/\\]/g, '')
          const list = (Array.isArray(titles) ? titles : []).slice(0, 50)
          if (!cl || list.length === 0) { sendJson(res, { ok: false, error: 'no-client-or-titles' }); return }
          const files = []
          for (const raw of list) {
            try {
              const safe = safeFile(raw)
              const draft = join(draftDir(cl), safe)
              if (existsSync(draft)) { files.push(draft); continue }
              /* 正式库兜底：已入库的文章也能复查（老文件当年是 rename 走的，草稿区没有） */
              const lib = join(LIBRARY_ROOT, cl, safe)
              if (existsSync(lib)) files.push(lib)
            } catch { /* 坏名字直接跳过 */ }
          }
          if (files.length === 0) { sendJson(res, { ok: false, error: 'no-files' }); return }
          let stdout = ''
          try {
            stdout = (await execFileP(process.execPath, [HARDCHECK_SCRIPT, ...files, '--json'],
              { timeout: 20000, maxBuffer: 10 * 1024 * 1024 })).stdout
          } catch (eRun) {
            /* 硬检 CLI 惯例：查出「拦」时退出码 1 —— stdout 里的 JSON 仍是完整结果 */
            stdout = (eRun && eRun.stdout) || ''
            if (!stdout) throw eRun
          }
          const parsed = JSON.parse(stdout)
          sendJson(res, { ok: true, results: parsed.results || [] })
        } catch (e) {
          sendJson(res, { ok: false, error: 'hardcheck-failed', detail: (String(e && e.message ? e.message : e) + ' ' + String(e && e.stderr ? e.stderr : '')).slice(0, 400) }, 500)
        }
      })
    }

  return { handlers }
}
