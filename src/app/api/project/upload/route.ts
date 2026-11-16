import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { PROJECT_FILE_URL_TTL, getStorage } from '@/lib/project'
import {
  IMAGE_EXT,
  MAX_IMAGE_SIZE,
  MAX_PAPER_SIZE,
  MAX_VIDEO_SIZE,
  PAPER_EXT,
  VIDEO_EXT,
  fileExt,
  formatSize,
} from '@/lib/project-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Kind = 'paper' | 'image' | 'video'

const PAPER_MIME = /(pdf|msword|officedocument\.wordprocessingml\.document)/i
const IMAGE_MIME = /^image\//i
const VIDEO_MIME = /^video\//i

/** 上传研学项目材料：论文（PDF/Word ≤20MB）、图片（≤10MB）、视频（≤100MB） */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const form = await request.formData()
    const file = form.get('file')
    const kindRaw = String(form.get('kind') ?? 'paper')
    const kind: Kind = kindRaw === 'image' || kindRaw === 'video' ? kindRaw : 'paper'

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请选择要上传的文件' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: '文件内容为空' }, { status: 400 })
    }

    const ext = fileExt(file.name)
    const type = file.type || ''

    if (kind === 'paper') {
      if (file.size > MAX_PAPER_SIZE) {
        return NextResponse.json(
          { error: `论文不能超过 ${formatSize(MAX_PAPER_SIZE)}，请压缩后再上传` },
          { status: 400 },
        )
      }
      if (!PAPER_EXT.includes(ext) && !PAPER_MIME.test(type)) {
        return NextResponse.json({ error: '论文仅支持 PDF / DOC / DOCX' }, { status: 400 })
      }
    } else if (kind === 'image') {
      if (file.size > MAX_IMAGE_SIZE) {
        return NextResponse.json(
          { error: `单张图片不能超过 ${formatSize(MAX_IMAGE_SIZE)}` },
          { status: 400 },
        )
      }
      if (!IMAGE_EXT.includes(ext) && !IMAGE_MIME.test(type)) {
        return NextResponse.json({ error: '仅支持 JPG / PNG / WebP / HEIC 图片' }, { status: 400 })
      }
    } else {
      if (file.size > MAX_VIDEO_SIZE) {
        return NextResponse.json(
          { error: `视频不能超过 ${formatSize(MAX_VIDEO_SIZE)}，请压缩后再上传` },
          { status: 400 },
        )
      }
      if (!VIDEO_EXT.includes(ext) && !VIDEO_MIME.test(type)) {
        return NextResponse.json({ error: '视频仅支持 MP4 / MOV / WebM' }, { status: 400 })
      }
    }

    const safeExt = ext || (kind === 'paper' ? 'pdf' : kind === 'video' ? 'mp4' : 'jpg')
    const safeName = `project-${kind}-${auth.user.id.slice(0, 8)}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${safeExt}`

    const uploaded = await getStorage().uploadFile({
      fileContent: Buffer.from(await file.arrayBuffer()),
      fileName: safeName,
      contentType:
        type || (kind === 'paper' ? 'application/pdf' : kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    })

    const info = await getStorage().getFile({
      fileId: uploaded.fileId,
      expiresInSeconds: PROJECT_FILE_URL_TTL,
    })

    return NextResponse.json({
      fileId: uploaded.fileId,
      fileName: file.name,
      size: file.size,
      kind,
      url: info.url,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

/** 删除一份还没随项目提交的文件 */
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
