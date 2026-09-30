#!/usr/bin/env node
/* 硬检 CLI —— 命令行跑一遍，看它报的准不准。
 *
 * 为什么要这个：界面调试一圈要重启、刷新、等 bundle，慢；命令行改一版跑一版，快几倍。
 * 规则表和执行器跟工作台共用同一份（lib/规则表.js + lib/执行器.js），不会两边漂移。
 *
 * 用法：
 *   node 硬检.mjs <文件.md> [更多文件…]
 *   node 硬检.mjs <目录>           # 扫目录下的 *.md（不递归）
 *   node 硬检.mjs --规则            # 只打印它查什么（那份给人看的清单）
 *   node 硬检.mjs --json <文件>     # 出 JSON，给别的程序用
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const { checkText } = await import(join(here, 'lib/执行器.js'))
const { ruleCatalog, GROUPS } = await import(join(here, 'lib/规则表.js'))

const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const YEL = '\x1b[33m'
const CYN = '\x1b[36m'
const GRN = '\x1b[32m'
const BLD = '\x1b[1m'
const OFF = '\x1b[0m'

const argv = process.argv.slice(2)
const wantJson = argv.includes('--json')
const wantRules = argv.includes('--规则') || argv.includes('--rules')
const targets = argv.filter(arg => !arg.startsWith('--'))

/* ---- --规则：打印「它查什么」------------------------------------ */
if (wantRules) {
  const catalog = ruleCatalog()
  if (wantJson) {
    process.stdout.write(JSON.stringify(catalog, null, 2) + '\n')
    process.exit(0)
  }
  process.stdout.write(`${BLD}硬检规则${OFF} ${DIM}v${catalog.version}${OFF}\n`)
  process.stdout.write(`${DIM}拦 = 挡住入库　证 = 可能是真的，要有出处（也挡）　提 = 只提醒${OFF}\n\n`)
  for (const group of GROUPS) {
    process.stdout.write(`${BLD}${group.id}${OFF} ${DIM}${group.desc}${OFF}\n`)
    for (const rule of catalog.rules.filter(r => r.group === group.id)) {
      const tag = rule.level === 'fail' ? `${RED}拦${OFF}`
        : rule.level === 'proof' ? `${CYN}证${OFF}` : `${YEL}提${OFF}`
      const eg = rule.samples.length > 0 ? ` ${DIM}如：${rule.samples.join('、')}${OFF}` : ''
      process.stdout.write(`  ${tag} ${rule.name}${eg}\n`)
      process.stdout.write(`     ${DIM}${rule.why}${OFF}\n`)
    }
    process.stdout.write('\n')
  }
  process.stdout.write(`${DIM}它不查：文章写得好不好、逻辑通不通、事实对不对（价格/地址/参数）、`
    + `字数和有没有 FAQ（按文章类型不同，硬判就是误报）${OFF}\n`)
  process.exit(0)
}

if (targets.length === 0) {
  process.stderr.write('用法：node 硬检.mjs <文件.md|目录> [...]   或   node 硬检.mjs --规则\n')
  process.exit(2)
}

/* ---- 收集要检查的文件 -------------------------------------------- */
const files = []
for (const target of targets) {
  let st
  try { st = statSync(target) } catch {
    process.stderr.write(`找不到：${target}\n`)
    process.exit(2)
  }
  if (st.isDirectory()) {
    for (const name of readdirSync(target).sort()) {
      if (name.toLowerCase().endsWith('.md')) files.push(join(target, name))
    }
  } else {
    files.push(target)
  }
}

/* ---- 跑 ---------------------------------------------------------- */
const started = Date.now()
const results = files.map(file => {
  const text = readFileSync(file, 'utf8')
  return { file, title: basename(file).replace(/\.md$/i, ''), ...checkText(text) }
})
const elapsed = Date.now() - started

if (wantJson) {
  process.stdout.write(JSON.stringify({ results, elapsedMs: elapsed }, null, 2) + '\n')
  process.exit(results.some(r => r.verdict === 'fail' || r.verdict === 'proof') ? 1 : 0)
}

/* ---- 人看的报告 --------------------------------------------------- */
/** 三档的显示样式。 */
const MARK = { fail: `${RED}✗${OFF}`, proof: `${CYN}?${OFF}`, warn: `${YEL}!${OFF}` }

for (const result of results) {
  const mark = result.verdict === 'pass' ? `${GRN}✓${OFF}` : MARK[result.verdict]
  const parts = []
  if (result.counts.fail > 0) parts.push(`${RED}${String(result.counts.fail)} 处硬伤${OFF}`)
  if (result.counts.proof > 0) parts.push(`${CYN}${String(result.counts.proof)} 处要出处${OFF}`)
  if (result.counts.warn > 0) parts.push(`${YEL}${String(result.counts.warn)} 处疑似${OFF}`)
  const tail = parts.length === 0 ? `${GRN}干净${OFF}` : parts.join(' · ')
  process.stdout.write(`\n${mark} ${BLD}${result.title}${OFF}  ${tail}`
    + `  ${DIM}${String(result.stats.chars)} 字 · ${String(result.stats.h2)} 个 H2${OFF}\n`)

  for (const issue of result.issues) {
    process.stdout.write(`   ${MARK[issue.level]} ${issue.group} · ${issue.rule}\n`)
    process.stdout.write(`     ${issue.hit}  ${DIM}${issue.where}${OFF}\n`)
    if (issue.snippet !== '') process.stdout.write(`     ${DIM}…${issue.snippet}…${OFF}\n`)
  }
}

/* 挡入库的是 fail 和 proof，退出码跟着它们走（CI / 脚本能直接用）。 */
const blocked = results.filter(r => r.verdict === 'fail' || r.verdict === 'proof').length
const warn = results.filter(r => r.verdict === 'warn').length
const ok = results.length - blocked - warn
process.stdout.write(`\n${DIM}────${OFF} ${String(results.length)} 篇：`
  + `${GRN}${String(ok)} 干净${OFF} · ${YEL}${String(warn)} 有疑似${OFF} · ${RED}${String(blocked)} 挡住${OFF}`
  + `  ${DIM}${String(elapsed)}ms${OFF}\n`)
process.exit(blocked > 0 ? 1 : 0)
