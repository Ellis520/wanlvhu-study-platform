'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AppFrame } from '@/components/app-frame'
import { apiGet, downloadFromApi } from '@/lib/client-api'

interface TeacherProject {
  id: string
  user_id: string
  title: string
  status: string
  ai_score: number | null
  best_ai_score: number | null
  ai_reviewed_at: string | null
  teacher_score: number | null
  /** 最终成绩：教师评分优先，无教师分时取 AI 最高分 */
  final_score: number | null
  final_source: 'teacher' | 'ai' | 'none'
  submitted_at: string | null
  submit_count: number
  needs_recheck: boolean
  paper_name: string
  image_count: number
  has_video: boolean
  display_name: string
  class_name: string
  /** 学号，页面上用它代替班级名 */
  student_code: string | null
}

interface Payload {
  projects: TeacherProject[]
  summary: {
    total: number
    submitted: number
    aiScored: number
    teacherReviewed: number
    averageAiScore: number
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

function TeacherProjectsContent() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<'all' | 'submitted' | 'scored' | 'reviewed' | 'recheck'>('all')
  const [downloadingId, setDownloadingId] = useState('')
  const [notice, setNotice] = useState('')

  async function handleDownload(row: TeacherProject) {
    setDownloadingId(row.id)
    setError('')
    setNotice('')
    try {
      await downloadFromApi(
        `/api/teacher/projects/${row.id}/bundle`,
        `${row.display_name}_研学作品.zip`,
      )
      setNotice(`已开始下载 ${row.display_name} 的材料压缩包。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败')
    } finally {
      setDownloadingId('')
    }
  }

  const hasMaterial = (row: TeacherProject) =>
    Boolean(row.paper_name) || row.image_count > 0 || row.has_video

  useEffect(() => {
    apiGet<Payload>('/api/teacher/projects')
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => {
    const list = data?.projects ?? []
    return list.filter((row) => {
      if (filter === 'submitted' && row.status !== 'submitted') return false
      if (filter === 'scored' && row.ai_score === null) return false
      if (filter === 'reviewed' && row.teacher_score === null) return false
      if (filter === 'recheck' && !row.needs_recheck) return false
      if (keyword.trim()) {
        const text = `${row.display_name}${row.student_code ?? ''}${row.title}`
        if (!text.includes(keyword.trim())) return false
      }
      return true
    })
  }, [data, filter, keyword])

  return (
    <div className="space-y-10">
      <section>
        <p className="text-[11px] tracking-[0.22em] text-muted-foreground">教师端 · 研学项目</p>
        <h1 className="mt-3 font-serif text-3xl tracking-tight">全班项目作品</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          学生提交的论文、图片与视频会汇总到这里。你可以读论文、看 AI 的分维度点评，再写下自己的分数与评语。
        </p>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-primary">{notice}</p> : null}

      <section className="grid gap-6 border-y border-border py-6 sm:grid-cols-4">
        {[
          { label: '全部作品', value: data?.summary.total ?? 0, note: '含草稿' },
          { label: '已提交', value: data?.summary.submitted ?? 0, note: '学生点击提交' },
          { label: '已 AI 评分', value: data?.summary.aiScored ?? 0, note: '模型已出分' },
          { label: '平均 AI 分', value: data?.summary.averageAiScore ?? 0, note: '已评分作品均值' },
        ].map((item) => (
          <div key={item.label}>
            <p className="text-[11px] tracking-[0.2em] text-muted-foreground">{item.label}</p>
            <p className="mt-2 font-serif text-2xl">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-5">
          {(
            [
              { key: 'all', label: '全部' },
              { key: 'submitted', label: '已提交' },
              { key: 'scored', label: '已评分' },
              { key: 'reviewed', label: '已评价' },
              { key: 'recheck', label: '待复评' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`pb-1 text-sm transition-colors ${
                filter === item.key
                  ? 'border-b border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          aria-label="按姓名、学号或标题搜索"
          className="w-full max-w-xs rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </section>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-12 w-full animate-pulse rounded-sm bg-muted/70" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <p className="font-serif text-lg">还没有学生作品</p>
          <p className="mt-2 text-sm text-muted-foreground">
            学生在「项目提交」页上传论文并提交后，会出现在这里。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] tracking-[0.15em] text-muted-foreground">
                <th className="py-2.5 pr-4 font-normal">学生</th>
                <th className="py-2.5 pr-4 font-normal">学号</th>
                <th className="py-2.5 pr-4 font-normal">作品标题</th>
                <th className="py-2.5 pr-4 font-normal">材料</th>
                <th className="py-2.5 pr-4 font-normal">状态</th>
                <th className="py-2.5 pr-4 font-normal">版本</th>
                <th className="py-2.5 pr-4 font-normal">AI 最高分</th>
                <th className="py-2.5 pr-4 font-normal">教师分</th>
                <th className="py-2.5 pr-4 font-normal">最终成绩</th>
                <th className="py-2.5 pr-4 font-normal">提交时间</th>
                <th className="py-2.5 font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/70">
                  <td className="py-3 pr-4">{row.display_name}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                    {row.student_code ?? '—'}
                  </td>
                  <td className="max-w-[220px] truncate py-3 pr-4">{row.title || '（未命名）'}</td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    {row.paper_name ? '论文' : '无论文'}
                    {row.image_count > 0 ? ` · 图 ${row.image_count}` : ''}
                    {row.has_video ? ' · 视频' : ''}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`text-[11px] tracking-wider ${
                        row.status === 'submitted' ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {row.status === 'submitted' ? '已提交' : '草稿'}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-[11px] tracking-wider text-muted-foreground">
                      {row.submit_count > 0 ? `第 ${row.submit_count} 版` : '—'}
                    </span>
                    {row.needs_recheck ? (
                      <span className="mt-1 block text-[10px] text-primary">待复评</span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 font-serif">
                    {row.best_ai_score ?? row.ai_score ?? '—'}
                  </td>
                  <td className="py-3 pr-4 font-serif">{row.teacher_score ?? '—'}</td>
                  <td className="py-3 pr-4">
                    <span className="font-serif text-primary">{row.final_score ?? '—'}</span>
                    {row.final_source === 'ai' ? (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        AI 最高分
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    {formatDateTime(row.submitted_at)}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/teacher/projects/${row.id}`}
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        查看与评价
                      </Link>
                      {hasMaterial(row) ? (
                        <button
                          type="button"
                          onClick={() => void handleDownload(row)}
                          disabled={downloadingId === row.id}
                          className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
                        >
                          {downloadingId === row.id ? '打包中…' : '下载压缩包'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function TeacherProjectsPage() {
  return (
    <AppFrame>
      <TeacherProjectsContent />
    </AppFrame>
  )
}
