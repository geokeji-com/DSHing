// 知识库「编辑区 → 确认 → 正式区」+ 版本历史
//
//   <DATA>/知识库-编辑区/<客户>/…   控制台的编辑、上传、删除只发生在这里（写手看不到）
//   <DATA>/知识库/<客户>/…          正式区 = 写手读的（知识库 MCP 只读挂载这个目录，代码不用改）
//   <DATA>/.kb-history/            Git 仓库（--git-dir），工作树 = 正式区；每次「确认版本」= 一次提交
//
// 为什么 Git 目录不放进 知识库/ 里：知识库 MCP 列客户时不过滤隐藏目录，.git 会被当成一个客户。
// 每个提交带 `Kb-File: <客户>/<文件>` 行，文件历史按它过滤（续约这类「内容无变化」的确认是空提交，
// git log -- <path> 查不到，所以不能靠路径过滤）。初始版本的 Kb-File 是 *，对所有文件都算一版。

import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rename as mv, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export function createKbStore({ data, kb = '知识库', author = 'console' }) {
  const PUB = join(data, kb)
  const EDIT = join(data, kb + '-编辑区')
  const GIT = join(data, '.kb-history')
  // 改名不进历史，但旧版本要跟着新名字走：新名 → 旧名 的记录（可以连着改好几次）
  const RENAMES = join(data, '.kb-renames.json')
  const loadRenames = async () => JSON.parse((await readFile(RENAMES, 'utf8').catch(() => '{}')) || '{}')
  /** 这个文件历史上用过的所有名字（含现在的） */
  async function namesOf(r) {
    const map = await loadRenames()
    const out = [r]
    for (let cur = r, n = 0; map[cur] && n < 50; cur = map[cur], n++) out.push(map[cur])
    return out
  }

  // 所有 git 操作串行，避免两个确认同时写 index
  let chain = Promise.resolve()
  const serial = (fn) => (chain = chain.then(fn, fn))

  const git = async (args, opts = {}) => {
    const { stdout } = await exec('git', [
      '-c', 'safe.directory=*', '-c', 'core.quotePath=false',
      '--git-dir', GIT, '--work-tree', PUB, ...args,
    ], { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...opts.env } })
    return stdout
  }
  const who = (name) => ({
    GIT_AUTHOR_NAME: name || author, GIT_AUTHOR_EMAIL: 'console@local',
    GIT_COMMITTER_NAME: name || author, GIT_COMMITTER_EMAIL: 'console@local',
  })

  const exists = (p) => stat(p).then(() => true, () => false)
  const read = (p) => readFile(p, 'utf8').catch(() => null)

  /** 首次启动：编辑区 = 正式区的拷贝；历史库建好并记一版「初始版本」 */
  async function init() {
    await mkdir(PUB, { recursive: true })
    if (!(await exists(EDIT))) {
      await cp(PUB, EDIT, { recursive: true, filter: (src) => !src.split('/').pop().startsWith('.') })
    }
    if (!(await exists(GIT))) {
      await exec('git', ['init', '-q', '--bare', GIT])
      await git(['config', 'core.bare', 'false'])
      await git(['add', '-A', '--', '.', ':(exclude).*', ':(exclude)**/.*'])
      await git(['commit', '-q', '--allow-empty', '-m', '初始版本\n\n控制台版本管理上线时的知识库状态\n\nKb-File: *'],
        { env: who('系统') })
    }
  }

  /** 逻辑路径「知识库/<客户>/…」→ 相对路径「<客户>/…」 */
  const rel = (path) => {
    if (!path.startsWith(kb + '/')) throw new Error('不是知识库路径')
    const r = path.slice(kb.length + 1)
    if (!r || r.split('/').some((s) => !s || s === '..' || s.startsWith('.'))) throw new Error('非法路径')
    return r
  }

  /** 状态：ok 已确认 / modified 有未确认修改 / new 从没确认过 / deleted 删除待确认 */
  async function status(path) {
    const r = rel(path)
    const [e, p] = await Promise.all([read(join(EDIT, r)), read(join(PUB, r))])
    if (e == null && p == null) return null
    if (e == null) return 'deleted'
    if (p == null) return 'new'
    return e === p ? 'ok' : 'modified'
  }

  /** 读：编辑区优先；删除待确认的退回正式区内容 */
  async function readFor(path) {
    const r = rel(path)
    return (await read(join(EDIT, r))) ?? (await read(join(PUB, r)))
  }

  async function write(path, content) {
    const abs = join(EDIT, rel(path))
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
    return abs
  }

  /** 删：只删编辑区；正式区要等确认 */
  async function remove(path) {
    const r = rel(path)
    if (await exists(join(EDIT, r))) await unlink(join(EDIT, r))
    else if (!(await exists(join(PUB, r)))) throw new Error('文件不存在')
  }

  /** 直接删除：编辑区和正式区一起删，写手立刻读不到；不记版本 */
  async function removeNow(path) {
    const r = rel(path)
    if (!(await exists(join(EDIT, r))) && !(await exists(join(PUB, r)))) throw new Error('文件不存在')
    await rm(join(EDIT, r), { force: true })
    await rm(join(PUB, r), { force: true })
  }

  /** 改名：编辑区和正式区一起改；不记版本，旧版本历史跟着新名字走 */
  async function rename(path, toPath) {
    const r = rel(path), t = rel(toPath)
    if (await exists(join(EDIT, t)) || await exists(join(PUB, t))) throw new Error('同名文件已存在')
    for (const base of [EDIT, PUB]) {
      if (!(await exists(join(base, r)))) continue
      await mkdir(dirname(join(base, t)), { recursive: true })
      await mv(join(base, r), join(base, t))
    }
    const map = await loadRenames()
    map[t] = r
    await writeFile(RENAMES, JSON.stringify(map, null, 2), 'utf8')
  }

  /** 放弃未确认的修改：编辑区回到正式区那一份（新文件 = 直接删掉） */
  async function discard(path) {
    const r = rel(path)
    const p = await read(join(PUB, r))
    if (p == null) { await unlink(join(EDIT, r)).catch(() => {}); return }
    await mkdir(dirname(join(EDIT, r)), { recursive: true })
    await writeFile(join(EDIT, r), p, 'utf8')
  }

  async function pending(path) {
    const r = rel(path)
    return { edit: await read(join(EDIT, r)), published: await read(join(PUB, r)) }
  }

  /** 确认版本：编辑区 → 正式区，记一版。内容没变也记（续约等业务节点） */
  function confirm(path, { name, note, by }) {
    return serial(async () => {
      const r = rel(path)
      const e = await read(join(EDIT, r))
      if (e == null) {
        await rm(join(PUB, r), { force: true })
      } else {
        await mkdir(dirname(join(PUB, r)), { recursive: true })
        await writeFile(join(PUB, r), e, 'utf8')
      }
      await git(['add', '-A', '--', r])
      const d = new Date()
      const title = (name || '').trim() || `${d.getMonth() + 1}-${d.getDate()} 确认`
      const msg = [title, (note || '').trim(), `Kb-File: ${r}`].filter(Boolean).join('\n\n')
      await git(['commit', '-q', '--allow-empty', '-m', msg], { env: who(by) })
      return { ok: true, title }
    })
  }

  /** 某文件的版本列表（新→旧） */
  async function history(path) {
    const r = rel(path)
    const names = new Set(await namesOf(r))
    const SEP = '\u001e', FS = '\u001f'
    const out = await git(['log', `--format=${SEP}%H${FS}%an${FS}%aI${FS}%B`])
    const rows = []
    for (const chunk of out.split(SEP).slice(1)) {
      const [sha, an, date, body] = chunk.split(FS)
      const lines = body.trim().split('\n')
      const file = (lines.find((l) => l.startsWith('Kb-File: ')) ?? '').slice(9)
      if (!names.has(file) && file !== '*') continue
      const text = lines.filter((l) => !l.startsWith('Kb-File: ')).join('\n').trim()
      const [title, ...rest] = text.split('\n\n')
      rows.push({ sha, author: an, date, name: title, note: rest.join('\n\n').trim(), initial: file === '*' })
    }
    // 每版相对上一版的增删行数（初始版本不算）
    for (const v of rows) {
      if (v.initial) continue
      const ns = await git(['show', '--numstat', '--format=', v.sha, '--', ...names]).catch(() => '')
      const m = /^(\d+)\t(\d+)\t/.exec(ns)
      v.added = m ? +m[1] : 0
      v.removed = m ? +m[2] : 0
    }
    return rows
  }

  /** 某一版的内容 + 它的上一版（给「显示改动」用） */
  async function version(path, sha) {
    if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error('版本号不合法')
    const r = rel(path)
    const names = await namesOf(r)
    const show = async (ref) => {
      for (const n of names) { const c = await git(['show', `${ref}:${n}`]).catch(() => null); if (c != null) return c }
      return null
    }
    const parents = (await git(['rev-list', '--parents', '-n', '1', sha])).trim().split(' ').slice(1)
    return { content: await show(sha), prev: parents.length ? await show(sha + '~1') : null }
  }

  /** 编辑区和正式区里出现过的客户名 */
  async function clients() {
    const names = new Set()
    for (const base of [EDIT, PUB]) {
      for (const e of await readdir(base, { withFileTypes: true }).catch(() => [])) {
        if (e.isDirectory() && !e.name.startsWith('.')) names.add(e.name)
      }
    }
    return names
  }

  return { PUB, EDIT, init, rel, status, readFor, write, remove, removeNow, rename, discard, pending, confirm, history, version, clients }
}
