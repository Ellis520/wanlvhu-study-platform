import { getStorage } from '@/lib/storage'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  JOURNEY_TITLE,
  MAX_MEDIA,
  type FeedComment,
  type FeedJourney,
  type FeedJourneyCard,
  type FeedJourneySummary,
  type FeedMedia,
  type FeedPost,
} from '@/lib/feed-types'
import { resolveAvatarUrl } from '@/lib/server-avatar'



export const MEDIA_URL_TTL = 60 * 60 * 12
export const FEED_PAGE_SIZE = 12

export { MAX_CONTENT, MAX_MEDIA, MAX_COMMENT, MAX_IMAGE_SIZE, MAX_VIDEO_SIZE } from '@/lib/feed-types'
export type { FeedComment, FeedMedia, FeedPage, FeedPost, FeedScope } from '@/lib/feed-types'


/** 把库里的媒体数组转成带期限的访问链接（链接不落库） */
export async function resolveMediaUrls(media: unknown): Promise<FeedMedia[]> {
  if (!Array.isArray(media)) return []
  const rows = media
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      fileId: typeof item.fileId === 'string' ? item.fileId : '',
      type: item.type === 'video' ? ('video' as const) : ('image' as const),
    }))
    .filter((item) => item.fileId.length > 0)

  return Promise.all(
    rows.map(async (item) => {
      try {
        const file = await getStorage().getFile({ fileId: item.fileId, expiresInSeconds: MEDIA_URL_TTL })
        return { ...item, url: file.url }
      } catch {
        return { ...item, url: null }
      }
    }),
  )
}


/** 一个 fileId 的临时访问链接；失败返回 null，不让整页报错 */
async function signedUrl(fileId: string): Promise<string | null> {
  try {
    const file = await getStorage().getFile({ fileId, expiresInSeconds: MEDIA_URL_TTL })
    return file.url
  } catch {
    return null
  }
}


/** 取 AI 总结的第一句，作为卡片预览 */
function firstSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^.{0,60}?[。！？!?]/)
  return (match ? match[0] : trimmed.slice(0, 60)).trim()
}


interface RawJourney {
  title?: unknown
  summary?: unknown
  cards?: unknown
}

function readJourney(raw: unknown): RawJourney | null {
  if (!raw || typeof raw !== 'object') return null
  const snapshot = raw as RawJourney
  if (!Array.isArray(snapshot.cards)) return null
  return snapshot
}


/** 列表用：只取封面与概况，避免为每条动态解析几十张照片 */
export async function summarizeJourney(raw: unknown): Promise<FeedJourneySummary | null> {
  const snapshot = readJourney(raw)
  if (!snapshot) return null
  const cards = (snapshot.cards ?? []) as Record<string, unknown>[]
  let coverFileId = ''
  for (const card of cards) {
    const photos = Array.isArray(card.photos) ? card.photos : []
    const first = photos.find((item): item is string => typeof item === 'string' && item.length > 0)
    if (first) {
      coverFileId = first
      break
    }
  }
  return {
    title: typeof snapshot.title === 'string' && snapshot.title ? snapshot.title : JOURNEY_TITLE,
    stationCount: cards.length,
    preview: firstSentence(typeof snapshot.summary === 'string' ? snapshot.summary : ''),
    coverUrl: coverFileId ? await signedUrl(coverFileId) : null,
  }
}


/** 详情用：展开 12 站感悟与照片链接 */
export async function buildJourney(raw: unknown): Promise<FeedJourney | null> {
  const summary = await summarizeJourney(raw)
  if (!summary) return null
  const snapshot = readJourney(raw) as RawJourney
  const rawCards = (snapshot.cards ?? []) as Record<string, unknown>[]

  const cards: FeedJourneyCard[] = await Promise.all(
    rawCards.map(async (card) => {
      const photos = (Array.isArray(card.photos) ? card.photos : [])
        .filter((item): item is string => typeof item === 'string' && item.length > 0)
        .slice(0, 4)
      const resolved: FeedMedia[] = await Promise.all(
        photos.map(async (fileId) => ({ fileId, type: 'image' as const, url: await signedUrl(fileId) })),
      )
      return {
        order: typeof card.order === 'number' ? card.order : 0,
        title: typeof card.title === 'string' ? card.title : '',
        day: typeof card.day === 'string' ? card.day : '',
        time: typeof card.time === 'string' ? card.time : '',
        note: typeof card.note === 'string' ? card.note : '',
        reflection: typeof card.reflection === 'string' ? card.reflection : '',
        photos: resolved,
      }
    }),
  )

  return {
    ...summary,
    summary: typeof snapshot.summary === 'string' ? snapshot.summary : '',
    cards,
  }
}


/** 敏感词/空内容兜底：只做长度与空白校验，不做内容审查 */
export function normalizeMedia(input: unknown): { fileId: string; type: 'image' | 'video' }[] {
  if (!Array.isArray(input)) return []
  const items = input
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      fileId: typeof item.fileId === 'string' ? item.fileId.trim() : '',
      type: item.type === 'video' ? ('video' as const) : ('image' as const),
    }))
    .filter((item) => item.fileId.length > 0)
  const videos = items.filter((item) => item.type === 'video')
  const images = items.filter((item) => item.type === 'image')
  // 视频最多 1 段，图片最多 9 张，合计不超过 9 个媒体
  return [...videos.slice(0, 1), ...images.slice(0, MAX_MEDIA - Math.min(videos.length, 1))].slice(
    0,
    MAX_MEDIA,
  )
}


/**
 * 组装动态列表：一次批量补齐作者、点赞、收藏、评论，避免 N+1。
 * 可见性由 RLS 决定，这里只做展示层的聚合。
 */
export async function buildFeed(
  supabase: SupabaseClient,
  meId: string,
  rows: Record<string, unknown>[],
): Promise<FeedPost[]> {
  if (rows.length === 0) return []

  const postIds = rows.map((row) => row.id as string)
  const authorIds = Array.from(new Set(rows.map((row) => row.user_id as string)))

  const [likesResult, favoritesResult, commentsResult] = await Promise.all([
    supabase.from('post_likes').select('post_id, user_id').in('post_id', postIds),
    supabase.from('post_favorites').select('post_id, user_id').eq('user_id', meId).in('post_id', postIds),
    supabase
      .from('post_comments')
      .select('id, post_id, user_id, content, created_at')
      .in('post_id', postIds)
      .order('created_at', { ascending: true }),
  ])

  if (likesResult.error) throw new Error(`读取点赞失败: ${likesResult.error.message}`)
  if (favoritesResult.error) throw new Error(`读取收藏失败: ${favoritesResult.error.message}`)
  if (commentsResult.error) throw new Error(`读取评论失败: ${commentsResult.error.message}`)

  const likes = likesResult.data ?? []
  const favorites = favoritesResult.data ?? []
  const comments = commentsResult.data ?? []
  const commenterIds = comments.map((comment) => comment.user_id as string)
  const profileIds = Array.from(new Set([...authorIds, ...commenterIds]))

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, role, avatar_preset, avatar_file_id')
    .in('id', profileIds)
  if (profileError) throw new Error(`读取作者信息失败: ${profileError.message}`)

  // 头像：上传图要换签名链接，多个作者并发解析，避免列表接口被串行拖慢
  const avatarEntries = await Promise.all(
    (profileRows ?? []).map(async (profile) => {
      const url = await resolveAvatarUrl(
        (profile.avatar_file_id as string | null) ?? null,
        (profile.avatar_preset as string | null) ?? null,
      )
      return [profile.id as string, url] as const
    }),
  )
  const avatarMap = new Map<string, string | null>(avatarEntries)

  const nameMap = new Map<string, { name: string; role: string }>()
  for (const profile of profileRows ?? []) {
    nameMap.set(profile.id as string, {
      name: (profile.display_name as string) || '同学',
      role: (profile.role as string) || 'student',
    })
  }

  const likeCounts = new Map<string, number>()
  const likedByMe = new Set<string>()
  for (const like of likes) {
    const postId = like.post_id as string
    likeCounts.set(postId, (likeCounts.get(postId) ?? 0) + 1)
    if (like.user_id === meId) likedByMe.add(postId)
  }
  const favoredByMe = new Set(favorites.map((item) => item.post_id as string))

  const commentsByPost = new Map<string, FeedComment[]>()
  for (const comment of comments) {
    const postId = comment.post_id as string
    const list = commentsByPost.get(postId) ?? []
    list.push({
      id: comment.id as string,
      user_id: comment.user_id as string,
      author: nameMap.get(comment.user_id as string)?.name ?? '同学',
      content: comment.content as string,
      created_at: comment.created_at as string,
      mine: comment.user_id === meId,
    })
    commentsByPost.set(postId, list)
  }

  return Promise.all(
    rows.map(async (row) => {
      const id = row.id as string
      const author = nameMap.get(row.user_id as string)
      const postComments = commentsByPost.get(id) ?? []
      return {
        id,
        user_id: row.user_id as string,
        author: author?.name ?? '同学',
        author_role: author?.role ?? 'student',
        author_avatar: avatarMap.get(row.user_id as string) ?? null,
        class_name: (row.class_name as string) ?? '',
        content: (row.content as string) ?? '',
        media: await resolveMediaUrls(row.media),
        created_at: row.created_at as string,
        mine: row.user_id === meId,
        like_count: likeCounts.get(id) ?? 0,
        liked: likedByMe.has(id),
        favored: favoredByMe.has(id),
        comments: postComments,
        journey: await summarizeJourney(row.journey),
      }
    }),
  )
}

export { getStorage } from '@/lib/storage'
