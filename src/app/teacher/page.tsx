'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AppFrame } from '@/components/app-frame'
import { apiGet } from '@/lib/client-api'

interface RosterRow {
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

interface Payload {
  classTotal: number
  registered: number
  summary: {
    recorded: number
    reported: number
    projected: number
    averageScore: number | null
    unregistered: number
  }
  rows: RosterRow[]
}

type FilterKey = 'all' | 'pending' | 'done' | 'unregistered'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '未完成' },
  { key: 'done', label: '已完成' },
  { key: 'unregistered', label: '未注册' },
]

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

/** 两项任务都交齐才算完成：过程记录 + 项目作品 */
function isDone(row: RosterRow): boolean {
  return row.recordDone && row.projectStatus === 'submitted'
}

function TaskCell({
  done,
  doneLabel,
  pendingLabel,
  registered,
  badge,
}: {
  done: boolean
  doneLabel: string
  pendingLabel: string
  registered: boolean
  badge?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`text-[12px] tracking-wider ${done ? 'text-primary' : 'text-muted-foreground'}`}
      >
        {done ? doneLabel : pendingLabel}
      </span>
      {badge ? <span className="text-[10px] text-primary">{badge}</span> : null}
      {!registered ? <span className="text-[10px] text-muted-foreground">未注册</span> : null}
    </div>
  )
}

function TeacherContent() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  useEffect(() => {
    apiGet<Payload>('/api/teacher/roster')
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => {
    const list = data?.rows ?? []
    return list.filter((row) => {
      if (filter === 'pending' && isDone(row)) return false
      if (filter === 'done' && !isDone(row)) return false
      if (filter === 'unregistered' && row.registered) return false
      if (keyword.trim()) {
        const text = `${row.name}${row.studentCode ?? ''}`
        if (!text.includes(keyword.trim())) return false
      }
      return true
    })
  }, [data, filter, keyword])

  const stats = [
    {
      label: '全班人数',
      value: data?.classTotal ?? 0,
      note: `已注册 ${data?.registered ?? 0} 人`,
    },
    {
      label: '过程记录已交',
      value: data?.summary.recorded ?? 0,
      note: `未交 ${Math.max((data?.classTotal ?? 0) - (data?.summary.recorded ?? 0), 0)} 人`,
    },
    {
      label: '项目作品已交',
      value: data?.summary.projected ?? 0,
      note: `未交 ${Math.max((data?.classTotal ?? 0) - (data?.summary.projected ?? 0), 0)} 人`,
    },
    {
      label: '综合均分',
      value: data?.summary.averageScore ?? '—',
      note: '过程记录与项目合计',
    },
  ]

  return (
    <div className="space-y-10">
      <section>
        <p className="text-[11px] tracking-[0.22em] text-muted-foreground">教师端</p>
        <h1 className="mt-3 font-serif text-3xl tracking-tight">全班任务总览</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          全班 {data?.classTotal ?? '—'} 名学生，每人要交「过程记录」和「项目作品」两项任务。名册里还没注册的学生也会列在这里，任务先记为未完成。
        </p>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="grid gap-6 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item, index) => (
          <div key={item.label}>
            <div className="flex items-center gap-2">
              <span className="eco-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinecap="round"
                >
                  {index % 2 === 0 ? (
                    <>
                      <path d="M1.4 5.2c1.6-1.5 3.5-1.5 5.1 0s3.5 1.5 5.1 0" />
                      <path d="M1.4 9c1.6-1.5 3.5-1.5 5.1 0s3.5 1.5 5.1 0" />
                    </>
                  ) : (
                    <>
                      <path d="M7 1.6v10.8" />
                      <path d="M7 4.4 4.2 2.6M7 4.4l2.8-1.8M7 7.6 4.4 5.9M7 7.6l2.6-1.7" />
                    </>
                  )}
                </svg>
              </span>
              <p className="text-[11px] tracking-[0.2em] text-muted-foreground">{item.label}</p>
            </div>
            <p className="mt-2 font-serif text-2xl">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-5">
          {FILTERS.map((item) => (
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
          aria-label="按姓名或学号搜索"
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
          <p className="font-serif text-lg">没有符合条件的学生</p>
          <p className="mt-2 text-sm text-muted-foreground">换一个筛选条件或清空搜索再看看。</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] tracking-[0.15em] text-muted-foreground">
                <th className="py-2.5 pr-4 font-normal">序号</th>
                <th className="py-2.5 pr-4 font-normal">学生</th>
                <th className="py-2.5 pr-4 font-normal">学号</th>
                <th className="py-2.5 pr-4 font-normal">过程记录</th>
                <th className="py-2.5 pr-4 font-normal">研学报告</th>
                <th className="py-2.5 pr-4 font-normal">项目作品</th>
                <th className="py-2.5 pr-4 font-normal">综合分</th>
                <th className="py-2.5 pr-4 font-normal">最近提交</th>
                <th className="py-2.5 font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border/70">
                  <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                    {row.studentNo ?? '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2">
                      {row.name}
                      {row.inRoster ? null : (
                        <span className="text-[10px] tracking-wider text-muted-foreground">
                          名册外
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                    {row.studentCode ?? '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <TaskCell
                      done={row.recordDone}
                      doneLabel={`已填 ${row.stageCount}/3 阶段`}
                      pendingLabel={`未完成 ${row.stageCount}/3`}
                      registered={row.registered}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <TaskCell
                      done={row.reportStatus === 'submitted'}
                      doneLabel={row.reportScore !== null ? `已交 · ${row.reportScore} 分` : '已交'}
                      pendingLabel={row.reportStatus === 'draft' ? '草稿未交' : '未完成'}
                      registered={row.registered}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <TaskCell
                      done={row.projectStatus === 'submitted'}
                      doneLabel={
                        row.projectScore !== null
                          ? `已交 · 第 ${Math.max(row.projectSubmitCount, 1)} 版 · ${row.projectScore} 分`
                          : `已交 · 第 ${Math.max(row.projectSubmitCount, 1)} 版`
                      }
                      pendingLabel={row.projectStatus === 'draft' ? '草稿未交' : '未完成'}
                      registered={row.registered}
                      badge={row.projectNeedsRecheck ? '待复评' : undefined}
                    />
                  </td>
                  <td className="py-3 pr-4 font-serif">{row.overallScore ?? '—'}</td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    {formatDateTime(row.updatedAt)}
                  </td>
                  <td className="py-3">
                    {row.reportId ? (
                      <Link
                        href={`/teacher/${row.reportId}`}
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        查看与评价
                      </Link>
                    ) : row.registered ? (
                      <span className="text-xs text-muted-foreground">尚未提交</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">未注册</span>
                    )}
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

export default function TeacherPage() {
  return (
    <AppFrame>
      <TeacherContent />
    </AppFrame>
  )
}
