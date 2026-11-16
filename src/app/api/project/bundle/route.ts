import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { getPrimaryTrip } from '@/lib/server-trip'
import { PROJECT_COLUMNS, normalizeFiles, toProjectPayload } from '@/lib/project'
import {
  MAX_BUNDLE_SIZE,
  scanBundle,
  spoolToTemp,
  uploadEntry,
  type BundleScan,
} from '@/lib/project-bundle'
import { MAX_IMAGES, fileExt, formatSize } from '@/lib/project-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function summarize(scan: BundleScan) {
  return {
    paper: scan.paper ? { name: scan.paper.name, size: scan.paper.size } : null,
    images: scan.images.map((item) => ({ name: item.name, size: item.size })),
    video: scan.video ? { name: scan.video.name, size: scan.video.size } : null,
    ignored: scan.ignored,
    notes: scan.notes,
  }
}

function previousFileIds(row: Record<string, unknown> | null): string[] {
  if (!row) return []
  const ids: string[] = []
  const paper = row.paper as { fileId?: string } | null
  if (paper?.fileId) ids.push(paper.fileId)
  const video = row.video as { fileId?: string } | null
  if (video?.fileId) ids.push(video.fileId)
  for (const image of normalizeFiles(row.images)) {
    if (image.fileId) ids.push(image.fileId)
  }
  return ids
}

/**
 * 上传作品压缩包（一个 zip 装论文 + 图片 + 视频）。
 * 请求体是 zip 原始二进制，文件名通过 `?name=` 传入；服务端落盘解压后按类型分别入库。
 */
export async function POST(request: Request) {
  let cleanup: (() => Promise<void>) | null = null
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role === 'teacher') {
      return NextResponse.json({ error: '教师无需提交研学作品' }, { status: 403 })
    }

    const url = new URL(request.url)
    const rawName = url.searchParams.get('name') ?? 'works.zip'
    const bundleName = rawName.split(/[\\/]/).pop() || 'works.zip'
    if (fileExt(bundleName) !== 'zip') {
      return NextResponse.json({ error: '只支持 zip 压缩包，请把论文、图片、视频打成一个 zip' }, { status: 400 })
    }
    if (!request.body) {
      return NextResponse.json({ error: '没有收到压缩包内容' }, { status: 400 })
    }

    const spooled = await spoolToTemp(request.body)
    cleanup = spooled.cleanup

    if (spooled.size === 0) {
      return NextResponse.json({ error: '压缩包是空的' }, { status: 400 })
    }
    if (spooled.size > MAX_BUNDLE_SIZE) {
      return NextResponse.json(
        { error: `压缩包有 ${formatSize(spooled.size)}，超过 ${formatSize(MAX_BUNDLE_SIZE)} 上限` },
        { status: 400 },
      )
    }

    const scan = await scanBundle(spooled.filePath)
    if (!scan.paper) {
      return NextResponse.json(
        {
          error:
            '压缩包里没有找到论文。请把论文（PDF 或 DOC/DOCX）放在压缩包根目录或任意子文件夹里，再重新打包。',
        },
        { status: 400 },
      )
    }

    const trip = await getPrimaryTrip(auth.supabase)

    const paper = await uploadEntry(spooled.filePath, scan.paper, auth.user.id)
    const images = []
    for (const entry of scan.images.slice(0, MAX_IMAGES)) {
      images.push(await uploadEntry(spooled.filePath, entry, auth.user.id))
    }
    const video = scan.video ? await uploadEntry(spooled.filePath, scan.video, auth.user.id) : null

    const { data: existing, error: existingError } = await auth.supabase
      .from('project_submissions')
      .select('id, paper, images, video, paper_text, status')
      .eq('trip_id', trip.id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (existingError) throw new Error(`读取项目提交失败: ${existingError.message}`)

    const previousPaperId =
      existing && existing.paper && typeof existing.paper === 'object'
        ? ((existing.paper as Record<string, unknown>).fileId as string | undefined) ?? ''
        : ''
    const paperChanged = (paper.fileId ?? '') !== previousPaperId

    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {
      paper,
      images,
      video,
      updated_at: now,
    }
    // 换了论文就要重新解析正文，否则 AI 会拿旧正文评分
    if (paperChanged) {
      patch.paper_text = ''
      patch.paper_parse_status = 'none'
      patch.paper_parse_task_id = null
      patch.ai_score = null
      patch.ai_review = null
      patch.ai_reviewed_at = null
    }

    if (existing) {
      const { error } = await auth.supabase
        .from('project_submissions')
        .update(patch)
        .eq('id', existing.id)
      if (error) throw new Error(`保存项目失败: ${error.message}`)
    } else {
      const { error } = await auth.supabase.from('project_submissions').insert({
        ...patch,
        user_id: auth.user.id,
        trip_id: trip.id,
        status: 'draft',
      })
      if (error) throw new Error(`保存项目失败: ${error.message}`)
    }

    // 旧材料已被整包替换，顺手清理对象存储里的历史文件
    const keep = new Set(
      [paper.fileId, video?.fileId ?? '', ...images.map((item) => item.fileId)].filter(Boolean),
    )
    for (const fileId of previousFileIds(existing)) {
      if (keep.has(fileId)) continue
      try {
        await deleteStoredFile(fileId)
      } catch {
        // 旧文件清理失败不影响本次上传
      }
    }

    const { data: saved, error: savedError } = await auth.supabase
      .from('project_submissions')
      .select(PROJECT_COLUMNS)
      .eq('trip_id', trip.id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (savedError) throw new Error(`读取项目提交失败: ${savedError.message}`)

    return NextResponse.json({
      project: await toProjectPayload(saved),
      scan: summarize(scan),
      bundle: { name: bundleName, size: spooled.size },
    })
  } catch (error) {
    return errorResponse(error)
  } finally {
    if (cleanup) await cleanup()
  }
}

async function deleteStoredFile(fileId: string) {
  const { getStorage } = await import('@/lib/project')
  await getStorage().deleteFile({ fileId })
}
