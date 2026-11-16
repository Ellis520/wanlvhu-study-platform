import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { getPrimaryTrip } from '@/lib/server-trip'
import { computeRuleScore, type Answers } from '@/lib/study-trip'

export const dynamic = 'force-dynamic'

/** 提交报告：写入规则评分并标记为已提交 */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    const trip = await getPrimaryTrip(auth.supabase)

    const [{ data: records, error: recordsError }, { data: report, error: reportError }] =
      await Promise.all([
        auth.supabase
          .from('stage_records')
          .select('stage, answers')
          .eq('trip_id', trip.id)
          .eq('user_id', auth.user.id),
        auth.supabase
          .from('reports')
          .select('id, title, highlights, reflection, action_plan')
          .eq('trip_id', trip.id)
          .eq('user_id', auth.user.id)
          .maybeSingle(),
      ])
    if (recordsError) throw new Error(`读取记录失败: ${recordsError.message}`)
    if (reportError) throw new Error(`读取报告失败: ${reportError.message}`)
    if (!report) {
      return NextResponse.json({ error: '请先填写报告正文再提交' }, { status: 400 })
    }

    const answersList = (records ?? []).map((row) => (row.answers ?? {}) as Answers)
    const score = computeRuleScore(answersList, report)

    const { data, error } = await auth.supabase
      .from('reports')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        rule_score: score.total,
        rule_detail: score,
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id)
      .select('id, status, submitted_at, rule_score, rule_detail')
      .maybeSingle()
    if (error) throw new Error(`提交失败: ${error.message}`)

    return NextResponse.json({ report: data, score })
  } catch (error) {
    return errorResponse(error)
  }
}
