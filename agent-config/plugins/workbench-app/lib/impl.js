/* dsh-workbench — 宿主半边的**实现**（被 lib/index.js 按 mtime 热加载）。
 *
 * 为什么单独一个文件：宿主插件的代码改了，DSH 要重启才生效（模块被 import 缓存），
 * 而客户端半边是热重载的。所以真正的逻辑放在这里，index.js 每次请求按 mtime
 * 重新 import 它 —— 从此改这个文件不用重启。
 *
 * 浏览器做不到的事：调 MCP、列技能。全部走 DSH 自己已经挂好的东西，
 * **不自己配地址、不碰任何 token**：
 *
 *   客户    → `ctx.tools.execute('mcp__knowledge__list_clients')`
 *   文章库  → `ctx.tools.execute('mcp__articles__list_articles')`
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
 *   POST/GET /api/workbench/task-meta       → 装配参数；POST 持久化 client_key(CUS-*) + display client
 *   GET/POST /api/workbench/session-client  → session_id ↔ client_key 索引
 *   POST /api/workbench/confirm-draft       → 绑死 client_key → write_article(draft:false) + 本地草稿挪正式
 */


import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, renameSync, unlinkSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'

const CLIENTS_PATH = '/api/workbench/clients'
const SKILLS_PATH = '/api/workbench/skills'
const ARTICLES_PATH = '/api/workbench/articles'
const MCP_INFO_PATH = '/api/workbench/mcp'
const TASK_META_PATH = '/api/workbench/task-meta'
// Test overrides are resolved at use time; production storage stays in place.
const taskMetaDir = () => process.env.DSH_WORKBENCH_META_DIR || '/home/dsh/.dsh/workbench-meta'
const TASK_STATUS_PATH = '/api/workbench/task-status'
const DRAFTS_PATH = '/api/workbench/drafts'
const DRAFT_PATH = '/api/workbench/draft'
const CONFIRM_DRAFT_PATH = '/api/workbench/confirm-draft'
const SESSION_CLIENT_PATH = '/api/workbench/session-client'
const sessionClientIndex = () => join(taskMetaDir(), 'session-client-index.json')
const ASSIGN_GROUP_PATH = '/api/workbench/assign-client-group'
const CLIENT_MAP_PATH = '/api/workbench/client-map'
const clientMapFile = () => join(taskMetaDir(), 'client-map.json')
const workspaceRoot = () => process.env.DSH_WORKBENCH_WORKSPACE_ROOT || '/home/dsh/生文'
const libraryRoot = () => process.env.DSH_WORKBENCH_LIBRARY_ROOT || '/srv/dsh-data/文章库'

const clientPathName = value => String(value ?? '').replace(/[/\\]/g, '')

function jsonArray(raw) {
  if (typeof raw !== 'string') return undefined
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value : undefined
  } catch { return undefined }
}

function grantSet(raw) {
  const values = jsonArray(raw)
  return values === undefined ? undefined : new Set(values.filter(value => typeof value === 'string' && value !== ''))
}

/** Identity and grants come only from the trusted gateway / harness environment. */
function requestScope(req) {
  const headers = req.headers || {}
  const cloud = process.env.DSH_ROOT !== undefined || process.env.DSH_ALLOWED_PROJECT_IDS !== undefined
    || headers['x-dsh-allowed-client-keys'] !== undefined
  const env = grantSet(process.env.DSH_ALLOWED_PROJECT_IDS)
  const live = grantSet(headers['x-dsh-allowed-client-keys'])
  const allowed = env !== undefined && live !== undefined
    ? new Set([...env].filter(key => live.has(key))) : (env ?? live ?? new Set())
  let uid = firstString(headers['x-dsh-uid'])
  if (!uid && process.env.DSH_ROOT && process.env.DSH_HOME) {
    const home = resolve(process.env.DSH_HOME)
    if (dirname(home) === resolve(process.env.DSH_ROOT, 'homes')) uid = basename(home)
  }
  const namesHeader = headers['x-dsh-allowed-clients']
  const names = new Set()
  for (const entry of jsonArray(namesHeader) || []) {
    if (entry && allowed.has(entry.key) && typeof entry.name === 'string' && entry.name !== '') names.add(clientPathName(entry.name))
  }
  return { cloud, uid, allowed, names, needsNames: namesHeader === undefined }
}

function authorizedClient(scope, value) {
  if (!scope.cloud) return true
  if (typeof value !== 'string' || value === '') return false
  const name = clientPathName(value)
  // These directory components must never address the shared root or its parent.
  if (!name || name === '.' || name === '..') return false
  return scope.allowed.has(value) || scope.allowed.has(name) || scope.names.has(name)
}

function visibleRecord(scope, record) {
  if (!scope || !scope.cloud) return true
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false
  if (record.owner_uid && record.owner_uid !== scope.uid) return false
  if (record.client_key) return scope.allowed.has(record.client_key)
  if (record.client) return authorizedClient(scope, record.client)
  return Boolean(record.owner_uid) && record.owner_uid === scope.uid
}

function visibleEntries(scope, index) {
  return scope.cloud ? Object.fromEntries(Object.entries(index).filter(([, entry]) => visibleRecord(scope, entry))) : index
}

function authorizedBinding(scope, body) {
  const key = firstString(body && body.client_key)
  return !scope.cloud || (key !== '' ? scope.allowed.has(key) : !firstString(body && body.client) || authorizedClient(scope, firstString(body.client)))
}

function stampOwner(scope, record) {
  if (scope.cloud) {
    delete record.owner_uid
    if (scope.uid) record.owner_uid = scope.uid
  }
  return record
}

function ownEntry(index, id) {
  return Object.hasOwn(index, id) ? index[id] : undefined
}

function forbidden(res) { sendJson(res, { ok: false, error: 'forbidden' }, 403) }

/** 默认服务器名；在 cordis.patch.yml 的 config 里可改。 */
const DEFAULT_KNOWLEDGE_SERVER = 'knowledge'
const DEFAULT_LIBRARY_SERVER = 'articles'

const KNOWLEDGE_SERVER_ALIASES = ['knowledge', 'sora-knowledge']
const LIBRARY_SERVER_ALIASES = ['articles', 'sora-articles']

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
  if (configured !== '') return ''
  return names.length > 0 ? names[0] : ''
}

/**
 * Resolve a configured server to the first alias that has any registered tools.
 * The configured name remains first so Noah's sora-* names continue to work.
 */
function resolveServer(ctx, preferred, fallbacks) {
  const candidates = []
  for (const server of [preferred, ...(Array.isArray(fallbacks) ? fallbacks : [])]) {
    const name = firstString(server)
    if (name !== '' && !candidates.includes(name)) candidates.push(name)
  }
  for (const server of candidates) {
    if (toolsOf(ctx, server).length > 0) return server
  }
  return candidates[0] || ''
}

/** Pick a tool and its server, trying aliases when the preferred server has no match. */
function resolveTool(ctx, preferred, fallbacks, configured, hints) {
  const candidates = []
  for (const server of [preferred, ...(Array.isArray(fallbacks) ? fallbacks : [])]) {
    const name = firstString(server)
    if (name !== '' && !candidates.includes(name)) candidates.push(name)
  }
  /* An explicitly configured tool must win on any alias before heuristic
   * selection; otherwise a preferred server's read tool could mask a
   * fallback server's list/write tool. */
  if (configured !== '') {
    for (const server of candidates) {
      if (toolsOf(ctx, server).includes(configured)) return { server, tool: configured }
    }
    for (const server of candidates) {
      const names = toolsOf(ctx, server)
      for (const hint of hints) {
        const hit = names.find(name => hint.test(name))
        if (hit !== undefined) return { server, tool: hit }
      }
    }
    return { server: resolveServer(ctx, preferred, fallbacks), tool: '' }
  }
  for (const server of candidates) {
    const tool = pickTool(ctx, server, configured, hints)
    if (tool !== '') return { server, tool }
  }
  return { server: resolveServer(ctx, preferred, fallbacks), tool: '' }
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
      && (Array.isArray(structured.customers) || Array.isArray(structured.clients)
        || Array.isArray(structured.items) || Array.isArray(structured.articles))) {
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

/** 把标量字段拼成一句人话（files / chars 这种），没有就不写。 */
function metaOf(item) {
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
  const items = normalizeLibraryArticles(raw)
  return items === null ? null : items.map(item => ({ id: item.id, title: item.title }))
}

/** Normalize article metadata while retaining the fields used by draft parity. */
function normalizeLibraryArticles(raw) {
  const list = Array.isArray(raw) ? raw : (raw !== null && typeof raw === 'object'
    ? (Array.isArray(raw.items) ? raw.items : (Array.isArray(raw.articles) ? raw.articles : null))
    : null)
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
    const entry = { id: firstString(item.id, item.key, title) || title, title }
    const status = firstString(item.status, item.state).toLowerCase()
    if (status !== '') entry.status = status
    if (Number.isFinite(Number(item.chars))) entry.chars = Number(item.chars)
    const updatedAt = firstString(item.updatedAt, item.updated_at, item.updated)
    if (updatedAt !== '') entry.updatedAt = updatedAt
    out.push(entry)
  }
  return out
}

/** Read article content from the common Support MCP response shapes. */
function articleContent(raw) {
  const value = unwrapMcp(raw)
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object') return null
  for (const key of ['content', 'body_inline', 'body', 'text', 'markdown']) {
    if (typeof value[key] === 'string') return value[key]
  }
  return null
}

/**
 * Merge local filesystem entries with Support article metadata.
 * Local ready entries remain in drafts for the existing locked-section UI;
 * MCP ready entries are exposed through `library` and MCP drafts through `drafts`.
 */
function mergeDraftLists(localDrafts, localReady, mcpArticles) {
  const drafts = Array.isArray(localDrafts) ? localDrafts.map(item => ({ ...item })) : []
  const ready = Array.isArray(localReady) ? localReady : []
  const draftTitles = new Set(drafts.map(item => firstString(item && item.title)).filter(Boolean))
  const library = []
  const addLibrary = title => {
    const clean = firstString(title)
    if (clean !== '' && !library.includes(clean)) library.push(clean)
  }
  for (const item of ready) {
    const title = firstString(item && item.title)
    if (title === '') continue
    addLibrary(title)
    if (!draftTitles.has(title)) {
      drafts.push({ ...item, title })
      draftTitles.add(title)
    }
  }
  if (Array.isArray(mcpArticles)) {
    for (const item of mcpArticles) {
      const title = firstString(item && item.title)
      if (title === '') continue
      const status = firstString(item.status).toLowerCase()
      if (status === 'ready') addLibrary(title)
      if (status === 'draft' && !draftTitles.has(title)) {
        drafts.push({ ...item, title })
        draftTitles.add(title)
      }
    }
  }
  drafts.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  return { drafts, library }
}

/** 从 POST body 造 task-meta 落盘记录：强制字符串化 client_key / client。 */
function taskMetaRecordFromBody(parsed) {
  const base = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {}
  const clientKey = firstString(base.client_key)
  const client = firstString(base.client)
  if (clientKey !== '') base.client_key = clientKey
  else delete base.client_key
  if (client !== '') base.client = client
  base.savedAt = new Date().toISOString()
  return base
}

/** 读 session↔client 索引；坏文件当空对象。 */
function readSessionClientIndex(filePath) {
  const path = filePath || sessionClientIndex()
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch { /* 缺文件 / 坏 JSON → 空 */ }
  return {}
}

/** 原子写索引。 */
function writeSessionClientIndex(index, filePath) {
  const path = filePath || sessionClientIndex()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(index, null, 2))
  renameSync(tmp, path)
}

/**
 * 合并一条绑定。session_id 必填；client_key 可空（表示未归类占位）。
 * @returns 更新后的 entry。
 */
function mergeSessionClientBinding(index, sessionId, entry) {
  const id = firstString(sessionId)
  if (id === '') throw new Error('missing-session-id')
  const stored = ownEntry(index, id)
  const prev = (stored !== null && typeof stored === 'object') ? stored : {}
  const next = {
    client_key: firstString(entry && entry.client_key, prev.client_key),
    client: firstString(entry && entry.client, prev.client),
    meta_id: firstString(entry && entry.meta_id, prev.meta_id),
    topic: firstString(entry && entry.topic, prev.topic),
    bound_at: firstString(entry && entry.bound_at) || new Date().toISOString(),
  }
  if (prev.owner_uid) next.owner_uid = prev.owner_uid
  Object.defineProperty(index, id, { value: next, enumerable: true, configurable: true, writable: true })
  return next
}


/**
 * 读 task-meta JSON；坏 id / 缺文件 → null。
 * @param {string} metaId
 * @returns {object|null}
 */
function readTaskMetaRecord(metaId) {
  const id = firstString(metaId)
  if (!/^wbtm-[a-z0-9-]+$/.test(id)) return null
  try {
    const raw = readFileSync(join(taskMetaDir(), id + '.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch { /* missing / bad */ }
  return null
}

/**
 * 确认入库绑死客户：优先 session-client 索引，其次 task-meta。
 * body 可带 session_id / meta_id / client_key / client。
 * @returns {{ client_key: string, client: string, source: string }|null}
 */
function resolveBoundClientForConfirm(body, scope) {
  const parsed = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const sessionId = firstString(parsed.session_id, parsed.session)
  const metaId = firstString(parsed.meta_id, parsed.metaId)
  if (sessionId !== '') {
    const index = readSessionClientIndex()
    const entry = ownEntry(index, sessionId)
    if (entry !== undefined && !visibleRecord(scope, entry)) return { forbidden: true }
    if (entry !== null && typeof entry === 'object') {
      const key = firstString(entry.client_key)
      if (key !== '') {
        return {
          client_key: key,
          client: firstString(entry.client, parsed.client),
          source: 'session-client',
        }
      }
      const viaMeta = firstString(entry.meta_id)
      if (viaMeta !== '') {
        const meta = readTaskMetaRecord(viaMeta)
        if (meta !== null && !visibleRecord(scope, meta)) return { forbidden: true }
        const key2 = firstString(meta && meta.client_key)
        if (key2 !== '') {
          return {
            client_key: key2,
            client: firstString(meta && meta.client, entry.client, parsed.client),
            source: 'session-task-meta',
          }
        }
      }
    }
  }
  if (metaId !== '') {
    const meta = readTaskMetaRecord(metaId)
    if (meta !== null && !visibleRecord(scope, meta)) return { forbidden: true }
    const key = firstString(meta && meta.client_key)
    if (key !== '') {
      return {
        client_key: key,
        client: firstString(meta && meta.client, parsed.client),
        source: 'task-meta',
      }
    }
  }
  const bodyKey = firstString(parsed.client_key)
  if (bodyKey !== '') {
    return {
      client_key: bodyKey,
      client: firstString(parsed.client),
      source: 'body',
    }
  }
  return null
}

/**
 * body 声明的 client / client_key 必须与会话绑定一致。
 * @returns {{ ok:true }|{ ok:false, error:string, detail?:string }}
 */
function assertConfirmClientMatch(bound, body) {
  if (bound === null || typeof bound !== 'object' || firstString(bound.client_key) === '') {
    return { ok: false, error: 'client-unbound', detail: '会话未绑定 client_key，无法确认入库' }
  }
  const parsed = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const reqKey = firstString(parsed.client_key)
  const reqClient = firstString(parsed.client)
  const boundKey = firstString(bound.client_key)
  const boundClient = firstString(bound.client)
  if (reqKey !== '' && reqKey !== boundKey) {
    return { ok: false, error: 'client-mismatch', detail: `body.client_key=${reqKey} ≠ bound=${boundKey}` }
  }
  if (reqClient !== '' && boundClient !== '' && reqClient !== boundClient && reqClient !== boundKey) {
    return { ok: false, error: 'client-mismatch', detail: `body.client=${reqClient} ≠ bound.client=${boundClient}` }
  }
  return { ok: true }
}

function sendJson(res, body, status) {
  const code = Number.isFinite(status) && status >= 100 ? status : 200
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function methodNotAllowed(res) {
  res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ ok: false, error: 'method-not-allowed' }))
}

/* 归一化函数导出，只为离线自检用（宿主加载器只用 apply）：
 *   node --input-type=module -e "import('./lib/index.js').then(m => …)" */
export {
  normalize,
  normalizeArticles,
  normalizeLibraryArticles,
  payloadOf,
  articleContent,
  mergeDraftLists,
  resolveServer,
  resolveTool,
  taskMetaRecordFromBody,
  readSessionClientIndex,
  writeSessionClientIndex,
  mergeSessionClientBinding,
  resolveBoundClientForConfirm,
  assertConfirmClientMatch,
  readTaskMetaRecord,
}

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
  const knowledgeServers = [knowledgeServer, ...KNOWLEDGE_SERVER_ALIASES]
  const libraryServers = [libraryServer, ...LIBRARY_SERVER_ALIASES]

  const hostCtx = ctx
  const handlers = {}

  // Called only when names are needed. Never learn grants from writable metadata.
  async function loadClientNames(scope) {
    if (!scope.cloud || !scope.needsNames || scope.allowed.size === 0) return
    scope.needsNames = false
    const resolved = resolveTool(hostCtx, knowledgeServer, knowledgeServers, 'list_clients', [/^list_clients$/i])
    if (!resolved.tool) return
    const called = await callTool(hostCtx, resolved.server, resolved.tool, {})
    if (!called.ok) return
    for (const customer of normalize(called.value) || []) {
      if (scope.allowed.has(customer.id)) scope.names.add(clientPathName(customer.name))
    }
  }

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

    /* ---- 知识库：客户名单（不缓存）-------------------------------- */
    handlers[CLIENTS_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const resolved = resolveTool(hostCtx, knowledgeServer, knowledgeServers, clientsTool, [/hierarch/i, /(list|space|customer|client)/i])
      if (resolved.tool === '') {
        sendJson(res, {
          ok: false,
          error: 'mcp-missing',
          detail: `没找到 ${knowledgeServer} / knowledge / sora-knowledge 的工具。设置 → MCP 里确认这台服务器已连接。`,
          available: hostCtx.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('mcp__')).sort(),
        })
        return
      }
      const { server, tool } = resolved
      const called = await callTool(hostCtx, server, tool, {})
      if (!called.ok) {
        sendJson(res, { ok: false, error: called.error, detail: called.detail, server, tool })
        return
      }
      const customers = normalize(called.value)
      if (customers === null) {
        sendJson(res, { ok: false, error: 'bad-reply', detail: `认不出 ${tool} 的返回形状（收到 ${describe(called.value)}）`, server, tool })
        return
      }
      sendJson(res, { ok: true, customers: scope.cloud ? customers.filter(customer => scope.allowed.has(customer.id)) : customers, server, tool })
    }

    /* ---- 文章库：某个客户已有的文章 -------------------------------- */
    handlers[ARTICLES_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url ?? '/', 'http://dsh.invalid')
      const client = (url.searchParams.get('client') ?? '').trim()
      await loadClientNames(scope)
      if (!authorizedClient(scope, client)) { forbidden(res); return }
      if (client === '') {
        sendJson(res, { ok: false, error: 'bad-request', detail: '缺少 client 参数' })
        return
      }
      const resolved = resolveTool(hostCtx, libraryServer, libraryServers, articlesTool, [/^list_articles$/i, /^list/i])
      if (resolved.tool === '') {
        sendJson(res, {
          ok: false,
          error: 'mcp-missing',
          detail: `没找到 ${libraryServer} / articles / sora-articles 的工具。设置 → MCP 里确认这台服务器已连接。`,
        })
        return
      }
      const { server, tool } = resolved
      const called = await callTool(hostCtx, server, tool, { client })
      if (!called.ok) {
        sendJson(res, { ok: false, error: called.error, detail: called.detail, server, tool })
        return
      }
      const articles = normalizeArticles(called.value)
      if (articles === null) {
        sendJson(res, { ok: false, error: 'bad-reply', detail: `认不出 ${tool} 的返回形状（收到 ${describe(called.value)}）`, server, tool })
        return
      }
      sendJson(res, { ok: true, articles, client, server, tool })
    }

    /* ---- Noah 左树兼容映射：session → 客户/topic ----------------------
     * P1 的正式索引仍是 session-client；这份 map 只保留 Noah 旧壳需要的
     * topic/登记时间，并与 session-client 合并读取，不参与 confirm 鉴权。 */
    handlers[ASSIGN_GROUP_PATH] = async (req, res, scope) => {
      if (req.method !== 'POST') { methodNotAllowed(res); return }
      let body = ''
      req.on('data', chunk => { body += chunk })
      await new Promise(resolve => req.on('end', resolve))
      let parsed
      try { parsed = JSON.parse(body || '{}') } catch { parsed = {} }
      const sessionId = firstString(parsed.session_id, parsed.session)
      const client = firstString(parsed.client)
      if (sessionId === '') { sendJson(res, { ok: false, error: 'no-args' }, 400); return }
      await loadClientNames(scope)
      if (!authorizedBinding(scope, parsed)) { forbidden(res); return }
      try {
        let map = {}
        try {
          const raw = readFileSync(clientMapFile(), 'utf8')
          const value = JSON.parse(raw)
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) map = value
        } catch { /* first registration */ }
        if (Object.hasOwn(map, sessionId) && !visibleRecord(scope, map[sessionId])) { forbidden(res); return }
        const entry = stampOwner(scope, {
          client,
          client_key: firstString(parsed.client_key),
          topic: firstString(parsed.topic),
          meta_id: firstString(parsed.meta_id),
          at: new Date().toISOString(),
        })
        Object.defineProperty(map, sessionId, { value: entry, enumerable: true, configurable: true, writable: true })
        mkdirSync(dirname(clientMapFile()), { recursive: true })
        writeFileSync(clientMapFile(), JSON.stringify(map, null, 2))
        sendJson(res, { ok: true, session_id: sessionId, entry: map[sessionId] })
      } catch (error) {
        sendJson(res, { ok: false, error: 'map-failed', detail: String(error && error.message ? error.message : error) }, 500)
      }
    }
    handlers[CLIENT_MAP_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      await loadClientNames(scope)
      try {
        const raw = readFileSync(clientMapFile(), 'utf8')
        const map = JSON.parse(raw)
        sendJson(res, { ok: true, map: visibleEntries(scope, map !== null && typeof map === 'object' && !Array.isArray(map) ? map : {}) })
      } catch { sendJson(res, { ok: true, map: {} }) }
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
    handlers[TASK_META_PATH] = async (req, res, scope) => {
      if (req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        await new Promise(resolve => req.on('end', resolve))
        let parsed
        try { parsed = JSON.parse(body || '{}') } catch { parsed = {} }
        const record = taskMetaRecordFromBody(parsed)
        if (scope.cloud && record.client_key && !scope.allowed.has(record.client_key)) { forbidden(res); return }
        stampOwner(scope, record)
        const id = 'wbtm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
        try {
          mkdirSync(taskMetaDir(), { recursive: true })
          writeFileSync(
            join(taskMetaDir(), id + '.json'),
            JSON.stringify(record, null, 2),
          )
          sendJson(res, { ok: true, id, client_key: record.client_key || '', client: record.client || '' })
        } catch (error) {
          sendJson(res, { ok: false, error: 'save-failed', detail: String(error && error.message ? error.message : error) })
        }
        return
      }
      if (req.method === 'GET') {
        const url = new URL(req.url, 'http://localhost')
        const id = String(url.searchParams.get('id') ?? '')
        if (!/^wbtm-[a-z0-9-]+$/.test(id)) {
          sendJson(res, { ok: false, error: scope.cloud ? 'not-found' : 'bad-id' }, scope.cloud ? 404 : 200)
          return
        }
        await loadClientNames(scope)
        try {
          const raw = readFileSync(join(taskMetaDir(), id + '.json'), 'utf8')
          if (scope.cloud && !visibleRecord(scope, JSON.parse(raw))) {
            sendJson(res, { ok: false, error: 'not-found' }, 404)
            return
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(raw)
        } catch {
          sendJson(res, { ok: false, error: 'not-found' }, scope.cloud ? 404 : 200)
        }
        return
      }
      methodNotAllowed(res)
    }

    /* ---- session ↔ client 索引（WB-SUP P1）--------------------------
     * 形状：{ "<session_id>": { client_key, client, meta_id, topic, bound_at } }
     * 存 /home/dsh/.dsh/workbench-meta/session-client-index.json。
     * GET ?session= 单条；?client_key= 该客户下会话；无 query 全量。
     * POST 绑定（装配台起会话后拿到 session id 时写）。失败不挡发消息。 */
    handlers[SESSION_CLIENT_PATH] = async (req, res, scope) => {
      if (req.method === 'GET') {
        const url = new URL(req.url ?? '/', 'http://dsh.invalid')
        const session = (url.searchParams.get('session') ?? '').trim()
        const clientKey = (url.searchParams.get('client_key') ?? '').trim()
        if (scope.cloud && url.searchParams.has('client_key') && !scope.allowed.has(clientKey)) { forbidden(res); return }
        await loadClientNames(scope)
        const index = visibleEntries(scope, readSessionClientIndex())
        if (session !== '' || (scope.cloud && url.searchParams.has('session'))) {
          const binding = ownEntry(index, session) ?? null
          if (scope.cloud && binding === null) { sendJson(res, { ok: false, error: 'not-found' }, 404); return }
          sendJson(res, { ok: true, session, binding })
          return
        }
        if (clientKey !== '') {
          const sessions = []
          for (const [sid, entry] of Object.entries(index)) {
            if (entry !== null && typeof entry === 'object' && firstString(entry.client_key) === clientKey) {
              sessions.push({ session_id: sid, ...entry })
            }
          }
          sessions.sort((a, b) => String(b.bound_at || '').localeCompare(String(a.bound_at || '')))
          sendJson(res, { ok: true, client_key: clientKey, sessions })
          return
        }
        sendJson(res, { ok: true, index })
        return
      }
      if (req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        await new Promise(resolve => req.on('end', resolve))
        let parsed
        try { parsed = JSON.parse(body || '{}') } catch { parsed = {} }
        const sessionId = firstString(parsed.session_id, parsed.session)
        if (sessionId === '') {
          sendJson(res, { ok: false, error: 'bad-request', detail: '缺少 session_id' })
          return
        }
        await loadClientNames(scope)
        if (!authorizedBinding(scope, parsed)) { forbidden(res); return }
        try {
          const index = readSessionClientIndex()
          if (Object.hasOwn(index, sessionId) && !visibleRecord(scope, index[sessionId])) { forbidden(res); return }
          const entry = stampOwner(scope, mergeSessionClientBinding(index, sessionId, parsed))
          writeSessionClientIndex(index)
          sendJson(res, { ok: true, session_id: sessionId, binding: entry })
        } catch (error) {
          process.stderr.write(`[dsh-workbench] session-client 绑定失败：${String(error && error.message ? error.message : error)}\n`)
          sendJson(res, { ok: false, error: 'save-failed', detail: String(error && error.message ? error.message : error) })
        }
        return
      }
      methodNotAllowed(res)
    }

    /* ---- 任务进程的客观卡点（2026-09-23）--------------------------
     * 按客户名探测两个位置：工作区目录（产物）与文章库（入库）。
     * 只报事实：目录是否存在 / 文件数 / 最近 24h 新增数。 */
    handlers[TASK_STATUS_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url, 'http://localhost')
      const client = String(url.searchParams.get('client') ?? '').replace(/[/\\]/g, '')
      await loadClientNames(scope)
      if (!authorizedClient(scope, client)) { forbidden(res); return }
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
          const list = files.filter(name => name.toLowerCase().endsWith('.md')).map(name => name.replace(/\.md$/i, ''))
          return { exists: true, files: files.length, recent, list }
        } catch {
          return { exists: false, files: 0, recent: 0, list: [] }
        }
      }
      sendJson(res, { ok: true, workspace: probe(workspaceRoot()), library: probe(libraryRoot()) })
    }

    /* ---- 草稿区（2026-09-24）：write(draft:true) 落「文章库/<客户>/草稿/」，
     * 人在工作台预览 → 确认 → 宿主把文件挪到正式位置（rename，查重幂等）。
     * 卷共享，入库动作不经过 MCP 容器。 */
    const draftDir = client => join(libraryRoot(), String(client).replace(/[/\\]/g, ''), '草稿')
    const safeFile = name => {
      const s = String(name ?? '')
      if (!s || s.includes('/') || s.includes('\\') || s.includes('..')) throw new Error('bad file name')
      return s.endsWith('.md') ? s : s + '.md'
    }
    handlers[DRAFTS_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url, 'http://localhost')
      const client = String(url.searchParams.get('client') ?? '').replace(/[/\\]/g, '')
      await loadClientNames(scope)
      if (!authorizedClient(scope, client)) { forbidden(res); return }
      if (!client) { sendJson(res, { ok: false, error: 'no-client' }); return }
      const localDrafts = []
      const localReady = []
      try {
        const dir = draftDir(client)
        for (const name of readdirSync(dir)) {
          if (!name.toLowerCase().endsWith('.md')) continue
          const st = statSync(join(dir, name))
          localDrafts.push({ title: name.replace(/\.md$/i, ''), chars: st.size, updatedAt: new Date(st.mtimeMs).toISOString() })
        }
      } catch { /* 本地草稿目录不存在时继续查 Support */ }
      try {
        const libDir = join(libraryRoot(), client)
        for (const name of readdirSync(libDir)) {
          if (!name.toLowerCase().endsWith('.md')) continue
          const st = statSync(join(libDir, name))
          localReady.push({ title: name.replace(/\.md$/i, ''), chars: st.size, updatedAt: new Date(st.mtimeMs).toISOString() })
        }
      } catch { /* 客户还没有正式库目录 */ }

      /* Support 是正式站的权威源；MCP 不可用时仍返回本地兼容目录。 */
      let mcpArticles = []
      const resolved = resolveTool(hostCtx, libraryServer, libraryServers, articlesTool, [/^list_articles$/i, /^list/i])
      if (resolved.tool !== '') {
        const called = await callTool(hostCtx, resolved.server, resolved.tool, { client })
        if (called.ok) {
          const normalized = normalizeLibraryArticles(called.value)
          if (normalized !== null) mcpArticles = normalized
        }
      }
      const merged = mergeDraftLists(localDrafts, localReady, mcpArticles)
      sendJson(res, { ok: true, drafts: merged.drafts, library: merged.library })
    }
    handlers[DRAFT_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url, 'http://localhost')
      const client = String(url.searchParams.get('client') ?? '').replace(/[/\\]/g, '')
      await loadClientNames(scope)
      if (!authorizedClient(scope, client)) { forbidden(res); return }
      if (!client) { sendJson(res, { ok: false, error: 'not-found' }, 404); return }
      const title = firstString(url.searchParams.get('title'))
      try {
        const file = safeFile(title)
        const text = readFileSync(join(draftDir(client), file), 'utf8')
        res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' })
        res.end(text)
        return
      } catch { /* Support fallback below */ }
      try {
        const resolved = resolveTool(hostCtx, libraryServer, libraryServers, 'read_article', [/read_article/i, /read/i])
        if (title === '' || resolved.tool === '') throw new Error('article-missing')
        const called = await callTool(hostCtx, resolved.server, resolved.tool, { client, title })
        if (!called.ok) throw new Error('article-missing')
        const text = articleContent(called.value)
        if (text === null) throw new Error('article-missing')
        res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' })
        res.end(text)
      } catch { sendJson(res, { ok: false, error: 'not-found' }, 404) }
    }
    handlers[CONFIRM_DRAFT_PATH] = async (req, res, scope) => {
      if (req.method !== 'POST') { methodNotAllowed(res); return }
      let body = ''
      req.on('data', c => { body += c; if (body.length > 1e6) req.destroy() })
      await new Promise(resolve => req.on('end', resolve))
      let parsed
      try { parsed = JSON.parse(body || '{}') } catch { parsed = {} }
      try {
        const title = firstString(parsed.title)
        if (title === '') {
          sendJson(res, { ok: false, error: 'bad-request', detail: '缺少 title' }, 400)
          return
        }
        /* WB-SUP P2：绑死会话 client_key；跨客户确认失败关闭。 */
        await loadClientNames(scope)
        const bound = resolveBoundClientForConfirm(parsed, scope)
        if (bound && (bound.forbidden || (scope.cloud && !scope.allowed.has(bound.client_key)))) { forbidden(res); return }
        const displayClient = firstString(bound && bound.client, parsed.client, bound && bound.client_key)
        if (bound && !authorizedClient(scope, displayClient)) { forbidden(res); return }
        const match = assertConfirmClientMatch(bound, parsed)
        if (!match.ok) {
          sendJson(res, { ok: false, error: match.error, detail: match.detail || '' }, 400)
          return
        }
        const boundKey = bound.client_key
        const fileName = safeFile(title)
        /* 草稿目录仍按显示名（现网 write draft:true 落盘约定）；再试 client_key 目录。 */
        let src = join(draftDir(displayClient), fileName)
        if (!existsSync(src) && displayClient !== boundKey) {
          const alt = join(draftDir(boundKey), fileName)
          if (existsSync(alt)) src = alt
        }
        const localSource = existsSync(src)
        let content = null
        if (localSource) {
          content = readFileSync(src, 'utf8')
        } else {
          /* Support-only draft：工作台卷没有镜像时，从权威文章库读正文再确认。 */
          const readResolved = resolveTool(hostCtx, libraryServer, libraryServers, 'read_article', [/read_article/i, /read/i])
          if (readResolved.tool === '') {
            sendJson(res, { ok: false, error: 'draft-missing', detail: `草稿不存在：${displayClient}/草稿/${fileName}` }, 404)
            return
          }
          const readCalled = await callTool(hostCtx, readResolved.server, readResolved.tool, { client: boundKey, title })
          if (!readCalled.ok) {
            sendJson(res, { ok: false, error: 'draft-missing', detail: `Support 草稿不存在：${title}` }, 404)
            return
          }
          content = articleContent(readCalled.value)
          if (content === null) {
            sendJson(res, { ok: false, error: 'draft-missing', detail: `Support 草稿不存在：${title}` }, 404)
            return
          }
        }
        const dst = join(libraryRoot(), String(displayClient).replace(/[/\\]/g, ''), fileName)
        /* 先远端 write_article(draft:false) 用绑死的 client_key，再挪本地文件。 */
        const writeResolved = resolveTool(hostCtx, libraryServer, libraryServers, 'write_article', [/write_article/i, /write/i])
        let article = null
        if (writeResolved.tool !== '') {
          const called = await callTool(hostCtx, writeResolved.server, writeResolved.tool, {
            client: boundKey,
            title,
            content,
            draft: false,
          })
          if (!called.ok) {
            sendJson(res, {
              ok: false,
              error: 'write-article-failed',
              detail: called.detail || called.error,
              client_key: boundKey,
              server: writeResolved.server,
              tool: writeResolved.tool,
            }, 502)
            return
          }
          article = called.value
        } else {
          if (!localSource) {
            sendJson(res, {
              ok: false,
              error: 'write-article-missing',
              detail: 'Support 草稿已读取，但没有可用的 write_article 工具。',
            }, 502)
            return
          }
          process.stderr.write('[dsh-workbench] confirm-draft：未找到 write_article，仅做本地 rename（Support 未更新）\n')
        }
        /* 本地卷：远端成功后挪/清草稿；仅本地路径时保持原 409 查重。 */
        let movedTo = null
        if (!localSource) {
          /* Support-only draft has no local file to move. */
        } else if (existsSync(dst)) {
          if (article === null) {
            sendJson(res, { ok: false, error: 'already-exists', detail: '正式库已有同名文章，未覆盖' }, 409)
            return
          }
          try { unlinkSync(src) } catch { /* 远端已 ready，草稿删不掉不挡 */ }
          movedTo = dst
        } else {
          mkdirSync(dirname(dst), { recursive: true })
          renameSync(src, dst)
          movedTo = dst
        }
        sendJson(res, {
          ok: true,
          client_key: boundKey,
          client: displayClient,
          title,
          draft: false,
          movedTo,
          article,
          bound_source: bound.source,
        })
      } catch (e) {
        sendJson(res, { ok: false, error: 'confirm-failed', detail: String(e && e.message ? e.message : e) }, 500)
      }
    }

  for (const [path, handler] of Object.entries(handlers)) {
    handlers[path] = (req, res) => handler(req, res, requestScope(req))
  }
  return { handlers }
}
