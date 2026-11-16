'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { apiGet } from '@/lib/client-api'
import { ProfileSetup } from '@/components/profile-setup'

export interface Profile {
  id: string
  display_name: string
  role: string
  class_name: string
  student_code?: string | null
  avatar_preset?: string | null
}

export interface Trip {
  id: string
  title: string
  destination: string
  start_date: string
  end_date: string
  summary: string
}

export interface SessionData {
  profile: Profile
  /** 学号（来自班级名册），右上角身份展示用它代替班级名 */
  studentCode?: string | null
  /** 头像地址：上传照片的临时签名链接，或预置手绘图静态路径 */
  avatarUrl?: string | null
  trip: Trip
  /** 超星首次登录：需要确认身份（学生 / 教师）与班级 */
  needsProfileSetup?: boolean
}

const SessionContext = createContext<SessionData | null>(null)

export function useSession(): SessionData {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession 必须在 AppFrame 内使用')
  return value
}

const STUDENT_NAV = [
  { href: '/', label: '研学概览' },
  { href: '/record', label: '过程记录' },
  { href: '/memory', label: '回顾时刻' },
  { href: '/feed', label: '分享圈' },
  { href: '/project', label: '项目提交' },
  { href: '/report', label: '学习情况' },
]

const TEACHER_NAV = [
  { href: '/', label: '研学概览' },
  { href: '/teacher', label: '全班汇总' },
  { href: '/teacher/projects', label: '项目作品' },
  { href: '/teacher/grades', label: '成绩册' },
  { href: '/feed', label: '分享圈' },
]

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`relative px-1 py-1 text-sm transition-colors ${
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      <span
        className={`absolute -bottom-[13px] left-0 h-px w-full transition-opacity ${
          active ? 'bg-gradient-to-r from-primary via-primary/70 to-transparent opacity-100' : 'opacity-0'
        }`}
      />
    </Link>
  )
}

export function AppFrame({
  children,
  hideChrome = false,
}: {
  children: React.ReactNode
  hideChrome?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState<SessionData | null>(null)
  const [error, setError] = useState('')

  const loadSession = useCallback(async () => {
    const data = await apiGet<SessionData>('/api/bootstrap')
    setSession(data)
  }, [])

  useEffect(() => {
    let mounted = true
    apiGet<SessionData>('/api/bootstrap')
      .then((data) => {
        if (mounted) setSession(data)
      })
      .catch((err: unknown) => {
        if (!mounted) return
        const message = err instanceof Error ? err.message : '加载失败'
        setError(message)
        router.replace('/login')
      })
    return () => {
      mounted = false
    }
  }, [router])

  const handleSignOut = useCallback(async () => {
    if (!window.confirm('退出登录后需要重新登录，确定退出吗？')) return
    await getSupabase().auth.signOut()
    router.replace('/login')
  }, [router])

  if (!session) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto w-full max-w-[1100px] px-5 py-16">
          <div className="space-y-3" aria-busy="true">
            <div className="h-3 w-32 animate-pulse rounded-sm bg-muted" />
            <div className="h-8 w-72 animate-pulse rounded-sm bg-muted" />
            <div className="h-3 w-full max-w-xl animate-pulse rounded-sm bg-muted" />
            <div className="h-3 w-2/3 max-w-lg animate-pulse rounded-sm bg-muted" />
          </div>
          {error ? <p className="mt-6 text-sm text-destructive">{error}，正在跳转登录…</p> : null}
        </div>
      </div>
    )
  }

  // 超星首次登录：先确认身份与班级，再进入业务页面
  if (session.needsProfileSetup) {
    return (
      <ProfileSetup
        profile={session.profile}
        avatarUrl={session.avatarUrl}
        onDone={() => {
          void loadSession()
        }}
      />
    )
  }

  const isTeacher = session.profile.role === 'teacher'
  const nav = isTeacher ? TEACHER_NAV : STUDENT_NAV
  // 取前缀最长的一项高亮，避免 /teacher 与 /teacher/grades 同时点亮
  const activeHref = nav
    .filter((item) =>
      item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <SessionContext.Provider value={session}>
      <div className="flex min-h-screen flex-col text-foreground">
        {hideChrome ? null : (
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur print:hidden">
            <div className="mx-auto flex w-full max-w-[1100px] items-center gap-6 px-5 py-4">
              <Link href="/" className="flex items-baseline gap-2">
                <span className="font-serif text-base tracking-tight">万绿湖研学</span>
                <span className="hidden text-[11px] tracking-[0.2em] text-muted-foreground sm:inline">
                  2026.11.14 - 11.15
                </span>
              </Link>

              <nav className="flex flex-1 items-center gap-5">
                {nav.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    active={item.href === activeHref}
                  />
                ))}
              </nav>

              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="font-serif text-sm leading-tight">{session.profile.display_name}</p>
                  <p className="eco-num mt-0.5 text-[11px] tracking-[0.15em] text-muted-foreground">
                    {isTeacher ? '教师' : session.studentCode || '学生'}
                  </p>
                </div>
                {session.avatarUrl ? (
                  <img
                    src={session.avatarUrl}
                    alt={`${session.profile.display_name}的头像`}
                    className="h-9 w-9 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="eco-btn-outline rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  退出
                </button>
              </div>
            </div>
          </header>
        )}

        <main className="mx-auto w-full max-w-[1100px] flex-1 px-5 py-12 sm:py-14 print:max-w-none print:px-0 print:py-0">{children}</main>

        <footer className="border-t border-border print:hidden">
          <div className="mx-auto w-full max-w-[1100px] px-5 py-5 text-[11px] tracking-wide text-muted-foreground">
            {session.trip.destination} · 研学过程记录与学习报告
          </div>
        </footer>
      </div>
    </SessionContext.Provider>
  )
}
