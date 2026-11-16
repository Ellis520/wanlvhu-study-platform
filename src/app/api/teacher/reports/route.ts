import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

interface TeacherReportRow {
  id: string
  user_id: string
  title: string
  status: string
  rule_score: number | null
  ai_score: number | null
  teacher_score: number | null
  submitted_at: string | null
  updated_at: string
  profiles: { display_name: string; class_name: string } | { display_name: string; class_name: string }[] | null
}

function pickProfile(row: TeacherReportRow) {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  return {
    display_name: profile?.display_name ?? '未命名学生',
    class_name: profile?.class_name ?? '',
  }
}

/** 教师端：全班研学报告汇总 */
export async function GET(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role !== 'teacher') {
      return NextResponse.json({ error: '仅教师可查看班级汇总' }, { status: 403 })
    }

    const { data, error } = await auth.supabase
      .from('reports')
      .select(
        'id, user_id, title, status, rule_score, ai_score, teacher_score, submitted_at, updated_at, profiles(display_name, class_name)',
      )
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .limit(200)
    if (error) throw new Error(`读取班级汇总失败: ${error.message}`)

    const rows = ((data ?? []) as TeacherReportRow[]).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      status: row.status,
      rule_score: row.rule_score,
      ai_score: row.ai_score,
      teacher_score: row.teacher_score,
      submitted_at: row.submitted_at,
      updated_at: row.updated_at,
      ...pickProfile(row),
    }))

    const submitted = rows.filter((row) => row.status === 'submitted')
    const summary = {
      total: rows.length,
      submitted: submitted.length,
      averageRuleScore: submitted.length
        ? Math.round(
            submitted.reduce((acc, row) => acc + (row.rule_score ?? 0), 0) / submitted.length,
          )
        : 0,
      reviewed: rows.filter((row) => row.teacher_score !== null).length,
    }

    return NextResponse.json({ reports: rows, summary })
  } catch (error) {
    return errorResponse(error)
  }
}
