import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { getPrimaryTrip } from '@/lib/server-trip'
import { STAGES, type Answers } from '@/lib/study-trip'

export const dynamic = 'force-dynamic'

const STAGE_KEYS = STAGES.map((stage) => stage.key as string)

/** 读取当前学生的三阶段关键点记录 */
export async function GET(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    const trip = await getPrimaryTrip(auth.supabase)
    const { data, error } = await auth.supabase
      .from('stage_records')
      .select('stage, answers, updated_at')
      .eq('trip_id', trip.id)
      .eq('user_id', auth.user.id)
    if (error) throw new Error(`读取记录失败: ${error.message}`)
    return NextResponse.json({ tripId: trip.id, records: data ?? [] })
  } catch (error) {
    return errorResponse(error)
  }
}

/** 保存某一阶段的关键点记录（按 user + trip + stage 覆盖） */
export async function PUT(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    const body = (await request.json()) as { stage?: string; answers?: Record<string, unknown> }
    const stage = body?.stage ?? ''
    if (!STAGE_KEYS.includes(stage)) {
      return NextResponse.json({ error: '阶段参数不合法' }, { status: 400 })
    }
    if (!body?.answers || typeof body.answers !== 'object') {
      return NextResponse.json({ error: '记录内容不合法' }, { status: 400 })
    }

    const answers: Answers = {}
    for (const [key, value] of Object.entries(body.answers)) {
      if (typeof value === 'string') answers[key] = value
    }

    const trip = await getPrimaryTrip(auth.supabase)
    const { data, error } = await auth.supabase
      .from('stage_records')
      .upsert(
        {
          user_id: auth.user.id,
          trip_id: trip.id,
          stage,
          answers,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,trip_id,stage' },
      )
      .select('stage, answers, updated_at')
      .maybeSingle()
    if (error) throw new Error(`保存记录失败: ${error.message}`)
    return NextResponse.json(data)
  } catch (error) {
    return errorResponse(error)
  }
}
