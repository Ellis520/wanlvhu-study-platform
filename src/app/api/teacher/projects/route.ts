import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { resolveFinalScore } from '@/lib/final-score'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface TeacherProjectRow {
  id: string
  user_id: string
  title: string
  status: string
  ai_score: number | null
  best_ai_score: number | null
  ai_reviewed_at: string | null
  teacher_score: number | null
  teacher_reviewed_at: string | null
  submitted_at: string | null
  submit_count: number
  paper: { fileName?: string } | null
  images: unknown
  video: unknown
  profiles:
    | { display_name: string; class_name: string }
    | { display_name: string; class_name: string }[]
    | null
}

function pickProfile(row: TeacherProjectRow) {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  return {
    display_name: profile?.display_name ?? '未命名学生',
    class_name: profile?.class_name ?? '',
  }
}

/** 教师端：全班研学项目作品汇总 */
export async function GET(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role !== 'teacher') {
      return NextResponse.json({ error: '仅教师可查看班级作品' }, { status: 403 })
    }

    const [projectsResult, rosterResult] = await Promise.all([
      auth.supabase
        .from('project_submissions')
        .select(
          'id, user_id, title, status, ai_score, best_ai_score, ai_reviewed_at, teacher_score, teacher_reviewed_at, submitted_at, submit_count, paper, images, video, profiles(display_name, class_name)',
        )
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .limit(200),
      auth.supabase.from('class_roster').select('display_name, student_code'),
    ])
    const { data, error } = projectsResult
    if (error) throw new Error(`读取班级作品失败: ${error.message}`)

    // 学号取自名册（按姓名匹配），页面上的身份标识用它代替班级名
    const codeByName = new Map(
      ((rosterResult.data ?? []) as { display_name: string; student_code: string | null }[]).map(
        (entry) => [entry.display_name, entry.student_code],
      ),
    )

    const rows = ((data ?? []) as TeacherProjectRow[]).map((row) => {
      const final = resolveFinalScore(row)
      const profile = pickProfile(row)
      return {
        id: row.id,
        user_id: row.user_id,
        title: row.title,
        status: row.status,
        ai_score: row.ai_score,
        best_ai_score: row.best_ai_score,
        ai_reviewed_at: row.ai_reviewed_at,
        teacher_score: row.teacher_score,
        /** 最终成绩：教师评分优先，没有教师分时取 AI 最高分 */
        final_score: final.score,
        final_source: final.source,
        submitted_at: row.submitted_at,
        submit_count: row.submit_count ?? 0,
        needs_recheck: Boolean(
          row.teacher_reviewed_at &&
            row.submitted_at &&
            new Date(row.teacher_reviewed_at) < new Date(row.submitted_at),
        ),
        paper_name: row.paper?.fileName ?? '',
        image_count: Array.isArray(row.images) ? row.images.length : 0,
        has_video: Boolean(row.video),
        ...profile,
        student_code: codeByName.get(profile.display_name) ?? null,
      }
    })

    const submitted = rows.filter((row) => row.status === 'submitted')
    const scored = submitted.filter((row) => row.ai_score !== null)
    const summary = {
      total: rows.length,
      submitted: submitted.length,
      aiScored: scored.length,
      teacherReviewed: rows.filter((row) => row.teacher_score !== null).length,
      averageAiScore: scored.length
        ? Math.round(scored.reduce((acc, row) => acc + (row.ai_score ?? 0), 0) / scored.length)
        : 0,
    }

    return NextResponse.json({ projects: rows, summary })
  } catch (error) {
    return errorResponse(error)
  }
}
