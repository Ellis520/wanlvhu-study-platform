'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { loginWithChaoxingOAuth, POST_LOGIN_HOME } from '@/lib/auth'

const APP_ICON =
  'https://p.ananas.chaoxing.com/star3/origin/53af543e2a86bd6da54f5ebec9298e01'

export default function LoginPage() {
  const router = useRouter()
  const [oauthLoading, setOauthLoading] = useState(false)
  const [error, setError] = useState('')

  // session 自愈：已登录（含超星回跳兑换成功）直接进业务首页，不停留登录页
  useEffect(() => {
    let mounted = true
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (mounted && data.session) router.replace(POST_LOGIN_HOME)
      })
    return () => {
      mounted = false
    }
  }, [router])

  async function handleChaoxingLogin() {
    setError('')
    setOauthLoading(true)
    const result = await loginWithChaoxingOAuth()
    // 成功时浏览器正在顶层跳转到超星授权页，无需恢复状态；仅失败时恢复按钮
    if (!result.success) {
      setOauthLoading(false)
      setError(result.error || '超星登录跳转失败，请稍后重试')
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      {/* 万绿湖清晨：全屏风景底 */}
      <Image
        src="/wanlvhu-dawn.jpg"
        alt="万绿湖清晨的湖面与远山"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* 纸白蒙层：上部留风景，下部压白保证文字与按钮可读 */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-white/55 to-white/92" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_-10%,transparent,rgba(255,255,255,0.55))]" />

      <div className="relative z-10 mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-5 py-8 sm:py-10">
        <header className="flex items-center gap-2.5">
          <Image
            src={APP_ICON}
            alt="应用图标"
            width={32}
            height={32}
            className="eco-frame rounded-md"
            priority
          />
          <p className="text-[11px] tracking-[0.18em] text-foreground/70">
            广东绿色水经济发展示范点 · 河源
          </p>
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="eco-reveal w-full max-w-[420px]">
            <p className="text-[11px] tracking-[0.28em] text-primary">
              中山大学调研团队 · 两日研学
            </p>
            <h1 className="mt-4 font-serif text-[2rem] leading-[1.25] tracking-tight sm:text-[2.6rem]">
              河源绿色
              <br />
              水经济研学
            </h1>
            <p className="eco-num mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tracking-[0.1em] text-foreground/65">
              <span>2026.11.14 — 11.15</span>
              <span className="h-3 w-px bg-foreground/25" />
              <span>万绿湖 · 新丰江</span>
              <span className="h-3 w-px bg-foreground/25" />
              <span>两日行程 10 站</span>
            </p>
            <p className="mt-4 max-w-[380px] text-pretty text-sm leading-7 text-foreground/75">
              从市博物馆的历史底色，到新丰江大坝、农夫山泉与粤海水务的产业链，
              再到万绿湖水面上的两小时——用两天时间，看清一湖水如何支撑一座城市。
            </p>

            <div className="eco-rule-t mt-8 pt-6">
              <button
                type="button"
                onClick={handleChaoxingLogin}
                disabled={oauthLoading}
                className="eco-btn-solid flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {oauthLoading ? '正在跳转超星…' : '用超星账号进入'}
              </button>
              <p className="mt-3 text-[11px] leading-5 text-foreground/60">
                仅支持超星学习通授权登录，学生与教师共用一个入口；首次进入需确认身份。
              </p>
              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            </div>
          </div>
        </div>

        <footer className="eco-num flex flex-wrap items-center justify-between gap-2 text-[11px] text-foreground/55">
          <span>广州博阅研学旅行服务有限公司</span>
          <span>中山大学南校区 → 河源市</span>
        </footer>
      </div>
    </main>
  )
}
