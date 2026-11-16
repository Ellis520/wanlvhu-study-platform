import { NextResponse } from 'next/server'
import { errorResponse, needsProfileSetup, requireProfile } from '@/lib/server-auth'
import { getPrimaryTrip } from '@/lib/server-trip'
import { resolveAvatarUrl } from '@/lib/server-avatar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 登录后初始化：返回当前用户档案、头像、研学项目与资料补全标记 */
export async function GET(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    const trip = await getPrimaryTrip(auth.supabase)

    const profile = auth.profile
    const isTeacher = profile.role === 'teacher'

    // 学号：优先取本人档案里已核验过的学号，其次按姓名在名册里兜底
    let studentCode: string | null = profile.student_code ?? null
    if (!isTeacher && !studentCode) {
      const { data } = await auth.supabase
        .from('class_roster')
        .select('student_code')
        .eq('display_name', profile.display_name)
        .not('student_code', 'is', null)
        .maybeSingle()
      studentCode = (data?.student_code as string | null) ?? null
    }

    // 头像：上传的优先（存 fileId，取带期限链接），否则用预置头像
    const avatarUrl = await resolveAvatarUrl(profile.avatar_file_id, profile.avatar_preset)

    return NextResponse.json({
      profile,
      studentCode,
      avatarUrl,
      trip,
      // 超星一键登录用户没有注册表单，需要自行确认身份、学号与头像
      needsProfileSetup: needsProfileSetup(auth.user, auth.profile),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
