// 三方合并（按行）：两个人从同一个 base 出发各自改了文档，把两边的修改合到一起。
// 改的是不同行 → 两边都保留；改到同一处且不一样 → 以 ours（刚提交的这次）为准，记一次冲突。
// 前端 console-web/src/merge3.js 是同一份代码（前端不能 import 这里的文件），改一处记得同步另一处。

function ops(A, B) {
  const n = A.length, m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push(['=', B[j]]); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(['-']); i++ }
    else out.push(['+', B[j++]])
  }
  while (i++ < n) out.push(['-'])
  while (j < m) out.push(['+', B[j++]])
  return out
}

/** base → other 的改动块：{ start, end（base 行号，左闭右开）, lines（替换成的内容） } */
function hunks(base, other, side) {
  // 公共头尾先剥掉，LCS 只算中间（知识库一般只改几处，这样很快）
  let s = 0
  while (s < base.length && s < other.length && base[s] === other[s]) s++
  let eb = base.length, eo = other.length
  while (eb > s && eo > s && base[eb - 1] === other[eo - 1]) { eb--; eo-- }
  const out = []
  let i = s, cur = null
  for (const [t, line] of ops(base.slice(s, eb), other.slice(s, eo))) {
    if (t === '=') { if (cur) { out.push(cur); cur = null } i++; continue }
    cur ??= { start: i, end: i, lines: [], side }
    if (t === '-') cur.end = ++i
    else cur.lines.push(line)
  }
  if (cur) out.push(cur)
  return out
}

function apply(base, from, to, hs) {
  const out = []
  let p = from
  for (const h of hs) { out.push(...base.slice(p, h.start), ...h.lines); p = h.end }
  out.push(...base.slice(p, to))
  return out
}

export function merge3(base, ours, theirs) {
  if (ours === theirs || theirs === base) return { text: ours, conflicts: 0 }
  if (ours === base) return { text: theirs, conflicts: 0 }
  const B = base.split('\n')
  const all = [...hunks(B, theirs.split('\n'), 'theirs'), ...hunks(B, ours.split('\n'), 'ours')]
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const out = []
  let pos = 0, conflicts = 0, k = 0
  while (k < all.length) {
    const group = [all[k]]
    let gStart = all[k].start, gEnd = all[k].end
    k++
    // 碰到同一段 base 行、或在同一个位置插入的，算一组一起处理
    while (k < all.length) {
      const h = all[k]
      const touch = h.start < gEnd || h.start === gStart ||
        (h.start === gEnd && (h.start === h.end || gStart === gEnd))
      if (!touch) break
      group.push(h); gEnd = Math.max(gEnd, h.end); k++
    }
    out.push(...B.slice(pos, gStart))
    const mine = group.filter((h) => h.side === 'ours')
    const other = group.filter((h) => h.side === 'theirs')
    if (!mine.length) out.push(...apply(B, gStart, gEnd, other))
    else if (!other.length) out.push(...apply(B, gStart, gEnd, mine))
    else {
      const a = apply(B, gStart, gEnd, mine), b = apply(B, gStart, gEnd, other)
      if (a.join('\n') !== b.join('\n')) conflicts++
      out.push(...a)
    }
    pos = gEnd
  }
  out.push(...B.slice(pos))
  return { text: out.join('\n'), conflicts }
}
