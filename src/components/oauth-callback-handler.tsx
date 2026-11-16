'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { handleOAuthLoginFlow, POST_LOGIN_HOME } from '@/lib/auth'

/**
 * 超星 OAuth 登录闭环组件：挂在根 layout，任意路由的回跳落点都会执行闭环（含 checklogin 中转）。
 * 内部 exchange 自带 in-flight 去重，dev StrictMode 双执行 effect 也只发一次。
 * 必须与 AuthGuard 同级（<body> 直接子节点），MUST NOT 被守卫包裹，否则无 session 时不渲染 → 死锁。
 */
export function OAuthCallbackHandler() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    handleOAuthLoginFlow().then((result) => {
      if (cancelled) return
      if (result.success) {
        // 登录成功导航到业务首页（replace：登录后“回退”不应回到登录页）
        router.replace(POST_LOGIN_HOME)
      } else if (result.error) {
        // 兑换失败：标记已结算清理，导航登录页展示重试（此时守卫恢复常态判定）
        console.warn('[auth] OAuth 回跳处理失败:', result.error)
        router.replace('/login')
      }
    })
    return () => {
      cancelled = true
    }
  }, [router])

  return null
}
