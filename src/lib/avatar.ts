/**
 * 预置头像清单：登录/资料页从这里选，选中的 key 存 profiles.avatar_preset。
 * 图片在 public/avatars/，与全站「野外记录本」的苔绿墨线手绘风格一致。
 */
export interface AvatarOption {
  key: string
  label: string
  src: string
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { key: 'otter', label: '水獭', src: '/avatars/otter.png' },
  { key: 'egret', label: '白鹭', src: '/avatars/egret.png' },
  { key: 'fern', label: '蕨叶', src: '/avatars/fern.png' },
  { key: 'pinecone', label: '松果', src: '/avatars/pinecone.png' },
  { key: 'ripple', label: '涟漪', src: '/avatars/ripple.png' },
  { key: 'butterfly', label: '蝴蝶', src: '/avatars/butterfly.png' },
  { key: 'stone', label: '卵石', src: '/avatars/stone.png' },
  { key: 'grass', label: '竹节草', src: '/avatars/grass.png' },
]

const AVATAR_KEYS = new Set(AVATAR_OPTIONS.map((item) => item.key))

export function isAvatarKey(value: unknown): value is string {
  return typeof value === 'string' && AVATAR_KEYS.has(value)
}

export function avatarSrc(preset: string | null | undefined): string | null {
  if (!isAvatarKey(preset)) return null
  return `/avatars/${preset}.png`
}
