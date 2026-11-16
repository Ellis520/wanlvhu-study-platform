import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { buildFeed, buildJourney } from '@/lib/feed'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * 单条动态详情：分享圈的「研学之旅」卡片点开后，在这里取回 12 站回顾与 AI 总结。
 * 可见性沿用 posts 的 RLS（所有登录用户可见），看不到的人只会拿到 404。
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const { id } = await context.params
    const { data, error } = await auth.supabase
      .from('posts')
      .select('id, user_id, class_name, content, media, journey, created_at')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(`读取动态失败: ${error.message}`)
    if (!data) {
      return NextResponse.json({ error: '这条动态不存在，或不在你的可见范围内' }, { status: 404 })
    }

    const row = data as Record<string, unknown>
    const [post] = await buildFeed(auth.supabase, auth.user.id, [row])
    const journey = await buildJourney(row.journey)

    return NextResponse.json({ post: post ?? null, journey })
  } catch (error) {
    return errorResponse(error)
  }
}
