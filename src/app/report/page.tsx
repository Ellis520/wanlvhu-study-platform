'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AppFrame, useSession } from '@/components/app-frame'
import { apiGet, apiSend, apiStream } from '@/lib/client-api'
import {
  REPORT_FIELDS,
  STAGES,
  computeRuleScore,
  countChars,
  type Answers,
  type RuleScoreResult,
} from '@/lib/study-trip'
import type { ProjectPayload } from '@/lib/project-types'
import { resolveFinalScore, scoreSourceLabel } from '@/lib/final-score'

interface ReportRow {
  id: string
  title: string
  highlights: string
  reflection: string
  action_plan: string
  status: string
  submitted_at: string | null
  teacher_comment: string | null
  teacher_score: number | null
  ai_review: string | null
  ai_score: number | null
  rule_score: number | null
}

interface Payload {
  report: ReportRow | null
  records: { stage: string; answers: Answers; updated_at: string }[]
  score: RuleScoreResult
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/** 极简 Markdown 渲染：加粗、小标题、列表 */
function renderRich(text: string) {
  const lines = text.split('\n')
  return lines.map((line, index) => {
    const trimmed = line.trim()
    const withBold = (value: string) => {
      const parts = value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
      return parts.map((part, partIndex) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={partIndex} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={partIndex}>{part}</span>
        ),
      )
    }
    if (!trimmed) return <div key={index} className="h-2" />
    if (trimmed.startsWith('###')) {
      return (
        <p key={index} className="mt-3 font-serif text-base">
          {withBold(trimmed.replace(/^#+\s*/, ''))}
        </p>
      )
    }
    if (/^\d+[.、)]/.test(trimmed) || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      return (
        <p key={index} className="mt-1 pl-4 text-sm leading-7">
          {withBold(trimmed.replace(/^[-*]\s*/, ''))}
        </p>
      )
    }
    return (
      <p key={index} className="mt-1 text-sm leading-7">
        {withBold(trimmed)}
      </p>
    )
  })
}

function ScorePanel({ score }: { score: RuleScoreResult }) {
  return (
    <div className="eco-card p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] tracking-[0.2em] text-muted-foreground">规则评分</span>
        <span className="text-[11px] tracking-wider text-primary">{score.level}</span>
      </div>
      <p className="mt-2 font-serif text-4xl">
        {score.total}
        <span className="text-base text-muted-foreground">/100</span>
      </p>
      <div className="mt-5 space-y-3">
        {score.dimensions.map((dimension) => (
          <div key={dimension.key}>
            <div className="flex items-baseline justify-between text-xs">
              <span>{dimension.label}</span>
              <span className="text-muted-foreground">
                {dimension.score}/{dimension.max}
              </span>
            </div>
            <div className="mt-1 h-1 w-full bg-primary/10">
              <div
                className="h-1 bg-primary transition-all duration-500"
                style={{ width: `${(dimension.score / dimension.max) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{dimension.comment}</p>
          </div>
        ))}
      </div>
      {score.missing.length ? (
        <div className="eco-rule-t mt-5 pt-4">
          <p className="text-[11px] tracking-wide text-muted-foreground">还需补的关键点</p>
          <p className="mt-1 text-xs leading-6 text-destructive">{score.missing.join('、')}</p>
          <Link href="/record" className="mt-2 inline-block text-xs text-primary hover:underline">
            去补充 →
          </Link>
        </div>
      ) : (
        <p className="eco-rule-t mt-5 pt-4 text-xs text-muted-foreground">
          所有必填关键点已完成。
        </p>
      )}
    </div>
  )
}

function ReportContent() {
  const session = useSession()
  const [data, setData] = useState<Payload | null>(null)
  const [form, setForm] = useState({
    title: '万绿湖绿色发展区研学报告',
    highlights: '',
    reflection: '',
    action_plan: '',
  })
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [aiText, setAiText] = useState('')
  const [aiRunning, setAiRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [project, setProject] = useState<ProjectPayload | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    const payload = await apiGet<Payload>('/api/report')
    setData(payload)
    setForm({
      title: payload.report?.title ?? '万绿湖绿色发展区研学报告',
      highlights: payload.report?.highlights ?? '',
      reflection: payload.report?.reflection ?? '',
      action_plan: payload.report?.action_plan ?? '',
    })
    setAiText(payload.report?.ai_review ?? '')
    loadedRef.current = true
  }, [])

  useEffect(() => {
    load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载报告失败'))
      .finally(() => setLoading(false))
  }, [load])

  // 「学习情况」页同时呈现项目作品情况：教师评分优先，未评分取 AI 最高分
  useEffect(() => {
    apiGet<{ project: ProjectPayload | null }>('/api/project')
      .then((payload) => setProject(payload.project))
      .catch(() => setProject(null))
  }, [])

  const persist = useCallback(async (next: typeof form) => {
    setSaveState('saving')
    try {
      await apiSend('/api/report', 'PUT', next)
      setSaveState('saved')
    } catch (err) {
      setSaveState('error')
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }, [])

  const handleChange = (key: keyof typeof form, value: string) => {
    const next = { ...form, [key]: value }
    setForm(next)
    if (!loadedRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setSaveState('saving')
    timerRef.current = setTimeout(() => {
      void persist(next)
    }, 1200)
  }

  const answersMap = useMemo(() => {
    const map: Record<string, Answers> = {}
    for (const record of data?.records ?? []) {
      map[record.stage] = record.answers ?? {}
    }
    return map
  }, [data])

  const liveScore = useMemo(
    () => computeRuleScore(Object.values(answersMap), form),
    [answersMap, form],
  )

  async function handleSubmit() {
    if (!window.confirm('提交后教师即可查看并评价，你仍可以继续修改内容。确定提交吗？')) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      if (timerRef.current) clearTimeout(timerRef.current)
      await apiSend('/api/report', 'PUT', form)
      await apiSend('/api/report/submit', 'POST')
      await load()
      setNotice('已提交，教师可以看到你的报告了。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAiReview() {
    setAiRunning(true)
    setAiText('')
    setError('')
    try {
      if (timerRef.current) clearTimeout(timerRef.current)
      await apiSend('/api/report', 'PUT', form)
      await apiStream('/api/report/ai-review', {
        onDelta: (text) => setAiText((prev) => prev + text),
        onDone: async (payload) => {
          setAiRunning(false)
          await load()
          if (payload.score != null) setNotice(`AI 点评已生成，AI 评分 ${payload.score}`)
        },
        onError: (message) => {
          setAiRunning(false)
          setError(message)
        },
      })
    } catch (err) {
      setAiRunning(false)
      setError(err instanceof Error ? err.message : 'AI 点评失败')
    }
  }

  const statusText = data?.report?.status === 'submitted' ? '已提交' : '草稿'

  // 学习情况总览：过程记录 / 研学报告 / 项目作品三块并列
  const filledStages = STAGES.filter((stage) => {
    const answers = answersMap[stage.key] ?? {}
    return stage.fields.some((field) => countChars(answers[field.key]) > 0)
  }).length
  const projectFinal = resolveFinalScore(project)
  const projectStatusLabel = !project
    ? '未开始'
    : project.status === 'submitted'
      ? `已提交 · 第 ${Math.max(project.submit_count, 1)} 版`
      : '草稿'

  return (
    <div className="space-y-12">
      <section className="eco-reveal flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-[11px] tracking-[0.22em] text-muted-foreground">
            {session.profile.display_name} · 学习情况
          </p>
          <input
            value={form.title}
            onChange={(event) => handleChange('title', event.target.value)}
            aria-label="报告标题"
            className="mt-3 w-full border-none bg-transparent font-serif text-3xl tracking-tight outline-none print:hidden"
          />
          <h1 className="mt-3 hidden font-serif text-3xl tracking-tight print:block">
            {form.title}
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            {session.trip.destination} · {session.trip.start_date} 至 {session.trip.end_date}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="border border-primary/40 px-2 py-0.5 text-[11px] tracking-wider text-primary">
            {statusText}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {saveState === 'saving'
              ? '保存中…'
              : saveState === 'saved'
                ? '已保存'
                : saveState === 'error'
                  ? '保存失败'
                  : '自动保存'}
          </span>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-primary">{notice}</p> : null}

      <section className="grid gap-6 border-y border-border py-6 sm:grid-cols-2">
        <div>
          <p className="text-[11px] tracking-[0.2em] text-muted-foreground">过程记录</p>
          <p className="mt-2 font-serif text-2xl">
            {filledStages}
            <span className="text-base text-muted-foreground"> / {STAGES.length} 阶段</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">已填写关键点的阶段</p>
        </div>
        <div>
          <p className="text-[11px] tracking-[0.2em] text-muted-foreground">项目作品</p>
          <p className="mt-2 font-serif text-2xl">
            {projectFinal.score ?? '—'}
            <span className="text-base text-muted-foreground">/100</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {projectStatusLabel} · {scoreSourceLabel(projectFinal.source)}
          </p>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-10">
          <div>
            <h2 className="font-serif text-xl">一、项目作品情况</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              最终成绩以教师评分为准；教师还没评分时，取历次 AI 评分中的最高分。
            </p>
            {project ? (
              <div className="mt-5 space-y-3">
                <p className="font-serif text-base">{project.title || '（未命名项目）'}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>状态：{projectStatusLabel}</span>
                  <span>最近提交：{formatDateTime(project.submitted_at) || '—'}</span>
                  <span>
                    材料：
                    {[
                      project.paper ? '论文' : '缺论文',
                      project.images.length > 0 ? `${project.images.length} 张图` : null,
                      project.video ? '视频' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-1 text-xs">
                  <span>
                    最终成绩{' '}
                    <strong className="font-serif text-base text-primary">
                      {projectFinal.score ?? '—'}
                    </strong>
                    /100（{scoreSourceLabel(projectFinal.source)}）
                  </span>
                  <span>AI 评分：{project.ai_score ?? '—'}</span>
                  <span>AI 最高分：{project.best_ai_score ?? '—'}</span>
                  <span>教师评分：{project.teacher_score ?? '—'}</span>
                </div>
                {project.summary ? (
                  <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/85">
                    {project.summary}
                  </p>
                ) : null}
                <Link
                  href="/project"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  去项目提交页
                </Link>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                还没有提交项目作品，从顶部导航「项目提交」开始。
              </p>
            )}
          </div>

          <div>
            <h2 className="font-serif text-xl">二、过程记录汇总</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              以下内容来自你在三个阶段填写的关键点，修改请回到记录页。
            </p>
            <div className="mt-5 space-y-7">
              {STAGES.map((stage) => {
                const answers = answersMap[stage.key] ?? {}
                const filled = stage.fields.filter(
                  (field) => countChars(answers[field.key]) > 0,
                )
                return (
                  <div key={stage.key} className="eco-rule-t pt-4">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-serif text-base">{stage.title}</h3>
                      <Link
                        href={`/record?stage=${stage.key}`}
                        className="text-[11px] text-primary hover:underline print:hidden"
                      >
                        修改
                      </Link>
                    </div>
                    {filled.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        这一段还是空的，先去记录页写下你的观察。
                      </p>
                    ) : (
                      <dl className="mt-3 space-y-3">
                        {filled.map((field) => (
                          <div key={field.key}>
                            <dt className="text-xs tracking-wide text-muted-foreground">
                              {field.time ? `${field.time} · ` : ''}
                              {field.label}
                            </dt>
                            <dd className="mt-1 whitespace-pre-wrap text-sm leading-7">
                              {answers[field.key]}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <h2 className="font-serif text-xl">三、报告正文</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              把记录整理成一条说得通的线索：我看到了什么、说明了什么、我准备做什么。
            </p>
            <div className="mt-5 space-y-8">
              {REPORT_FIELDS.map((field, index) => {
                const value = form[field.key]
                const chars = countChars(value)
                const enough = chars >= field.minLength
                return (
                  <div key={field.key} className="eco-rule-t pt-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-3">
                        <span className="text-[11px] tracking-[0.2em] text-muted-foreground">
                          0{index + 1}
                        </span>
                        <label htmlFor={field.key} className="font-serif text-lg">
                          {field.label}
                        </label>
                      </div>
                      <span
                        className={`text-[11px] ${enough ? 'text-primary' : 'text-muted-foreground'}`}
                      >
                        {chars} 字 / 建议 {field.minLength} 字以上
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{field.hint}</p>
                    <textarea
                      id={field.key}
                      value={value}
                      onChange={(event) => handleChange(field.key, event.target.value)}
                      rows={field.rows}
                      className="mt-3 w-full resize-y rounded-md border border-input bg-card px-3.5 py-3 text-sm leading-7 outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 print:hidden"
                    />
                    <div className="mt-2 hidden whitespace-pre-wrap text-sm leading-7 print:block">
                      {value || '（未填写）'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="print:hidden">
            <ScorePanel score={liveScore} />
          </div>

          <div className="eco-card p-5 print:hidden">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] tracking-[0.2em] text-muted-foreground">AI 点评</span>
              {data?.report?.ai_score != null ? (
                <span className="text-[11px] tracking-wider text-primary">
                  AI 评分 {data.report.ai_score}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              基于你的记录与正文，按观察完整性、证据使用、思考深度、绿色理念理解、行动可行性五个方面点评。
            </p>
            <button
              type="button"
              onClick={handleAiReview}
              disabled={aiRunning || loading}
              className="eco-btn-solid mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {aiRunning
                ? '生成中…'
                : data?.report?.ai_review
                  ? '重新生成点评'
                  : '生成 AI 点评'}
            </button>
            <div className="eco-rule-t mt-4 max-h-[420px] overflow-y-auto pt-3">
              {aiText ? (
                renderRich(aiText)
              ) : (
                <p className="text-sm leading-7 text-muted-foreground">
                  还没有点评。先保存报告正文，再点上面的按钮。
                </p>
              )}
              {aiRunning ? (
                <span className="mt-1 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" />
              ) : null}
            </div>
          </div>

          {data?.report?.teacher_comment ? (
            <div className="eco-card p-5">
              <span className="text-[11px] tracking-[0.2em] text-muted-foreground">教师评语</span>
              {data.report.teacher_score != null ? (
                <p className="mt-1 font-serif text-2xl">
                  {data.report.teacher_score}
                  <span className="text-sm text-muted-foreground">/100</span>
                </p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                {data.report.teacher_comment}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 print:hidden">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="eco-btn-outline rounded-md px-4 py-2 text-sm text-primary disabled:opacity-60"
            >
              {submitting ? '提交中…' : data?.report?.status === 'submitted' ? '更新提交' : '提交报告'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="eco-btn-outline rounded-md px-4 py-2 text-sm"
            >
              打印 / 导出 PDF
            </button>
            {data?.report?.submitted_at ? (
              <p className="text-[11px] text-muted-foreground">
                最近提交：{formatDateTime(data.report.submitted_at)}
              </p>
            ) : null}
          </div>
        </aside>
      </section>

      <section className="hidden print:block">
        <div className="border-t border-border pt-6">
          <h2 className="font-serif text-lg">评价</h2>
          <p className="mt-1 text-sm">规则评分：{liveScore.total}/100（{liveScore.level}）</p>
          <p className="mt-1 text-sm">
            AI 评分：{data?.report?.ai_score ?? '—'}
            {data?.report?.teacher_score != null
              ? ` · 教师评分：${data.report.teacher_score}`
              : ''}
          </p>
          {data?.report?.teacher_comment ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
              教师评语：{data.report.teacher_comment}
            </p>
          ) : null}
          {aiText ? (
            <div className="mt-3">{renderRich(aiText)}</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export default function ReportPage() {
  return (
    <AppFrame>
      <ReportContent />
    </AppFrame>
  )
}
