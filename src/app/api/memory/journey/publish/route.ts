import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { getPrimaryTrip } from '@/lib/server-trip'
import { JOURNEY_TITLE } from '@/lib/feed-types'
import { MEMORY_CARDS } from '@/lib/memory-cards'

export const dynamic = 'force-dynamic'

/** AI 总结的合理区间：太短放出去没内容，太长则说明不是这段总结 */
const MIN_SUMMARY = 40
const MAX_SUMMARY = 4000
const MAX_PHOTOS_PER_STATION = 4
const MAX_NOTE_LENGTH = 60

interface CheckinRow {
  card_id: string
  reflection: string
  photo_file_ids: unknown
}

function readPhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, MAX_PHOTOS_PER_STATION)
}

/** 前端传回来的逐站小结，只收合法序号与有内容的句子 */
function readNotes(value: unknown): Map<number, string> {
  const map = new Map<number, string>()
  if (!Array.isArray(value)) return map
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const order = typeof row.order === 'number' ? row.order : Number.parseInt(String(row.order ?? ''), 10)
    const note = typeof row.note === 'string' ? row.note.replace(/\s+/g, ' ').trim() : ''
    if (!Number.isInteger(order) || !note) continue
    if (!map.has(order)) map.set(order, note.slice(0, MAX_NOTE_LENGTH))
  }
  return map
}

/**
 * 把这次研学之旅发表到分享圈：所有登录的同学与老师会看到一张「欢迎来看看我的研学之旅」卡片。
 * 回顾快照由服务端按当前用户的打卡重新生成，因此学生后来补的照片、改过的感悟都会随再次发表刷新。
 * 同一个人在同一趟研学里只保留一条回顾，重复发表是覆盖更新，不会在分享圈堆出多张卡片。
 */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const summary = typeof body.summary === 'string' ? body.summary.trim() : ''
    if (summary.length < MIN_SUMMARY) {
      return NextResponse.json({ error: '先把这段回顾写完整，再发表吧' }, { status: 400 })
    }
    if (summary.length > MAX_SUMMARY) {
      return NextResponse.json({ error: '这段回顾有点长，留一点给下一次吧' }, { status: 400 })
    }

    const notes = readNotes(body.notes)
    const trip = await getPrimaryTrip(auth.supabase)
    const { data, error } = await auth.supabase
      .from('memory_checkins')
      .select('card_id, reflection, photo_file_ids')
      .eq('trip_id', trip.id)
      .eq('user_id', auth.user.id)
    if (error) throw new Error(`读取打卡记录失败: ${error.message}`)

    const byCard = new Map(((data ?? []) as CheckinRow[]).map((row) => [row.card_id, row]))
    const cards = MEMORY_CARDS.map((card) => {
      const row = byCard.get(card.id)
      return {
        order: card.order,
        title: card.title,
        day: card.day,
        time: card.time,
        note: notes.get(card.order) ?? '',
        reflection: (row?.reflection ?? '').trim(),
        photos: readPhotos(row?.photo_file_ids),
      }
    }).filter((card) => card.reflection.length > 0 || card.photos.length > 0)

    if (cards.length === 0) {
      return NextResponse.json({ error: '这一趟还没有可以回顾的内容' }, { status: 400 })
    }

    const snapshot = { title: JOURNEY_TITLE, summary, cards }

    const { data: existing, error: findError } = await auth.supabase
      .from('posts')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('content', JOURNEY_TITLE)
      .not('journey', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (findError) throw new Error(`读取已发表的回顾失败: ${findError.message}`)

    if (existing?.id) {
      const { error: updateError } = await auth.supabase
        .from('posts')
        .update({
          class_name: auth.profile.class_name ?? '',
          journey: snapshot,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (updateError) throw new Error(`更新回顾失败: ${updateError.message}`)
      return NextResponse.json({ postId: existing.id, updated: true })
    }

    const { data: post, error: insertError } = await auth.supabase
      .from('posts')
      .insert({
        user_id: auth.user.id,
        class_name: auth.profile.class_name ?? '',
        content: JOURNEY_TITLE,
        media: [],
        journey: snapshot,
      })
      .select('id')
      .maybeSingle()
    if (insertError) throw new Error(`发表失败: ${insertError.message}`)

    return NextResponse.json({ postId: post?.id ?? null, updated: false })
  } catch (error) {
    return errorResponse(error)
  }
}
