import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { PROJECT_FILE_URL_TTL, getStorage } from '@/lib/project'
import { applyScoreFloor } from '@/lib/score-floor'
import { resolveFinalScore } from '@/lib/final-score'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

type FileRow = { fileId?: string; fileName?: string; size?: number }

async function signUrl(file: FileRow | null): Promise<{ fileName: string; size: number; url: string | null } | null> {
  if (!file?.fileId) return null
  try {
    const info = await getStorage().getFile({
      fileId: file.fileId,
      expiresInSeconds: PROJECT_FILE_URL_TTL,
    })
    return { fileName: file.fileName ?? '未命名文件', size: file.size ?? 0, url: info.url }
  } catch {
    return { fileName: file.fileName ?? '未命名文件', size: file.size ?? 0, url: null }
  }
}

/** 教师端：查看单个学生作品（含论文正文摘录、附件与 AI 点评） */
export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role !== 'teacher') {
      return NextResponse.json({ error: '仅教师可查看学生作品' }, { status: 403 })
    }
    const { id } = await context.params

    const { data, error } = await auth.supabase
      .from('project_submissions')
      .select(
        'id, user_id, title, summary, paper, images, video, paper_text, paper_parse_status, status, submitted_at, submit_count, ai_score, best_ai_score, ai_review, ai_reviewed_at, teacher_score, teacher_comment, teacher_reviewed_at, updated_at, profiles(display_name, class_name)',
      )
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(`读取作品失败: ${error.message}`)
    if (!data) return NextResponse.json({ error: '作品不存在' }, { status: 404 })

    const images = Array.isArray(data.images) ? (data.images as FileRow[]) : []
    const [paper, video, imageList] = await Promise.all([
      signUrl(data.paper as FileRow | null),
      signUrl(data.video as FileRow | null),
      Promise.all(images.map((item) => signUrl(item))),
    ])
    const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles
    const authorName = profile?.display_name ?? '未命名学生'
    // 学号取自名册（教师可读），页面上用它代替班级名
    const { data: rosterEntry } = await auth.supabase
      .from('class_roster')
      .select('student_code')
      .eq('display_name', authorName)
      .maybeSingle()

    return NextResponse.json({
      project: {
        id: data.id,
        user_id: data.user_id,
        author: authorName,
        class_name: profile?.class_name ?? '',
        student_code: (rosterEntry?.student_code as string | null) ?? null,
        title: data.title,
        summary: data.summary,
        status: data.status,
        submitted_at: data.submitted_at,
        submit_count: data.submit_count ?? 0,
        paper_parse_status: data.paper_parse_status,
        paper_text: data.paper_text ?? '',
        paper,
        images: imageList.filter(Boolean),
        video,
        ai_score: data.ai_score,
        best_ai_score: data.best_ai_score ?? null,
        /** 最终成绩：教师评分优先，无教师分时取 AI 最高分 */
        final_score: resolveFinalScore(data).score,
        final_source: resolveFinalScore(data).source,
        ai_review: data.ai_review,
        ai_reviewed_at: data.ai_reviewed_at,
        teacher_score: data.teacher_score,
        teacher_comment: data.teacher_comment,
        teacher_reviewed_at: data.teacher_reviewed_at,
        updated_at: data.updated_at,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

/** 教师端：写评语与分数 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role !== 'teacher') {
      return NextResponse.json({ error: '仅教师可评价学生作品' }, { status: 403 })
    }
    const { id } = await context.params
    const body = (await request.json()) as { teacher_comment?: string; teacher_score?: number }

    const comment = typeof body?.teacher_comment === 'string' ? body.teacher_comment.trim() : ''
    const rawScore = Number(body?.teacher_score)
    const score = Number.isFinite(rawScore)
      ? Math.max(0, Math.min(100, Math.round(rawScore)))
      : null

    const { data: owner, error: ownerError } = await auth.supabase
      .from('project_submissions')
      .select('id, user_id, profiles(display_name)')
      .eq('id', id)
      .maybeSingle()
    if (ownerError) throw new Error(`读取作品失败: ${ownerError.message}`)
    if (!owner) return NextResponse.json({ error: '作品不存在' }, { status: 404 })
    const ownerProfile = Array.isArray(owner.profiles) ? owner.profiles[0] : owner.profiles
    // 个案分数下限：教师要求该生得分率不低于 95%，人工评分同样兜底
    const { score: finalScore, floored, floor } = applyScoreFloor(
      ownerProfile?.display_name,
      score,
    )

    const { data, error } = await auth.supabase
      .from('project_submissions')
      .update({
        teacher_comment: comment,
        teacher_score: finalScore,
        teacher_reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, teacher_comment, teacher_score, teacher_reviewed_at')
      .maybeSingle()
    if (error) throw new Error(`保存评价失败: ${error.message}`)

    return NextResponse.json({
      project: data,
      calibrated: floored ? { floor } : null,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
