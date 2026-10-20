// Markdown 渲染（从旧版控制台原样移植，逻辑不变）

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

export function md(src) {
  const blocks = []
  let text = src.replace(/```([\s\S]*?)```/g, (_, code) => {
    blocks.push('<pre><code>' + esc(code.replace(/^\n/, '')) + '</code></pre>')
    return '\u0000' + (blocks.length - 1) + '\u0000'
  })
  const lines = text.split('\n')
  const out = []
  let list = null, quote = false, table = false, hn = 0   // hn：标题序号，给阅读区大纲跳转用
  const flushList = () => { if (list) { out.push('</' + list + '>'); list = null } }
  const flushQuote = () => { if (quote) { out.push('</blockquote>'); quote = false } }
  const flushTable = () => { if (table) { out.push('</tbody></table>'); table = false } }
  // 飞书导出带大量 \. \- \* 之类的转义：显示时去掉反斜杠（先换成占位，免得被 ** 等规则误伤）
  const inline = (s) => esc(s)
    .replace(/\\([\\`*_{}\[\]()#+\-.!|~>])/g, (_, c) => '\u0002' + c.charCodeAt(0) + '\u0003')
    .replace(/\\(&lt;|&gt;|&amp;)/g, '$1')                     // \< \> \&（esc 之后已是实体）
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/&lt;u&gt;([\s\S]+?)&lt;\/u&gt;/g, '<u>$1</u>')   // Markdown 没有下划线，用 <u>，只放行这一个标签
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\u0002(\d+)\u0003/g, (_, n) => esc(String.fromCharCode(+n)))

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '')
    if (/^\u0000\d+\u0000$/.test(line.trim())) { flushList(); flushQuote(); flushTable(); out.push(line.trim()); continue }
    if (!line.trim()) {
      // 飞书导出的列表每项之间隔一个空行：下一项还是同类列表就别断开，否则每项都是一个新列表、编号全是 1
      if (list) {
        let k = i + 1
        while (k < lines.length && !lines[k].trim()) k++
        const nx = lines[k] ?? ''
        if ((list === 'ul' && /^\s*[-*+]\s+/.test(nx)) || (list === 'ol' && /^\s*\d+[.)]\s+/.test(nx))) continue
      }
      flushList(); flushQuote(); flushTable(); continue
    }
    let m
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flushList(); flushQuote(); flushTable()
      out.push(`<h${m[1].length} id="h-${hn++}">${inline(m[2])}</h${m[1].length}>`); continue }
    if (/^(---|\*\*\*|___)\s*$/.test(line)) { flushList(); flushQuote(); flushTable(); out.push('<hr>'); continue }
    if ((m = /^>\s?(.*)$/.exec(line))) { flushList(); flushTable()
      if (!quote) { out.push('<blockquote>'); quote = true } out.push('<p>' + inline(m[1]) + '</p>'); continue }
    if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) { flushQuote(); flushTable()
      if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul' } out.push('<li>' + inline(m[1]) + '</li>'); continue }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { flushQuote(); flushTable()
      if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol' } out.push('<li>' + inline(m[1]) + '</li>'); continue }
    if (line.includes('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test((lines[i + 1] ?? '').replace(/\s+$/, ''))) {
      flushList(); flushQuote()
      const cells = line.split('|').map(s => s.trim()).filter((s, ix, a) => !(ix === 0 && s === '') && !(ix === a.length - 1 && s === ''))
      out.push('<table><thead><tr>' + cells.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>')
      table = true; i++; continue   // 跳过下一行的 |---|---| 分隔行
    }
    if (table && line.includes('|')) {
      const cells = line.split('|').map(s => s.trim()).filter((s, ix, a) => !(ix === 0 && s === '') && !(ix === a.length - 1 && s === ''))
      out.push('<tr>' + cells.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>'); continue
    }
    flushList(); flushQuote(); flushTable(); out.push('<p>' + inline(line) + '</p>')
  }
  flushList(); flushQuote(); flushTable()
  return out.join('\n').replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i])
}

export { esc }

/** 只做行内渲染（粗体/斜体/代码/链接/转义），表格单元格比对用 */
export function mdInline(s) {
  const h = md(String(s ?? '').replace(/^(\d+)\.(\s)/, '$1\\.$2').replace(/^([-*+#>])(\s)/, '\\$1$2'))
  return h.replace(/^<p>|<\/p>$/g, '')
}

// 大纲：和 md() 同一套标题识别（跳过代码块），序号与 id="h-N" 一一对应
export function outline(src) {
  const text = String(src || '').replace(/```[\s\S]*?```/g, '')
  const out = []
  for (const line of text.split('\n')) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line.replace(/\s+$/, ''))
    if (m) out.push({ level: m[1].length, text: m[2].replace(/\\/g, '').replace(/[*`]/g, ''), id: 'h-' + out.length })
  }
  return out
}
