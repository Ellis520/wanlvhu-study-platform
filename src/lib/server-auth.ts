import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase-server'

export interface Profile {
  id: string
  display_name: string
  role: string
  class_name: string
  /** 学号：学生需与班级名册一致 */
  student_code?: string | null
  /** 预置头像 key（见 src/lib/avatar.ts） */
  avatar_preset?: string | null
  /** 上传头像的对象存储 fileId */
  avatar_file_id?: string | null
}

export function getAccessToken(request: Request): string | undefined {
  const raw =
    request.headers.get('x-sandbox-authorization') ?? request.headers.get('authorization') ?? ''
  const token = raw.replace(/^Bearer\s+/i, '').trim()
  return token.length > 0 ? token : undefined
}

/** 读取并校验当前登录用户，同时返回带用户 JWT 的 Supabase 客户端 */
export async function resolveUser(
  request: Request,
): Promise<{ ok: true; user: User; supabase: SupabaseClient } | { ok: false; response: NextResponse }> {
  const accessToken = getAccessToken(request)
  if (!accessToken) {
    return { ok: false, response: NextResponse.json({ error: '请先登录' }, { status: 401 }) }
  }
  const supabase = createSupabaseServer(accessToken)
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) {
    return { ok: false, response: NextResponse.json({ error: '登录已失效，请重新登录' }, { status: 401 }) }
  }
  return { ok: true, user: data.user, supabase }
}

/** 首次访问时按注册元数据补齐 profiles 记录（RLS 只允许本人写入） */
export async function ensureProfile(supabase: SupabaseClient, user: User): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, role, class_name, student_code, avatar_preset, avatar_file_id')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw new Error(`读取档案失败: ${error.message}`)
  if (data) return data as Profile

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  // 超星登录用户没有 display_name，姓名在 realname（超星统一认证写入）
  const realname = typeof meta.realname === 'string' ? meta.realname.trim() : ''
  const displayName =
    (typeof meta.display_name === 'string' && meta.display_name.trim()) ||
    realname ||
    user.email?.split('@')[0] ||
    '同学'
  const role = meta.role === 'teacher' ? 'teacher' : 'student'
  const className = typeof meta.class_name === 'string' ? meta.class_name.trim() : ''

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: user.id, display_name: displayName, role, class_name: className })
    .select('id, display_name, role, class_name, student_code, avatar_preset, avatar_file_id')
    .maybeSingle()
  if (insertError) {
    // 并发首访（bootstrap 与页面请求同时到达）会撞唯一键：重新读一次已插入的档案
    const { data: retried, error: retryError } = await supabase
      .from('profiles')
      .select('id, display_name, role, class_name, student_code, avatar_preset, avatar_file_id')
      .eq('id', user.id)
      .maybeSingle()
    if (retried) return retried as Profile
    throw new Error(`创建档案失败: ${retryError?.message ?? insertError.message}`)
  }
  return created as Profile
}

/**
 * 判断是否需要补全身份资料（角色）。
 * 超星一键登录用户没有注册表单，元数据里只有 realname、cxid，
 * 首次进入需要自己确认「学生 / 教师」，否则教师端权限无从判断。
 * 学号不在这里收集——它来自班级名册，按姓名自动匹配。
 * 邮箱注册用户在注册时已写入 role，视为已完成；补全成功后写 profile_setup = true。
 */
export function needsProfileSetup(user: User, profile: Profile): boolean {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  // 只有超星一键登录的用户需要确认身份
  const isChaoxing = typeof meta.cxid === 'string' && meta.cxid.length > 0
  if (!isChaoxing) return false
  if (meta.profile_setup === true) return false
  if (typeof meta.role === 'string' && meta.role) return false
  return profile.role !== 'teacher'
}

export async function requireProfile(
  request: Request,
): Promise<
  | { ok: true; user: User; profile: Profile; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  const resolved = await resolveUser(request)
  if (!resolved.ok) return resolved
  const profile = await ensureProfile(resolved.supabase, resolved.user)
  return { ok: true, user: resolved.user, profile, supabase: resolved.supabase }
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '服务异常，请稍后重试'
  return NextResponse.json({ error: message }, { status: 500 })
}
