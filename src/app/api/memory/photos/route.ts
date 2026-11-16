import { getStorage } from '@/lib/storage'
import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'


export const dynamic = 'force-dynamic'


const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPE = /^image\/(jpeg|png|webp|heic|heif|gif)$/i


/** 上传回顾照片到平台对象存储，返回 fileId 与带期限的访问链接 */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请选择要上传的照片' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: '照片内容为空' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '单张照片不能超过 10MB' }, { status: 400 })
    }
    if (file.type && !ALLOWED_TYPE.test(file.type)) {
      return NextResponse.json({ error: '仅支持 JPG / PNG / WebP / HEIC 图片' }, { status: 400 })
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
    const safeName = `memory-${auth.user.id.slice(0, 8)}-${Date.now()}.${ext ?? 'jpg'}`

    const uploaded = await getStorage().uploadFile({
      fileContent: Buffer.from(await file.arrayBuffer()),
      fileName: safeName,
      contentType: file.type || 'image/jpeg',
    })

    const info = await getStorage().getFile({ fileId: uploaded.fileId, expiresInSeconds: 60 * 60 * 12 })
    return NextResponse.json({
      fileId: uploaded.fileId,
      fileName: uploaded.fileName,
      url: info.url,
    })
  } catch (error) {
    return errorResponse(error)
  }
}


/** 删除一张尚未随打卡提交的照片 */
export async function DELETE(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const fileId = new URL(request.url).searchParams.get('fileId') ?? ''
    if (!fileId) return NextResponse.json({ error: '缺少 fileId' }, { status: 400 })

    const ok = await getStorage().deleteFile({ fileId })
    return NextResponse.json({ ok })
  } catch (error) {
    return errorResponse(error)
  }
}
