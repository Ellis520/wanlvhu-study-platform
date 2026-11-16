import { Readable } from 'node:stream'
import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { resolveFinalScore } from '@/lib/final-score'
import {
  contentDisposition,
  createSubmissionZip,
  sanitizeName,
  type ArchiveSource,
} from '@/lib/project-archive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type RouteContext = { params: Promise<{ id: string }> }

type FileRow = { fileId?: string; fileName?: string; size?: number }

interface SubmissionRow {
  id: string
  user_id: string
  title: string | null
  status: string | null
  submitted_at: string | null
  submit_count: number | null
  ai_score: number | null
  best_ai_score: number | null
  teacher_score: number | null
  paper: FileRow | null
  images: unknown
  video: FileRow | null
  profiles:
    | { display_name: string; class_name: string }
    | { display_name: string; class_name: string }[]
    | null
}

function toFileRows(input: unknown): FileRow[] {
  if (!Array.isArray(input)) return []
  return input.filter((item): item is FileRow => Boolean(item) && typeof item === 'object')
}

/** 按「论文 / 图片 / 视频」整理出压缩包内的条目 */
function collectSources(row: SubmissionRow): ArchiveSource[] {
  const sources: ArchiveSource[] = []

  if (row.paper?.fileId) {
    sources.push({
      folder: '论文',
      fileName: row.paper.fileName || '论文',
      fileId: row.paper.fileId,
    })
  }

  toFileRows(row.images).forEach((image, index) => {
    if (!image.fileId) return
    const name = image.fileName || `图片-${index + 1}`
    sources.push({
      folder: '图片',
      fileName: `${String(index + 1).padStart(2, '0')}-${name}`,
      fileId: image.fileId,
    })
  })

  if (row.video?.fileId) {
    sources.push({
      folder: '视频',
      fileName: row.video.fileName || '视频',
      fileId: row.video.fileId,
    })
  }

  return sources
}

function summarize(row: SubmissionRow, authorName: string, studentCode: string | null): string {
  const final = resolveFinalScore(row)
  const lines = [
    '万绿湖研学项目 · 学生提交材料',
    '',
    `学生：${authorName}`,
    `学号：${studentCode ?? '—'}`,
    `作品标题：${row.title || '（未命名）'}`,
    `状态：${row.status === 'submitted' ? '已提交' : '草稿'}`,
    `提交版本：第 ${Math.max(row.submit_count ?? 0, 1)} 版`,
    `提交时间：${row.submitted_at ? new Date(row.submitted_at).toLocaleString('zh-CN') : '—'}`,
    '',
    `AI 分：${row.ai_score ?? '—'}（历史最高 ${row.best_ai_score ?? '—'}）`,
    `教师分：${row.teacher_score ?? '—'}`,
    `最终成绩：${final.score ?? '—'}`,
    '',
    `材料：${[
      row.paper ? '论文' : '',
      toFileRows(row.images).length ? `图片 ${toFileRows(row.images).length} 张` : '',
      row.video ? '视频' : '',
    ]
      .filter(Boolean)
      .join(' / ')}`,
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
  ]
  return lines.join('\n')
}

/** 教师端：把某位学生提交的材料打包成 zip 下载 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role !== 'teacher') {
      return NextResponse.json({ error: '仅教师可下载学生作品压缩包' }, { status: 403 })
    }

    const { id } = await context.params
    const { data, error } = await auth.supabase
      .from('project_submissions')
      .select(
        'id, user_id, title, status, submitted_at, submit_count, ai_score, best_ai_score, teacher_score, paper, images, video, profiles(display_name, class_name)',
      )
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(`读取作品失败: ${error.message}`)
    if (!data) return NextResponse.json({ error: '作品不存在' }, { status: 404 })

    const row = data as SubmissionRow
    const sources = collectSources(row)
    if (sources.length === 0) {
      return NextResponse.json(
        { error: '这位学生还没有上传可打包的材料（论文 / 图片 / 视频）' },
        { status: 400 },
      )
    }

    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const authorName = profile?.display_name ?? '未命名学生'

    // 学号取自名册（按姓名匹配），压缩包文件名里带上，方便老师归档
    const { data: rosterEntry } = await auth.supabase
      .from('class_roster')
      .select('student_code')
      .eq('display_name', authorName)
      .maybeSingle()
    const studentCode = (rosterEntry?.student_code as string | null) ?? null

    const zipName = `${sanitizeName(authorName)}_${studentCode ? `${sanitizeName(studentCode)}_` : ''}研学作品.zip`
    const infoName = '提交信息.txt'
    const { stream, done } = createSubmissionZip(sources, {
      name: infoName,
      content: summarize(row, authorName, studentCode),
    })
    // 打包过程中读文件失败时，abort 已让客户端下载中断，这里兜住避免 unhandled rejection
    done.catch((zipError: unknown) => {
      console.error(
        `[teacher/bundle] 打包失败 submission=${row.id}:`,
        zipError instanceof Error ? zipError.message : zipError,
      )
    })

    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition(zipName),
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
