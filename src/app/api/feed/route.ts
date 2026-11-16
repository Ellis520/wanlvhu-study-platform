import { NextResponse } from 'next/server'
import {
  FEED_PAGE_SIZE,
  MAX_CONTENT,
  buildFeed,
  normalizeMedia,
  getStorage,
} from '@/lib/feed'
import { errorResponse, requireProfile } from '@/lib/server-auth'


export const dynamic = 'force-dynamic'


type FeedScope = 'all' | 'mine' | 'favored'


function parseScope(value: string | null): FeedScope {
  if (value === 'mine' || value === 'favored') return value
  return 'all'
}


/** 动态时间线：cursor 为上一页最后一条的 created_at，按时间倒序分页 */
export async function GET(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const scope = parseScope(params.get('scope'))
    const cursor = params.get('cursor') ?? ''

    let query = auth.supabase
      .from('posts')
      .select('id, user_id, class_name, content, media, journey, created_at')
      .order('created_at', { ascending: false })
      .limit(FEED_PAGE_SIZE + 1)

    if (scope === 'mine') query = query.eq('user_id', auth.user.id)
    if (scope === 'favored') {
      const { data: favorites, error } = await auth.supabase
        .from('post_favorites')
        .select('post_id')
        .eq('user_id', auth.user.id)
      if (error) throw new Error(`读取收藏失败: ${error.message}`)
      const ids = (favorites ?? []).map((item) => item.post_id as string)
      if (ids.length === 0) return NextResponse.json({ posts: [], nextCursor: null, hasMore: false })
      query = query.in('id', ids)
    }
    if (cursor) query = query.lt('created_at', cursor)

    const { data, error } = await query
    if (error) throw new Error(`读取动态失败: ${error.message}`)

    const rows = (data ?? []) as Record<string, unknown>[]
    const hasMore = rows.length > FEED_PAGE_SIZE
    const pageRows = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows
    const posts = await buildFeed(auth.supabase, auth.user.id, pageRows)

    return NextResponse.json({
      posts,
      hasMore,
      nextCursor: hasMore ? (pageRows[pageRows.length - 1]?.created_at as string) ?? null : null,
    })
  } catch (error) {
    return errorResponse(error)
  }
}


/** 发布一条动态：文案 + 图片/视频（媒体已先上传到对象存储） */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    const media = normalizeMedia(body.media)

    if (!content && media.length === 0) {
      return NextResponse.json({ error: '写点什么或选张照片再发布吧' }, { status: 400 })
    }
    if (content.length > MAX_CONTENT) {
      return NextResponse.json({ error: `文案不能超过 ${MAX_CONTENT} 字` }, { status: 400 })
    }

    const { data, error } = await auth.supabase
      .from('posts')
      .insert({
        user_id: auth.user.id,
        class_name: auth.profile.class_name ?? '',
        content,
        media,
      })
      .select('id, user_id, class_name, content, media, journey, created_at')
      .maybeSingle()
    if (error) throw new Error(`发布失败: ${error.message}`)

    const [post] = await buildFeed(auth.supabase, auth.user.id, [data as Record<string, unknown>])
    return NextResponse.json({ post })
  } catch (error) {
    return errorResponse(error)
  }
}


/** 删除自己的动态，并清理其图片/视频文件 */
export async function DELETE(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const postId = new URL(request.url).searchParams.get('postId') ?? ''
    if (!postId) return NextResponse.json({ error: '缺少 postId' }, { status: 400 })

    const { data: post, error: readError } = await auth.supabase
      .from('posts')
      .select('id, user_id, media')
      .eq('id', postId)
      .maybeSingle()
    if (readError) throw new Error(`读取动态失败: ${readError.message}`)
    if (!post) return NextResponse.json({ error: '动态不存在或已删除' }, { status: 404 })
    if (post.user_id !== auth.user.id) {
      return NextResponse.json({ error: '只能删除自己发布的动态' }, { status: 403 })
    }

    const { error } = await auth.supabase.from('posts').delete().eq('id', postId)
    if (error) throw new Error(`删除动态失败: ${error.message}`)

    const media = Array.isArray(post.media) ? (post.media as Record<string, unknown>[]) : []
    await Promise.all(
      media
        .map((item) => (typeof item?.fileId === 'string' ? item.fileId : ''))
        .filter(Boolean)
        .map((fileId) => getStorage().deleteFile({ fileId }).catch(() => false)),
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
