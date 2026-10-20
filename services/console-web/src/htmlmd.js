// 可视化编辑 → Markdown：只认 md.js 会渲染出来的那几种标签（再加 contentEditable 自己会插的 div/br/b/i）
// 客户在分享页直接改汉字，保存时转回 Markdown；一段内每个块占一行（和 md.js「一行一个 <p>」对得上）

const inline = (node) => {
  let out = ''
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += n.nodeValue.replace(/ /g, ' '); continue }
    if (n.nodeType !== 1) continue
    const tag = n.tagName
    const inner = inline(n)
    if (tag === 'BR') out += '\n'
    else if (!inner.trim()) out += inner
    else if (tag === 'STRONG' || tag === 'B') out += `**${inner.trim()}**`
    else if (tag === 'EM' || tag === 'I') out += `*${inner.trim()}*`
    else if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') out += `~~${inner.trim()}~~`
    else if (tag === 'U') out += `<u>${inner.trim()}</u>`
    else if (tag === 'CODE') out += '`' + n.textContent + '`'
    else if (tag === 'A') out += `[${inner}](${n.getAttribute('href') || ''})`
    else if (/^(DIV|P|LI|H[1-6])$/.test(tag)) out += '\n' + inner   // 行内冒出块元素 = 换行
    else out += inner
  }
  return out
}

// 一个块里出现 \n（br / 嵌套 div）就拆成多行，每行都是独立的块
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean)
// 普通段落文字以「1. 」「- 」「# 」「> 」开头时补反斜杠，保持它还是普通文字
const guard = (t) => t.replace(/^(\d+)\.(\s)/, '$1\\.$2').replace(/^([-*+#>])(\s)/, '\\$1$2')

function blocks(container) {
  const out = []
  let loose = ''                                  // 顶层裸文字 / 行内元素攒成一段
  const flush = () => { out.push(...lines(loose).map(guard)); loose = '' }
  for (const n of container.childNodes) {
    if (n.nodeType === 3 || (n.nodeType === 1 && !/^(H[1-6]|P|DIV|UL|OL|BLOCKQUOTE|TABLE|PRE|HR)$/.test(n.tagName))) {
      loose += n.nodeType === 3 ? n.nodeValue.replace(/ /g, ' ') : inline({ childNodes: [n] })
      continue
    }
    if (n.nodeType !== 1) continue
    flush()
    const tag = n.tagName
    if (/^H[1-6]$/.test(tag)) {
      const [first, ...rest] = lines(inline(n))
      if (first) out.push('#'.repeat(+tag[1]) + ' ' + first)
      out.push(...rest)
    } else if (tag === 'P') out.push(...lines(inline(n)).map(guard))
    else if (tag === 'DIV') out.push(...blocks(n))
    else if (tag === 'UL' || tag === 'OL') {
      let k = 0
      for (const li of n.children) {
        if (li.tagName !== 'LI') continue
        for (const t of lines(inline(li))) out.push(tag === 'UL' ? `- ${t}` : `${++k}. ${t}`)
      }
    } else if (tag === 'BLOCKQUOTE') out.push(...blocks(n).map((t) => '> ' + t))
    else if (tag === 'TABLE') {
      const rows = [...n.querySelectorAll('tr')].map((tr) =>
        [...tr.children].map((c) => inline(c).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim()))
      if (rows.length) {
        const w = Math.max(...rows.map((r) => r.length))
        const row = (r) => '| ' + Array.from({ length: w }, (_, x) => r[x] ?? '').join(' | ') + ' |'
        out.push(row(rows[0]), '| ' + Array(w).fill('---').join(' | ') + ' |', ...rows.slice(1).map(row))
      }
    } else if (tag === 'PRE') out.push('```\n' + n.textContent.replace(/\n$/, '') + '\n```')
    else if (tag === 'HR') out.push('---')
  }
  flush()
  return out
}

export function htmlToMd(elOrHtml) {
  let el = elOrHtml
  if (typeof elOrHtml === 'string') { el = document.createElement('div'); el.innerHTML = elOrHtml }
  return blocks(el).join('\n')
}

// ---------- 存回 Markdown 时尽量保住原文 ----------
// 编辑器吐出的 Markdown 会「规范化」：* 列表变 -、表格空格变、空行全没了。直接存的话，
// 客户改一个字，「看改动」里整篇都在变。所以按行对齐：渲染效果没变的行用原文那一行（连同它前后的空行），
// 只有真正改过 / 新加的行才用编辑器的写法。
import { md, mdInline } from './md'
import { diffArrays } from './diff'

// 相邻的同种标签合并比（**1****.9** 和 **1.9** 显示一样，编辑器会把前者规范成后者）
const norm = (h) => h.replace(/\s+/g, ' ').replace(/>\s+/g, '>').replace(/\s+</g, '<')
  .replace(/<\/(strong|em|del|u|code)><\1>/g, '')
// 一行的「长相」：渲染后的 HTML（表格行按单元格行内渲染比，分隔行统一）
export function lineKey(line) {
  const t = line.trim()
  if (/^\|?[\s:|-]+\|[\s:|-]*$/.test(t)) return 'SEP'
  if (t.startsWith('|') || (t.includes('|') && t.endsWith('|')))
    return 'ROW:' + t.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => norm(mdInline(c.trim()))).join('|')
  return norm(md(t))
}

const isList = (l) => /^\s*([-*+]|\d+[.)])\s/.test(l)
const isRow = (l) => l.trim().startsWith('|')
const glue = (a, b) => (isList(a) && isList(b)) || (isRow(a) && isRow(b))

export function mergeBack(orig, next) {
  const O = String(orig ?? '').split('\n')
  const idx = []
  O.forEach((l, i) => { if (l.trim()) idx.push(i) })
  const N = String(next ?? '').split('\n').filter((l) => l.trim())
  const ops = diffArrays(idx.map((i) => lineKey(O[i])), N.map(lineKey))
  const out = []
  let p = 0, ai = 0, bi = 0, afterDel = false
  const last = () => out[out.length - 1]
  for (const op of ops) {
    if (op.type === 'same') {
      const i = idx[ai++]; bi++
      while (p <= i) {
        const l = O[p++]
        if (!l.trim() && afterDel && last() !== undefined && !last().trim()) continue   // 删段后别留两道空行
        out.push(l)
      }
      afterDel = false
    } else if (op.type === 'del') {
      const i = idx[ai++]
      while (p < i) out.push(O[p++])                 // 前面的空行留着（可能马上要在这儿替换成新行）
      p = i + 1
      afterDel = true
    } else {
      const l = N[bi++]
      const prev = last()
      if (prev !== undefined && prev.trim() && !glue(prev, l)) out.push('')
      out.push(l)
      afterDel = false
    }
  }
  while (p < O.length) {
    const l = O[p++]
    if (!l.trim() && afterDel && last() !== undefined && !last().trim()) continue
    out.push(l)
  }
  return out.join('\n')
}
