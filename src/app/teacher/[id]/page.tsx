'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AppFrame } from '@/components/app-frame'
import { apiGet, apiSend } from '@/lib/client-api'
import { STAGES, type Answers, type RuleScoreResult } from '@/lib/study-trip'

interface ReportDetail {
  id: string
  user_id: string
  title: string
  highlights: string
  reflection: string
  action_plan: string
  rule_score: number | null
  rule_detail: RuleScoreResult | null
  ai_review: string | null
  ai_score: number | null
  status: string
  submitted_at: string | null
  teacher_comment: string | null
  teacher_score: number | null
  profiles: { display_name: string; class_name: string } | { display_name: string; class_name: string }[] | null
}

interface Payload {
  report: ReportDetail
  student_code: string | null
  /** 学生头像：上传照片的签名链接或预置手绘图路径 */
  avatar_url?: string | null
  records: { stage: string; answers: Answers; updated_at: string }[]
}

function pickProfile(report: ReportDetail) {
  const profile = Array.isArray(report.profiles) ? report.profiles[0] : report.profiles
  return {
    display_name: profile?.display_name ?? '未命名学生',
    class_name: profile?.class_name ?? '',
  }
}

function TeacherDetailContent() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [score, setScore] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const payload = await apiGet<Payload>(`/api/teacher/reports/${id}`)
    setData(payload)
    setScore(payload.report.teacher_score != null ? String(payload.report.teacher_score) : '')
    setComment(payload.report.teacher_comment ?? '')
  }, [id])

  useEffect(() => {
    if (!id) return
    load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [id, load])

  async function handleSave() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const numeric = score.trim() === '' ? undefined : Number(score)
      await apiSend(`/api/teacher/reports/${id}`, 'PUT', {
        teacher_comment: comment,
        teacher_score: numeric,
      })
      setNotice('评价已保存，学生可以在报告页看到。')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-8 w-64 animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-full animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded-sm bg-muted" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="border border-dashed border-border p-10 text-center">
        <p className="font-serif text-lg">未找到这份报告</p>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        <Link href="/teacher" className="mt-4 inline-block text-sm text-primary hover:underline">
          返回全班汇总
        </Link>
      </div>
    )
  }

  const student = pickProfile(data.report)
  const answersMap: Record<string, Answers> = {}
  for (const record of data.records) answersMap[record.stage] = record.answers ?? {}
  const ruleDetail = data.report.rule_detail

  return (
    <div className="space-y-10">
      <section>
        <Link href="/teacher" className="text-xs text-muted-foreground hover:text-foreground">
          ← 返回全班汇总
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            {data.avatar_url ? (
              <img
                src={data.avatar_url}
                alt={`${student.display_name}的头像`}
                className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
              />
            ) : null}
            <div>
              <p className="text-[11px] tracking-[0.22em] text-muted-foreground">
                {student.display_name}
                {data.student_code ? ` · ${data.student_code}` : ''}
              </p>
              <h1 className="mt-2 font-serif text-3xl tracking-tight">{data.report.title}</h1>
              <p className="mt-2 text-xs text-muted-foreground">
                {data.report.status === 'submitted'
                  ? `已提交 · ${data.report.submitted_at ? new Date(data.report.submitted_at).toLocaleString('zh-CN') : ''}`
                  : '草稿（学生尚未提交）'}
              </p>
            </div>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-[11px] tracking-[0.15em] text-muted-foreground">规则分</p>
              <p className="font-serif text-xl">{data.report.rule_score ?? '—'}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.15em] text-muted-foreground">AI 分</p>
              <p className="font-serif text-xl">{data.report.ai_score ?? '—'}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.15em] text-muted-foreground">教师分</p>
              <p className="font-serif text-xl">{data.report.teacher_score ?? '—'}</p>
            </div>
          </div>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-primary">{notice}</p> : null}

      <section className="grid gap-9 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-9">
          <div>
            <h2 className="font-serif text-xl">过程记录</h2>
            <div className="mt-4 space-y-7">
              {STAGES.map((stage) => {
                const answers = answersMap[stage.key] ?? {}
                const filled = stage.fields.filter((field) => (answers[field.key] ?? '').trim())
                return (
                  <div key={stage.key} className="eco-rule-t pt-4">
                    <h3 className="font-serif text-base">{stage.title}</h3>
                    {filled.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">该阶段未填写内容。</p>
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
            <h2 className="font-serif text-xl">报告正文</h2>
            <div className="mt-4 space-y-6">
              {[
                { label: '研学成果摘要', value: data.report.highlights },
                { label: '深度反思', value: data.report.reflection },
                { label: '个人绿色行动方案', value: data.report.action_plan },
              ].map((block) => (
                <div key={block.label} className="eco-rule-t pt-4">
                  <h3 className="font-serif text-base">{block.label}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                    {block.value || '（未填写）'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {data.report.ai_review ? (
            <div>
              <h2 className="font-serif text-xl">AI 点评</h2>
              <div className="eco-rule-t mt-3 pt-4">
                <p className="whitespace-pre-wrap text-sm leading-7">{data.report.ai_review}</p>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-6">
          {ruleDetail ? (
            <div className="eco-card p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] tracking-[0.2em] text-muted-foreground">规则评分</span>
                <span className="text-[11px] tracking-wider text-primary">{ruleDetail.level}</span>
              </div>
              <p className="mt-2 font-serif text-3xl">
                {ruleDetail.total}
                <span className="text-sm text-muted-foreground">/100</span>
              </p>
              <div className="mt-4 space-y-2.5">
                {ruleDetail.dimensions.map((dimension) => (
                  <div key={dimension.key}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span>{dimension.label}</span>
                      <span className="text-muted-foreground">
                        {dimension.score}/{dimension.max}
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full bg-primary/10">
                      <div
                        className="h-1 bg-primary"
                        style={{ width: `${(dimension.score / dimension.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="eco-card p-5">
            <h2 className="font-serif text-lg">我的评价</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="teacher-score" className="text-xs text-muted-foreground">
                  评分（0-100）
                </label>
                <input
                  id="teacher-score"
                  type="number"
                  min={0}
                  max={100}
                  value={score}
                  onChange={(event) => setScore(event.target.value)}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="teacher-comment" className="text-xs text-muted-foreground">
                  评语
                </label>
                <textarea
                  id="teacher-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={8}
                  className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-7 outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="eco-btn-solid w-full rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving ? '保存中…' : '保存评价'}
              </button>
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}

export default function TeacherDetailPage() {
  return (
    <AppFrame>
      <TeacherDetailContent />
    </AppFrame>
  )
}
