'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { AppFrame } from '@/components/app-frame'
import { apiGet } from '@/lib/client-api'

type ScoreSource = 'teacher' | 'ai' | 'none'

interface GradeProject {
  id: string
  title: string
  score: number | null
  source: ScoreSource
  submittedAt: string | null
}

interface GradeRow {
  key: string
  studentNo: number | null
  /** 学号，页面上用它代替班级名 */
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
  projects: GradeProject[]
  updatedAt: string | null
}

interface Payload {
  classNames: string[]
  summary: {
    total: number
    submitted: number
    scored: number
    average: number | null
    highest: number | null
    ungraded: number
  }
  rows: GradeRow[]
}

const SOURCE_LABEL: Record<ScoreSource, string> = {
  teacher: '教师评分',
  ai: 'AI 最高分',
  none: '未评分',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function csvCell(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function TeacherGradesContent() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    apiGet<Payload>('/api/teacher/grades')
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => {
    const list = data?.rows ?? []
    const trimmed = keyword.trim()
    return list.filter((row) => {
      if (trimmed && !`${row.name}${row.studentCode ?? ''}`.includes(trimmed)) return false
      return true
    })
  }, [data, keyword])

  const stats = [
    {
      label: '全班人数',
      value: data?.summary.total ?? 0,
      note: `已交项目 ${data?.summary.submitted ?? 0} 人`,
    },
    {
      label: '已出成绩',
      value: data?.summary.scored ?? 0,
      note: `待评分 ${data?.summary.ungraded ?? 0} 人`,
    },
    {
      label: '项目均分',
      value: data?.summary.average ?? '—',
      note: '按每人最高分项目统计',
    },
    {
      label: '最高分',
      value: data?.summary.highest ?? '—',
      note: '本班项目最高成绩',
    },
  ]

  function handleExport() {
    const header = [
      '序号',
      '姓名',
      '学号',
      '提交项目数',
      '最高分项目',
      '项目成绩',
      '成绩来源',
      '最近提交',
    ]
    const lines = rows.map((row) =>
      [
        row.studentNo,
        row.name,
        row.studentCode,
        row.projectCount,
        row.bestProjectTitle,
        row.bestScore,
        row.bestScore === null ? '未评分' : SOURCE_LABEL[row.bestSource],
        formatDate(row.updatedAt),
      ]
        .map(csvCell)
        .join(','),
    )
    const csv = `\ufeff${[header.join(','), ...lines].join('\r\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `项目成绩册-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-10">
      <section>
        <p className="text-[11px] tracking-[0.22em] text-muted-foreground">教师端</p>
        <h1 className="mt-3 font-serif text-3xl tracking-tight">项目成绩册</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          每名学生的项目成绩取他得分最高的那个项目：教师给过分用教师评分，没给分用 AI 最高分。导出后可直接整理进学习通成绩册。
        </p>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="grid gap-6 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label}>
            <p className="text-[11px] tracking-[0.2em] text-muted-foreground">{item.label}</p>
            <p className="eco-num mt-2 font-serif text-2xl">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] tracking-[0.15em] text-muted-foreground">
          按名册编号排序 · 每人取最高分项目
        </p>
        <div className="flex items-center gap-3">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索姓名或学号"
            aria-label="按姓名或学号搜索"
            className="w-full max-w-[200px] rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <button
            type="button"
            onClick={handleExport}
            disabled={rows.length === 0}
            className="eco-btn-outline rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            导出 Excel
          </button>
        </div>
      </section>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-12 w-full animate-pulse rounded-sm bg-muted/70" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <p className="font-serif text-lg">还没有匹配的学生</p>
          <p className="mt-2 text-sm text-muted-foreground">清空搜索再看看。</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] tracking-[0.15em] text-muted-foreground">
                <th className="py-2.5 pr-4 font-normal">序号</th>
                <th className="py-2.5 pr-4 font-normal">学生</th>
                <th className="py-2.5 pr-4 font-normal">学号</th>
                <th className="py-2.5 pr-4 font-normal">提交项目</th>
                <th className="py-2.5 pr-4 font-normal">最高分项目</th>
                <th className="py-2.5 pr-4 font-normal">项目成绩</th>
                <th className="py-2.5 pr-4 font-normal">成绩来源</th>
                <th className="py-2.5 font-normal">最近提交</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expanded === row.key
                return (
                  <Fragment key={row.key}>
                    <tr className="border-b border-border/70 transition-colors hover:bg-muted/25">
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                        {row.studentNo ?? '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-2">
                          <span className="text-foreground">{row.name}</span>
                          {row.inRoster ? null : (
                            <span className="text-[10px] tracking-wider text-muted-foreground">
                              名册外
                            </span>
                          )}
                          {row.projects.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => setExpanded(isOpen ? null : row.key)}
                              className="text-[10px] tracking-wider text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                            >
                              {isOpen ? '收起' : `查看 ${row.projects.length} 个项目`}
                            </button>
                          ) : null}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                        {row.studentCode ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{row.projectCount}</td>
                      <td className="max-w-[220px] truncate py-3 pr-4 text-xs">
                        {row.bestProjectTitle ?? '—'}
                      </td>
                      <td className="eco-num py-3 pr-4 font-serif text-base">
                        {row.bestScore === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          row.bestScore
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {row.bestScore === null ? '未评分' : SOURCE_LABEL[row.bestSource]}
                      </td>
                      <td className="py-3 font-mono text-xs text-muted-foreground">
                        {formatDate(row.updatedAt)}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr key={`${row.key}-detail`} className="border-b border-border/70 bg-muted/30">
                        <td />
                        <td colSpan={7} className="py-3 pr-4">
                          <ul className="space-y-1.5">
                            {row.projects.map((project) => (
                              <li
                                key={project.id}
                                className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
                              >
                                <span className="text-foreground">{project.title}</span>
                                <span className="eco-num font-serif text-sm text-foreground">
                                  {project.score === null ? '—' : `${project.score}/100`}
                                </span>
                                <span>{SOURCE_LABEL[project.source]}</span>
                                <span className="font-mono">{formatDate(project.submittedAt)}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function TeacherGradesPage() {
  return (
    <AppFrame>
      <TeacherGradesContent />
    </AppFrame>
  )
}
