'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AppFrame, useSession } from '@/components/app-frame'
import { apiGet, apiSend } from '@/lib/client-api'
import { STAGES, countChars, type Answers, type StageKey } from '@/lib/study-trip'

interface RecordsPayload {
  tripId: string
  records: { stage: string; answers: Answers; updated_at: string }[]
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function formatTime(iso: string): string {
  const date = new Date(iso)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function RecordContent() {
  const session = useSession()
  const [stage, setStage] = useState<StageKey>('before')
  const [answersMap, setAnswersMap] = useState<Record<string, Answers>>({
    before: {},
    during: {},
    after: {},
  })
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState<string>('')
  const [error, setError] = useState('')
  const loadedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const queryStage = params.get('stage')
    if (queryStage === 'during' || queryStage === 'after' || queryStage === 'before') {
      setStage(queryStage)
    }
  }, [])

  useEffect(() => {
    apiGet<RecordsPayload>('/api/records')
      .then((data) => {
        const next: Record<string, Answers> = { before: {}, during: {}, after: {} }
        for (const record of data.records ?? []) {
          next[record.stage] = record.answers ?? {}
        }
        setAnswersMap(next)
        loadedRef.current = true
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载记录失败')
        setLoading(false)
      })
  }, [])

  const persist = useCallback(
    async (targetStage: StageKey, answers: Answers) => {
      setSaveState('saving')
      try {
        await apiSend('/api/records', 'PUT', { stage: targetStage, answers })
        setSaveState('saved')
        setSavedAt(formatTime(new Date().toISOString()))
      } catch (err) {
        setSaveState('error')
        setError(err instanceof Error ? err.message : '保存失败')
      }
    },
    [],
  )

  const currentAnswers = answersMap[stage] ?? {}
  const currentStageDef = STAGES.find((item) => item.key === stage) ?? STAGES[0]

  const handleChange = (key: string, value: string) => {
    setAnswersMap((prev) => {
      const next = { ...prev, [stage]: { ...(prev[stage] ?? {}), [key]: value } }
      if (loadedRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current)
        setSaveState('saving')
        timerRef.current = setTimeout(() => {
          void persist(stage, next[stage] ?? {})
        }, 1200)
      }
      return next
    })
  }

  const stageStats = useMemo(
    () =>
      STAGES.map((item) => {
        const answers = answersMap[item.key] ?? {}
        const filled = item.fields.filter((field) => countChars(answers[field.key]) >= 10).length
        return { key: item.key, filled, total: item.fields.length }
      }),
    [answersMap],
  )

  const saveLabel =
    saveState === 'saving'
      ? '保存中…'
      : saveState === 'saved'
        ? `已保存 · ${savedAt}`
        : saveState === 'error'
          ? '保存失败'
          : '自动保存已开启'

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-serif text-3xl tracking-tight">过程记录</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          按时间顺序把关键点写下来。写不完整没关系，先写你真正看到和想到的；系统会在你停笔约 1 秒后自动保存。
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-3">
        <div className="flex flex-wrap gap-6">
          {STAGES.map((item) => {
            const stat = stageStats.find((entry) => entry.key === item.key)
            const active = item.key === stage
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setStage(item.key)}
                className={`relative pb-1 text-sm transition-colors ${
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.title}
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  {stat?.filled}/{stat?.total}
                </span>
                <span
                  className={`absolute -bottom-[13px] left-0 h-px w-full ${
                    active ? 'bg-primary' : 'bg-transparent'
                  }`}
                />
              </button>
            )
          })}
        </div>
        <span
          className={`text-[11px] tracking-wide ${
            saveState === 'error' ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          {saveLabel}
        </span>
      </div>

      <section>
        <div className="border-l-2 border-primary/40 pl-4">
          <h2 className="font-serif text-xl">{currentStageDef.title}</h2>
          <p className="mt-1 text-xs tracking-wide text-muted-foreground">
            {currentStageDef.window}
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-foreground/80">
            {currentStageDef.intro}
          </p>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <div className="space-y-6" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="space-y-2">
              <div className="h-4 w-40 animate-pulse rounded-sm bg-muted" />
              <div className="h-24 w-full animate-pulse rounded-md bg-muted/70" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-9">
          {currentStageDef.fields.map((field, index) => {
            const value = currentAnswers[field.key] ?? ''
            return (
              <div key={field.key} className="eco-rule-t pt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[11px] tracking-[0.2em] text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <label
                      htmlFor={field.key}
                      className="font-serif text-lg leading-snug"
                    >
                      {field.label}
                    </label>
                    {field.required ? (
                      <span className="text-[11px] tracking-wide text-primary">必填</span>
                    ) : (
                      <span className="text-[11px] tracking-wide text-muted-foreground">选填</span>
                    )}
                  </div>
                  {field.time ? (
                    <span className="text-[11px] tracking-wider text-muted-foreground">
                      {field.time}
                      {field.place ? ` · ${field.place}` : ''}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                  {field.hint}
                </p>

                <textarea
                  id={field.key}
                  value={value}
                  onChange={(event) => handleChange(field.key, event.target.value)}
                  rows={field.rows}
                  className="mt-3 w-full resize-y rounded-md border border-input bg-card px-3.5 py-3 text-sm leading-7 outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <div className="mt-1.5 flex justify-end">
                  <span className="text-[11px] text-muted-foreground">
                    {countChars(value)} 字
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="eco-rule-t flex flex-wrap items-center justify-between gap-4 pt-6">
        <p className="text-xs text-muted-foreground">
          {stage === 'before'
            ? '写完这一步，就可以出发了。'
            : stage === 'during'
              ? '现场能记多少记多少，回程再补细节。'
              : '整理成文后，去报告页汇总并提交。'}
        </p>
        <Link
          href="/report"
          className="eco-btn-outline rounded-md px-4 py-2 text-sm"
        >
          去汇总报告 →
        </Link>
      </div>
    </div>
  )
}

export default function RecordPage() {
  return (
    <AppFrame>
      <RecordContent />
    </AppFrame>
  )
}
