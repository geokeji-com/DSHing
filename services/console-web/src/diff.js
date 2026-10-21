// 行级 diff（LCS）：知识库单文件千行量级，O(n·m) 足够快，不引第三方库
// 返回 [{ type: 'same' | 'add' | 'del', text }]
export function lineDiff(a, b) {
  return diffArrays(String(a ?? '').split('\n'), String(b ?? '').split('\n'))
}

/** 两个字符串数组逐项比；返回 [{ type, text }]，text 是数组里的那一项 */
export function diffArrays(A, B) {
  // 先剥掉公共头尾，LCS 只算中间那段
  let s = 0
  while (s < A.length && s < B.length && A[s] === B[s]) s++
  let ea = A.length, eb = B.length
  while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb-- }
  const a2 = A.slice(s, ea), b2 = B.slice(s, eb)
  const n = a2.length, m = b2.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const mid = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a2[i] === b2[j]) { mid.push({ type: 'same', text: a2[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) mid.push({ type: 'del', text: a2[i++] })
    else mid.push({ type: 'add', text: b2[j++] })
  }
  while (i < n) mid.push({ type: 'del', text: a2[i++] })
  while (j < m) mid.push({ type: 'add', text: b2[j++] })
  return [
    ...A.slice(0, s).map((t) => ({ type: 'same', text: t })),
    ...mid,
    ...A.slice(ea).map((t) => ({ type: 'same', text: t })),
  ]
}

export function diffStat(a, b) {
  let added = 0, removed = 0
  for (const d of lineDiff(a, b)) {
    // 和 git numstat 同口径（空行也算），确认弹窗和历史里的数字才对得上
    if (d.type === 'add') added++
    else if (d.type === 'del') removed++
  }
  return { added, removed }
}

/** 折叠大段没变的：每块改动前后各留 ctx 行，中间换成 { type: 'gap', n } */
export function foldDiff(rows, ctx = 2) {
  const keep = new Array(rows.length).fill(false)
  rows.forEach((r, k) => {
    if (r.type === 'same') return
    for (let x = Math.max(0, k - ctx); x <= Math.min(rows.length - 1, k + ctx); x++) keep[x] = true
  })
  const out = []
  let gap = 0
  rows.forEach((r, k) => {
    if (keep[k]) { if (gap) { out.push({ type: 'gap', n: gap }); gap = 0 } out.push(r) }
    else gap++
  })
  if (gap) out.push({ type: 'gap', n: gap })
  return out
}
