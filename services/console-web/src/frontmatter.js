// 把 markdown 开头的 --- frontmatter --- 拆出来：阅读视图里收进信息卡，不当正文渲染
export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text || '')
  if (!m) return { meta: [], body: text || '' }
  const meta = []
  let cur = null
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (kv) {
      cur = { key: kv[1], value: /^[>|][-+]?$/.test(kv[2].trim()) ? '' : kv[2].trim() }
      meta.push(cur)
    } else if (cur && line.trim()) {
      cur.value += (cur.value ? ' ' : '') + line.trim()
    }
  }
  return { meta, body: text.slice(m[0].length) }
}
