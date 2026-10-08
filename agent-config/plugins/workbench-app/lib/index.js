/* dsh-workbench — 宿主半边的**壳**。
 *
 * 这个文件应该几乎不用改。真正的逻辑在 `impl.js`，这里只做两件事：
 *
 *   1. 把四条路由注册一次；
 *   2. 每个请求按 `impl.js` 的 mtime 决定要不要重新 import。
 *
 * 为什么绕这一下
 * -------------
 * 宿主插件的代码改了，DSH **要重启才生效** —— 模块已经被 import 缓存，
 * 把 loader 行禁用再启用也没用（实测过）。而客户端半边是 500ms 热替换的。
 * 于是把易变的逻辑放进 impl.js，按 mtime 重新 import，宿主逻辑就也跟着热了：
 *
 *   - 改 `impl.js`   → 下一个请求就是新逻辑，**不用重启**
 *   - 改 `index.js`  → 还是要重启一次（这层壳刻意写到最少）
 *
 * 代价：多一层间接 + 每个请求多做一次 statSync。值。
 */

import { mkdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 注册进 webServer 的路径，必须与 impl.js 造的 handlers 键一致。 */
const ROUTES = [
  '/api/workbench/clients',
  '/api/workbench/articles',
  '/api/workbench/skills',
  '/api/workbench/mcp',
  '/api/workbench/task-meta',
  '/api/workbench/session-client',
  '/api/workbench/client-map',
  '/api/workbench/assign-client-group',
  '/api/workbench/task-status',
  '/api/workbench/drafts',
  '/api/workbench/draft',
  '/api/workbench/confirm-draft',
]

/** 只补齐本用户的工作区；新会话的显式落点由热加载的 impl/client 提供。 */
const DEFAULT_WORKSPACE_TITLE = '我的工作区'

const IMPL_PATH = join(dirname(fileURLToPath(import.meta.url)), 'impl.js')

/** 已加载的实现：{ mtimeMs, module }。 */
let cached = null

/** impl.js 的当前实现；文件一变就重新 import（带 mtime 查询串破缓存）。 */
async function currentImpl() {
  let mtimeMs = 0
  try {
    mtimeMs = statSync(IMPL_PATH).mtimeMs
  } catch {
    mtimeMs = 0
  }
  if (cached !== null && cached.mtimeMs === mtimeMs) return cached.module
  const module = await import(`./impl.js?mtime=${String(mtimeMs)}`)
  cached = { mtimeMs, module }
  return module
}

function fail(res, status, error, detail) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ ok: false, error, detail }))
}

/**
 * Mount the workbench routes.
 * @param ctx - host plugin context.
 * @param config - this row's config from cordis.patch.yml.
 */
export function apply(ctx, config) {
  ctx.inject(['webServer', 'tools', 'skills', 'workspaceRegistry'], hostCtx => {
    /* 确保默认工作区（幂等）：目录不存在就建，registry 里没有就注册。
     * 失败只打日志 —— 工作区缺失不该拖垮工作台路由。 */
    try {
      if (!process.env.DSH_HOME) {
        process.stderr.write('[dsh-workbench] DSH_HOME 未设置，跳过个人工作区初始化\n')
      } else {
        const path = join(process.env.DSH_HOME, 'workspaces', 'default')
        mkdirSync(path, { recursive: true })
        const canonical = realpathSync(path)
        const registry = hostCtx.workspaceRegistry
        const has = registry.list().some(w => w.path === canonical)
        if (!has) {
          registry.create(canonical, DEFAULT_WORKSPACE_TITLE)
            .then(() => process.stderr.write(`[dsh-workbench] 默认工作区已就绪：${canonical}\n`))
            .catch(error => process.stderr.write(`[dsh-workbench] 默认工作区创建失败：${String(error && error.message ? error.message : error)}\n`))
        }
      }
    } catch (error) {
      process.stderr.write(`[dsh-workbench] 默认工作区检查失败：${String(error && error.message ? error.message : error)}\n`)
    }

    for (const path of ROUTES) {
      hostCtx.effect(
        () => hostCtx.webServer.register({
          kind: 'exact',
          path,
          handler: async (req, res) => {
            try {
              const module = await currentImpl()
              const handlers = module.create(hostCtx, config).handlers
              const handler = handlers[path]
              if (typeof handler !== 'function') {
                fail(res, 500, 'impl-missing-route', `impl.js 没有实现 ${path}`)
                return
              }
              await handler(req, res)
            } catch (error) {
              fail(res, 500, 'workbench-route-failed', String(error && error.message ? error.message : error))
            }
          },
        }),
        `dsh-workbench: ${path}`,
      )
    }
    process.stderr.write('[dsh-workbench] 路由就绪（逻辑在 impl.js，改它不用重启）\n')
  })
}
