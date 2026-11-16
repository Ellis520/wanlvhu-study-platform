'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { AppFrame, useSession } from '@/components/app-frame'
import { apiGet } from '@/lib/client-api'
import { STAGES, computeRuleScore, countChars, type Answers, type RuleScoreResult } from '@/lib/study-trip'
import { resolveFinalScore, scoreSourceLabel } from '@/lib/final-score'

interface ReportPayload {
  report: {
    id: string
    title: string
    status: string
    rule_score: number | null
    ai_score: number | null
    teacher_score: number | null
    submitted_at: string | null
    teacher_comment: string | null
    highlights: string
    reflection: string
    action_plan: string
  } | null
  records: { stage: string; answers: Answers; updated_at: string }[]
  score: RuleScoreResult
}

interface StatItem {
  key: string
  label: string
  value: string | number
  unit?: string
  hint: string
  icon: ReactNode
}

interface TeacherOverview {
  students: number
  reports: { total: number; submitted: number; reviewed: number; averageRuleScore: number }
  projects: { total: number; submitted: number; reviewed: number; aiScored: number }
  posts: number
}

/** 概览统计条的单项：图标 + 标签 / 数值 / 一句说明 */
function StatBlock({ item }: { item: StatItem }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="eco-icon" aria-hidden="true">
          <svg
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {item.icon}
          </svg>
        </span>
        <p className="text-[11px] tracking-[0.14em] text-muted-foreground">{item.label}</p>
      </div>
      <p className="eco-num mt-1.5 font-serif text-xl leading-tight">
        {item.value}
        {item.unit ? <span className="text-xs text-muted-foreground">{item.unit}</span> : null}
      </p>
      <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground" title={item.hint}>
        {item.hint}
      </p>
    </div>
  )
}

/** 行程封面：学生与教师共用 */
function TripHero() {
  const session = useSession()

  return (
    <section className="eco-reveal relative overflow-hidden rounded-lg border border-border">
      <Image
        src="/wanlvhu-dawn.jpg"
        alt="万绿湖清晨的湖面与远山"
        fill
        priority
        sizes="(max-width: 1100px) 100vw, 1100px"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-tr from-white/92 via-white/72 to-white/30" />
      <div className="relative px-6 py-10 sm:px-10 sm:py-14">
        <p className="text-[11px] tracking-[0.28em] text-primary">
          广东绿色水经济发展示范点 · 河源
        </p>
        <h1 className="mt-4 max-w-2xl text-balance font-serif text-3xl leading-[1.24] tracking-tight sm:text-[2.6rem]">
          {session.trip.title}
        </h1>
        <div className="eco-num mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs tracking-[0.08em] text-foreground/70">
          <span>
            {session.trip.start_date.replace(/-/g, '.')} — {session.trip.end_date.replace(/-/g, '.')}
          </span>
          <span className="h-3 w-px bg-foreground/25" />
          <span>{session.trip.destination}</span>
          <span className="h-3 w-px bg-foreground/25" />
          <span>两日 · 10 站</span>
        </div>
        <p className="mt-4 max-w-2xl text-pretty text-sm leading-7 text-foreground/80">
          {session.trip.summary}
        </p>
      </div>
    </section>
  )
}

function StudentHome() {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [error, setError] = useState('')
  const [memory, setMemory] = useState<{ doneCount: number; totalCards: number } | null>(null)
  const [project, setProject] = useState<{
    status: string
    title: string
    hasPaper: boolean
    images: number
    hasVideo: boolean
    ai_score: number | null
    best_ai_score: number | null
    teacher_score: number | null
  } | null>(null)

  useEffect(() => {
    apiGet<ReportPayload>('/api/report')
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载失败'))
  }, [])

  useEffect(() => {
    apiGet<{
      project: {
        status: string
        title: string
        paper: { fileName: string } | null
        images: unknown[]
        video: { fileName: string } | null
        ai_score: number | null
        best_ai_score: number | null
        teacher_score: number | null
      } | null
    }>('/api/project')
      .then((payload) =>
        setProject(
          payload.project
            ? {
                status: payload.project.status,
                title: payload.project.title,
                hasPaper: Boolean(payload.project.paper),
                images: payload.project.images?.length ?? 0,
                hasVideo: Boolean(payload.project.video),
                ai_score: payload.project.ai_score,
                best_ai_score: payload.project.best_ai_score ?? null,
                teacher_score: payload.project.teacher_score,
              }
            : null,
        ),
      )
      .catch(() => setProject(null))
  }, [])

  useEffect(() => {
    apiGet<{ doneCount: number; totalCards: number }>('/api/memory')
      .then(setMemory)
      .catch(() => setMemory(null))
  }, [])

  const answersMap = useMemo(() => {
    const map: Record<string, Answers> = {}
    for (const record of data?.records ?? []) {
      map[record.stage] = record.answers ?? {}
    }
    return map
  }, [data])

  const liveScore = useMemo(() => {
    const list = Object.values(answersMap)
    return computeRuleScore(list, data?.report ?? {})
  }, [answersMap, data])

  const stageFilledTotal = useMemo(
    () =>
      STAGES.reduce(
        (acc, stage) => {
          const answers = answersMap[stage.key] ?? {}
          return {
            filled:
              acc.filled + stage.fields.filter((field) => countChars(answers[field.key]) >= 10).length,
            total: acc.total + stage.fields.length,
          }
        },
        { filled: 0, total: 0 },
      ),
    [answersMap],
  )

  const stageStats = useMemo(
    () =>
      STAGES.map((stage) => {
        const answers = answersMap[stage.key] ?? {}
        return {
          key: stage.key,
          title: stage.title,
          window: stage.window,
          filled: stage.fields.filter((field) => countChars(answers[field.key]) >= 10).length,
          total: stage.fields.length,
        }
      }),
    [answersMap],
  )

  const status = data?.report?.status === 'submitted' ? '已提交' : data?.report ? '草稿' : '未开始'

  const projectStatus = !project ? '未开始' : project.status === 'submitted' ? '已提交' : '草稿'
  const projectMaterial = !project
    ? '还没有上传作品'
    : [
        project.hasPaper ? '论文' : '缺论文',
        project.images > 0 ? `${project.images} 张图` : null,
        project.hasVideo ? '视频' : null,
      ]
        .filter(Boolean)
        .join(' · ')

  // 最终成绩：教师评分优先，教师未评分时取历次 AI 评分中的最高分
  const projectFinal = resolveFinalScore(project)
  const projectScore = projectFinal.score
  const projectScoreHint =
    projectFinal.source === 'teacher'
      ? '教师评分'
      : projectFinal.source === 'ai'
        ? `${scoreSourceLabel('ai')} · 教师未评分`
        : '尚未评分'

  const recordStats: StatItem[] = [
    {
      key: 'records',
      label: '记录进度',
      value: stageFilledTotal.filled,
      unit: `/${stageFilledTotal.total}`,
      hint: '已填写关键点',
      icon: (
        <>
          <path d="M1.4 5.2c1.6-1.5 3.5-1.5 5.1 0s3.5 1.5 5.1 0" />
          <path d="M1.4 9c1.6-1.5 3.5-1.5 5.1 0s3.5 1.5 5.1 0" />
        </>
      ),
    },
    {
      key: 'rule-score',
      label: '规则评分',
      value: liveScore.total,
      unit: '/100',
      hint: `等级：${liveScore.level}`,
      icon: (
        <>
          <path d="M7 1.6v10.8" />
          <path d="M7 4.4 4.2 2.6M7 4.4l2.8-1.8M7 7.6 4.4 5.9M7 7.6l2.6-1.7" />
        </>
      ),
    },
    {
      key: 'report',
      label: '报告状态',
      value: status,
      hint:
        data?.report?.teacher_score != null
          ? `教师评分 ${data.report.teacher_score}`
          : '提交后教师可评价',
      icon: (
        <>
          <path d="M11.4 7A4.4 4.4 0 1 1 7 2.6" />
          <path d="M7 4.6V7l1.8 1.2" />
        </>
      ),
    },
  ]

  const projectStats: StatItem[] = [
    {
      key: 'project',
      label: '项目提交',
      value: projectStatus,
      hint: projectMaterial,
      icon: (
        <>
          <path d="M8.2 1.8H4.2a1 1 0 0 0-1 1v8.4a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1V4.4z" />
          <path d="M8.2 1.8v2.6h2.6" />
        </>
      ),
    },
    {
      key: 'project-score',
      label: '项目评分',
      value: projectScore ?? '—',
      unit: projectScore != null ? '/100' : undefined,
      hint: projectScoreHint,
      icon: (
        <>
          <path d="M7 1.7l1.6 3.4 3.7.5-2.7 2.6.6 3.7L7 10.2l-3.2 1.7.6-3.7L1.7 5.6l3.7-.5z" />
        </>
      ),
    },
  ]

  const statGroups: Array<{
    key: string
    en: string
    label: string
    note: string
    cols: string
    href: string
    items: StatItem[]
  }> = [
    {
      key: 'record',
      en: 'PROCESS',
      label: '过程记录',
      note: '三阶段关键点 · 研学报告',
      cols: 'grid-cols-1 sm:grid-cols-3',
      href: '/record',
      items: recordStats,
    },
    {
      key: 'project',
      en: 'PROJECT',
      label: '项目',
      note: '作品提交 · 评分',
      cols: 'grid-cols-2',
      href: '/project',
      items: projectStats,
    },
  ]

  return (
    <div className="space-y-12">
      <TripHero />

      <section
        className="eco-reveal divide-y divide-border border-y border-border"
        style={{ '--reveal-delay': '120ms' } as CSSProperties}
      >
        {statGroups.map((group) => (
          <div key={group.key} className="py-4">
            <div className="flex items-center gap-2">
              <p className="font-mono text-[10px] tracking-[0.2em] text-primary">{group.en}</p>
              <p className="text-[11px] tracking-[0.1em] text-foreground/85">{group.label}</p>
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              <p className="hidden text-[10px] text-muted-foreground sm:block">{group.note}</p>
              <Link
                href={group.href}
                className="eco-btn-solid flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-[11px] tracking-wide text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                查看
                <ChevronRight className="size-3" aria-hidden="true" />
              </Link>
            </div>
            <div className={`mt-3 grid gap-x-4 gap-y-4 ${group.cols}`}>
              {group.items.map((item) => (
                <StatBlock key={item.key} item={item} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section
        className="eco-card eco-reveal p-5 sm:p-6"
        style={{ '--reveal-delay': '260ms' } as CSSProperties}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground">
              <span className="eco-num mr-2 text-primary">01</span>RECORD
            </p>
            <h2 className="font-serif text-xl">过程记录</h2>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              出发前、学习中、参观后三段，一站一站填关键点：看到什么、数据是多少、还剩什么疑问。填完就能一键生成研学报告。
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-right">
              <span className="eco-num font-serif text-2xl leading-none">
                {stageFilledTotal.filled}
                <span className="text-sm text-muted-foreground"> / {stageFilledTotal.total}</span>
              </span>
              <span className="mt-1 block text-[11px] tracking-[0.18em] text-muted-foreground">
                已填关键点
              </span>
            </p>
            <Link
              href="/record"
              className="eco-btn-solid rounded-md px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90"
            >
              {stageFilledTotal.filled > 0 ? '继续记录' : '去记录'}
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {stageStats.map((stage) => (
            <Link key={stage.key} href={`/record?stage=${stage.key}`} className="block">
              <span className="flex items-baseline justify-between">
                <span className="text-xs text-foreground/85">{stage.title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {stage.filled}/{stage.total}
                </span>
              </span>
              <span className="mt-1.5 block h-[2px] w-full overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${stage.total ? (stage.filled / stage.total) * 100 : 0}%`,
                    backgroundColor: 'var(--eco-edge)',
                  }}
                />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section
        className="eco-card eco-reveal p-5 sm:p-6"
        style={{ '--reveal-delay': '340ms' } as CSSProperties}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground">
              <span className="eco-num mr-2 text-primary">02</span>MEMORY
            </p>
            <h2 className="font-serif text-xl">回顾美好时刻</h2>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              十二个站点按这两天走过的顺序排好，一站一张卡片：写几句当时的感受，传一张现场照片。
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-right">
              <span className="eco-num font-serif text-2xl leading-none">
                {memory?.doneCount ?? 0}
                <span className="text-sm text-muted-foreground"> / {memory?.totalCards ?? 12}</span>
              </span>
              <span className="mt-1 block text-[11px] tracking-[0.18em] text-muted-foreground">
                已打卡站点
              </span>
            </p>
            <Link
              href="/memory"
              className="eco-btn-solid rounded-md px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90"
            >
              {memory && memory.doneCount > 0 ? '继续回顾' : '去打卡'}
            </Link>
          </div>
        </div>
        <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${memory && memory.totalCards ? (memory.doneCount / memory.totalCards) * 100 : 0}%`,
              backgroundColor: 'var(--eco-edge)',
            }}
          />
        </div>
      </section>

      <section
        className="eco-card eco-reveal p-5 sm:p-6"
        style={{ '--reveal-delay': '420ms' } as CSSProperties}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground">
              <span className="eco-num mr-2 text-primary">03</span>FEED
            </p>
            <h2 className="font-serif text-xl">分享圈</h2>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              把两天的照片、视频和一句话放到同一张小桌上：所有同学和带队老师都能看到，也能点赞、收藏、评论。
            </p>
          </div>
          <Link href="/feed" className="eco-btn-outline rounded-md px-4 py-2 text-sm text-foreground">
            去分享圈
          </Link>
        </div>
      </section>

      <section
        className="eco-card eco-reveal p-5 sm:p-6"
        style={{ '--reveal-delay': '500ms' } as CSSProperties}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground">
              <span className="eco-num mr-2 text-primary">04</span>PROJECT
            </p>
            <h2 className="font-serif text-xl">研学项目作品</h2>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              把这两天的调查做成一份作品：一篇论文，加上现场图片和一段视频，装进一个 zip 上传就行。提交后可以让 AI 先给一遍点评，老师也会来看。
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="eco-num font-serif text-2xl leading-none">
                {projectScore ?? '—'}
                <span className="text-sm text-muted-foreground"> /100</span>
              </span>
            </div>
            <Link
              href="/project"
              className="eco-btn-outline rounded-md px-4 py-2 text-sm text-foreground"
            >
              {project?.status === 'submitted' ? '查看 / 重新提交' : project?.hasPaper ? '继续编辑' : '去提交'}
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] tracking-[0.08em] text-muted-foreground">
          <span>{project?.status === 'submitted' ? '状态：已提交' : project ? '状态：草稿' : '状态：未开始'}</span>
          <span className="h-3 w-px bg-foreground/20" />
          <span>{project?.hasPaper ? '论文已上传' : '待上传论文'}</span>
          <span className="h-3 w-px bg-foreground/20" />
          <span>{project?.images ?? 0} 张图片</span>
          <span className="h-3 w-px bg-foreground/20" />
          <span>{project?.hasVideo ? '视频已上传' : '待上传视频'}</span>
        </div>
      </section>
    </div>
  )
}

function TeacherHome() {
  const [overview, setOverview] = useState<TeacherOverview | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet<TeacherOverview>('/api/teacher/overview')
      .then(setOverview)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载失败'))
  }, [])

  const submittedRate =
    overview && overview.students > 0
      ? Math.round((overview.reports.submitted / overview.students) * 100)
      : 0

  return (
    <div className="space-y-12">
      <TripHero />

      <section
        className="eco-reveal border-y border-border py-6"
        style={{ '--reveal-delay': '120ms' } as CSSProperties}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground">OVERVIEW</p>
          <p className="text-xs text-muted-foreground">带班教师视角 · 全班进度</p>
        </div>
        <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[11px] tracking-[0.2em] text-muted-foreground">报告已提交</p>
            <p className="eco-num mt-2 font-serif text-2xl">
              {overview?.reports.submitted ?? '—'}
              <span className="text-base text-muted-foreground"> / {overview?.students ?? '—'}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">占全班 {submittedRate}%</p>
          </div>
          <div>
            <p className="text-[11px] tracking-[0.2em] text-muted-foreground">规则平均分</p>
            <p className="eco-num mt-2 font-serif text-2xl">
              {overview ? overview.reports.averageRuleScore : '—'}
              <span className="text-base text-muted-foreground">/100</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">已提交报告的平均</p>
          </div>
          <div>
            <p className="text-[11px] tracking-[0.2em] text-muted-foreground">作品已提交</p>
            <p className="eco-num mt-2 font-serif text-2xl">
              {overview?.projects.submitted ?? '—'}
              <span className="text-base text-muted-foreground"> / {overview?.students ?? '—'}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              待评分 {overview ? overview.projects.submitted - overview.projects.reviewed : '—'} 份
            </p>
          </div>
          <div>
            <p className="text-[11px] tracking-[0.2em] text-muted-foreground">分享动态</p>
            <p className="eco-num mt-2 font-serif text-2xl">{overview?.posts ?? '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">全班已发布的照片与文字</p>
          </div>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section
        className="eco-card eco-reveal p-5 sm:p-6"
        style={{ '--reveal-delay': '260ms' } as CSSProperties}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground">
              <span className="eco-num mr-2 text-primary">01</span>CLASS
            </p>
            <h2 className="font-serif text-xl">全班汇总</h2>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              一位学生一行：报告是否提交、规则分与 AI 分多少、你有没有写过评语。点开就能读全文、给分。
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-right">
              <span className="eco-num font-serif text-2xl leading-none">
                {overview?.reports.submitted ?? '—'}
                <span className="text-sm text-muted-foreground"> / {overview?.students ?? '—'}</span>
              </span>
              <span className="mt-1 block text-[11px] tracking-[0.18em] text-muted-foreground">
                已交报告
              </span>
            </p>
            <Link
              href="/teacher"
              className="eco-btn-solid rounded-md px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90"
            >
              查看全班汇总
            </Link>
          </div>
        </div>
        <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${submittedRate}%`, backgroundColor: 'var(--eco-edge)' }}
          />
        </div>
      </section>

      <section
        className="eco-card eco-reveal p-5 sm:p-6"
        style={{ '--reveal-delay': '340ms' } as CSSProperties}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground">
              <span className="eco-num mr-2 text-primary">02</span>PROJECT
            </p>
            <h2 className="font-serif text-xl">项目作品</h2>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              全班上传的 zip 作品在这里解开：论文、图片、视频都在，AI 已经先评过一遍，你只需确认或改分。
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-right">
              <span className="eco-num font-serif text-2xl leading-none">
                {overview?.projects.submitted ?? '—'}
                <span className="text-sm text-muted-foreground"> / {overview?.students ?? '—'}</span>
              </span>
              <span className="mt-1 block text-[11px] tracking-[0.18em] text-muted-foreground">
                {overview?.projects.reviewed != null
                  ? `已评分 ${overview.projects.reviewed}`
                  : '待评分'}
              </span>
            </p>
            <Link
              href="/teacher/projects"
              className="eco-btn-solid rounded-md px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90"
            >
              查看项目作品
            </Link>
          </div>
        </div>
      </section>

      <section
        className="eco-card eco-reveal p-5 sm:p-6"
        style={{ '--reveal-delay': '420ms' } as CSSProperties}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground">
              <span className="eco-num mr-2 text-primary">03</span>FEED
            </p>
            <h2 className="font-serif text-xl">分享圈</h2>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              学生在路上发的照片与短句。看得到他们被什么打动，也方便你在点评时接住这些细节。
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-right">
              <span className="eco-num font-serif text-2xl leading-none">{overview?.posts ?? '—'}</span>
              <span className="mt-1 block text-[11px] tracking-[0.18em] text-muted-foreground">
                条动态
              </span>
            </p>
            <Link href="/feed" className="eco-btn-outline rounded-md px-4 py-2 text-sm text-foreground">
              去分享圈
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function HomeContent() {
  const session = useSession()
  const isTeacher = session.profile.role === 'teacher'

  return isTeacher ? <TeacherHome /> : <StudentHome />
}

export default function HomePage() {
  return (
    <AppFrame>
      <HomeContent />
    </AppFrame>
  )
}
