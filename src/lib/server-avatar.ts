import { getStorage } from '@/lib/storage'
import { avatarSrc } from '@/lib/avatar'

const AVATAR_URL_TTL = 86400

/**
 * 服务端解析头像地址：上传照片优先（存 fileId，换取带期限签名链接），否则用预置手绘图。
 * 取签名失败时回落到预置头像，避免整页因为一张图挂掉。
 */
export async function resolveAvatarUrl(
  fileId: string | null | undefined,
  preset: string | null | undefined,
): Promise<string | null> {
  if (fileId) {
    try {
      const info = await getStorage().getFile({ fileId, expiresInSeconds: AVATAR_URL_TTL })
      return info.url
    } catch {
      return avatarSrc(preset)
    }
  }
  return avatarSrc(preset)
}
