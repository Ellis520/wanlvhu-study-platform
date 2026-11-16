import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { STAGES } from '@/lib/study-trip'
import { resolveFinalScore } from '@/lib/final-score'

export const dynamic = 'force-dynamic'

const STAGE_TOTAL = STAGES.length

interface RosterRow {
  student_no: number
  display_name: string
  class_name: string
  student_code: string | null
  user_id: string | null
}

interface ProfileRow {
  id: string
  display_name: string
  class_name: string
}

interface ReportRow {
  id: string
  user_id: string
  status: string
  rule_score: number | null
  teacher_score: number | null
  submitted_at: string | null
}

interface ProjectRow {
  user_id: string
  status: string
  ai_score: number | null
  best_ai_score: number | null
  teacher_score: number | null
  teacher_reviewed_at: string | null
  submitted_at: string | null
  submit_count: number
}

interface RecordRow {
  user_id: string
  stage: string
}

/**
 * 名册中的一名学生：任务状态按「过程记录 / 研学报告 / 项目作品」分别标注。
 * 名册里 reference_score 属于系统内部参考分，这里不查询、不返回。
 */
export interface RosterStudentRow {
  key: string
  studentNo: number | null
  /** 学号，代替原先展示的班级名 */
  studentCode: string | null
  name: string
  className: string
  registered: boolean
  inRoster: boolean
  recordDone: boolean
  stageCount: number
  reportStatus: 'none' | 'draft' | 'submitted'
  reportScore: number | null
  reportId: string | null
  projectStatus: 'none' | 'draft' | 'submitted'
  projectScore: number | null
  projectSubmitCount: number
  projectNeedsRecheck: boolean
  overallScore: number | null
  updatedAt: string | null
}

function pickScore(teacher: number | null, fallback: number | null): number | null {
  return teacher ?? fallback
}

/** 教师端：全班名册与任务完成情况（按名册人数，未注册也列出） */
export async function GET(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role !== 'teacher') {
      return NextResponse.json({ error: '仅教师可查看班级名册' }, { status: 403 })
    }
    const supabase = auth.supabase

    const [rosterResult, profilesResult, reportsResult, projectsResult, recordsResult] =
      await Promise.all([
        supabase
          .from('class_roster')
          .select('student_no, display_name, class_name, student_code, user_id')
          .order('student_no', { ascending: true }),
        supabase.from('profiles').select('id, display_name, class_name').eq('role', 'student'),
        supabase
          .from('reports')
          .select('id, user_id, status, rule_score, teacher_score, submitted_at'),
        supabase
          .from('project_submissions')
          .select('user_id, status, ai_score, best_ai_score, teacher_score, teacher_reviewed_at, submitted_at, submit_count'),
        supabase.from('stage_records').select('user_id, stage'),
      ])

    if (rosterResult.error) throw new Error(`读取班级名册失败: ${rosterResult.error.message}`)
    if (profilesResult.error) throw new Error(`读取学生档案失败: ${profilesResult.error.message}`)
    if (reportsResult.error) throw new Error(`读取报告失败: ${reportsResult.error.message}`)
    if (projectsResult.error) throw new Error(`读取项目失败: ${projectsResult.error.message}`)
    if (recordsResult.error) throw new Error(`读取过程记录失败: ${recordsResult.error.message}`)

    const roster = (rosterResult.data ?? []) as RosterRow[]
    const profiles = (profilesResult.data ?? []) as ProfileRow[]
    const reports = (reportsResult.data ?? []) as ReportRow[]
    const projects = (projectsResult.data ?? []) as ProjectRow[]
    const records = (recordsResult.data ?? []) as RecordRow[]

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
    const profileByName = new Map(profiles.map((profile) => [profile.display_name, profile]))
    const reportByUser = new Map(reports.map((report) => [report.user_id, report]))
    const projectByUser = new Map(projects.map((project) => [project.user_id, project]))

    const stagesByUser = new Map<string, Set<string>>()
    for (const record of records) {
      const current = stagesByUser.get(record.user_id) ?? new Set<string>()
      current.add(record.stage)
      stagesByUser.set(record.user_id, current)
    }

    function buildRow(input: {
      key: string
      studentNo: number | null
      studentCode: string | null
      name: string
      className: string
      inRoster: boolean
      profileId: string | null
    }): RosterStudentRow {
      const report = input.profileId ? reportByUser.get(input.profileId) : undefined
      const project = input.profileId ? projectByUser.get(input.profileId) : undefined
      const stages = input.profileId ? stagesByUser.get(input.profileId) : undefined
      const stageCount = stages?.size ?? 0
      const reportScore = report ? pickScore(report.teacher_score, report.rule_score) : null
      const projectScore = project ? resolveFinalScore(project).score : null
      const overallScore =
        reportScore !== null && projectScore !== null
          ? Math.round((reportScore + projectScore) / 2)
          : (reportScore ?? projectScore)

      return {
        key: input.key,
        studentNo: input.studentNo,
        studentCode: input.studentCode,
        name: input.name,
        className: input.className,
        registered: Boolean(input.profileId),
        inRoster: input.inRoster,
        recordDone: stageCount >= STAGE_TOTAL,
        stageCount,
        reportStatus:
          report?.status === 'submitted' ? 'submitted' : report ? 'draft' : ('none' as const),
        reportScore,
        reportId: report?.id ?? null,
        projectStatus:
          project?.status === 'submitted' ? 'submitted' : project ? 'draft' : ('none' as const),
        projectScore,
        projectSubmitCount: project?.submit_count ?? 0,
        projectNeedsRecheck: Boolean(
          project?.teacher_reviewed_at &&
            project.submitted_at &&
            new Date(project.teacher_reviewed_at) < new Date(project.submitted_at),
        ),
        overallScore,
        updatedAt: report?.submitted_at ?? project?.submitted_at ?? null,
      }
    }

    const usedProfileIds = new Set<string>()
    const rows: RosterStudentRow[] = roster.map((item) => {
      const matched =
        (item.user_id ? profileById.get(item.user_id) : undefined) ??
        profileByName.get(item.display_name)
      if (matched) usedProfileIds.add(matched.id)
      return buildRow({
        key: `roster-${item.student_no}`,
        studentNo: item.student_no,
        studentCode: item.student_code,
        name: item.display_name,
        className: matched?.class_name || item.class_name,
        inRoster: true,
        profileId: matched?.id ?? null,
      })
    })

    // 名册之外、但确实动过手的学生补进来，避免真实提交的数据被漏掉；
    // 什么都没做的注册账号（如测试账号）不计入，保证人数与名册一致。
    for (const profile of profiles) {
      if (usedProfileIds.has(profile.id)) continue
      const row = buildRow({
        key: `profile-${profile.id}`,
        studentNo: null,
        studentCode: null,
        name: profile.display_name,
        className: profile.class_name,
        inRoster: false,
        profileId: profile.id,
      })
      const hasWork =
        row.stageCount > 0 || row.reportStatus !== 'none' || row.projectStatus !== 'none'
      if (!hasWork) continue
      rows.push(row)
    }

    const recorded = rows.filter((row) => row.recordDone).length
    const reported = rows.filter((row) => row.reportStatus === 'submitted').length
    const projected = rows.filter((row) => row.projectStatus === 'submitted').length
    const scoredRows = rows.filter((row) => row.overallScore !== null)
    const averageScore = scoredRows.length
      ? Math.round(
          scoredRows.reduce((sum, row) => sum + (row.overallScore ?? 0), 0) / scoredRows.length,
        )
      : null

    return NextResponse.json({
      classTotal: rows.length,
      registered: rows.filter((row) => row.registered).length,
      summary: {
        recorded,
        reported,
        projected,
        averageScore,
        unregistered: rows.filter((row) => !row.registered).length,
      },
      rows,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
