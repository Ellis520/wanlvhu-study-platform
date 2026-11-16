import { NextResponse } from 'next/server'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { isAvatarKey } from '@/lib/avatar'

export const dynamic = 'force-dynamic'

interface RosterMatch {
  student_no: number
  display_name: string
}

/**
 * 补全 / 修改本人资料：姓名、身份、学号、头像。
 * 学生登录后填学号，必须与班级名册里的学号 + 姓名对上，否则拒绝——
 * 这样教师端的人数与成绩才不会被名单外的人搅乱。
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const body = (await request.json()) as {
      display_name?: unknown
      role?: unknown
      student_code?: unknown
      avatar_preset?: unknown
    }

    const displayName = typeof body?.display_name === 'string' ? body.display_name.trim() : ''
    const role = auth.profile.role === 'teacher' ? 'teacher' : 'student'
    if (body?.role === 'teacher' && role !== 'teacher') {
      return NextResponse.json({ error: '教师权限须由管理员授予' }, { status: 403 })
    }
    if (!displayName) {
      return NextResponse.json({ error: '请填写姓名' }, { status: 400 })
    }
    if (displayName.length > 30) {
      return NextResponse.json({ error: '姓名不超过 30 个字' }, { status: 400 })
    }

    let studentCode: string | null = null
    if (role === 'student') {
      const rawCode = typeof body?.student_code === 'string' ? body.student_code.trim() : ''
      if (!/^\d{6,20}$/.test(rawCode)) {
        return NextResponse.json({ error: '请填写 6–20 位数字学号' }, { status: 400 })
      }
      const { data: roster, error: rosterError } = await auth.supabase
        .from('class_roster')
        .select('student_no, display_name')
        .eq('student_code', rawCode)
        .maybeSingle<RosterMatch>()
      if (rosterError) throw new Error(`核对学号失败: ${rosterError.message}`)
      if (!roster) {
        return NextResponse.json(
          { error: '班级名单里没有这个学号，请核对后再填' },
          { status: 400 },
        )
      }
      if (roster.display_name !== displayName) {
        return NextResponse.json(
          { error: `学号 ${rawCode} 对应的姓名是「${roster.display_name}」，请核对姓名` },
          { status: 400 },
        )
      }
      studentCode = rawCode
    }

    const patch: Record<string, unknown> = {
      display_name: displayName,
      role,
      student_code: studentCode,
    }
    // 头像只在明确传了字段时才改，避免编辑姓名时把头像清掉
    if ('avatar_preset' in body) {
      const presetKey = isAvatarKey(body.avatar_preset) ? body.avatar_preset : null
      patch.avatar_preset = presetKey
      // 选了预置头像就放弃之前上传的照片，避免两套头像同时存在
      if (presetKey) patch.avatar_file_id = null
    }

    const { data, error } = await auth.supabase
      .from('profiles')
      .update(patch)
      .eq('id', auth.user.id)
      .select('id, display_name, role, class_name, student_code, avatar_preset, avatar_file_id')
      .maybeSingle()
    if (error) throw new Error(`保存资料失败: ${error.message}`)

    return NextResponse.json({ profile: data })
  } catch (error) {
    return errorResponse(error)
  }
}
