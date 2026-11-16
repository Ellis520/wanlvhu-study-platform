import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { getPrimaryTrip } from '@/lib/server-trip'
import { computeRuleScore, type Answers } from '@/lib/study-trip'

export const dynamic = 'force-dynamic'

/** 汇总视图：个人报告 + 三阶段记录 + 实时规则评分 */
export async function GET(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    const trip = await getPrimaryTrip(auth.supabase)

    const [{ data: report, error: reportError }, { data: records, error: recordsError }] =
      await Promise.all([
        auth.supabase
          .from('reports')
          .select(
            'id, title, highlights, reflection, action_plan, rule_score, rule_detail, ai_review, ai_score, status, submitted_at, teacher_comment, teacher_score, updated_at',
          )
          .eq('trip_id', trip.id)
          .eq('user_id', auth.user.id)
          .maybeSingle(),
        auth.supabase
          .from('stage_records')
          .select('stage, answers, updated_at')
          .eq('trip_id', trip.id)
          .eq('user_id', auth.user.id),
      ])
    if (reportError) throw new Error(`读取报告失败: ${reportError.message}`)
    if (recordsError) throw new Error(`读取记录失败: ${recordsError.message}`)

    const answersList = (records ?? []).map((row) => (row.answers ?? {}) as Answers)
    const score = computeRuleScore(answersList, report ?? {})

    return NextResponse.json({
      trip,
      profile: auth.profile,
      report: report ?? null,
      records: records ?? [],
      score,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

/** 保存报告正文（学生自写部分） */
export async function PUT(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    const body = (await request.json()) as {
      title?: string
      highlights?: string
      reflection?: string
      action_plan?: string
    }
    const toText = (value: unknown) => (typeof value === 'string' ? value : '')
    const title = toText(body?.title).trim() || '万绿湖绿色发展区研学报告'

    const trip = await getPrimaryTrip(auth.supabase)
    const { data, error } = await auth.supabase
      .from('reports')
      .upsert(
        {
          user_id: auth.user.id,
          trip_id: trip.id,
          title,
          highlights: toText(body?.highlights),
          reflection: toText(body?.reflection),
          action_plan: toText(body?.action_plan),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,trip_id' },
      )
      .select(
        'id, title, highlights, reflection, action_plan, rule_score, rule_detail, ai_review, ai_score, status, submitted_at, teacher_comment, teacher_score, updated_at',
      )
      .maybeSingle()
    if (error) throw new Error(`保存报告失败: ${error.message}`)
    return NextResponse.json(data)
  } catch (error) {
    return errorResponse(error)
  }
}
