import { lineDiff } from './diff'
import { md } from './md'

// 正文里标改动：按「段」（空行分块）比，改过/新加的段浅绿底 + 左侧绿线，删掉的段淡化 + 删除线
export default function InlineDiff({ a, b }) {
  const split = (t) => t.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)
  const rows = lineDiff(split(a).join('\n\u0001\n'), split(b).join('\n\u0001\n'))
  // 把行 diff 重新拼回段：同一段里只要有一行变了，这段就算改过
  const blocks = []
  let cur = { lines: [], add: false, del: false, same: false }
  const flush = () => { if (cur.lines.length) blocks.push(cur); cur = { lines: [], add: false, del: false, same: false } }
  for (const r of rows) {
    if (r.text === '\u0001') { flush(); continue }
    if (r.type === 'del' && (cur.add || cur.same)) { flush() }
    cur.lines.push(r); cur[r.type === 'same' ? 'same' : r.type] = true
  }
  flush()
  return (
    <div className="md-view inline-diff">
      {blocks.map((bk, k) => {
        const onlyDel = bk.del && !bk.add && !bk.same
        const text = bk.lines.filter((l) => l.type !== 'del').map((l) => l.text).join('\n')
        if (onlyDel) return <div key={k} className="idf del" dangerouslySetInnerHTML={{ __html: md(bk.lines.map((l) => l.text).join('\n')) }} />
        return <div key={k} className={'idf' + (bk.add || bk.del ? ' chg' : '')} dangerouslySetInnerHTML={{ __html: md(text) }} />
      })}
    </div>
  )
}
