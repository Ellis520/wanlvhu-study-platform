'use client'


import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import {
  ChevronRight,
  Loader2,
  MessageCircle,
  Play,
  Send,
  Star,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react'
import { apiSend } from '@/lib/client-api'
import { formatTime, initialOf } from '@/lib/feed-format'
import { MAX_COMMENT, type FeedComment, type FeedPost } from '@/lib/feed-types'


interface PostCardProps {
  post: FeedPost
  onPatch: (id: string, patch: Partial<FeedPost>) => void
  onRemove: (id: string) => void
}


export function PostCard({ post, onPatch, onRemove }: PostCardProps) {
  const [showComments, setShowComments] = useState(post.comments.length > 0)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<number | null>(null)

  const images = useMemo(
    () => post.media.filter((item) => item.type === 'image' && item.url),
    [post.media],
  )
  const video = useMemo(
    () => post.media.find((item) => item.type === 'video' && item.url) ?? null,
    [post.media],
  )

  const run = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusy(key)
      setError('')
      try {
        await action()
      } catch (err) {
        setError(err instanceof Error ? err.message : '操作失败，请稍后重试')
      } finally {
        setBusy('')
      }
    },
    [],
  )

  const toggleLike = useCallback(() => {
    void run('like', async () => {
      if (post.liked) {
        await apiSend(`/api/feed/likes?postId=${post.id}`, 'DELETE')
        onPatch(post.id, { liked: false, like_count: Math.max(0, post.like_count - 1) })
      } else {
        await apiSend('/api/feed/likes', 'POST', { postId: post.id })
        onPatch(post.id, { liked: true, like_count: post.like_count + 1 })
      }
    })
  }, [onPatch, post.id, post.like_count, post.liked, run])

  const toggleFavorite = useCallback(() => {
    void run('fav', async () => {
      if (post.favored) {
        await apiSend(`/api/feed/favorites?postId=${post.id}`, 'DELETE')
        onPatch(post.id, { favored: false })
      } else {
        await apiSend('/api/feed/favorites', 'POST', { postId: post.id })
        onPatch(post.id, { favored: true })
      }
    })
  }, [onPatch, post.favored, post.id, run])

  const submitComment = useCallback(() => {
    const content = draft.trim()
    if (!content) return
    void run('comment', async () => {
      const data = await apiSend<{ comment: FeedComment }>('/api/feed/comments', 'POST', {
        postId: post.id,
        content,
      })
      onPatch(post.id, { comments: [...post.comments, data.comment] })
      setDraft('')
      setShowComments(true)
    })
  }, [draft, onPatch, post.comments, post.id, run])

  const deleteComment = useCallback(
    (commentId: string) => {
      void run(`comment-${commentId}`, async () => {
        await apiSend(`/api/feed/comments?commentId=${commentId}`, 'DELETE')
        onPatch(post.id, { comments: post.comments.filter((item) => item.id !== commentId) })
      })
    },
    [onPatch, post.comments, post.id, run],
  )

  const deletePost = useCallback(() => {
    if (!window.confirm('删除后这段话和照片都不再出现在分享圈，确定删除吗？')) return
    void run('delete', async () => {
      await apiSend(`/api/feed?postId=${post.id}`, 'DELETE')
      onRemove(post.id)
    })
  }, [onRemove, post.id, run])

  return (
    <article className="eco-card p-5 sm:p-6">
      <header className="flex items-start gap-3">
        {post.author_avatar ? (
          <img
            src={post.author_avatar}
            alt={`${post.author}的头像`}
            className="h-9 w-9 shrink-0 rounded-sm border border-border object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/50 font-serif text-sm text-foreground"
          >
            {initialOf(post.author)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-sm leading-tight">{post.author}</p>
            {post.author_role === 'teacher' ? (
              <span className="border border-border px-1.5 py-px text-[10px] tracking-[0.2em] text-muted-foreground">
                教师
              </span>
            ) : null}
            {post.mine ? (
              <span className="text-[10px] tracking-[0.2em] text-muted-foreground">我的</span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] tracking-[0.12em] text-muted-foreground">
            {formatTime(post.created_at)}
          </p>
        </div>
        {post.mine ? (
          <button
            type="button"
            onClick={deletePost}
            disabled={busy === 'delete'}
            className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
            aria-label="删除这条动态"
          >
            {busy === 'delete' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </header>

      {post.journey ? (
        <Link
          href={`/feed/${post.id}`}
          className="mt-4 flex items-stretch gap-4 overflow-hidden rounded-sm border border-border bg-muted/20 p-3 transition-colors hover:border-primary/50"
        >
          {post.journey.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.journey.coverUrl}
              alt=""
              loading="lazy"
              className="h-20 w-24 shrink-0 rounded-sm object-cover"
            />
          ) : (
            <span className="flex h-20 w-24 shrink-0 items-center justify-center rounded-sm border border-border bg-background font-serif text-2xl text-muted-foreground">
              旅
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[10px] tracking-[0.24em] text-muted-foreground">
              JOURNEY
            </span>
            <span className="mt-1 block font-serif text-base leading-snug">
              {post.journey.title}
            </span>
            <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
              {post.journey.preview || `${post.journey.stationCount} 站的记录都在里面`}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end justify-between">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-[10px] text-muted-foreground">
              {post.journey.stationCount} 站
            </span>
          </span>
        </Link>
      ) : post.content ? (
        <p className="mt-4 whitespace-pre-wrap font-sans text-[15px] leading-8 text-foreground">
          {post.content}
        </p>
      ) : null}

      {video?.url ? (
        <div className="mt-4 overflow-hidden rounded-sm border border-border bg-black/85">
          <video
            src={video.url}
            controls
            playsInline
            preload="metadata"
            className="max-h-[460px] w-full"
          />
        </div>
      ) : null}

      {images.length > 0 ? (
        <div
          className={`mt-4 grid gap-1.5 ${
            images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
          }`}
        >
          {images.map((item, index) => (
            <button
              key={item.fileId}
              type="button"
              onClick={() => setLightbox(index)}
              className={`group relative overflow-hidden rounded-sm border border-border bg-muted/40 ${
                images.length === 1 ? 'aspect-[4/3]' : 'aspect-square'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url ?? ''}
                alt={`${post.author}发布的照片 ${index + 1}`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-1 border-t border-border pt-3">
        <ActionButton
          active={post.liked}
          onClick={toggleLike}
          busy={busy === 'like'}
          icon={<ThumbsUp className="h-4 w-4" />}
          label={post.like_count > 0 ? String(post.like_count) : '点赞'}
          activeLabel={post.like_count > 0 ? String(post.like_count) : '已赞'}
        />
        <ActionButton
          active={showComments}
          onClick={() => setShowComments((value) => !value)}
          busy={false}
          icon={<MessageCircle className="h-4 w-4" />}
          label={post.comments.length > 0 ? String(post.comments.length) : '评论'}
          activeLabel={post.comments.length > 0 ? String(post.comments.length) : '收起'}
        />
        <ActionButton
          active={post.favored}
          onClick={toggleFavorite}
          busy={busy === 'fav'}
          icon={<Star className="h-4 w-4" />}
          label={post.favored ? '已收藏' : '收藏'}
          activeLabel="已收藏"
        />
      </div>

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      {showComments ? (
        <div className="mt-3 rounded-sm bg-muted/30 p-3">
          {post.comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">还没有人说话，第一句留给你。</p>
          ) : (
            <ul className="space-y-2">
              {post.comments.map((comment) => (
                <li key={comment.id} className="flex items-start gap-2 text-[13px] leading-6">
                  <span className="shrink-0 text-muted-foreground">{comment.author}：</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground">
                    {comment.content}
                  </span>
                  {comment.mine || post.mine ? (
                    <button
                      type="button"
                      onClick={() => deleteComment(comment.id)}
                      disabled={busy === `comment-${comment.id}`}
                      className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                      aria-label="删除这条评论"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, MAX_COMMENT))}
              rows={1}
              aria-label="写评论"
              className="min-h-9 flex-1 resize-none rounded-sm border border-border bg-card px-2.5 py-2 font-sans text-[13px] leading-5 outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={submitComment}
              disabled={busy === 'comment' || draft.trim().length === 0}
              className="eco-btn-outline flex h-9 items-center gap-1 rounded-sm px-2.5 text-xs text-foreground disabled:opacity-50"
            >
              {busy === 'comment' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              发送
            </button>
          </div>
        </div>
      ) : null}

      {lightbox !== null && images[lightbox]?.url ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-4 print:hidden"
          role="presentation"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 rounded-sm p-2 text-background/80 transition-colors hover:text-background"
            aria-label="关闭大图"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[lightbox].url ?? ''}
            alt="查看大图"
            className="max-h-full max-w-full rounded-sm object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </article>
  )
}


function ActionButton({
  active,
  busy,
  icon,
  label,
  activeLabel,
  onClick,
}: {
  active: boolean
  busy: boolean
  icon: React.ReactNode
  label: string
  activeLabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs transition-colors disabled:opacity-60 ${
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
      aria-pressed={active}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {active ? activeLabel : label}
    </button>
  )
}
