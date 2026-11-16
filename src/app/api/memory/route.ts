import { getStorage } from '@/lib/storage'
import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { getPrimaryTrip } from '@/lib/server-trip'
import { MEMORY_CARDS, findCard } from '@/lib/memory-cards'


export const dynamic = 'force-dynamic'


const MAX_PHOTOS = 4
const MAX_REFLECTION = 3000


export interface MemoryPhoto {
  fileId: string
  url: string | null
}


export interface MemoryCheckin {
  card_id: string
  card_order: number
  reflection: string
  photos: MemoryPhoto[]
  updated_at: string
}


/** 把库里的 fileId 列表转成带期限的访问链接（链接不持久化） */
async function resolvePhotos(fileIds: unknown): Promise<MemoryPhoto[]> {
  const ids = Array.isArray(fileIds)
    ? fileIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
  const photos = await Promise.all(
    ids.map(async (fileId) => {
      try {
        const file = await getStorage().getFile({ fileId, expiresInSeconds: 60 * 60 * 12 })
        return { fileId, url: file.url }
      } catch {
        return { fileId, url: null }
      }
    }),
  )
  return photos
}


/** 读取当前学生在本次研学里的全部打卡记录 */
export async function GET(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    const trip = await getPrimaryTrip(auth.supabase)

    const { data, error } = await auth.supabase
      .from('memory_checkins')
      .select('card_id, card_order, reflection, photo_file_ids, updated_at')
      .eq('trip_id', trip.id)
      .eq('user_id', auth.user.id)
      .order('card_order', { ascending: true })
    if (error) throw new Error(`读取打卡记录失败: ${error.message}`)

    const checkins: MemoryCheckin[] = await Promise.all(
      (data ?? []).map(async (row) => ({
        card_id: row.card_id as string,
        card_order: (row.card_order as number) ?? 0,
        reflection: (row.reflection as string) ?? '',
        photos: await resolvePhotos(row.photo_file_ids),
        updated_at: row.updated_at as string,
      })),
    )

    const doneCount = checkins.filter((item) => item.reflection.trim().length > 0).length
    return NextResponse.json({
      tripId: trip.id,
      tripTitle: trip.title,
      totalCards: MEMORY_CARDS.length,
      doneCount,
      checkins,
    })
  } catch (error) {
    return errorResponse(error)
  }
}


/** 保存（或覆盖）某一张卡片的感悟与照片 */
export async function PUT(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const body = (await request.json()) as {
      cardId?: string
      reflection?: string
      photoFileIds?: unknown
    }

    const card = findCard(String(body?.cardId ?? ''))
    if (!card) return NextResponse.json({ error: '站点卡片不存在' }, { status: 400 })

    const reflection = typeof body?.reflection === 'string' ? body.reflection.trim() : ''
    if (reflection.length > MAX_REFLECTION) {
      return NextResponse.json({ error: `感悟不超过 ${MAX_REFLECTION} 字` }, { status: 400 })
    }

    const rawIds = Array.isArray(body?.photoFileIds) ? body.photoFileIds : []
    const photoFileIds = rawIds
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, MAX_PHOTOS)

    if (!reflection && photoFileIds.length === 0) {
      return NextResponse.json({ error: '写一点感悟或传一张照片，再打卡吧' }, { status: 400 })
    }

    const trip = await getPrimaryTrip(auth.supabase)
    const { data, error } = await auth.supabase
      .from('memory_checkins')
      .upsert(
        {
          user_id: auth.user.id,
          trip_id: trip.id,
          card_id: card.id,
          card_order: card.order,
          reflection,
          photo_file_ids: photoFileIds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,trip_id,card_id' },
      )
      .select('card_id, card_order, reflection, photo_file_ids, updated_at')
      .maybeSingle()
    if (error) throw new Error(`保存打卡失败: ${error.message}`)

    return NextResponse.json({
      card_id: data?.card_id ?? card.id,
      card_order: data?.card_order ?? card.order,
      reflection,
      photos: await resolvePhotos(data?.photo_file_ids),
      updated_at: data?.updated_at ?? new Date().toISOString(),
    } satisfies MemoryCheckin)
  } catch (error) {
    return errorResponse(error)
  }
}
