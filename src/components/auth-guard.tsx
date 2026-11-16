'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { POST_LOGIN_HOME } from '@/lib/auth'

/**
 * 回跳进行中信号（字面量检查：与 src/lib/auth.ts 的 CX_CODE_KEY / CX_RELAY_KEY 同名，
 * 改动任一处必须同步另一处）。纯密码登录不会命中任何信号。
 */
function isOAuthCallbackInProgress(): boolean {
  const params = new URLSearchParams(window.location.search)
  return (
    params.has('code') ||
    params.has('userinfo') ||
    sessionStorage.getItem('cx_oauth_code') !== null ||
    sessionStorage.getItem('cx_checklogin_relay') !== null
  )
}

/** 守卫挂起超时（毫秒）：回跳标记存在但超时未结算时清标记降级，防白屏卡死 */
const CALLBACK_HOLD_TIMEOUT_MS = 10_000

/** 无需登录即可访问的路由 */
const PUBLIC_PATHS = new Set(['/login'])

/**
 * 全站集中认证守卫（客户端）：session 存 localStorage，只有客户端可见，因此守卫在客户端执行。
 * 未登录访问受保护路由 → replace('/login')；已登录访问登录/注册页 → replace(POST_LOGIN_HOME)。
 * OAuth 回跳/中转进行中 → 不导航、停留加载态，把裁决交给根 layout 的回跳闭环组件。
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const evaluate = async () => {
      const {
        data: { session },
      } = await getSupabase().auth.getSession()
      const isPublic = PUBLIC_PATHS.has(pathname)
      if (!session && !isPublic) {
        router.replace('/login')
        return
      }
      if (session && isPublic) {
        router.replace(POST_LOGIN_HOME)
        return
      }
      setReady(true)
    }
    // 回跳进行中：保持 !ready（不渲染、不导航），等待闭环结算；超时兜底清标记后降级常态判定
    if (isOAuthCallbackInProgress()) {
      const timer = setTimeout(() => {
        sessionStorage.removeItem('cx_oauth_code')
        sessionStorage.removeItem('cx_checklogin_relay')
        void evaluate()
      }, CALLBACK_HOLD_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }
    setReady(false)
    void evaluate()
  }, [pathname, router])

  // 守卫判定期间不渲染受保护内容，避免未登录用户瞥见业务页面；
  // 回跳窗口内同样停留加载态，不闪现登录页
  if (!ready) {
    return (
      <div className="min-h-screen" aria-busy="true">
        <div className="mx-auto w-full max-w-[1100px] px-5 py-16">
          <div className="space-y-3">
            <div className="h-3 w-32 animate-pulse rounded-sm bg-muted" />
            <div className="h-8 w-72 animate-pulse rounded-sm bg-muted" />
            <div className="h-3 w-full max-w-xl animate-pulse rounded-sm bg-muted" />
          </div>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
