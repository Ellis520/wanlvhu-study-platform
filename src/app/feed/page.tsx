'use client'


import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AppFrame } from '@/components/app-frame'
import { FeedComposer } from '@/components/feed/feed-composer'
import { PostCard } from '@/components/feed/post-card'
import { apiGet } from '@/lib/client-api'
import type { FeedPage, FeedPost, FeedScope } from '@/lib/feed-types'


const SCOPES: { value: FeedScope; label: string; hint: string }[] = [
  { value: 'all', label: '全部', hint: '所有同学与老师的动态' },
  { value: 'mine', label: '我的', hint: '自己发过的内容' },
  { value: 'favored', label: '收藏', hint: '你夹在册子里的那几张' },
]


function FeedBoard() {
  const [scope, setScope] = useState<FeedScope>('all')
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const load = useCallback(async (nextScope: FeedScope) => {
    const current = requestId.current + 1
    requestId.current = current
    setLoading(true)
    setError('')
    try {
      const data = await apiGet<FeedPage>(`/api/feed?scope=${nextScope}`)
      if (requestId.current !== current) return
      setPosts(data.posts)
      setCursor(data.nextCursor)
      setHasMore(data.hasMore)
    } catch (err) {
      if (requestId.current !== current) return
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      if (requestId.current === current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(scope)
  }, [load, scope])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const data = await apiGet<FeedPage>(`/api/feed?scope=${scope}&cursor=${encodeURIComponent(cursor)}`)
      setPosts((prev) => {
        const seen = new Set(prev.map((item) => item.id))
        return [...prev, ...data.posts.filter((item) => !seen.has(item.id))]
      })
      setCursor(data.nextCursor)
      setHasMore(data.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载更多失败')
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, scope])

  const patchPost = useCallback((id: string, patch: Partial<FeedPost>) => {
    setPosts((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const removePost = useCallback((id: string) => {
    setPosts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const created = useCallback(
    (post: FeedPost) => {
      if (scope === 'favored') {
        setScope('all')
        return
      }
      setPosts((prev) => [post, ...prev.filter((item) => item.id !== post.id)])
    },
    [scope],
  )

  const activeHint = SCOPES.find((item) => item.value === scope)?.hint ?? ''

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] tracking-[0.28em] text-muted-foreground">分享圈 · 同一张小桌</p>
        <h1 className="font-serif text-[26px] leading-tight sm:text-[30px]">
          把今天拍到的放到这张桌上
        </h1>
      </header>

      <FeedComposer onCreated={created} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <div className="flex items-center gap-5">
            {SCOPES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setScope(item.value)}
                className={`relative pb-1 text-sm transition-colors ${
                  scope === item.value
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
                <span
                  className={`absolute -bottom-[9px] left-0 h-px w-full transition-opacity ${
                    scope === item.value ? 'bg-primary opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            ))}
          </div>
          <p className="text-[11px] tracking-[0.12em] text-muted-foreground">{activeHint}</p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="eco-card space-y-3 p-5">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 animate-pulse rounded-sm bg-muted" />
                  <div className="space-y-1.5">
                    <div className="h-3 w-24 animate-pulse rounded-sm bg-muted" />
                    <div className="h-2.5 w-16 animate-pulse rounded-sm bg-muted" />
                  </div>
                </div>
                <div className="h-3 w-full animate-pulse rounded-sm bg-muted" />
                <div className="h-3 w-3/4 animate-pulse rounded-sm bg-muted" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="eco-card px-5 py-12 text-center">
            <p className="font-serif text-base">这一页还是空的</p>
            <p className="mt-2 font-sans text-sm text-muted-foreground">
              {scope === 'mine'
                ? '你还没发过内容，先写一句湖边看到的东西。'
                : scope === 'favored'
                  ? '还没有收藏，看到想留住的动态点一下收藏。'
                  : '还没有人发布，第一条留给你。'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onPatch={patchPost} onRemove={removePost} />
            ))}
          </div>
        )}

        {!loading && hasMore ? (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="eco-btn-outline flex items-center gap-1.5 rounded-md px-4 py-2 text-sm text-foreground disabled:opacity-60"
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              再看前一页
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}


export default function FeedPageRoute() {
  return (
    <AppFrame>
      <FeedBoard />
    </AppFrame>
  )
}
