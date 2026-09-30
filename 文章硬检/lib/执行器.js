/* 硬检执行器 —— 拿一篇正文，按 规则表.js 扫一遍，报「哪条规则、哪句话、第几段」。
 *
 * 纯函数，不读文件、不联网、不调模型。谁调用它、给它哪几篇，由调用方决定 ——
 * 工作台那边传右栏正在显示的那几篇（已经按本任务过滤过），所以范围天然只有当前会话。
 *
 * 两条路：
 *   wordIssues()      —— 词表匹配（规则表.js 的 WORD_RULES）
 *   structureIssues() —— 数结构（`**` 几个、表格几列、标题几级）
 *
 * 一篇几十毫秒。不花 token。
 */

import { WORD_RULES, STRUCTURE_RULES, RULES_VERSION } from './规则表.js'

/** 命中处前后各取多少字来试豁免正则。 */
const ALLOW_WINDOW = 14
/** 报给界面的命中原句最多多少字（太长了列表没法看）。 */
const SNIPPET_MAX = 60
/** 同一条规则最多报几处（一篇里「知识库」出现 20 次没必要列 20 行）。 */
const PER_RULE_MAX = 5
/** 判「整段重复」的最短段落长度 —— 太短的段落（如「二、价格」）重复是正常的。 */
const DUP_MIN_CHARS = 40
/** 找限定口径时，往命中处前后各看多少字。 */
const QUALIFIER_WINDOW = 40

/**
 * 限定口径：时间、地域、数据来源。
 *
 * 《广告绝对化用语执法指南》第六条(六)——「在限定具体时间、地域等条件的情况下，
 * 表述时空顺序客观情况或者宣传产品销量、销售额、市场占有率等事实信息的」不算违规。
 * 所以带了这些限定的排他性说法，从 proof 降一档到 warn（还是提醒，但不拦入库）。
 */
const QUALIFIER_RES = [
  /20\d{2}\s*年?/,                                    // 2024 年
  /(截至|截止)/,                                       // 截至 2024 年底
  /(据|根据|依据|来源)[^。；]{0,20}(数据|报告|统计|机构|协会|榜单|白皮书|监测)/,
  /(数据|报告|统计|榜单|白皮书)(显示|表明|来源)/,
  /(中国大陆|中国内地|中国|大陆地区|华东|华南|华北|西南|东北|西北)(地区|市场)?/,
  /(省|市|区|县)(内|域内)/,
  /(第[一二三四五六七八九十]|上|下|本)(季度|半年|年度)/,
]

/**
 * 命中处**所在这一句**有没有限定口径。
 *
 * 必须限制在同一句内：用宽窗口会串句 —— 上一句写了「市场占有率」，
 * 下一句光秃秃一个「全网唯一」也被当成有出处放过了（实测踩过）。
 * 所以先按句末标点和换行切句，只在命中所在那句里找。
 * @param text - 正文。
 * @param offset - 命中起始偏移。
 * @param length - 命中长度。
 * @returns 这一句是否带限定口径。
 */
function hasQualifier(text, offset, length) {
  const from = Math.max(0, offset - QUALIFIER_WINDOW)
  const to = Math.min(text.length, offset + length + QUALIFIER_WINDOW)
  /* 往左找最近的句末（或换行），往右同理，夹出命中所在的那一句 */
  const left = text.slice(from, offset)
  const right = text.slice(offset + length, to)
  const SENT_END = /[。！？；\n]/g
  let leftCut = 0
  let match = SENT_END.exec(left)
  while (match !== null) { leftCut = match.index + 1; match = SENT_END.exec(left) }
  const rightEnd = right.search(/[。！？；\n]/)
  const sentence = left.slice(leftCut)
    + text.slice(offset, offset + length)
    + (rightEnd >= 0 ? right.slice(0, rightEnd) : right)
  return QUALIFIER_RES.some(re => re.test(sentence))
}

/* ----------------------------------------------------------------- 正文分段 */

/**
 * 按段落切开，记住每段的起止偏移，好把命中位置换算成「第几段」。
 * @param text - 正文。
 * @returns `[{ index, start, end, text }]`，index 从 1 开始。
 */
function paragraphs(text) {
  const out = []
  let index = 0
  let cursor = 0
  for (const chunk of text.split(/\n{2,}/)) {
    const start = text.indexOf(chunk, cursor)
    const at = start >= 0 ? start : cursor
    cursor = at + chunk.length
    if (chunk.trim() !== '') {
      index += 1
      out.push({ index, start: at, end: at + chunk.length, text: chunk })
    }
  }
  return out
}

/** 某个偏移落在第几段；找不到就返回 0（算「全文」）。 */
function paraAt(paras, offset) {
  for (const para of paras) {
    if (offset >= para.start && offset <= para.end) return para.index
  }
  return 0
}

/** 把位置说成人话。 */
function whereText(line, para) {
  if (para > 0) return `第 ${String(para)} 段`
  if (line > 0) return `第 ${String(line)} 行`
  return '全文'
}

/** 偏移 → 行号（1 起）。 */
function lineAt(text, offset) {
  let line = 1
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1
  }
  return line
}

/** 取命中处一小段上下文当「原句」。 */
function snippet(text, offset, length) {
  const from = Math.max(0, offset - 12)
  const to = Math.min(text.length, offset + length + 24)
  const raw = text.slice(from, to).replace(/\s+/g, ' ').trim()
  return raw.length > SNIPPET_MAX ? raw.slice(0, SNIPPET_MAX) + '…' : raw
}

/* ------------------------------------------------------------- frontmatter */

/**
 * 摘掉开头的 YAML frontmatter。
 *
 * 为什么要摘：frontmatter 本身是一条独立的 fail（s1），但如果不摘掉，
 * 里面的 `article_type` 之类会被词表再报一遍，一个毛病报两次。
 * @param text - 原始全文。
 * @returns `{ body, offset, found }`：body 是去掉 frontmatter 的正文，
 *   offset 是 body 在原文里的起始偏移（报位置时要加回去）。
 */
function stripFrontmatter(text) {
  const match = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)
  if (match === null) return { body: text, offset: 0, found: false }
  return { body: text.slice(match[0].length), offset: match[0].length, found: true }
}

/* ------------------------------------------------------------- 词表匹配 */

/**
 * 命中处是否被豁免（如「最」命中在「最终」上）。
 *
 * 两种豁免写法：
 *   - 普通正则：拿命中处**前后**各 ALLOW_WINDOW 字去试，中了就放过
 *   - `^` 开头：**从命中位置起**往后试，用于「看紧跟着的是什么」——
 *     「最好的口腔机构」是违规，「最好由医生判断」是劝告语气，
 *     只有锚定才分得开（用宽窗口会把同一句里的真违规一起放过）
 * @param text - 正文。
 * @param offset - 命中起始偏移。
 * @param length - 命中长度。
 * @param allowList - 豁免正则数组。
 * @returns 是否放过。
 */
function allowed(text, offset, length, allowList) {
  if (!Array.isArray(allowList) || allowList.length === 0) return false
  const forward = text.slice(offset, Math.min(text.length, offset + length + ALLOW_WINDOW))
  const around = text.slice(Math.max(0, offset - ALLOW_WINDOW), Math.min(text.length, offset + length + ALLOW_WINDOW))
  return allowList.some(re => {
    const flat = new RegExp(re.source, re.flags.replace('g', ''))
    return flat.test(re.source.startsWith('^') ? forward : around)
  })
}

/**
 * 跑词表规则。
 * @param body - 已摘掉 frontmatter 的正文。
 * @param paras - paragraphs(body) 的结果。
 * @returns issue 数组。
 */
function wordIssues(body, paras) {
  const out = []
  for (const rule of WORD_RULES) {
    /* 命中位置去重：同一个偏移可能被 words 和 res 各抓一次 */
    const seen = new Set()
    const hits = []

    const take = (offset, length) => {
      if (seen.has(offset)) return
      if (allowed(body, offset, length, rule.allow)) return
      seen.add(offset)
      hits.push({ offset, length })
    }

    for (const word of rule.words ?? []) {
      let from = 0
      for (;;) {
        const at = body.indexOf(word, from)
        if (at < 0) break
        take(at, word.length)
        from = at + word.length
      }
    }
    for (const re of rule.res ?? []) {
      const scan = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
      let match = scan.exec(body)
      while (match !== null) {
        take(match.index, match[0].length)
        if (match[0].length === 0) scan.lastIndex += 1
        match = scan.exec(body)
      }
    }

    hits.sort((a, b) => a.offset - b.offset)

    /* proof 档：带了限定口径（年份/地域/数据来源）的降到 warn ——
     * 「2024 年中国大陆销量第一」比光秃秃一句「销量第一」站得住得多。
     * **分档之后再截断**：不然「只显示前 5 处」会把降级过的那些折叠进
     * 一行 proof 汇总里，等于把降级白做了（实测踩过）。 */
    const byLevel = new Map()
    for (const hit of hits) {
      const qualified = rule.qualifier === true && hasQualifier(body, hit.offset, hit.length)
      const level = qualified ? 'warn' : rule.level
      if (!byLevel.has(level)) byLevel.set(level, [])
      byLevel.get(level).push({ ...hit, qualified })
    }

    for (const [level, group] of byLevel) {
      const shown = group.slice(0, PER_RULE_MAX)
      for (const hit of shown) {
        const para = paraAt(paras, hit.offset)
        out.push({
          ruleId: rule.id,
          group: rule.group,
          rule: rule.name,
          level,
          why: hit.qualified ? '已带限定口径，确认数据有出处即可' : rule.why,
          hit: `命中「${body.slice(hit.offset, hit.offset + hit.length)}」`
            + (hit.qualified ? '（已带限定口径）' : ''),
          snippet: snippet(body, hit.offset, hit.length),
          where: whereText(lineAt(body, hit.offset), para),
          para,
        })
      }
      if (group.length > shown.length) {
        out.push({
          ruleId: rule.id,
          group: rule.group,
          rule: rule.name,
          level,
          why: rule.why,
          hit: `另有 ${String(group.length - shown.length)} 处同类命中`,
          snippet: '',
          where: '全文',
          para: 0,
        })
      }
    }
  }
  return out
}

/* ------------------------------------------------------------- 结构检查 */

/** 查一条结构规则的元信息（级别、说明）。 */
function structMeta(id) {
  return STRUCTURE_RULES.find(rule => rule.id === id) ?? { group: '格式', name: id, level: 'fail', why: '' }
}

/** 造一条结构 issue。 */
function structIssue(id, hit, where, para) {
  const meta = structMeta(id)
  return {
    ruleId: id,
    group: meta.group,
    rule: meta.name,
    level: meta.level,
    why: meta.why,
    hit,
    snippet: '',
    where,
    para: para ?? 0,
  }
}

/** 一行里在代码块外的 `|` 分段数（去掉首尾空段）。 */
function tableCells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').length
}

/** 是不是表格分隔行（`|---|:--:|`）。 */
function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)
}

/**
 * 跑结构检查。
 * @param body - 已摘掉 frontmatter 的正文。
 * @param paras - paragraphs(body) 的结果。
 * @param hadFrontmatter - 原文是否带 frontmatter。
 * @returns issue 数组。
 */
function structureIssues(body, paras, hadFrontmatter) {
  const out = []

  /* s1 frontmatter */
  if (hadFrontmatter) out.push(structIssue('s1', '文件开头有 --- 区块', '开头'))

  const lines = body.split(/\r?\n/)

  /* s3 代码块闭合 —— 先算出来，后面判 s2 要跳过代码块内容 */
  const fenceLines = []
  lines.forEach((line, i) => { if (/^\s*```/.test(line)) fenceLines.push(i) })
  if (fenceLines.length % 2 === 1) {
    out.push(structIssue('s3', '``` 个数是奇数（' + String(fenceLines.length) + ' 个）', '第 ' + String(fenceLines[fenceLines.length - 1] + 1) + ' 行'))
  }
  /* 哪些行在代码块里 */
  const inFence = new Set()
  for (let i = 0; i + 1 < fenceLines.length; i += 2) {
    for (let n = fenceLines[i]; n <= fenceLines[i + 1]; n += 1) inFence.add(n)
  }

  /* s2 粗体星号闭合（按段算，好定位；整段是代码块的跳过） */
  for (const para of paras) {
    if (/^\s*```/.test(para.text)) continue
    const stars = (para.text.match(/\*\*/g) ?? []).length
    if (stars % 2 === 1) {
      out.push(structIssue('s2', '本段 ** 个数是奇数（' + String(stars) + ' 个）', whereText(0, para.index), para.index))
    }
  }

  /* s4 / s5 表格：连续的含 | 行算一张表，第一行当表头 */
  let table = null
  const endTable = () => {
    if (table !== null && !table.sawSeparator) {
      out.push(structIssue('s5', '表头下面缺 |---| 分隔行', '第 ' + String(table.startLine + 1) + ' 行'))
    }
    table = null
  }
  lines.forEach((line, i) => {
    if (inFence.has(i)) { endTable(); return }
    if (!line.includes('|') || line.trim() === '') { endTable(); return }
    if (table === null) {
      table = { startLine: i, cells: tableCells(line), sawSeparator: false }
      return
    }
    const cells = tableCells(line)
    if (isTableSeparator(line)) {
      table.sawSeparator = true
      if (cells !== table.cells) {
        out.push(structIssue('s4', '分隔行 ' + String(cells) + ' 列，表头 ' + String(table.cells) + ' 列', '第 ' + String(i + 1) + ' 行'))
      }
      return
    }
    if (cells !== table.cells) {
      out.push(structIssue('s4', '本行 ' + String(cells) + ' 列，表头 ' + String(table.cells) + ' 列', '第 ' + String(i + 1) + ' 行'))
    }
  })
  endTable()

  /* s6 标题跳级 */
  let prevLevel = 0
  lines.forEach((line, i) => {
    if (inFence.has(i)) return
    const match = /^(#{1,6})\s+(.*)$/.exec(line)
    if (match === null) return
    const level = match[1].length
    if (prevLevel > 0 && level > prevLevel + 1) {
      out.push(structIssue('s6', 'H' + String(prevLevel) + ' 直接跳到 H' + String(level), '第 ' + String(i + 1) + ' 行'))
    }
    prevLevel = level
    /* s8 空标题 */
    if (match[2].trim() === '') {
      out.push(structIssue('s8', '空标题（只有 #）', '第 ' + String(i + 1) + ' 行'))
    }
  })

  /* s7 字面量 \n / \t */
  lines.forEach((line, i) => {
    if (inFence.has(i)) return
    if (/\\[nt]/.test(line)) {
      out.push(structIssue('s7', '出现字面量 ' + (/\\n/.test(line) ? '\\n' : '\\t'), '第 ' + String(i + 1) + ' 行'))
    }
  })

  /* s8 空列表项 */
  lines.forEach((line, i) => {
    if (inFence.has(i)) return
    if (/^\s*([-*+]|\d+\.)\s*$/.test(line)) {
      out.push(structIssue('s8', '空列表项', '第 ' + String(i + 1) + ' 行'))
    }
  })

  /* s9 整段重复 */
  const seenPara = new Map()
  for (const para of paras) {
    const key = para.text.replace(/\s+/g, '')
    if (key.length < DUP_MIN_CHARS) continue
    if (seenPara.has(key)) {
      out.push(structIssue('s9', '与第 ' + String(seenPara.get(key)) + ' 段完全相同', whereText(0, para.index), para.index))
    } else {
      seenPara.set(key, para.index)
    }
  }

  /* s10 中文序号断裂 */
  const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  const marks = []
  lines.forEach((line, i) => {
    if (inFence.has(i)) return
    const match = /^\s*#{0,6}\s*([一二三四五六七八九十])[、．.]/.exec(line)
    if (match !== null) marks.push({ n: CN.indexOf(match[1]) + 1, line: i + 1 })
  })
  for (let i = 1; i < marks.length; i += 1) {
    if (marks[i].n > marks[i - 1].n + 1) {
      out.push(structIssue('s10', CN[marks[i - 1].n - 1] + ' 之后直接跳到 ' + CN[marks[i].n - 1], '第 ' + String(marks[i].line) + ' 行'))
    }
  }

  return out
}

/* ------------------------------------------------------------- 对外 */

/**
 * 检查一篇正文。
 * @param text - 文章全文（Markdown）。
 * @returns `{ verdict, counts, stats, issues }`。
 *   verdict：`fail` 有硬伤 / `warn` 只有疑似 / `pass` 干净。
 *   stats 里的字数、H2 数**只是统计**，不参与判定（按文章类型不同，硬判就是误报）。
 */
export function checkText(text) {
  const raw = typeof text === 'string' ? text : ''
  const { body, found } = stripFrontmatter(raw)
  const paras = paragraphs(body)

  const issues = wordIssues(body, paras).concat(structureIssues(body, paras, found))
  const order = { fail: 0, proof: 1, warn: 2 }
  issues.sort((a, b) => {
    if (a.level !== b.level) return (order[a.level] ?? 3) - (order[b.level] ?? 3)
    return a.para - b.para
  })

  const count = level => issues.filter(issue => issue.level === level).length
  const fails = count('fail')
  const proofs = count('proof')
  const warns = count('warn')
  return {
    rulesVersion: RULES_VERSION,
    /* fail 和 proof 都拦入库，但话不一样：fail 是「写错了」，proof 是「要有出处」。 */
    verdict: fails > 0 ? 'fail' : (proofs > 0 ? 'proof' : (warns > 0 ? 'warn' : 'pass')),
    counts: { fail: fails, proof: proofs, warn: warns },
    stats: {
      chars: body.replace(/\s/g, '').length,
      paragraphs: paras.length,
      h2: (body.match(/^##\s+/gm) ?? []).length,
    },
    issues,
  }
}
