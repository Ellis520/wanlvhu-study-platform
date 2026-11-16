import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'


export const dynamic = 'force-dynamic'


const MAX_COMMENT = 300


/** 发表评论 */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const postId = typeof body.postId === 'string' ? body.postId : ''
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!postId) return NextResponse.json({ error: '缺少 postId' }, { status: 400 })
    if (!content) return NextResponse.json({ error: '评论内容不能为空' }, { status: 400 })
    if (content.length > MAX_COMMENT) {
      return NextResponse.json({ error: `评论不能超过 ${MAX_COMMENT} 字` }, { status: 400 })
    }

    const { data, error } = await auth.supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: auth.user.id, content })
      .select('id, post_id, user_id, content, created_at')
      .maybeSingle()
    if (error) throw new Error(`评论失败: ${error.message}`)

    return NextResponse.json({
      comment: {
        id: data?.id,
        post_id: data?.post_id,
        user_id: data?.user_id,
        author: auth.profile.display_name || '同学',
        content: data?.content,
        created_at: data?.created_at,
        mine: true,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}


/** 删除评论：评论作者本人，或该动态的作者 */
export async function DELETE(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const commentId = new URL(request.url).searchParams.get('commentId') ?? ''
    if (!commentId) return NextResponse.json({ error: '缺少 commentId' }, { status: 400 })

    const { data: comment, error: readError } = await auth.supabase
      .from('post_comments')
      .select('id, post_id, user_id')
      .eq('id', commentId)
      .maybeSingle()
    if (readError) throw new Error(`读取评论失败: ${readError.message}`)
    if (!comment) return NextResponse.json({ error: '评论不存在或已删除' }, { status: 404 })

    let allowed = comment.user_id === auth.user.id
    if (!allowed) {
      const { data: post } = await auth.supabase
        .from('posts')
        .select('user_id')
        .eq('id', comment.post_id as string)
        .maybeSingle()
      allowed = post?.user_id === auth.user.id
    }
    if (!allowed) return NextResponse.json({ error: '无权删除该评论' }, { status: 403 })

    const { error } = await auth.supabase.from('post_comments').delete().eq('id', commentId)
    if (error) throw new Error(`删除评论失败: ${error.message}`)

    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
