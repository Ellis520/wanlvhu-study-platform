import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { resolveFinalScore, type ScoreSource } from '@/lib/final-score'

export const dynamic = 'force-dynamic'

interface RosterEntry {
  student_no: number
  display_name: string
  class_name: string
  student_code: string | null
  user_id: string | null
}

interface ProfileEntry {
  id: string
  display_name: string
  class_name: string
}

interface ProjectEntry {
  id: string
  user_id: string
  trip_id: string
  title: string
  status: string
  ai_score: number | null
  best_ai_score: number | null
  teacher_score: number | null
  submitted_at: string | null
  teacher_reviewed_at: string | null
}

interface TripEntry {
  id: string
  title: string
}

/** 成绩册里的一个项目作品 */
export interface GradeProjectRow {
  id: string
  title: string
  score: number | null
  source: ScoreSource
  submittedAt: string | null
}

/** 成绩册里的一名学生：项目成绩取「得分最高的那个项目」 */
export interface GradeStudentRow {
  key: string
  studentNo: number | null
  /** 学号，代替原先展示的班级名 */
  studentCode: string | null
  name: string
  className: string
  registered: boolean
  inRoster: boolean
  projectCount: number
  bestProjectId: string | null
  bestProjectTitle: string | null
  bestScore: number | null
  bestSource: ScoreSource
  projects: GradeProjectRow[]
  updatedAt: string | null
}

export interface GradesPayload {
  classNames: string[]
  summary: {
    total: number
    submitted: number
    scored: number
    average: number | null
    highest: number | null
    ungraded: number
  }
  rows: GradeStudentRow[]
}

function sortProjects(list: GradeProjectRow[]): GradeProjectRow[] {
  return [...list].sort((a, b) => {
    if (a.score === null && b.score === null) {
      return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')
    }
    if (a.score === null) return 1
    if (b.score === null) return -1
    if (b.score !== a.score) return b.score - a.score
    return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')
  })
}

/** 教师端：项目成绩册。每名学生取得分最高的项目作为项目成绩，缺失分数留空。 */
export async function GET(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role !== 'teacher') {
      return NextResponse.json({ error: '仅教师可查看成绩册' }, { status: 403 })
    }
    const supabase = auth.supabase

    const [rosterResult, profilesResult, projectsResult, tripsResult] = await Promise.all([
      supabase
        .from('class_roster')
        .select('student_no, display_name, class_name, student_code, user_id')
        .order('student_no', { ascending: true }),
      supabase.from('profiles').select('id, display_name, class_name').eq('role', 'student'),
      supabase
        .from('project_submissions')
        .select(
          'id, user_id, trip_id, title, status, ai_score, best_ai_score, teacher_score, submitted_at, teacher_reviewed_at',
        ),
      supabase.from('study_trips').select('id, title'),
    ])

    if (rosterResult.error) throw new Error(`读取班级名册失败: ${rosterResult.error.message}`)
    if (profilesResult.error) throw new Error(`读取学生档案失败: ${profilesResult.error.message}`)
    if (projectsResult.error) throw new Error(`读取项目作品失败: ${projectsResult.error.message}`)
    if (tripsResult.error) throw new Error(`读取研学项目失败: ${tripsResult.error.message}`)

    const roster = (rosterResult.data ?? []) as RosterEntry[]
    const profiles = (profilesResult.data ?? []) as ProfileEntry[]
    const projects = (projectsResult.data ?? []) as ProjectEntry[]
    const trips = (tripsResult.data ?? []) as TripEntry[]

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
    const profileByName = new Map(profiles.map((profile) => [profile.display_name, profile]))
    const tripTitleById = new Map(trips.map((trip) => [trip.id, trip.title]))

    const projectsByUser = new Map<string, ProjectEntry[]>()
    for (const project of projects) {
      const list = projectsByUser.get(project.user_id) ?? []
      list.push(project)
      projectsByUser.set(project.user_id, list)
    }

    function buildRow(input: {
      key: string
      studentNo: number | null
      studentCode: string | null
      name: string
      className: string
      inRoster: boolean
      profileId: string | null
    }): GradeStudentRow {
      const own = input.profileId ? (projectsByUser.get(input.profileId) ?? []) : []
      const visible = own.filter(
        (project) => project.status === 'submitted' || resolveFinalScore(project).score !== null,
      )

      const items = sortProjects(
        visible.map((project) => {
          const final = resolveFinalScore(project)
          return {
            id: project.id,
            title: project.title || tripTitleById.get(project.trip_id) || '未命名项目',
            score: final.score,
            source: final.source,
            submittedAt: project.submitted_at,
          }
        }),
      )

      const best = items.find((item) => item.score !== null) ?? null
      const updatedAt =
        visible
          .map((project) => project.submitted_at)
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => b.localeCompare(a))[0] ?? null

      return {
        key: input.key,
        studentNo: input.studentNo,
        studentCode: input.studentCode,
        name: input.name,
        className: input.className,
        registered: Boolean(input.profileId),
        inRoster: input.inRoster,
        projectCount: items.length,
        bestProjectId: best?.id ?? null,
        bestProjectTitle: best?.title ?? null,
        bestScore: best?.score ?? null,
        bestSource: best?.source ?? 'none',
        projects: items,
        updatedAt,
      }
    }

    const usedProfileIds = new Set<string>()
    const rows: GradeStudentRow[] = roster.map((entry) => {
      const matched =
        (entry.user_id ? profileById.get(entry.user_id) : undefined) ??
        profileByName.get(entry.display_name)
      if (matched) usedProfileIds.add(matched.id)
      return buildRow({
        key: `roster-${entry.student_no}`,
        studentNo: entry.student_no,
        studentCode: entry.student_code,
        name: entry.display_name,
        className: matched?.class_name || entry.class_name,
        inRoster: true,
        profileId: matched?.id ?? null,
      })
    })

    // 名册之外、但确有项目提交的学生补进来，避免真实成绩被漏掉；
    // 没有提交记录的注册账号（如测试账号）不计入，保证人数与名册一致。
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
      if (row.projectCount === 0) continue
      rows.push(row)
    }

    const scoredRows = rows.filter((row) => row.bestScore !== null)
    const submittedRows = rows.filter((row) => row.projectCount > 0)
    const scores = scoredRows.map((row) => row.bestScore as number)
    const average = scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : null
    const highest = scores.length ? Math.max(...scores) : null

    const classNames = Array.from(
      new Set(rows.map((row) => row.className.trim()).filter((name) => name.length > 0)),
    ).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))

    const payload: GradesPayload = {
      classNames,
      summary: {
        total: rows.length,
        submitted: submittedRows.length,
        scored: scoredRows.length,
        average,
        highest,
        ungraded: rows.length - scoredRows.length,
      },
      rows,
    }

    return NextResponse.json(payload)
  } catch (error) {
    return errorResponse(error)
  }
}
