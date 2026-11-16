import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { resolveAvatarUrl } from '@/lib/server-avatar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** 教师端：查看单个学生报告详情（含三阶段记录） */
export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role !== 'teacher') {
      return NextResponse.json({ error: '仅教师可查看学生报告' }, { status: 403 })
    }
    const { id } = await context.params

    const { data: report, error: reportError } = await auth.supabase
      .from('reports')
      .select(
        'id, user_id, trip_id, title, highlights, reflection, action_plan, rule_score, rule_detail, ai_review, ai_score, status, submitted_at, teacher_comment, teacher_score, updated_at, profiles(display_name, class_name, avatar_preset, avatar_file_id)',
      )
      .eq('id', id)
      .maybeSingle()
    if (reportError) throw new Error(`读取报告失败: ${reportError.message}`)
    if (!report) return NextResponse.json({ error: '报告不存在' }, { status: 404 })

    // 学号取自名册（教师可读），页面上用它代替班级名
    const ownerProfile = Array.isArray(report.profiles) ? report.profiles[0] : report.profiles
    const avatarUrl = await resolveAvatarUrl(
      (ownerProfile as { avatar_file_id?: string | null } | null)?.avatar_file_id,
      (ownerProfile as { avatar_preset?: string | null } | null)?.avatar_preset,
    )
    const { data: rosterEntry } = await auth.supabase
      .from('class_roster')
      .select('student_code')
      .eq('display_name', ownerProfile?.display_name ?? '')
      .maybeSingle()

    const { data: records, error: recordsError } = await auth.supabase
      .from('stage_records')
      .select('stage, answers, updated_at')
      .eq('user_id', report.user_id)
      .eq('trip_id', report.trip_id)
    if (recordsError) throw new Error(`读取记录失败: ${recordsError.message}`)

    return NextResponse.json({
      report,
      student_code: (rosterEntry?.student_code as string | null) ?? null,
      avatar_url: avatarUrl,
      records: records ?? [],
    })
  } catch (error) {
    return errorResponse(error)
  }
}

/** 教师端：写评语与评分 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role !== 'teacher') {
      return NextResponse.json({ error: '仅教师可评价学生报告' }, { status: 403 })
    }
    const { id } = await context.params
    const body = (await request.json()) as { teacher_comment?: string; teacher_score?: number }

    const comment = typeof body?.teacher_comment === 'string' ? body.teacher_comment : ''
    const rawScore = Number(body?.teacher_score)
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : null

    const { data, error } = await auth.supabase
      .from('reports')
      .update({
        teacher_comment: comment,
        teacher_score: score,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, teacher_comment, teacher_score, updated_at')
      .maybeSingle()
    if (error) throw new Error(`保存评价失败: ${error.message}`)
    if (!data) return NextResponse.json({ error: '报告不存在或无权限' }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) {
    return errorResponse(error)
  }
}
