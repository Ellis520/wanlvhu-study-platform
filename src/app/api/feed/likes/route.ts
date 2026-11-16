import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'


export const dynamic = 'force-dynamic'


/** 点赞 */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const postId = typeof body.postId === 'string' ? body.postId : ''
    if (!postId) return NextResponse.json({ error: '缺少 postId' }, { status: 400 })

    // 用幂等 insert 而非 upsert：点赞表没有 UPDATE 权限与策略，重复点赞的 23505 视为已点赞
    const { error } = await auth.supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: auth.user.id })
    if (error && error.code !== '23505') throw new Error(`点赞失败: ${error.message}`)

    return NextResponse.json({ ok: true, liked: true })
  } catch (error) {
    return errorResponse(error)
  }
}


/** 取消点赞 */
export async function DELETE(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const postId = new URL(request.url).searchParams.get('postId') ?? ''
    if (!postId) return NextResponse.json({ error: '缺少 postId' }, { status: 400 })

    const { error } = await auth.supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', auth.user.id)
    if (error) throw new Error(`取消点赞失败: ${error.message}`)

    return NextResponse.json({ ok: true, liked: false })
  } catch (error) {
    return errorResponse(error)
  }
}
