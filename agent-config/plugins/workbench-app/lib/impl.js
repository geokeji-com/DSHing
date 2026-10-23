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
 *   POST/GET /api/workbench/batch           → 多轮生文状态（uid/session 隔离，revision 防重复发送）
 *   GET/POST /api/workbench/session-client  → session_id ↔ client_key 索引
 *   GET/PUT /api/workbench/draft            → 读/写本地草稿区 Markdown（PUT 不碰正式库、不重跑检查）
 *   POST /api/workbench/confirm-draft       → 绑死 client_key → write_article(draft:false) + 本地草稿挪正式
 */


import { mkdirSync, realpathSync, readFileSync, writeFileSync, readdirSync, statSync, lstatSync, existsSync, renameSync, unlinkSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = typeof execFile === 'function' && typeof promisify === 'function'
  ? promisify(execFile)
  : async () => { throw new Error('hardcheck runner unavailable') }

const CLIENTS_PATH = '/api/workbench/clients'
const SKILLS_PATH = '/api/workbench/skills'
const ARTICLES_PATH = '/api/workbench/articles'
const MCP_INFO_PATH = '/api/workbench/mcp'
const TASK_META_PATH = '/api/workbench/task-meta'
const BATCH_PATH = '/api/workbench/batch'
const SESSION_STATUS_PATH = '/api/workbench/session-status'
// create() runs per request; keep read-only Support results across handler instances.
// Context and caller scope are part of the cache boundary, never a source of grants.
const sessionStatusDraftCache = new WeakMap()
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
const personalWorkspacePath = () => process.env.DSH_WORKBENCH_PERSONAL_WORKSPACE
  || (process.env.DSH_HOME ? join(process.env.DSH_HOME, 'workspaces', 'default') : null)
const workspaceRoot = () => process.env.DSH_WORKBENCH_WORKSPACE_ROOT || personalWorkspacePath()
const libraryRoot = () => process.env.DSH_WORKBENCH_LIBRARY_ROOT || '/srv/dsh-data/文章库'

/** All library paths pass here. Callers authorize the stored binding first.
 * Reads never create directories; writers explicitly opt in. Empty keys are
 * supported only for read-only, name-based callers during the migration. */
export function clientLibraryDir(client_key, display_name, { create = false } = {}) {
  const key = firstString(client_key)
  const name = clientPathName(display_name)
  const valid = value => value && value !== '.' && value !== '..' && !/[/\\\x00-\x1f]/.test(value)
  if (key && !valid(key)) throw new Error('invalid client_key directory')
  if (!key && (create || !valid(name))) throw new Error('missing client_key or invalid display_name')
  function directory(path) {
    let entry
    try { entry = lstatSync(path) } catch (error) {
      if (error.code === 'ENOENT') return false
      throw error
    }
    if (!entry.isDirectory() && !entry.isSymbolicLink()) throw new Error('library path is not a directory')
    if (!statSync(path).isDirectory()) throw new Error('library link is not a directory')
    return true
  }
  const keyed = key ? join(libraryRoot(), key) : null
  if (keyed && directory(keyed)) return keyed
  const legacy = valid(name) ? join(libraryRoot(), name) : null
  if (legacy && directory(legacy)) return legacy
  const path = keyed || legacy
  if (create) mkdirSync(path, { recursive: true })
  return path
}

/* ---- 薄弱问句（2026-10-10 接外部接口）---------------------------------
 * 数据来自「对外客户问句差额和信源渠道 API」（交付文档见仓库
 * `对接的文档在这里/交付文档.md`）。宿主半边负责：带密钥调接口 + 缓存 +
 * 白名单过滤。密钥不出宿主，浏览器永远拿不到。
 *
 * 这个接口**不做任何权限**（返回全公司客户、只认 ID 不认调用方），所以
 * 白名单是当前唯一的权限闸门 —— 详见
 * `docs/运维与管理/待技术同事解决的问题.md` P2。 */
const WEAK_DIR_PATH = '/api/workbench/weak-dir'
const WEAK_GAPS_PATH = '/api/workbench/weak-gaps'
const SESSION_CREATE_PATH = '/api/workbench/session-create'
const CHECK_PATH = '/api/workbench/check'
const HARDCHECK_SCRIPT = process.env.WORKBENCH_HARDCHECK_SCRIPT || '/home/dsh/DSHing/文章硬检/硬检.mjs'
const WEAK_RAW_PATH = '/api/workbench/weak-raw'

const INSIGHTS_BASE = 'http://182.92.179.181/api/external-insights/v1'
/** 密钥放进程环境变量，缺省用交付文档里那把共享密钥（不进 git 的只有 settings.yaml）。 */
const INSIGHTS_KEY = firstString(process.env.WORKBENCH_INSIGHTS_KEY)
  || 'f886619bac2251a47711aa39b782ff1f739a441f103a38e2f4094ac811aeb8cc'

/** 允许在工作台上看到的客户 ID 集合（空数组 = 不限）。
 *
 * ⚠️ 这张表和 WEAK_CLIENT_MAP 已经**不是两回事**了 —— 10-10 踩过一次坑：
 * 新客户只加到映射表、忘了加白名单，结果目录里查不到、页面显示"还没有数据"，
 * 排查了半天（两处闸门，只开了一个）。
 *
 * 现在的规矩：**映射表就是唯一真相源** —— 客户配了映射就等于放行。
 * 这个常量只在需要临时收紧时才填（比如演示时只想留两个客户）。 */
const WEAK_CLIENT_ALLOWLIST = []

/** 知识库客户名 → 万湖 enterprise_id 的映射。
 *
 * 为什么需要它：知识库那边的客户**只有名字**（`哈尔斯`、`杭州民师`…），
 * 没有企业 ID；而万湖的 `enterprise_id` 名字又跟知识库对不上（万湖叫
 * 「杭州民师教招教育科技有限公司」）。两边只能靠这张表对上。
 *
 * **刻意用显式映射、不做名字模糊匹配** —— 这是身份边界，猜错就是串客户。
 *
 * 两种形状：
 *   - 单业务线客户：值直接是 ID 字符串
 *   - **多业务线客户**：值是 { 业务线名: ID }，跟装配台的「业务线」下拉一一对应。
 *     典型是华熙生物 —— 一个客户四条产品线，在万湖**本来就是四个独立企业**，
 *     采集数据也各是各的，所以没法合成一份，必须选到线才有数据。
 *
 * 加客户就在这里加。想临时改而不动代码：环境变量
 * `WORKBENCH_INSIGHTS_MAP='{"客户名":"企业ID","多线客户":{"线名":"ID"}}'`（合并生效）。 */
const WEAK_CLIENT_MAP = {
  '哈尔斯': '2085556051360485376',
  '杭州民师': '2102224433627402240',
  '移山科技': '2079923537652617216',
  '清北中考高': '1995444826216206336',
  '猿编程': '2043937764923281408',
  /* 华熙生物：四条产品线，万湖侧是四个独立企业（名字用万湖的写法，
   * 但键要跟知识库/装配台显示的业务线名对得上）。 */
  '华熙生物': {
    '润致耀然': '2064596152271114240',
    '润致斐然': '2064595780697722880',
    '润致缇透': '2064595405299126272',
    '润致娃娃针': '1990423682916421632',
  },
}

/** 环境变量覆盖（合并，不替换）。解析失败只打日志，用内置那份。 */
function weakMapWithEnv() {
  const map = Object.assign({}, WEAK_CLIENT_MAP)
  const raw = firstString(process.env.WORKBENCH_INSIGHTS_MAP)
  if (raw !== '') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object') {
        for (const [name, id] of Object.entries(parsed)) {
          if (typeof id === 'string' && id.trim() !== '') map[name] = id.trim()
        }
      }
    } catch (error) {
      process.stderr.write(`[dsh-workbench] WORKBENCH_INSIGHTS_MAP 解析失败：${String(error)}\n`)
    }
  }
  return map
}

/** 缓存时长：目录 3 分钟（接口自己就缓存 180 秒）；
 * 问句差额 5 分钟（数据每 5 分钟才重算一次，查更勤没意义）。 */
const INSIGHTS_DIR_CACHE_MS = 180000
const INSIGHTS_GAPS_CACHE_MS = 300000
/** 单次外部请求预算。 */
const INSIGHTS_TIMEOUT_MS = 20000


// Missing legacy directories still have registry rows; never recreate them.
function canonicalWorkspacePath(path) {
  try { return realpathSync(path) } catch { return resolve(path) }
}

const legacySharedRoot = () => canonicalWorkspacePath(process.env.DSH_WORKBENCH_LEGACY_SHARED_ROOT || '/home/dsh/生文')

/** Runs on the hot-loaded request path, independently of index.js startup. */
async function resolvePersonalWorkspace(hostCtx) {
  const path = personalWorkspacePath()
  if (!path) throw new Error('DSH_HOME 未设置，无法确定个人工作区')
  const registry = hostCtx.workspaceRegistry
  if (!registry) throw new Error('workspaceRegistry 不可用')
  if (canonicalWorkspacePath(path) === legacySharedRoot()) throw new Error('个人工作区不能使用旧共享目录')
  mkdirSync(path, { recursive: true })
  const canonical = realpathSync(path)
  const row = registry.list().find(w => canonicalWorkspacePath(w.path) === canonical)
    || await registry.create(canonical, '我的工作区')
  if (!row || typeof row.id !== 'string' || !row.id) throw new Error('个人工作区缺少 ID')
  return { id: row.id, path: canonical }
}

async function workspaceInfo(hostCtx) {
  const personal = await resolvePersonalWorkspace(hostCtx)
  const legacy = legacySharedRoot()
  const legacySharedIds = hostCtx.workspaceRegistry.list()
    .filter(w => canonicalWorkspacePath(w.path) === legacy).map(w => w.id)
  return { personal, legacySharedIds }
}

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
  const namesByKey = new Map()
  for (const entry of jsonArray(namesHeader) || []) {
    if (entry && allowed.has(entry.key) && typeof entry.name === 'string' && entry.name !== '') {
      names.add(clientPathName(entry.name))
      namesByKey.set(entry.key, clientPathName(entry.name))
    }
  }
  return { cloud, uid, allowed, names, namesByKey, needsNames: namesHeader === undefined }
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
const DEFAULT_KNOWLEDGE_SERVER = 'sora-knowledge'
const DEFAULT_LIBRARY_SERVER = 'sora-articles'

const KNOWLEDGE_SERVER_ALIASES = ['knowledge', 'sora-knowledge', 'mcp-knowledge']
const LIBRARY_SERVER_ALIASES = ['articles', 'sora-articles', 'mcp-articles']

/** 一次工具调用的预算。 */
const TOOL_TIMEOUT_MS = 15000

/* ---------------------------------------------------------------- 工具注册表 */

/**
 * MCP 工具注册表的兼容读取。
 *
 * 生产 Host 的工具服务挂在 ctx.tools；一些 harness/旧宿主把它包在
 * hostCtx/ctx 下。不要把这些形状差异带进每个路由，统一在这里取。
 */
function toolService(ctx) {
  /* Cordis contexts throw on un-injected property reads ("cannot get property … without inject"). */
  const peek = (obj, key) => { try { return obj ? obj[key] : undefined } catch { return undefined } }
  const candidates = [ctx, peek(ctx, 'hostCtx'), peek(ctx, 'ctx'), peek(ctx, 'harness')]
  for (const candidate of candidates) {
    if (candidate === null || typeof candidate !== 'object') continue
    const tools = peek(candidate, 'tools')
    if (tools !== null && typeof tools === 'object'
      && (typeof tools.schemas === 'function' || Array.isArray(tools.schemas)
        || typeof tools.execute === 'function')) return tools
    const schemas = peek(candidate, 'schemas'), execute = peek(candidate, 'execute')
    if (typeof schemas === 'function' || Array.isArray(schemas) || typeof execute === 'function') return candidate
  }
  return null
}

function schemaNames(ctx) {
  const tools = toolService(ctx)
  if (tools === null) return []
  try {
    const raw = typeof tools.schemas === 'function' ? tools.schemas() : tools.schemas
    if (Array.isArray(raw)) return raw
      .map(schema => typeof schema === 'string' ? schema : schema && schema.name)
      .filter(name => typeof name === 'string' && name !== '')
    if (Array.isArray(tools)) return tools
      .map(schema => typeof schema === 'string' ? schema : schema && schema.name)
      .filter(name => typeof name === 'string' && name !== '')
  } catch { /* a disconnected registry is equivalent to no tools */ }
  return []
}

export function confirmQuestionContext(ctx, resolved, sessionId, binding) {
  if (!sessionId || !binding || !Array.isArray(binding.questions)) return {};
  const service = toolService(ctx)
  const schemas = service && (typeof service.schemas === 'function' ? service.schemas() : service.schemas)
  const schema = Array.isArray(schemas) && schemas.find(s => s.name === `mcp__${resolved.server}__${resolved.tool}`)
  const input = schema && (schema.inputSchema || schema.parameters)
  return input && input.properties && input.properties.question_context
    ? { question_context: { session_id: sessionId } } : {}
}

/** Normalize config/plugin-id/prefix spellings to the serverName used in calls. */
function canonicalServerName(value) {
  let name = firstString(value)
  if (name.startsWith('mcp__')) name = name.slice('mcp__'.length)
  if (name.endsWith('__')) name = name.slice(0, -'__'.length)
  if (name === 'mcp-articles' || name === 'sora-articles') return 'articles'
  if (name === 'mcp-knowledge' || name === 'sora-knowledge') return 'knowledge'
  return name
}

function sameServer(left, right) {
  return canonicalServerName(left) !== ''
    && canonicalServerName(left) === canonicalServerName(right)
}

/** Parse both canonical `mcp__server__tool` and bare `server__tool` names. */
function splitToolName(value) {
  const name = firstString(value)
  const match = /^(?:mcp__)?(.+)__(.+)$/.exec(name)
  return match === null ? null : { server: match[1], tool: match[2], name }
}

function registeredTools(ctx, server) {
  return schemaNames(ctx).map(splitToolName).filter(entry => entry !== null && sameServer(entry.server, server))
}

/** 某个 MCP server 在本 Host 上注册了哪些工具（去掉 server 前缀）。 */
function toolsOf(ctx, server) {
  return registeredTools(ctx, server).map(entry => entry.tool).sort()
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
    const hit = registeredTools(ctx, server)[0]
    if (hit !== undefined) return hit.server
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
      const hit = registeredTools(ctx, server).find(entry => entry.tool === configured)
      if (hit !== undefined) return { server: hit.server, tool: hit.tool }
    }
    for (const server of candidates) {
      const names = registeredTools(ctx, server)
      for (const hint of hints) {
        const hit = names.find(entry => hint.test(entry.tool))
        if (hit !== undefined) return { server: hit.server, tool: hit.tool }
      }
    }
    return { server: resolveServer(ctx, preferred, fallbacks), tool: '' }
  }
  for (const server of candidates) {
    const names = registeredTools(ctx, server)
    if (names.length > 0) {
      const hit = names.find(entry => hints.some(hint => hint.test(entry.tool))) || names[0]
      return { server: hit.server, tool: hit.tool }
    }
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
    const tools = toolService(ctx)
    if (tools === null || typeof tools.execute !== 'function') {
      return { ok: false, error: 'mcp-missing', detail: 'Host 工具服务不可用' }
    }
    const result = await tools.execute({
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
  for (const key of ['business_line_id', 'service_period_id']) {
    const value = firstString(base[key])
    if (value) base[key] = value
    else delete base[key]
  }
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
  const sameHierarchy = (!entry.client_key || entry.client_key === prev.client_key)
    && (!entry.meta_id || entry.meta_id === prev.meta_id)
  for (const key of ['business_line_id', 'service_period_id', 'line', 'period', 'batch_id']) {
    const value = firstString(entry && entry[key], sameHierarchy && prev[key])
    if (value) next[key] = value
  }
  if (entry.round != null || (sameHierarchy && prev.round != null)) next.round = entry.round ?? prev.round
  // Snapshot only explicit selection metadata, never the mutable shared ticks.
  if (Array.isArray(entry.questions)) {
    next.questions = entry.questions
    next.capture_period = firstString(entry.capture_period)
  } else if (Array.isArray(prev.questions)) {
    next.questions = prev.questions
    next.capture_period = prev.capture_period
  }
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

const batchDir = () => join(taskMetaDir(), 'batches')
const validBatchId = id => /^wbb-[a-z0-9-]{1,100}$/.test(id)
function readBatch(id) {
  if (!validBatchId(id)) return null
  try { return JSON.parse(readFileSync(join(batchDir(), id + '.json'), 'utf8')) } catch { return null }
}
function visibleBatch(scope, batch) {
  return batch && visibleRecord(scope, batch) && (!scope.cloud || (scope.uid && batch.owner_uid === scope.uid))
}

function sessionStatusIds(params) {
  const values = params.getAll('ids')
  const ids = values.length === 1 ? values[0].split(',') : []
  if (!ids.length || ids.length > 50 || ids.some(id => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) return null
  return [...new Set(ids)]
}

/** Same latest-visible selection as the single-session batch route, scanned once. */
function latestSessionBatches(scope, ids) {
  const wanted = new Set(ids), latest = new Map()
  let files = []
  try { files = readdirSync(batchDir()) } catch { /* no batches yet */ }
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const batch = readBatch(file.slice(0, -5))
    if (!visibleBatch(scope, batch) || !wanted.has(batch.session_id)) continue
    const previous = latest.get(batch.session_id)
    if (!previous || String(batch.savedAt || '').localeCompare(String(previous.savedAt || '')) > 0) latest.set(batch.session_id, batch)
  }
  return latest
}

function sessionStatusItem(batch, merged) {
  if (!batch) return { batch: null, drafts_pending: null, finished_at: null }
  const records = Array.isArray(batch.records) ? batch.records : []
  const next = records.find(row => row.status !== 'ok' && row.status !== 'failed')
  const terminal = ['done', 'failed_partial', 'stopped'].includes(batch.status)
  const pending = merged && new Set(merged.drafts.map(row => row.title).filter(title => !merged.library.includes(title)))
  return {
    batch: { id: batch.id, status: batch.status, round: next ? next.round : batch.rounds,
      rounds: batch.rounds, failed: records.filter(row => row.status === 'failed').length,
      review_opened: !!batch.review_opened, savedAt: batch.savedAt || null },
    drafts_pending: pending ? records.filter(row => row.status === 'ok' && pending.has(row.title)).length : null,
    finished_at: terminal ? batch.savedAt || null : null,
  }
}

/**
 * 确认入库绑死客户：优先 session-client 索引，其次 task-meta。
 * body 可带 session_id / meta_id / client_key / client。
 * @returns {{ client_key: string, client: string, source: string }|null}
 */
function resolveBoundClientForConfirm(body, scope, storedIndex) {
  const parsed = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const sessionId = firstString(parsed.session_id, parsed.session)
  const metaId = firstString(parsed.meta_id, parsed.metaId)
  if (sessionId !== '') {
    const index = storedIndex || readSessionClientIndex()
    const entry = ownEntry(index, sessionId)
    if (entry !== undefined && !visibleRecord(scope, entry)) return { forbidden: true }
    if (entry !== null && typeof entry === 'object') {
      const key = firstString(entry.client_key)
      if (key !== '') {
        return {
          client_key: key,
          client: firstString(entry.client),
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
            client: firstString(meta && meta.client, entry.client),
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
        client: firstString(meta && meta.client),
        source: 'task-meta',
      }
    }
  }
  return null
}

/**
 * body 声明的 client / client_key 必须与会话绑定一致。
 * @returns {{ ok:true }|{ ok:false, error:string, detail?:string }}
 */
function assertConfirmClientMatch(bound, body, scope) {
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
  // A matching stable key (or its trusted current name) survives display renames.
  if (reqClient !== '' && boundClient !== '' && reqClient !== boundClient && reqClient !== boundKey
      && reqKey !== boundKey && scope?.namesByKey.get(boundKey) !== clientPathName(reqClient)) {
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

function fail(res, status, error, detail) { sendJson(res, { ok: false, error, detail }, status) }

/* 归一化函数导出，只为离线自检用（宿主加载器只用 apply）：
 *   node --input-type=module -e "import('./lib/index.js').then(m => …)" */
export {
  resolvePersonalWorkspace,
  workspaceRoot,
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
  sessionStatusIds,
  sessionStatusItem,
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
      if (scope.allowed.has(customer.id)) {
        scope.names.add(clientPathName(customer.name))
        scope.namesByKey.set(customer.id, clientPathName(customer.name))
      }
    }
  }

  async function libraryClient(parsed, scope, res, requireBound = false) {
    await loadClientNames(scope)
    let bound = resolveBoundClientForConfirm(parsed, scope)
    // Older read callers send only a name. Recover a key only from a unique,
    // visible stored binding, never by treating their selector as a key.
    if (!bound && !requireBound && !parsed.session_id && !parsed.session && !parsed.meta_id && !parsed.metaId
        && !parsed.client_key && parsed.client) {
      const name = clientPathName(parsed.client)
      if (!authorizedClient(scope, name)) { forbidden(res); return null }
      const candidates = new Map()
      const index = readSessionClientIndex()
      for (const [session_id, entry] of Object.entries(index)) {
        if (!visibleRecord(scope, entry)) continue
        const candidate = resolveBoundClientForConfirm({ session_id }, scope, index)
        if (candidate?.client_key && (clientPathName(candidate.client) === name
            || scope.namesByKey.get(candidate.client_key) === name)) candidates.set(candidate.client_key, candidate)
      }
      if (candidates.size > 1) { sendJson(res, { ok: false, error: 'ambiguous-client-binding' }, 400); return null }
      bound = candidates.values().next().value || null
    }
    if (bound?.forbidden || (bound && scope.cloud && !scope.allowed.has(bound.client_key))) {
      forbidden(res); return null
    }
    if (!bound) {
      const name = clientPathName(parsed.client)
      if (!authorizedClient(scope, name)) { forbidden(res); return null }
      if (requireBound || parsed.session_id || parsed.session || parsed.meta_id || parsed.metaId
          || parsed.client_key || /^CUS-/.test(name) || (scope.cloud && !scope.names.has(name))) {
        sendJson(res, { ok: false, error: 'client-unbound' }, 400); return null
      }
    } else {
      const match = assertConfirmClientMatch(bound, parsed, scope)
      if (!match.ok) { sendJson(res, match, 400); return null }
    }
    const client = bound || { client_key: '', client: clientPathName(parsed.client) }
    try {
      const dir = clientLibraryDir(client.client_key, client.client)
      // Writable metadata is not a grant for a legacy display-name directory.
      // Once keyed, only the stable key matters, even if the saved name is old.
      if (scope.cloud && client.client_key && dir !== join(libraryRoot(), client.client_key)
          && scope.namesByKey.get(client.client_key) !== clientPathName(client.client)) {
        forbidden(res); return null
      }
      return client
    } catch {
      sendJson(res, { ok: false, error: 'invalid-library-path' }, 400); return null
    }
  }

    /* ---- 会话创建：绕开「探索未至之境」向导页 ------------------------
     * startSession() 现在落 Session Intent hero，装配台的接力挂件不在那里，
     * 提示词没人消费。这里直接调宿主 sessionController.create 造一个真实
     * （普通）会话，前端拿到 id 后 openSession 打开 —— 挂件在场，正常接力。 */
    handlers[SESSION_CREATE_PATH] = async (req, res, scope) => {
      if (req.method !== 'POST') { methodNotAllowed(res); return }
      try {
        /* Resolve the caller's personal registry row before creating anything.
         * Passing that id keeps the deploy-line fallback on the same per-user
         * workspace as openWorkspace(), and never silently falls back to the
         * legacy shared directory. */
        const personal = await resolvePersonalWorkspace(hostCtx)
        if (scope.cloud && scope.uid === '') {
          forbidden(res)
          return
        }
        const value = await hostCtx.sessionController.create({ workspaceId: personal.id })
        const sessionId = value !== null && typeof value === 'object' ? String(value.sessionId || value.id || '') : ''
        if (sessionId === '') {
          fail(res, 502, 'session-create-empty', '宿主返回的会话 id 为空')
          return
        }
        sendJson(res, { ok: true, sessionId, workspaceId: personal.id })
      } catch (error) {
        fail(res, 500, 'session-create-failed', String(error && error.message ? error.message : error))
      }
    }


    /* ---- 薄弱问句：可查客户目录 -------------------------------------
     * 从**知识库的客户**出发（那才是我们认识的客户），用映射对到万湖的
     * enterprise_id，再带上这次采集的日期。对不上映射的客户照样返回，
     * 但 `enterpriseId` 是空的 —— 前端据此置灰，不猜。 */
    handlers[WEAK_DIR_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const called = await insightsCached('dir', INSIGHTS_DIR_CACHE_MS, 'GET', '/customers')
      const insightsCustomers = []
      let insightsError = null
      if (!called.ok) {
        insightsError = called.detail
      } else if (called.status !== 200 || called.json === null) {
        insightsError = insightsErrorText(called.status, called.json)
      } else {
        const list = Array.isArray(called.json['客户']) ? called.json['客户'] : []
        for (const item of list) {
          if (item === null || typeof item !== 'object') continue
          const id = firstString(item['客户ID'], item.customer_id)
          if (id === '') continue
          insightsCustomers.push({
            id,
            name: firstString(item['客户'], id),
            collectedAt: firstString(item['最近采集时间']),
          })
        }
      }
      const byId = new Map(insightsCustomers.map(item => [item.id, item]))
      const allowed = weakAllowedSet()
      let kb = []
      const resolvedKnowledge = resolveTool(hostCtx, knowledgeServer, knowledgeServers, clientsTool, [/hierarch/i, /(list|space|customer|client)/i])
      if (resolvedKnowledge.tool !== '') {
        const listed = await callTool(hostCtx, resolvedKnowledge.server, resolvedKnowledge.tool, {})
        if (listed.ok) {
          const normalized = normalize(listed.value)
          if (normalized !== null) kb = normalized
        }
      }
      const customers = []
      const unmapped = []
      for (const item of kb) {
        if (scope.cloud && !authorizedClient(scope, item.id) && !authorizedClient(scope, item.name)) continue
        const lines = weakLinesFor(item.name)
        if (lines.length === 0) { unmapped.push(item.name); continue }
        /* 每条线各自带自己的采集日；单业务线客户就只有一项（name 为空串）。 */
        const detailed = []
        for (const line of lines) {
          if (allowed !== null && !allowed.has(line.id)) continue
          if (scope.cloud && !scope.allowed.has(line.id)) continue
          const hint = byId.get(line.id) || null
          detailed.push({
            name: line.name,
            id: line.id,
            collectedAt: hint === null ? '' : hint.collectedAt,
            inWindow: hint !== null,
          })
        }
        if (detailed.length === 0) continue
        const primary = detailed[0]
        customers.push({
          id: primary.id,
          clientKey: item.id,
          name: item.name,
          meta: item.meta,
          collectedAt: primary.collectedAt,
          inWindow: primary.inWindow,
          /* 多业务线客户：前端拿这个填「业务线」下拉。单业务线客户是空数组。 */
          lines: detailed.length > 1 || detailed[0].name !== '' ? detailed : [],
        })
      }
      customers.sort((a, b) => String(b.collectedAt).localeCompare(String(a.collectedAt)))
      sendJson(res, {
        ok: true,
        customers,
        unmapped,
        insightsError,
        insightsTotal: insightsCustomers.length,
        allowlist: WEAK_CLIENT_ALLOWLIST.length,
      })
    }

    /* ---- 薄弱问句：万湖侧的原始客户目录（诊断用）-------------------
     * 只给名字和日期，用来把知识库客户对到 enterprise_id（补映射表用）。
     * 有白名单时只回白名单内那些，避免把全公司客户列出来。 */
    handlers[WEAK_RAW_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const called = await insightsCached('dir', INSIGHTS_DIR_CACHE_MS, 'GET', '/customers')
      if (!called.ok) {
        sendJson(res, { ok: false, error: called.error, detail: called.detail })
        return
      }
      if (called.status !== 200 || called.json === null) {
        sendJson(res, { ok: false, error: 'insights-failed', status: called.status, detail: insightsErrorText(called.status, called.json) })
        return
      }
      const list = Array.isArray(called.json['客户']) ? called.json['客户'] : []
      const allowed = weakAllowedSet()
      const customers = []
      for (const item of list) {
        if (item === null || typeof item !== 'object') continue
        const id = firstString(item['客户ID'], item.customer_id)
        if (id === '') continue
        if (allowed !== null && !allowed.has(id)) continue
        if (scope.cloud && !scope.allowed.has(id)) continue
        customers.push({ id, name: firstString(item['客户'], id), collectedAt: firstString(item['最近采集时间']) })
      }
      sendJson(res, {
        ok: true,
        windowDays: Number(called.json['统计窗口天数']) || null,
        customers,
        total: list.length,
        mapping: weakMapWithEnv(),
      })
    }

    /* ---- 薄弱问句：某个客户本期全部问句的差额 ----------------------
     * 直接透传外部接口的形状（问句 / 词根 / 平台[名称,差额] / 汇总），
     * 筛选、排序、红绿都在客户端做 —— 接口本身也不接受这些参数。 */
    handlers[WEAK_GAPS_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url ?? '/', 'http://dsh.invalid')
      const clientId = (url.searchParams.get('client_id') ?? '').trim()
      const fresh = url.searchParams.get('fresh') === '1'
      if (clientId === '') {
        sendJson(res, { ok: false, error: 'bad-request', detail: '缺少 client_id 参数' })
        return
      }
      if (scope.cloud && !scope.allowed.has(clientId)) {
        sendJson(res, { ok: false, error: 'not-allowed', detail: '这个客户不在当前可查名单里。' })
        return
      }
      if (!weakClientAllowed(clientId)) {
        /* 白名单外不调接口 —— 省一次请求，也不泄漏"这个客户存在"这件事。 */
        sendJson(res, { ok: false, error: 'not-allowed', detail: '这个客户不在当前可查名单里。' })
        return
      }
      const called = await insightsCached(
        `gaps:${clientId}`, INSIGHTS_GAPS_CACHE_MS, 'POST', '/question-gaps', { customer_id: clientId }, fresh,
      )
      if (!called.ok) {
        sendJson(res, { ok: false, error: called.error, detail: called.detail })
        return
      }
      if (called.status === 404) {
        sendJson(res, {
          ok: false,
          error: 'no-data',
          status: 404,
          code: called.json !== null && typeof called.json === 'object' ? called.json.error : '',
          detail: insightsErrorText(404, called.json),
        })
        return
      }
      if (called.status !== 200 || called.json === null) {
        sendJson(res, {
          ok: false,
          error: 'insights-failed',
          status: called.status,
          detail: insightsErrorText(called.status, called.json),
        })
        return
      }
      const raw = called.json
      const questions = Array.isArray(raw['问句']) ? raw['问句'] : []
      const out = []
      for (const item of questions) {
        if (item === null || typeof item !== 'object') continue
        const platforms = []
        for (const platform of (Array.isArray(item['平台']) ? item['平台'] : [])) {
          if (platform === null || typeof platform !== 'object') continue
          platforms.push({
            name: firstString(platform['名称']),
            gap: numberOrNull(platform['差额']),
          })
        }
        const summary = item['汇总'] !== null && typeof item['汇总'] === 'object' ? item['汇总'] : {}
        out.push({
          question: firstString(item['问句']),
          root: firstString(item['词根']),
          platforms,
          summary: {
            gap: numberOrNull(summary['差额']),
            weakCount: numberOrNull(summary['弱平台数']),
          },
        })
      }
      sendJson(res, {
        ok: true,
        client: firstString(raw['客户'], clientId),
        clientId,
        collectedAt: firstString(raw['采集时间']),
        taskId: called.headers.taskId,
        excluded: called.headers.excluded,
        questions: out,
      })
    }


    /* ---- 诊断：这台 Host 挂了哪些 MCP、各有哪些工具 ---------------- */
    handlers[MCP_INFO_PATH] = (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const servers = new Map()
      for (const name of schemaNames(hostCtx)) {
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
        toolCount: schemaNames(hostCtx).length,
      })
    }

    /* ---- 知识库：客户名单（不缓存）-------------------------------- */
    handlers[CLIENTS_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      let workspace = null
      try { workspace = await workspaceInfo(hostCtx) } catch {
        process.stderr.write('[dsh-workbench] 个人工作区暂不可用，新会话需重试\n')
      }
      const resolved = resolveTool(hostCtx, knowledgeServer, knowledgeServers, clientsTool, [/hierarch/i, /(list|space|customer|client)/i])
      if (resolved.tool === '') {
        sendJson(res, {
          ok: false,
          error: 'mcp-missing',
          workspace,
          detail: `没找到 ${knowledgeServer} / knowledge / sora-knowledge 的工具。设置 → MCP 里确认这台服务器已连接。`,
          available: schemaNames(hostCtx).filter(name => name.startsWith('mcp__')).sort(),
        })
        return
      }
      const { server, tool } = resolved
      const called = await callTool(hostCtx, server, tool, {})
      if (!called.ok) {
        sendJson(res, { ok: false, error: called.error, detail: called.detail, server, tool, workspace })
        return
      }
      const customers = normalize(called.value)
      if (customers === null) {
        sendJson(res, { ok: false, error: 'bad-reply', detail: `认不出 ${tool} 的返回形状（收到 ${describe(called.value)}）`, server, tool, workspace })
        return
      }
      sendJson(res, { ok: true, customers: scope.cloud ? customers.filter(customer => scope.allowed.has(customer.id)) : customers, server, tool, workspace })
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

    /* Batches use the same trusted uid/client scope as task-meta. Revision CAS
     * makes claiming a round atomic across both relay slots and browser tabs. */
    handlers[BATCH_PATH] = async (req, res, scope) => {
      if (!['GET', 'POST'].includes(req.method)) { methodNotAllowed(res); return }
      await loadClientNames(scope)
      if (scope.cloud && !scope.uid) { forbidden(res); return }
      if (req.method === 'GET') {
        const url = new URL(req.url, 'http://localhost')
        const id = url.searchParams.get('id') || ''
        const session = url.searchParams.get('session_id') || ''
        let batch = id ? readBatch(id) : null
        if (!id && session) batch = latestSessionBatches(scope, [session]).get(session)
        const binding = batch && ownEntry(readSessionClientIndex(), batch.session_id)
        if (!visibleBatch(scope, batch) || (session && batch.session_id !== session)
          || (binding && !visibleRecord(scope, binding))) {
          sendJson(res, { ok: false, error: 'not-found' }, 404); return
        }
        sendJson(res, { ok: true, batch }); return
      }
      let raw = ''
      req.on('data', chunk => { raw += chunk })
      await new Promise(resolve => req.on('end', resolve))
      let body
      try { body = JSON.parse(raw) } catch { body = null }
      if (!body || !validBatchId(body.id || '')) { sendJson(res, { ok: false, error: 'bad-id' }, 400); return }
      const prev = readBatch(body.id)
      if (prev && !visibleBatch(scope, prev)) { forbidden(res); return }
      const session = firstString(body.session_id, prev && prev.session_id)
      const binding = ownEntry(readSessionClientIndex(), session)
      if ((binding && !visibleRecord(scope, binding)) || !authorizedBinding(scope, prev || body)) { forbidden(res); return }
      if (prev && prev.session_id && body.session_id !== undefined && body.session_id !== prev.session_id) {
        sendJson(res, { ok: false, error: 'session-mismatch' }, 409); return
      }
      // Stop wins over an in-flight claim; stale updates cannot restart a batch.
      if (prev && body.op !== 'stop' && body.revision !== prev.revision) {
        sendJson(res, { ok: false, error: 'revision-conflict', batch: prev }, 409); return
      }
      let record
      if (!prev) {
        const rounds = Math.max(1, Math.min(20, Math.floor(Number(body.rounds) || 1)))
        if (rounds < 2 || !firstString(body.prompt)) { sendJson(res, { ok: false, error: 'bad-batch' }, 400); return }
        record = stampOwner(scope, {
          id: body.id, session_id: session, client_key: firstString(body.client_key), client: firstString(body.client),
          rounds, prompt: body.prompt, meta_id: firstString(body.meta_id), bind: body.bind || {}, model: body.model || null,
          questions: Array.isArray(body.questions) ? body.questions : [], status: 'running', review_opened: false,
          records: Array.from({ length: rounds }, (_, i) => ({ round: i + 1, title: '', angle: '', status: 'pending' })),
        })
      } else {
        record = { ...prev, session_id: session }
        if (body.op === 'stop') record.status = 'stopped'
        else {
          if (body.records !== undefined) {
            const rows = body.records
            if (!Array.isArray(rows) || rows.length !== prev.rounds || rows.some((row, i) => !row || row.round !== i + 1
              || !['pending', 'sending', 'ok', 'failed'].includes(row.status)
              || typeof row.title !== 'string' || typeof row.angle !== 'string'
              || (['ok', 'failed'].includes(prev.records[i].status) && JSON.stringify(row) !== JSON.stringify(prev.records[i]))
              || (prev.status !== 'running' && prev.records[i].status === 'pending' && row.status !== 'pending')
              || (prev.records[i].status === 'sending' && row.status === 'pending'))) {
              sendJson(res, { ok: false, error: 'bad-rounds' }, 400); return
            }
            record.records = rows
          }
          if (prev.status === 'running' && ['done', 'failed_partial'].includes(body.status)) {
            if (record.records.some(row => !['ok', 'failed'].includes(row.status))) {
              sendJson(res, { ok: false, error: 'rounds-incomplete' }, 400); return
            }
            record.status = record.records.some(row => row.status === 'failed') ? 'failed_partial' : 'done'
          }
          if (body.review_opened === true) record.review_opened = true
        }
      }
      record.revision = (prev ? prev.revision : 0) + 1
      record.savedAt = new Date().toISOString()
      try {
        writeSessionClientIndex(record, join(batchDir(), record.id + '.json'))
        sendJson(res, { ok: true, batch: record })
      } catch (error) {
        sendJson(res, { ok: false, error: 'save-failed', detail: String(error.message || error) }, 500)
      }
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
          const meta = readTaskMetaRecord(firstString(parsed.meta_id))
          const inherited = {}
          const clientKey = firstString(parsed.client_key, ownEntry(index, sessionId)?.client_key)
          if (meta && visibleRecord(scope, meta) && (!clientKey || clientKey === meta.client_key)) {
            for (const key of ['business_line_id', 'service_period_id', 'line', 'period', 'batch_id']) {
              if (meta[key]) inherited[key] = meta[key]
            }
          }
          for (const key of Object.keys(inherited)) {
            if (parsed[key] == null || parsed[key] === '') parsed[key] = inherited[key]
          }
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
     * 工作区探测保持原样；文章库优先使用绑定的 client_key。
     * 只报事实：目录是否存在 / 文件数 / 最近 24h 新增数。 */
    handlers[TASK_STATUS_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url, 'http://localhost')
      const bound = await libraryClient(Object.fromEntries(url.searchParams), scope, res)
      if (!bound) return
      /* 2026-09-24：卡点按「本任务」算 —— since = 任务发起时刻（meta.savedAt）。
       * 不传 since 才退回 24h 窗口。上一单的入库不再冒充本任务的进度。 */
      const sinceRaw = url.searchParams.get('since') ?? ''
      const sinceParsed = Date.parse(sinceRaw)
      const since = Number.isFinite(sinceParsed) && sinceParsed > 0 ? sinceParsed : Date.now() - 24 * 3600 * 1000
      function probe(dir) {
        try {
          if (!dir) return { exists: false, files: 0, recent: 0, list: [] }
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
      sendJson(res, { ok: true,
        workspace: probe(workspaceRoot() ? join(workspaceRoot(), clientPathName(bound.client)) : null),
        library: probe(clientLibraryDir(bound.client_key, bound.client)),
      })
    }

    /* ---- 草稿区（2026-09-24）：write(draft:true) 落「文章库/<客户>/草稿/」，
     * 人在工作台预览 → 确认 → 宿主把文件挪到正式位置（rename，查重幂等）。
     * 卷共享，入库动作不经过 MCP 容器。 */
    const draftDir = bound => join(clientLibraryDir(bound.client_key, bound.client), '草稿')
    const safeFile = name => {
      const s = String(name ?? '')
      if (!s || s.includes('/') || s.includes('\\') || s.includes('..')) throw new Error('bad file name')
      return s.endsWith('.md') ? s : s + '.md'
    }
    function localDraftLists(bound) {
      const localDrafts = []
      const localReady = []
      try {
        const dir = draftDir(bound)
        for (const name of readdirSync(dir)) {
          if (!name.toLowerCase().endsWith('.md')) continue
          const st = statSync(join(dir, name))
          localDrafts.push({ title: name.replace(/\.md$/i, ''), chars: st.size, updatedAt: new Date(st.mtimeMs).toISOString() })
        }
      } catch { /* 本地草稿目录不存在时继续查 Support */ }
      try {
        const libDir = clientLibraryDir(bound.client_key, bound.client)
        for (const name of readdirSync(libDir)) {
          if (!name.toLowerCase().endsWith('.md')) continue
          const st = statSync(join(libDir, name))
          localReady.push({ title: name.replace(/\.md$/i, ''), chars: st.size, updatedAt: new Date(st.mtimeMs).toISOString() })
        }
      } catch { /* 客户还没有正式库目录 */ }

      return { localDrafts, localReady }
    }

    /* Support 是正式站的权威源；MCP 不可用时仍返回本地兼容目录。 */
    async function listLibraryArticles(bound) {
      let mcpArticles = []
      const resolved = resolveTool(hostCtx, libraryServer, libraryServers, articlesTool, [/^list_articles$/i, /^list/i])
      if (resolved.tool !== '') {
        const called = await callTool(hostCtx, resolved.server, resolved.tool, { client: bound.client_key || bound.client })
        if (called.ok) {
          const normalized = normalizeLibraryArticles(called.value)
          if (normalized !== null) mcpArticles = normalized
        }
      }
      return mcpArticles
    }

    function cachedStatusArticles(bound, scope) {
      let cache = sessionStatusDraftCache.get(hostCtx)
      if (!cache) { cache = new Map(); sessionStatusDraftCache.set(hostCtx, cache) }
      const now = Date.now()
      for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key)
      const key = JSON.stringify([libraryRoot(), scope.cloud, scope.uid, [...scope.allowed].sort(),
        libraryServer, articlesTool, bound.client_key || bound.client])
      if (!cache.has(key)) {
        const entry = { expires: now + 30000, promise: listLibraryArticles(bound) }
        cache.set(key, entry) // Share in-flight reads as well as completed results.
        entry.promise.then(() => { entry.expires = Date.now() + 30000 })
      }
      return cache.get(key).promise
    }

    handlers[SESSION_STATUS_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const ids = sessionStatusIds(new URL(req.url, 'http://localhost').searchParams)
      if (!ids) { fail(res, 400, 'bad-ids', 'ids must contain 1–50 session ids'); return }
      const items = Object.create(null)
      if (scope.cloud && !scope.uid) { sendJson(res, { ok: true, items }); return }
      await loadClientNames(scope)
      const index = readSessionClientIndex(), map = readSessionClientIndex(clientMapFile())
      const batches = latestSessionBatches(scope, ids), clients = new Map()
      for (const id of ids) {
        const binding = ownEntry(index, id), mapped = ownEntry(map, id), batch = batches.get(id)
        if ((binding !== undefined && !visibleRecord(scope, binding))
            || (mapped !== undefined && !visibleRecord(scope, mapped)) || (!binding && !mapped && !batch)) continue
        if (!batch) { items[id] = sessionStatusItem(null); continue }
        const bound = resolveBoundClientForConfirm({ session_id: id, meta_id: batch.meta_id }, scope, index)
        if (bound?.forbidden) continue
        let merged = null
        if (bound && authorizedBinding(scope, bound) && assertConfirmClientMatch(bound, batch, scope).ok) {
          try {
            const dir = clientLibraryDir(bound.client_key, bound.client)
            // Match the drafts route's legacy-directory guard; writable names are not grants.
            if (scope.cloud && dir !== join(libraryRoot(), bound.client_key)
                && scope.namesByKey.get(bound.client_key) !== clientPathName(bound.client)) continue
            if (!clients.has(bound.client_key)) {
              const { localDrafts, localReady } = localDraftLists(bound)
              clients.set(bound.client_key, mergeDraftLists(localDrafts, localReady, await cachedStatusArticles(bound, scope)))
            }
            merged = clients.get(bound.client_key)
          } catch { /* An unavailable/invalid binding cannot safely attribute drafts. */ }
        }
        items[id] = sessionStatusItem(batch, merged)
      }
      sendJson(res, { ok: true, items })
    }

    handlers[DRAFTS_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url, 'http://localhost')
      const bound = await libraryClient(Object.fromEntries(url.searchParams), scope, res)
      if (!bound) return
      const { localDrafts, localReady } = localDraftLists(bound)
      const mcpArticles = await listLibraryArticles(bound)
      const merged = mergeDraftLists(localDrafts, localReady, mcpArticles)
      sendJson(res, { ok: true, drafts: merged.drafts, library: merged.library })
    }
    handlers[DRAFT_PATH] = async (req, res, scope) => {
      if (req.method !== 'GET' && req.method !== 'PUT') { methodNotAllowed(res); return }
      if (req.method === 'PUT') {
        /* 审校面板手改：只写本地草稿区，不碰正式库、不重跑检查。 */
        let body = ''
        req.on('data', c => { body += c; if (body.length > 2e6) req.destroy() })
        await new Promise(resolve => req.on('end', resolve))
        let parsed
        try { parsed = JSON.parse(body || '{}') } catch { parsed = {} }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {}
        const bound = await libraryClient(parsed, scope, res)
        if (!bound) return
        const title = firstString(parsed.title)
        if (title === '') {
          sendJson(res, { ok: false, error: 'bad-request', detail: '缺少 title' }, 400)
          return
        }
        if (typeof parsed.text !== 'string') {
          sendJson(res, { ok: false, error: 'bad-request', detail: '缺少 text' }, 400)
          return
        }
        try {
          const file = safeFile(title)
          const dir = draftDir(bound)
          mkdirSync(dir, { recursive: true })
          const target = join(dir, file)
          const tmp = target + '.tmp'
          writeFileSync(tmp, parsed.text, 'utf8')
          renameSync(tmp, target)
          sendJson(res, { ok: true })
        } catch (error) {
          sendJson(res, {
            ok: false,
            error: 'draft-write-failed',
            detail: String(error && error.message ? error.message : error),
          }, 500)
        }
        return
      }
      const url = new URL(req.url, 'http://localhost')
      const bound = await libraryClient(Object.fromEntries(url.searchParams), scope, res)
      if (!bound) return
      const title = firstString(url.searchParams.get('title'))
      try {
        const file = safeFile(title)
        const text = readFileSync(join(draftDir(bound), file), 'utf8')
        res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' })
        res.end(text)
        return
      } catch { /* Support fallback below */ }
      try {
        const resolved = resolveTool(hostCtx, libraryServer, libraryServers, 'read_article', [/read_article/i, /read/i])
        if (title === '' || resolved.tool === '') throw new Error('article-missing')
        const called = await callTool(hostCtx, resolved.server, resolved.tool, { client: bound.client_key || bound.client, title })
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
        const bound = await libraryClient(parsed, scope, res, true)
        if (!bound) return
        const displayClient = firstString(bound.client, bound.client_key)
        const boundKey = bound.client_key
        const fileName = safeFile(title)
        const src = join(draftDir(bound), fileName)
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
            sendJson(res, { ok: false, error: 'draft-missing', detail: `资料台草稿不存在：${title}` }, 404)
            return
          }
          content = articleContent(readCalled.value)
          if (content === null) {
            sendJson(res, { ok: false, error: 'draft-missing', detail: `资料台草稿不存在：${title}` }, 404)
            return
          }
        }
        const dst = join(clientLibraryDir(boundKey, bound.client), fileName)
        /* 先远端 write_article(draft:false) 用绑死的 client_key，再挪本地文件。 */
        const writeResolved = resolveTool(hostCtx, libraryServer, libraryServers, 'write_article', [/write_article/i, /write/i])
        let article = null
        if (writeResolved.tool !== '') {
          const called = await callTool(hostCtx, writeResolved.server, writeResolved.tool, {
            client: boundKey,
            title,
            content,
            draft: false,
            ...confirmQuestionContext(hostCtx, writeResolved, firstString(parsed.session_id, parsed.session),
              ownEntry(readSessionClientIndex(), firstString(parsed.session_id, parsed.session))),
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
          /* A local mirror is not proof that Support was updated. Never report
           * success or move it into the ready directory when the remote write
           * tool is unavailable. */
          sendJson(res, {
            ok: false,
            error: 'write-article-missing',
            detail: '没有可用的 write_article 工具，资料台草稿未更新。',
          }, 502)
          return
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
          clientLibraryDir(boundKey, bound.client, { create: true })
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

    /* ---- 文章硬检：只接受当前调用方能访问的客户 ---------------------- */
    handlers[CHECK_PATH] = async (req, res, scope) => {
      if (req.method !== 'POST') { methodNotAllowed(res); return }
      let body = ''
      req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy() })
      await new Promise(resolve => req.on('end', resolve))
      try {
        const parsed = JSON.parse(body || '{}')
        const titles = (Array.isArray(parsed.titles) ? parsed.titles : []).slice(0, 50)
        const bound = await libraryClient(parsed, scope, res)
        if (!bound) return
        if (titles.length === 0) { sendJson(res, { ok: false, error: 'no-client-or-titles' }); return }
        const files = []
        for (const raw of titles) {
          try {
            const safe = safeFile(raw)
            const draft = join(draftDir(bound), safe)
            if (existsSync(draft)) { files.push(draft); continue }
            const lib = join(clientLibraryDir(bound.client_key, bound.client), safe)
            if (existsSync(lib)) files.push(lib)
          } catch { /* bad names are ignored */ }
        }
        if (files.length === 0) { sendJson(res, { ok: false, error: 'no-files' }); return }
        let stdout = ''
        try {
          stdout = (await execFileP(process.execPath, [HARDCHECK_SCRIPT, ...files, '--json'],
            { timeout: 20000, maxBuffer: 10 * 1024 * 1024 })).stdout
        } catch (runError) {
          stdout = (runError && runError.stdout) || ''
          if (!stdout) throw runError
        }
        const result = JSON.parse(stdout)
        sendJson(res, { ok: true, results: Array.isArray(result.results) ? result.results : [] })
      } catch (error) {
        sendJson(res, { ok: false, error: 'hardcheck-failed', detail: String(error && error.message ? error.message : error).slice(0, 400) }, 500)
      }
    }

  for (const [path, handler] of Object.entries(handlers)) {
    handlers[path] = (req, res) => handler(req, res, requestScope(req))
  }
  return { handlers }
}
