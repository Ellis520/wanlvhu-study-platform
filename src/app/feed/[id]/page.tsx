'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ChevronLeft, Images, Loader2 } from 'lucide-react'
import { AppFrame } from '@/components/app-frame'
import { apiGet } from '@/lib/client-api'
import { formatTime, initialOf } from '@/lib/feed-format'
import type { FeedJourney, FeedMedia, FeedPost } from '@/lib/feed-types'

interface JourneyPayload {
  post: FeedPost | null
  journey: FeedJourney | null
}

/**
 * 每站照片按张数换排版，一律不裁图：
 * 一张按自然比例立在中间（竖图不会拉成横条），多张走等比方格、图完整居中。
 */
function StationPhotos({ photos, title }: { photos: FeedMedia[]; title: string }) {
  const visible = photos.filter((photo) => photo.url)
  if (visible.length === 0) return null

  const count = visible.length

  if (count === 1) {
    return (
      <figure className="mt-4 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={visible[0].url ?? ''}
          alt={`${title}的照片`}
          loading="lazy"
          className="mx-auto h-auto max-h-[420px] w-auto max-w-full rounded-sm border border-border object-contain"
        />
      </figure>
    )
  }

  const columns = count === 3 ? 'grid-cols-3' : 'grid-cols-2'
  const ratio = count === 2 ? 'aspect-[4/3]' : 'aspect-square'
  return (
    <div className={`mt-4 grid gap-2 ${columns}`}>
      {visible.map((photo) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo.fileId}
          src={photo.url ?? ''}
          alt={`${title}的照片`}
          loading="lazy"
          className={`${ratio} w-full rounded-sm border border-border bg-muted/40 object-contain`}
        />
      ))}
    </div>
  )
}

function JourneyDetail() {
  const params = useParams<{ id: string }>()
  const postId = typeof params?.id === 'string' ? params.id : ''
  const [payload, setPayload] = useState<JourneyPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!postId) return
    let mounted = true
    apiGet<JourneyPayload>(`/api/feed/${postId}`)
      .then((data) => {
        if (mounted) setPayload(data)
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
  }, [postId])

  const post = payload?.post ?? null
  const journey = payload?.journey ?? null

  return (
    <div className="space-y-8">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        回到分享圈
      </Link>

      {loading ? (
        <div className="eco-card p-6" aria-busy="true">
          <div className="space-y-3">
            <div className="h-4 w-24 animate-pulse rounded-sm bg-muted" />
            <div className="h-8 w-2/3 animate-pulse rounded-sm bg-muted" />
            <div className="h-3 w-full animate-pulse rounded-sm bg-muted" />
            <div className="h-3 w-5/6 animate-pulse rounded-sm bg-muted" />
          </div>
        </div>
      ) : error ? (
        <div className="eco-card p-6">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : !post || !journey ? (
        <div className="eco-card p-6">
          <p className="text-sm text-muted-foreground">这条内容不存在，或者已经被作者删除了。</p>
        </div>
      ) : (
        <>
          <header className="space-y-4">
            <div className="flex items-center gap-2.5">
              {post.author_avatar ? (
                <img
                  src={post.author_avatar}
                  alt={`${post.author}的头像`}
                  className="h-9 w-9 shrink-0 rounded-sm border border-border object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/50 font-serif text-sm"
                >
                  {initialOf(post.author)}
                </span>
              )}
              <div>
                <p className="text-sm leading-tight">{post.author}</p>
                <p className="mt-0.5 text-[11px] tracking-[0.12em] text-muted-foreground">
                  {formatTime(post.created_at)}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="font-mono text-[11px] tracking-[0.32em] text-muted-foreground">JOURNEY</p>
              <h1 className="font-serif text-3xl leading-tight">
                {journey.title || '欢迎来看看我的研学之旅'}
              </h1>
              <p className="text-xs tracking-[0.12em] text-muted-foreground">
                {journey.stationCount} 站 · 两天的记录连成一段话
              </p>
            </div>
          </header>

          <section className="eco-card p-6 sm:p-8">
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground">回顾</p>
            <div className="mt-4 space-y-4 font-serif text-[15px] leading-8 text-foreground/90">
              {journey.summary
                .split(/\n{2,}/)
                .filter((paragraph) => paragraph.trim())
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-border pb-2">
              <h2 className="font-serif text-lg">一路上的十二站</h2>
              <p className="font-mono text-[11px] text-muted-foreground">{journey.stationCount} / 12</p>
            </div>

            {journey.cards.map((card) => (
              <article key={`${card.order}-${card.title}`} className="eco-card p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[11px] text-primary">
                    {String(card.order).padStart(2, '0')}
                  </span>
                  <h3 className="font-serif text-base leading-snug">{card.title}</h3>
                  <span className="ml-auto text-[11px] tracking-[0.12em] text-muted-foreground">
                    {card.day} {card.time}
                  </span>
                </div>

                {card.note ? (
                  <p className="mt-3 border-l-2 border-primary/35 pl-3 font-serif text-[15px] leading-7 text-foreground/90">
                    <span className="mr-1.5 align-middle font-mono text-[10px] tracking-[0.18em] text-primary">
                      AI
                    </span>
                    {card.note}
                  </p>
                ) : null}

                {card.reflection ? (
                  <p className="mt-3 whitespace-pre-wrap border-l-2 border-border pl-3 text-sm leading-7 text-foreground/80">
                    {card.reflection}
                  </p>
                ) : null}

                <StationPhotos photos={card.photos} title={card.title} />
              </article>
            ))}
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
            <p className="inline-flex items-center gap-1.5">
              <Images className="h-3.5 w-3.5" />
              照片保存在平台对象存储，链接有时效
            </p>
            <Link href="/feed" className="eco-btn-outline rounded-md px-3 py-1.5">
              回到分享圈
            </Link>
          </section>
        </>
      )}
    </div>
  )
}

export default function JourneyPage() {
  return (
    <AppFrame>
      <JourneyDetail />
    </AppFrame>
  )
}
