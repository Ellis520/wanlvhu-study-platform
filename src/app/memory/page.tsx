'use client'


import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ImagePlus,
  Loader2,
  MapPin,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { AppFrame, useSession } from '@/components/app-frame'
import { apiGet, apiSend } from '@/lib/client-api'
import { getSupabase } from '@/lib/supabase'
import { MEMORY_CARDS, TOTAL_CARDS, type MemoryCard } from '@/lib/memory-cards'


interface MemoryPhoto {
  fileId: string
  url: string | null
}


/** AI 给每站写的一句小结（序号对应站点 order） */
interface StationNote {
  order: number
  note: string
}


interface MemoryCheckin {
  card_id: string
  card_order: number
  reflection: string
  photos: MemoryPhoto[]
  updated_at: string
}


interface MemoryPayload {
  tripId: string
  tripTitle: string
  totalCards: number
  doneCount: number
  checkins: MemoryCheckin[]
}


const MAX_PHOTOS = 4


function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}


/** 带 token 的图片上传（FormData 不能走 JSON 封装的 apiSend） */
async function uploadPhoto(file: File): Promise<{ fileId: string; url: string | null }> {
  const { data } = await getSupabase().auth.getSession()
  const token = data.session?.access_token
  const form = new FormData()
  form.append('file', file)
  const response = await fetch('/api/memory/photos', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  })
  const text = await response.text()
  const payload = text ? (JSON.parse(text) as { fileId?: string; url?: string; error?: string }) : null
  if (!response.ok || !payload?.fileId) {
    throw new Error(payload?.error ?? `照片上传失败(${response.status})`)
  }
  return { fileId: payload.fileId, url: payload.url ?? null }
}


function CardMedia({ card }: { card: MemoryCard }) {
  return (
    <div
      className="relative h-28 w-full overflow-hidden rounded-t-lg sm:h-32"
      style={{ backgroundImage: card.gradient }}
    >
      <div className="absolute inset-0 flex items-end justify-between p-4">
        <div className="space-y-1">
          <p className="font-mono text-[11px] tracking-[0.28em] text-foreground/60">{card.day}</p>
          <p className="font-serif text-lg text-foreground/80">{card.kind}</p>
        </div>
        <p className="rounded-full border border-foreground/15 bg-background/60 px-2.5 py-1 text-[11px] tracking-wide text-foreground/70">
          {card.time}
        </p>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
    </div>
  )
}


function MemoryFlow() {
  const session = useSession()
  const [payload, setPayload] = useState<MemoryPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [reflection, setReflection] = useState('')
  const [photos, setPhotos] = useState<MemoryPhoto[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 末站「完成回顾」的 AI 总结面板 */
  const [journey, setJourney] = useState<{
    open: boolean
    text: string
    sites: StationNote[]
    streaming: boolean
    error: string
    published: boolean
    postId: string | null
    publishing: boolean
  }>({
    open: false,
    text: '',
    sites: [],
    streaming: false,
    error: '',
    published: false,
    postId: null,
    publishing: false,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cardTopRef = useRef<HTMLDivElement>(null)
  const journeyRef = useRef<HTMLDivElement>(null)

  const card = MEMORY_CARDS[index]
  const checkinMap = useMemo(() => {
    const map = new Map<string, MemoryCheckin>()
    for (const item of payload?.checkins ?? []) map.set(item.card_id, item)
    return map
  }, [payload])
  const current = checkinMap.get(card.id)
  const doneCount = payload?.doneCount ?? 0
  const isDone = Boolean(current && (current.reflection.trim() || current.photos.length > 0))

  /** 切卡：把库里已有的内容回填到草稿区 */
  const hydrate = useCallback(
    (targetIndex: number) => {
      const targetCard = MEMORY_CARDS[targetIndex]
      const saved = checkinMap.get(targetCard.id)
      setIndex(targetIndex)
      setReflection(saved?.reflection ?? '')
      setPhotos(saved?.photos ?? [])
      setError('')
      setNotice('')
    },
    [checkinMap],
  )

  useEffect(() => {
    let mounted = true
    apiGet<MemoryPayload>('/api/memory')
      .then((data) => {
        if (!mounted) return
        setPayload(data)
        const map = new Map(data.checkins.map((item) => [item.card_id, item]))
        const firstUndone = MEMORY_CARDS.findIndex((item) => {
          const saved = map.get(item.id)
          return !saved || (!saved.reflection.trim() && saved.photos.length === 0)
        })
        const start = firstUndone >= 0 ? firstUndone : 0
        setIndex(start)
        const saved = map.get(MEMORY_CARDS[start].id)
        setReflection(saved?.reflection ?? '')
        setPhotos(saved?.photos ?? [])
      })
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : '加载打卡记录失败')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const goTo = useCallback(
    (target: number) => {
      if (target < 0 || target >= TOTAL_CARDS) return
      hydrate(target)
      requestAnimationFrame(() => {
        cardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    [hydrate],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      if (event.key === 'ArrowRight') goTo(index + 1)
      if (event.key === 'ArrowLeft') goTo(index - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goTo, index])

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      const remaining = MAX_PHOTOS - photos.length
      if (remaining <= 0) {
        setError(`每站最多 ${MAX_PHOTOS} 张照片`)
        return
      }
      setUploading(true)
      setError('')
      try {
        const picked = Array.from(files).slice(0, remaining)
        const uploaded: MemoryPhoto[] = []
        for (const file of picked) {
          uploaded.push(await uploadPhoto(file))
        }
        setPhotos((prev) => [...prev, ...uploaded].slice(0, MAX_PHOTOS))
      } catch (err) {
        setError(err instanceof Error ? err.message : '照片上传失败')
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [photos.length],
  )

  const removePhoto = useCallback((fileId: string) => {
    setPhotos((prev) => prev.filter((item) => item.fileId !== fileId))
  }, [])

  const save = useCallback(async () => {
    if (!reflection.trim() && photos.length === 0) {
      setError('写一句当时的感受，或传一张照片，再打卡吧')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await apiSend<MemoryCheckin>('/api/memory', 'PUT', {
        cardId: card.id,
        reflection,
        photoFileIds: photos.map((item) => item.fileId),
      })
      setPayload((prev) => {
        if (!prev) return prev
        const rest = prev.checkins.filter((item) => item.card_id !== saved.card_id)
        const nextCheckins = [...rest, saved]
        const nextDone = nextCheckins.filter(
          (item) => item.reflection.trim().length > 0 || item.photos.length > 0,
        ).length
        return { ...prev, checkins: nextCheckins, doneCount: nextDone }
      })
      setNotice(index + 1 < TOTAL_CARDS ? '已打卡，前往下一站' : '已打卡，这一趟的回忆都留住了')
      if (index + 1 < TOTAL_CARDS) {
        window.setTimeout(() => goTo(index + 1), 520)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }, [card.id, goTo, index, photos, reflection])

  /** 末站：请 AI 把这一趟写成一段回顾（流式输出） */
  const startJourney = useCallback(async () => {
    setError('')
    setJourney({
      open: true,
      text: '',
      sites: [],
      streaming: true,
      error: '',
      published: false,
      postId: null,
      publishing: false,
    })
    requestAnimationFrame(() => {
      journeyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    try {
      const { data } = await getSupabase().auth.getSession()
      const token = data.session?.access_token
      const response = await fetch('/api/memory/journey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      })
      if (!response.ok || !response.body) {
        const raw = await response.text()
        let message = `生成失败(${response.status})`
        try {
          const parsed = JSON.parse(raw) as { error?: string }
          if (parsed?.error) message = parsed.error
        } catch {
          // 保留默认文案
        }
        throw new Error(message)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let collected = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) {
          const line = chunk.trim()
          if (!line.startsWith('data:')) continue
          const payload = JSON.parse(line.slice(5).trim()) as {
            type: string
            content?: string
            message?: string
            sites?: StationNote[]
          }
          if (payload.type === 'sites' && payload.sites) {
            setJourney((prev) => ({ ...prev, sites: payload.sites ?? [] }))
          }
          if (payload.type === 'delta' && payload.content) {
            collected += payload.content
            setJourney((prev) => ({ ...prev, text: collected }))
          }
          if (payload.type === 'error') throw new Error(payload.message ?? '生成失败')
        }
      }
      setJourney((prev) => ({ ...prev, text: collected, streaming: false }))
    } catch (err) {
      setJourney((prev) => ({
        ...prev,
        streaming: false,
        error: err instanceof Error ? err.message : '生成失败',
      }))
    }
  }, [])

  /** 把这段回顾发表到分享圈：所有同学与老师会看到一张小卡片 */
  const publishJourney = useCallback(async () => {
    setJourney((prev) => ({ ...prev, publishing: true, error: '' }))
    try {
      const result = await apiSend<{ postId: string | null; updated?: boolean }>(
        '/api/memory/journey/publish',
        'POST',
        {
          summary: journey.text,
          notes: journey.sites,
        },
      )
      setJourney((prev) => ({ ...prev, publishing: false, published: true, postId: result.postId }))
    } catch (err) {
      setJourney((prev) => ({
        ...prev,
        publishing: false,
        error: err instanceof Error ? err.message : '发表失败',
      }))
    }
  }, [journey.text, journey.sites])

  const progress = Math.round((doneCount / TOTAL_CARDS) * 100)

  return (
    <div className="space-y-8">
      <header className="space-y-4" ref={cardTopRef}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="font-mono text-[11px] tracking-[0.32em] text-muted-foreground">
              MEMORY · {session.trip.start_date.replaceAll('-', '.')} - {session.trip.end_date.replaceAll('-', '.')}
            </p>
            <h1 className="font-serif text-3xl leading-tight">回顾美好时刻</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              十二个站点，按两天走过的顺序排好。每一站停下来写几句、传一张照片，就是把这段路重新走一遍。
            </p>
          </div>
          <div className="text-right">
            <p className="font-serif text-3xl leading-none">
              {doneCount}
              <span className="text-base text-muted-foreground"> / {TOTAL_CARDS}</span>
            </p>
            <p className="mt-1 text-[11px] tracking-[0.2em] text-muted-foreground">已打卡站点</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%`, backgroundColor: 'var(--eco-edge)' }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MEMORY_CARDS.map((item, i) => {
              const saved = checkinMap.get(item.id)
              const filled = Boolean(saved && (saved.reflection.trim() || saved.photos.length > 0))
              const active = i === index
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goTo(i)}
                  title={`${item.day} ${item.title}`}
                  aria-label={`第 ${item.order} 站 ${item.title}`}
                  aria-current={active ? 'step' : undefined}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-md border px-2 font-mono text-[11px] transition-colors ${
                    active
                      ? 'border-transparent text-primary-foreground eco-btn-solid'
                      : filled
                        ? 'border-transparent text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                  style={!active && filled ? { backgroundColor: 'var(--eco-wash)' } : undefined}
                >
                  {filled && !active ? <Check className="h-3 w-3" /> : String(item.order).padStart(2, '0')}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="eco-card p-6" aria-busy="true">
          <div className="space-y-3">
            <div className="h-28 w-full animate-pulse rounded-md bg-muted" />
            <div className="h-6 w-2/3 animate-pulse rounded-sm bg-muted" />
            <div className="h-3 w-full animate-pulse rounded-sm bg-muted" />
            <div className="h-3 w-5/6 animate-pulse rounded-sm bg-muted" />
          </div>
        </div>
      ) : (
        <article key={card.id} className="memory-card-enter eco-card overflow-hidden">
          <CardMedia card={card} />

          <div className="space-y-6 p-5 sm:p-7">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] tracking-[0.18em] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {card.subtitle}
                </span>
                <span className="text-border">·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3 w-3" />
                  {card.day} {card.time}
                </span>
                {isDone ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-primary" style={{ backgroundColor: 'var(--eco-wash)' }}>
                    <Check className="h-3 w-3" />
                    已打卡 {current ? formatTime(current.updated_at) : ''}
                  </span>
                ) : null}
              </div>
              <h2 className="font-serif text-2xl leading-snug sm:text-[26px]">{card.title}</h2>
              <p className="text-sm italic leading-relaxed text-muted-foreground">「{card.scene}」</p>
            </div>

            <div className="eco-rule-t pt-5">
              <p className="text-sm leading-relaxed">
                <span className="mr-1.5 font-serif text-primary">{String(card.order).padStart(2, '0')}.</span>
                {card.prompt}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {card.shots.map((shot, i) => (
                <div
                  key={shot}
                  className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2.5"
                >
                  <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="mr-1 font-mono text-[10px] text-foreground/50">0{i + 1}</span>
                    {shot}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="reflection" className="text-sm font-medium">
                  这一刻的你
                </label>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {reflection.replace(/\s/g, '').length} 字
                </span>
              </div>
              <textarea
                id="reflection"
                value={reflection}
                onChange={(event) => setReflection(event.target.value)}
                rows={5}
                className="w-full resize-y rounded-md border border-border bg-background/70 px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-primary/60"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">分享的照片</p>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {photos.length} / {MAX_PHOTOS}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {photos.map((photo) => (
                  <div
                    key={photo.fileId}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                  >
                    {photo.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.url}
                        alt={`${card.title} 打卡照片`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Camera className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.fileId)}
                      aria-label="移除这张照片"
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/85 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {photos.length < MAX_PHOTOS ? (
                  <label
                    className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground ${
                      uploading ? 'pointer-events-none opacity-60' : ''
                    }`}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    <span className="text-[11px]">{uploading ? '上传中' : '添加照片'}</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        void handleFiles(event.target.files)
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                单张不超过 10MB，最多 {MAX_PHOTOS} 张。照片保存在平台对象存储，只有你自己能看到。
              </p>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {notice ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {notice}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-border/70 pt-5">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || uploading}
                className="eco-btn-solid inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {isDone ? '更新这一站' : '打卡这一站'}
              </button>
              {index + 1 < TOTAL_CARDS ? (
                <button
                  type="button"
                  onClick={() => goTo(index + 1)}
                  className="eco-btn-outline inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-foreground"
                >
                  下一站
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startJourney()}
                  disabled={journey.streaming || doneCount === 0}
                  className="eco-btn-solid inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-primary-foreground transition-opacity disabled:opacity-50"
                >
                  {journey.streaming ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BookOpen className="h-3.5 w-3.5" />
                  )}
                  完成回顾
                </button>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => goTo(index - 1)}
                  disabled={index === 0}
                  aria-label="上一站"
                  className="eco-btn-outline flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {String(card.order).padStart(2, '0')} / {TOTAL_CARDS}
                </span>
              </div>
            </div>
          </div>
        </article>
      )}

      {journey.open ? (
        <section ref={journeyRef} className="eco-card p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1.5">
              <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground">JOURNEY</p>
              <h2 className="font-serif text-2xl leading-snug">这一趟，你走过的地方</h2>
              <p className="text-xs text-muted-foreground">
                依你写下的 {doneCount} 站记录，把这两天重新连成一段话。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setJourney((prev) => ({ ...prev, open: false }))}
              aria-label="收起这段回顾"
              className="eco-btn-outline flex h-8 w-8 items-center justify-center rounded-md"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="eco-rule-t mt-5 pt-5">
            {journey.text ? (
              <div className="space-y-4 font-serif text-[15px] leading-8 text-foreground/90">
                {journey.text.split(/\n{2,}/).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
                {journey.streaming ? (
                  <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary align-middle" />
                ) : null}
              </div>
            ) : (
              <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {journey.error ? journey.error : '正在把这两天的记录读一遍…'}
              </p>
            )}
          </div>

          {journey.error && journey.text ? (
            <p className="mt-4 text-sm text-destructive">{journey.error}</p>
          ) : null}



          {!journey.streaming && journey.text && !journey.published ? (
            <div className="mt-6 space-y-3 border-t border-border/70 pt-5">
              <p className="text-sm leading-relaxed">
                想把这段回顾放到分享圈吗？所有同学和老师都会看到，点开就是你这十二站的记录。
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={() => void publishJourney()}
                  disabled={journey.publishing}
                  className="eco-btn-solid inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-60"
                >
                  {journey.publishing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  发表在分享圈
                </button>
                <button
                  type="button"
                  onClick={() => setJourney((prev) => ({ ...prev, open: false }))}
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  先不发，留给自己
                </button>
                <button
                  type="button"
                  onClick={() => void startJourney()}
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  换一段重写
                </button>
              </div>
            </div>
          ) : null}

          {journey.published ? (
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/70 pt-5">
              <p className="inline-flex items-center gap-1.5 text-sm text-primary">
                <Check className="h-4 w-4" />
                已发表在分享圈，同学和老师都能看到了
              </p>
              <Link href="/feed" className="eco-btn-outline rounded-md px-3 py-1.5 text-xs">
                去分享圈看看
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="eco-card p-5">
        <p className="font-serif text-sm">这一趟的站点</p>
        <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {MEMORY_CARDS.map((item, i) => {
            const saved = checkinMap.get(item.id)
            const filled = Boolean(saved && (saved.reflection.trim() || saved.photos.length > 0))
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(i)}
                className={`flex items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs transition-colors ${
                  i === index ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border font-mono text-[9px] ${
                    filled ? 'border-transparent text-primary-foreground' : 'border-border'
                  }`}
                  style={filled ? { backgroundColor: 'var(--eco-edge)' } : undefined}
                >
                  {filled ? <Check className="h-2.5 w-2.5" /> : item.order}
                </span>
                <span className="truncate">
                  {item.day} · {item.title}
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}


export default function MemoryPage() {
  return (
    <AppFrame>
      <MemoryFlow />
    </AppFrame>
  )
}
