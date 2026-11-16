import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

interface OverviewReportRow {
  status: string
  rule_score: number | null
  teacher_score: number | null
}

interface OverviewProjectRow {
  status: string
  ai_score: number | null
  teacher_score: number | null
}

/** 教师端首页：研学概览（班级报告 / 项目作品 / 分享动态 / 班级人数）聚合 */
export async function GET(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role !== 'teacher') {
      return NextResponse.json({ error: '仅教师可查看研学概览' }, { status: 403 })
    }

    const [reportsResult, projectsResult, postsResult, studentsResult, rosterResult] =
      await Promise.all([
        auth.supabase.from('reports').select('status, rule_score, teacher_score').limit(500),
        auth.supabase
          .from('project_submissions')
          .select('status, ai_score, teacher_score')
          .limit(500),
        auth.supabase.from('posts').select('id', { count: 'exact', head: true }),
        auth.supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'student'),
        auth.supabase.from('class_roster').select('id', { count: 'exact', head: true }),
      ])

    if (reportsResult.error) throw new Error(`读取报告概览失败: ${reportsResult.error.message}`)
    if (projectsResult.error) throw new Error(`读取作品概览失败: ${projectsResult.error.message}`)

    const reportRows = (reportsResult.data ?? []) as OverviewReportRow[]
    const reportSubmitted = reportRows.filter((row) => row.status === 'submitted')

    const projectRows = (projectsResult.data ?? []) as OverviewProjectRow[]
    const projectSubmitted = projectRows.filter((row) => row.status === 'submitted')

    return NextResponse.json({
      // 班级人数以名册为准：名册里包含还没注册的学生，回退到已注册学生数
      students:
        (rosterResult.count ?? 0) > 0 ? (rosterResult.count ?? 0) : (studentsResult.count ?? 0),
      reports: {
        total: reportRows.length,
        submitted: reportSubmitted.length,
        reviewed: reportRows.filter((row) => row.teacher_score !== null).length,
        averageRuleScore: reportSubmitted.length
          ? Math.round(
              reportSubmitted.reduce((acc, row) => acc + (row.rule_score ?? 0), 0) /
                reportSubmitted.length,
            )
          : 0,
      },
      projects: {
        total: projectRows.length,
        submitted: projectSubmitted.length,
        reviewed: projectSubmitted.filter((row) => row.teacher_score !== null).length,
        aiScored: projectSubmitted.filter((row) => row.ai_score !== null).length,
      },
      posts: postsResult.count ?? 0,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
