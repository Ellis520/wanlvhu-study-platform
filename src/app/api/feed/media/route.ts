import { NextResponse } from 'next/server'
import { MEDIA_URL_TTL, getStorage } from '@/lib/feed'
import { errorResponse, requireProfile } from '@/lib/server-auth'


export const dynamic = 'force-dynamic'


const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const MAX_VIDEO_SIZE = 100 * 1024 * 1024
const IMAGE_TYPE = /^image\/(jpeg|png|webp|heic|heif|gif)$/i
const VIDEO_TYPE = /^video\/(mp4|quicktime|webm|x-m4v|3gpp)$/i


/** 上传分享圈媒体：图片 ≤10MB，视频 ≤100MB */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请选择要上传的文件' }, { status: 400 })
    }
    if (file.size === 0) return NextResponse.json({ error: '文件内容为空' }, { status: 400 })

    const isVideo = file.type.startsWith('video/')
    if (isVideo) {
      if (file.size > MAX_VIDEO_SIZE) {
        return NextResponse.json({ error: '视频不能超过 100MB，请压缩后再上传' }, { status: 400 })
      }
      if (file.type && !VIDEO_TYPE.test(file.type)) {
        return NextResponse.json({ error: '仅支持 MP4 / MOV / WebM 视频' }, { status: 400 })
      }
    } else {
      if (file.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: '单张图片不能超过 10MB' }, { status: 400 })
      }
      if (file.type && !IMAGE_TYPE.test(file.type)) {
        return NextResponse.json({ error: '仅支持 JPG / PNG / WebP / HEIC 图片' }, { status: 400 })
      }
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop() : isVideo ? 'mp4' : 'jpg'
    const safeName = `feed-${auth.user.id.slice(0, 8)}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`

    const uploaded = await getStorage().uploadFile({
      fileContent: Buffer.from(await file.arrayBuffer()),
      fileName: safeName,
      contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
    })

    const info = await getStorage().getFile({ fileId: uploaded.fileId, expiresInSeconds: MEDIA_URL_TTL })
    return NextResponse.json({
      fileId: uploaded.fileId,
      type: isVideo ? 'video' : 'image',
      url: info.url,
      size: file.size,
    })
  } catch (error) {
    return errorResponse(error)
  }
}


/** 删除一个尚未随动态提交的媒体文件 */
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
