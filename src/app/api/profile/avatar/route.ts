import { getStorage } from '@/lib/storage'
import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


const MAX_BYTES = 5 * 1024 * 1024
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** 上传自定义头像：存对象存储 fileId，渲染时再换带期限链接 */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const form = await request.formData()
    const file = form.get('avatar')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '没有收到图片' }, { status: 400 })
    }
    const ext = EXT_BY_TYPE[file.type]
    if (!ext) {
      return NextResponse.json({ error: '只支持 PNG / JPG / WebP / GIF 图片' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: '图片不要超过 5MB' }, { status: 400 })
    }

    const uploaded = await getStorage().uploadFile({
      fileContent: Buffer.from(await file.arrayBuffer()),
      fileName: `avatar-${auth.user.id}.${ext}`,
      contentType: file.type,
    })

    const { error } = await auth.supabase
      .from('profiles')
      .update({ avatar_file_id: uploaded.fileId })
      .eq('id', auth.user.id)
    if (error) throw new Error(`保存头像失败: ${error.message}`)

    const info = await getStorage().getFile({ fileId: uploaded.fileId, expiresInSeconds: 86400 })
    return NextResponse.json({ fileId: uploaded.fileId, url: info.url })
  } catch (error) {
    return errorResponse(error)
  }
}
