import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { getPrimaryTrip } from '@/lib/server-trip'
import { PROJECT_COLUMNS, normalizeFile, normalizeFiles, toProjectPayload } from '@/lib/project'
import { MAX_IMAGES, MAX_SUMMARY, MAX_TITLE } from '@/lib/project-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 读取当前学生的研学项目作品（未提交过时返回空壳） */
export async function GET(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    const trip = await getPrimaryTrip(auth.supabase)

    const { data, error } = await auth.supabase
      .from('project_submissions')
      .select(PROJECT_COLUMNS)
      .eq('trip_id', trip.id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (error) throw new Error(`读取项目提交失败: ${error.message}`)

    return NextResponse.json({ project: await toProjectPayload(data), trip })
  } catch (error) {
    return errorResponse(error)
  }
}

interface SaveBody {
  title?: unknown
  summary?: unknown
  paper?: unknown
  images?: unknown
  video?: unknown
  submit?: unknown
}

/** 保存草稿 / 提交作品：每人每个研学项目只有一份，重新提交即覆盖 */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role === 'teacher') {
      return NextResponse.json({ error: '教师无需提交研学作品' }, { status: 403 })
    }
    const trip = await getPrimaryTrip(auth.supabase)

    const body = (await request.json()) as SaveBody
    const title = String(body.title ?? '').trim().slice(0, MAX_TITLE)
    const summary = String(body.summary ?? '').trim().slice(0, MAX_SUMMARY)
    const paper = normalizeFile(body.paper)
    const images = normalizeFiles(body.images, MAX_IMAGES)
    const video = normalizeFile(body.video)
    const submit = body.submit === true

    if (submit && !paper) {
      return NextResponse.json({ error: '提交前请先上传论文（PDF 或 Word）' }, { status: 400 })
    }

    const { data: existing, error: existingError } = await auth.supabase
      .from('project_submissions')
      .select('id, paper, paper_text, paper_parse_status, submit_count')
      .eq('trip_id', trip.id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (existingError) throw new Error(`读取项目提交失败: ${existingError.message}`)

    const previousPaperId =
      existing && existing.paper && typeof existing.paper === 'object'
        ? ((existing.paper as Record<string, unknown>).fileId as string | undefined) ?? ''
        : ''
    const paperChanged = (paper?.fileId ?? '') !== previousPaperId

    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {
      title,
      summary,
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
    if (submit) {
      patch.status = 'submitted'
      patch.submitted_at = now
      // 不限次数提交：每提交一次记一版，评分与评价按时间判断是否对应旧版本
      patch.submit_count = ((existing?.submit_count as number | null) ?? 0) + 1
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
        status: submit ? 'submitted' : 'draft',
        submitted_at: submit ? now : null,
        submit_count: submit ? 1 : 0,
      })
      if (error) throw new Error(`保存项目失败: ${error.message}`)
    }

    const { data, error } = await auth.supabase
      .from('project_submissions')
      .select(PROJECT_COLUMNS)
      .eq('trip_id', trip.id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (error) throw new Error(`读取项目提交失败: ${error.message}`)

    return NextResponse.json({ project: await toProjectPayload(data) })
  } catch (error) {
    return errorResponse(error)
  }
}
