import { skillTint } from './skillMeta'

// 彩色首字头像：技能卡和客户列表共用一套视觉语言
export default function Avatar({ name, text, size = 28, radius }) {
  const t = skillTint(name)
  return (
    <span className="avatar" style={{
      width: size, height: size, borderRadius: radius ?? Math.round(size * 0.28),
      background: t.bg, color: t.fg, fontSize: Math.round(size * 0.42),
    }}>
      {(text ?? name).slice(0, 1)}
    </span>
  )
}
