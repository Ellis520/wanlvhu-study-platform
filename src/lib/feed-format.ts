/** 时间显示统一按东八区固定格式，服务端与客户端渲染结果一致，避免 hydration 差异 */
const OFFSET_MS = 8 * 60 * 60 * 1000

export function formatTime(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  const local = new Date(parsed.getTime() + OFFSET_MS)
  const month = local.getUTCMonth() + 1
  const day = local.getUTCDate()
  const hour = String(local.getUTCHours()).padStart(2, '0')
  const minute = String(local.getUTCMinutes()).padStart(2, '0')
  return `${month}月${day}日 ${hour}:${minute}`
}

export function initialOf(name: string): string {
  return name.trim().slice(0, 1) || '同'
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}
