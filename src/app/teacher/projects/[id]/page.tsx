'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AppFrame } from '@/components/app-frame'
import { apiGet, apiSend, downloadFromApi } from '@/lib/client-api'
import { formatSize } from '@/lib/project-types'

interface SignedFile {
  fileName: string
  size: number
  url: string | null
}

interface TeacherProjectDetail {
  id: string
  user_id: string
  author: string
  class_name: string
  /** 学号，页面上用它代替班级名 */
  student_code: string | null
  title: string
  summary: string
  status: string
  submitted_at: string | null
  submit_count: number
  paper_parse_status: string
  paper_text: string
  paper: SignedFile | null
  images: SignedFile[]
  video: SignedFile | null
  ai_score: number | null
  best_ai_score: number | null
  final_score: number | null
  final_source: 'teacher' | 'ai' | 'none'
  ai_review: string | null
  ai_reviewed_at: string | null
  teacher_score: number | null
  teacher_comment: string | null
  teacher_reviewed_at: string | null
  updated_at: string
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function TeacherProjectDetailContent() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''

  const [project, setProject] = useState<TeacherProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [score, setScore] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)

  async function handleDownloadBundle() {
    if (!id) return
    setDownloading(true)
    setError('')
    setNotice('')
    try {
      await downloadFromApi(
        `/api/teacher/projects/${id}/bundle`,
        `${project?.author ?? '学生'}_研学作品.zip`,
      )
      setNotice('已开始下载这位学生的材料压缩包。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败')
    } finally {
      setDownloading(false)
    }
  }

  const load = useCallback(async () => {
    const data = await apiGet<{ project: TeacherProjectDetail }>(`/api/teacher/projects/${id}`)
    setProject(data.project)
    setScore(data.project.teacher_score != null ? String(data.project.teacher_score) : '')
    setComment(data.project.teacher_comment ?? '')
  }, [id])

  useEffect(() => {
    if (!id) return
    let mounted = true
    apiGet<{ project: TeacherProjectDetail }>(`/api/teacher/projects/${id}`)
      .then((data) => {
        if (!mounted) return
        setProject(data.project)
        setScore(data.project.teacher_score != null ? String(data.project.teacher_score) : '')
        setComment(data.project.teacher_comment ?? '')
      })
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [id])

  async function handleSave() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const numeric = Number(score)
      await apiSend(`/api/teacher/projects/${id}`, 'PUT', {
        teacher_comment: comment,
        teacher_score: Number.isFinite(numeric) && score !== '' ? numeric : undefined,
      })
      await load()
      setNotice('评价已保存，学生可以看到。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-24 w-full animate-pulse rounded-sm bg-muted/70" />
        ))}
      </div>
    )
  }

  if (!project) {
    return (
      <div className="border border-dashed border-border p-10 text-center">
        <p className="font-serif text-lg">找不到这份作品</p>
        <p className="mt-2 text-sm text-muted-foreground">{error || '可能已被学生删除。'}</p>
        <Link
          href="/teacher/projects"
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          返回项目作品列表
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-[11px] tracking-[0.22em] text-muted-foreground">
            {project.author}
            {project.student_code ? ` · ${project.student_code}` : ''} · 第{' '}
            {Math.max(project.submit_count, 1)} 版 · 提交于{' '}
            {formatDateTime(project.submitted_at)}
          </p>
          <h1 className="mt-3 font-serif text-3xl tracking-tight">{project.title || '（未命名作品）'}</h1>
          {project.summary ? (
            <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-7 text-foreground/85">
              {project.summary}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="border border-primary/40 px-2 py-0.5 text-[11px] tracking-wider text-primary">
            {project.status === 'submitted' ? '已提交' : '草稿'}
          </span>
          <Link href="/teacher/projects" className="text-xs text-muted-foreground hover:text-foreground">
            ← 返回列表
          </Link>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-primary">{notice}</p> : null}

      <section className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-8">
          <div className="eco-card p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl">提交材料</h2>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] text-muted-foreground">
                  论文解析状态：
                  {project.paper_parse_status === 'success'
                    ? '已解析正文'
                    : project.paper_parse_status === 'pending'
                      ? '解析中'
                      : project.paper_parse_status === 'failed'
                        ? '解析失败'
                        : '未解析'}
                </span>
                {project.paper || project.images.length > 0 || project.video ? (
                  <button
                    type="button"
                    onClick={() => void handleDownloadBundle()}
                    disabled={downloading}
                    className="rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                  >
                    {downloading ? '打包中…' : '下载压缩包'}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="eco-wave mt-3" aria-hidden="true" />
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <dt className="text-xs tracking-wide text-muted-foreground">论文</dt>
                <dd className="flex flex-wrap items-center gap-3">
                  {project.paper ? (
                    <>
                      <span>{project.paper.fileName}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatSize(project.paper.size)}
                      </span>
                      {project.paper.url ? (
                        <a
                          href={project.paper.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          打开 / 下载
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">链接生成失败</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">没有论文</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <dt className="text-xs tracking-wide text-muted-foreground">视频</dt>
                <dd className="text-sm">
                  {project.video ? (
                    <span>{project.video.fileName}</span>
                  ) : (
                    <span className="text-muted-foreground">没有视频</span>
                  )}
                </dd>
              </div>
            </dl>

            {project.video?.url ? (
              <video
                src={project.video.url}
                controls
                preload="metadata"
                className="mt-4 max-h-[420px] w-full rounded-sm border border-border bg-black"
              />
            ) : null}

            {project.images.length > 0 ? (
              <ul className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {project.images.map((image) => (
                  <li
                    key={image.fileName + (image.url ?? '')}
                    className="aspect-square overflow-hidden rounded-sm border border-border bg-muted/40"
                  >
                    {image.url ? (
                      <a href={image.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.url}
                          alt={image.fileName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <span className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                        无法预览
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}

            {project.paper_text ? (
              <details className="mt-5 border-t border-border pt-4">
                <summary className="cursor-pointer text-sm text-primary">
                  查看解析出的论文正文（{project.paper_text.length} 字）
                </summary>
                <div className="mt-3 max-h-[420px] overflow-y-auto whitespace-pre-wrap border border-border bg-muted/20 p-3 text-xs leading-6 text-foreground/85">
                  {project.paper_text}
                </div>
              </details>
            ) : null}
          </div>

          <div className="eco-card p-5 sm:p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-xl">AI 评分与点评</h2>
              {project.ai_score != null ? (
                <span className="font-serif text-3xl text-primary">{project.ai_score}</span>
              ) : project.ai_review ? (
                <span className="text-[11px] text-muted-foreground">未给出正式总分</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">学生尚未生成</span>
              )}
            </div>
            {project.ai_review ? (
              <div className="mt-4 whitespace-pre-wrap text-sm leading-8">{project.ai_review}</div>
            ) : (
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                学生点「生成 AI 评分」后，这里会出现分维度点评与总分。
              </p>
            )}
            {project.ai_reviewed_at ? (
              <p className="mt-4 text-[11px] text-muted-foreground">
                生成于 {formatDateTime(project.ai_reviewed_at)}
              </p>
            ) : null}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="eco-card p-5">
            <h2 className="font-serif text-lg">我的评价</h2>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              最终成绩{' '}
              <span className="font-serif text-base text-primary">{project.final_score ?? '—'}</span>
              /100 ·{' '}
              {project.final_source === 'teacher'
                ? '以教师评分为准'
                : project.final_source === 'ai'
                  ? '教师未评分，取 AI 最高分'
                  : '尚未评分'}
            </p>
            <label htmlFor="teacher-score" className="mt-4 block text-xs tracking-wide text-muted-foreground">
              评分（0-100）
            </label>
            <input
              id="teacher-score"
              value={score}
              onChange={(event) => setScore(event.target.value.replace(/[^\d]/g, '').slice(0, 3))}
              inputMode="numeric"
              className="mt-1 w-24 rounded-md border border-input bg-card px-3 py-2 font-serif text-xl outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <label
              htmlFor="teacher-comment"
              className="mt-4 block text-xs tracking-wide text-muted-foreground"
            >
              评语
            </label>
            <textarea
              id="teacher-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={7}
              className="mt-1 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-7 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="eco-btn-solid mt-4 w-full rounded-md px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
            >
              {saving ? '保存中…' : '保存评价'}
            </button>
            {project.teacher_reviewed_at ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                上次评于 {formatDateTime(project.teacher_reviewed_at)}
              </p>
            ) : null}
            {project.teacher_reviewed_at &&
            project.submitted_at &&
            Date.parse(project.submitted_at) > Date.parse(project.teacher_reviewed_at) ? (
              <p className="mt-2 border-l-2 border-primary/60 bg-primary/5 px-3 py-2 text-[11px] leading-5 text-primary">
                学生在你上次评价后又提交了第 {Math.max(project.submit_count, 1)} 版，建议复评。
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </div>
  )
}

export default function TeacherProjectDetailPage() {
  return (
    <AppFrame>
      <TeacherProjectDetailContent />
    </AppFrame>
  )
}
