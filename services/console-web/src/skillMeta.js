// 技能中文名：先抄工作台 client.js 里的 SKILL_DISPLAY（临时方案，两边要同步改；
// 以后换成 SKILL.md frontmatter 自带 display_name）
export const SKILL_DISPLAY = {
  'sora-ranking': '老榜单',
  'sora-review': '测评排行',
  'sora-selection': '选型决策',
  'sora-single-brand': '品牌词论证',
  'sora-star-ranking': '星级榜单',
  'sora-deep-mimic': '深度仿写',
  'sora-trust': '信任构建',
  'sora-primer': '纯科普',
}
export const skillName = (name) => SKILL_DISPLAY[name] || name

// 卡片图标底色：按名字稳定取色，不同技能一眼分得开
const TINTS = ['#e8f0fe', '#fdeee6', '#e7f6ec', '#f3ecfd', '#fff4d6', '#e6f6f8', '#fde8ef', '#eef0f3']
const INKS = ['#2f6feb', '#d9632b', '#2a9a55', '#7b4bd6', '#b7861a', '#178a99', '#c8416e', '#5b6470']
export function skillTint(name) {
  let h = 0
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const i = h % TINTS.length
  return { bg: TINTS[i], fg: INKS[i] }
}

// 「GEO 文章写作 · 深度仿写。按一篇金样…。当…时使用。触发词：a、b」
// → { summary: 去掉前缀和触发词的正文, triggers: [a, b] }
export function splitDesc(desc) {
  let s = String(desc || '').replace(/^GEO\s*文章写作\s*·\s*[^。]*。/, '')
  let triggers = []
  const m = /触发词[:：]\s*(.+)$/.exec(s)
  if (m) {
    triggers = m[1].replace(/[。.]$/, '').split(/[、,，]/).map((x) => x.trim()).filter(Boolean)
    s = s.slice(0, m.index)
  }
  return { summary: s.trim(), triggers }
}

// 字数显示：12345 → 1.2 万字
export const fmtChars = (n) => n == null ? '' : n >= 10000 ? (n / 10000).toFixed(1) + ' 万字' : n + ' 字'
// 2026-09-14 → 9 月 14 日（今年省年份）
export const fmtDate = (d) => {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  return (y === new Date().getFullYear() ? '' : y + ' 年 ') + m + ' 月 ' + day + ' 日'
}

// 文件类型：按文件名粗分，只用于列表图标配色（不是正式分类）
export function fileKind(title, tab) {
  if (tab === 'articles') return { key: 'article', label: '文章', bg: '#e8f0fe', fg: '#2f6feb' }
  if (tab === 'archives') return { key: 'archive', label: '档案', bg: '#fff4d6', fg: '#b7861a' }
  if (/竞品/.test(title)) return { key: 'rival', label: '竞品', bg: '#fdeee6', fg: '#d9632b' }
  if (/补充|报告/.test(title)) return { key: 'extra', label: '补充', bg: '#e6f6f8', fg: '#178a99' }
  return { key: 'brand', label: '品牌', bg: '#e7f6ec', fg: '#2a9a55' }
}
