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

/** 客户 ID 是否允许看。白名单为空 = 不限（开发期留的后门，别在生产用）。 */
function weakClientAllowed(clientId) {
  if (WEAK_CLIENT_ALLOWLIST.length === 0) return true
  return WEAK_CLIENT_ALLOWLIST.includes(clientId)
}

/** 知识库客户名 → 映射值。查不到返回 null（**不猜**）。
 * 值可能是 ID 字符串（单业务线），也可能是 { 业务线: ID }（多业务线）。 */
function weakMappingFor(name) {
  const wanted = firstString(name)
  if (wanted === '') return null
  const map = weakMapWithEnv()
  if (Object.prototype.hasOwnProperty.call(map, wanted)) return map[wanted]
  const squash = value => String(value).replace(/\s+/g, '')
  for (const [key, value] of Object.entries(map)) {
    if (squash(key) === squash(wanted)) return value
  }
  return null
}

/** 这个客户的业务线 → ID 清单。单业务线返回 `[{ name: '', id }]`；
 * 多业务线返回每条线一项；没配映射返回 `[]`。 */
function weakLinesFor(name) {
  const mapping = weakMappingFor(name)
  if (mapping === null || mapping === undefined) return []
  if (typeof mapping === 'string') {
    const id = firstString(mapping)
    return id === '' ? [] : [{ name: '', id }]
  }
  if (typeof mapping === 'object') {
    const out = []
    for (const [line, id] of Object.entries(mapping)) {
      const value = firstString(id)
      if (value !== '') out.push({ name: String(line), id: value })
    }
    return out
  }
  return []
}

/** 知识库客户名 → 万湖 enterprise_id（单业务线用；多业务线取第一条）。
 * 保留这个函数是为了向后兼容；要多业务线请用 weakLinesFor()。 */
function weakClientIdForName(name) {
  const lines = weakLinesFor(name)
  return lines.length === 0 ? '' : lines[0].id
}

/** 被允许的客户 ID 集合；白名单为空时返回 null（表示不限）。 */
function weakAllowedSet() {
  return WEAK_CLIENT_ALLOWLIST.length === 0 ? null : new Set(WEAK_CLIENT_ALLOWLIST)
}

/** 带 TTL 的记忆缓存。外部接口有限流（共享密钥 120 次/分钟），
 * 而且它自己每 5 分钟才重算一次 —— 查更勤是白查。 */
const weakCache = new Map()

/** 调外部接口一次。返回 { ok, status, json } 或 { ok:false, error, detail }。
 * 绝不抛异常，让调用方决定怎么说人话。 */
async function insightsRequest(method, path, body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, timeoutMs)
  try {
    const init = {
      method,
      headers: {
        'X-API-Key': INSIGHTS_KEY,
        accept: 'application/json',
      },
      signal: controller.signal,
    }
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const response = await fetch(`${INSIGHTS_BASE}${path}`, init)
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch { json = null }
    return {
      ok: true,
      status: response.status,
      json,
      headers: {
        taskId: firstString(response.headers.get('x-collection-task-id')),
        excluded: numberOrNull(response.headers.get('x-excluded-unmapped-question-count')),
        requestId: firstString(response.headers.get('x-request-id')),
      },
    }
  } catch (error) {
    const aborted = error !== null && typeof error === 'object' && error.name === 'AbortError'
    return {
      ok: false,
      error: aborted ? 'timeout' : 'network',
      detail: `请求 ${path} 失败：${String(error && error.message ? error.message : error)}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/** 带缓存地调外部接口。`fresh` 为真时跳过并清掉这条缓存（用户点「刷新」）。 */
async function insightsCached(key, ttlMs, method, path, body, fresh) {
  const now = Date.now()
  if (fresh === true) weakCache.delete(key)
  const hit = weakCache.get(key)
  if (hit !== undefined && now - hit.at < ttlMs) return hit.value
  const value = await insightsRequest(method, path, body, INSIGHTS_TIMEOUT_MS)
  weakCache.set(key, { at: now, value })
  return value
}

/** 外部接口的 404 有三种：客户不在 45 天窗口、没有可用采集、路由不存在。
 * 前两种对用户是「这个客户暂无数据」，第三种是我们自己调错了。 */
function insightsErrorText(status, json) {
  const code = json !== null && typeof json === 'object' && typeof json.error === 'string' ? json.error : ''
  if (code === 'customer_outside_45_day_window') return '这个客户最近 45 天没有采集任务'
  if (code === 'no_successful_collection' || code === 'no_collection') return '这个客户还没有成功的采集'
  if (code !== '') return `数据服务返回：${code}`
  return `数据服务返回 HTTP ${String(status)}`
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

    /* ---- 薄弱问句：可查客户目录 -------------------------------------
     * 从**知识库的客户**出发（那才是我们认识的客户），用映射对到万湖的
     * enterprise_id，再带上这次采集的日期。对不上映射的客户照样返回，
     * 但 `enterpriseId` 是空的 —— 前端据此置灰，不猜。 */
    handlers[WEAK_DIR_PATH] = async (req, res) => {
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
      const tool = pickTool(hostCtx, knowledgeServer, clientsTool, [/hierarch/i, /(list|space|customer|client)/i])
      if (tool !== '') {
        const listed = await callTool(hostCtx, knowledgeServer, tool, {})
        if (listed.ok) {
          const normalized = normalize(listed.value)
          if (normalized !== null) kb = normalized
        }
      }
      const customers = []
      const unmapped = []
      for (const item of kb) {
        const lines = weakLinesFor(item.name)
        if (lines.length === 0) { unmapped.push(item.name); continue }
        /* 每条线各自带自己的采集日；单业务线客户就只有一项（name 为空串）。 */
        const detailed = []
        for (const line of lines) {
          if (allowed !== null && !allowed.has(line.id)) continue
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
    handlers[WEAK_RAW_PATH] = async (req, res) => {
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
    handlers[WEAK_GAPS_PATH] = async (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url ?? '/', 'http://dsh.invalid')
      const clientId = (url.searchParams.get('client_id') ?? '').trim()
      const fresh = url.searchParams.get('fresh') === '1'
      if (clientId === '') {
        sendJson(res, { ok: false, error: 'bad-request', detail: '缺少 client_id 参数' })
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
      /* 知识库不给产品线时，用映射表里的业务线补上 —— 业务线是**选的**，
       * 而 ID 绑在业务线上（华熙生物四条线各一个企业）。纯本地查表，不请求。 */
      for (const customer of customers) {
        if (Array.isArray(customer.business_lines) && customer.business_lines.length > 0) continue
        const lines = weakLinesFor(customer.name)
        if (lines.length > 1 || (lines.length === 1 && lines[0].name !== '')) {
          customer.business_lines = lines.map(line => ({ id: line.name, name: line.name }))
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
