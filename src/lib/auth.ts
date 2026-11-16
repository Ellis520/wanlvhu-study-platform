import { getSupabase } from '@/lib/supabase'

const PROJECT_ID = process.env.NEXT_PUBLIC_CODER_PROJECTS_ID
// 登录请求 base：本地开发模式平台注入隧道地址（浏览器直连，绕开预览网关）；
// 生产环境该变量不存在 → 空字符串 → 相对路径，由 Nginx 转发。
// 禁止硬编码隧道 URL：URL 会变化，必须始终从环境变量读取。
const AUTH_BASE = process.env.NEXT_PUBLIC_CODER_AUTH_PROXY_URL || ''

/** 登录后导航去向（唯一事实源）：业务首页 '/' */
export const POST_LOGIN_HOME = '/'

const AUTH_HEADERS = {
  'Content-Type': 'application/json',
  // 本地模式绕过 ngrok 免费版浏览器警告页；生产环境该头无副作用，必须保留
  'ngrok-skip-browser-warning': 'true',
}

export interface LoginResult {
  success: boolean
  error?: string
}

/** 获取当前登录用户 */
export async function getCurrentUser() {
  const {
    data: { user },
  } = await getSupabase().auth.getUser()
  return user
}

/** 退出登录 */
export async function logout() {
  await getSupabase().auth.signOut()
}

/**
 * 超星 OAuth2.0 一键登录：向服务端换取授权跳转地址后顶层导航到超星授权页。
 * 授权完成后超星会 302 回当前页面并追加 code/state，由 handleOAuthLoginFlow() 闭环。
 */
export async function loginWithChaoxingOAuth(): Promise<LoginResult> {
  // redirect_uri 固定为当前页面完整 URL（用户要求的首页），授权后原路回跳
  const redirectUri = window.location.href.split('#')[0]
  const res = await fetch(
    `${AUTH_BASE}/v1/api/coder/proxy/auth/chaoxing-oauth/authorize-url?redirect_uri=${encodeURIComponent(redirectUri)}&project_id=${encodeURIComponent(PROJECT_ID ?? '')}`,
    { headers: AUTH_HEADERS },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { success: false, error: body.message || `获取授权地址失败 (${res.status})` }
  }
  const { authorizeUrl } = await res.json()
  if (!authorizeUrl) {
    return { success: false, error: '授权地址为空，请稍后重试' }
  }
  // 必须顶层导航：fetch 跟随跨域 302 会被 CORS 拦截
  window.location.assign(authorizeUrl)
  return { success: true }
}

// in-flight 去重（模块级单一变量）：唯一公开编排入口 handleOAuthLoginFlow 的并发防线。
// 双挂载 / React StrictMode dev 双执行 effect / 快速再渲染都会并发调用；授权码一次性，
// 并发兑换必然其一 invalid code，更会在中转导航提交前“抢跑”消费 code。
let inflight: Promise<LoginResult> | null = null

/**
 * 以给定 code 完成 exchange 兑换：换取 session → setSession → 清理 URL。
 * userinfo（中转回跳的 AES 密文，可选）随请求体提交，服务端在兑换前内部解密并暂存凭证；
 * MUST NOT 调用任何独立解密端点。
 */
async function doExchange(code: string, userinfo?: string): Promise<LoginResult> {
  const res = await fetch(`${AUTH_BASE}/v1/api/coder/proxy/auth/chaoxing-oauth/exchange`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ code, projectId: PROJECT_ID, ...(userinfo ? { userinfo } : {}) }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // code 一次性且短时效：失败后清掉 URL 参数，提示用户重新发起登录
    cleanOAuthParamsFromUrl()
    return { success: false, error: body.message || '登录链接已失效，请重新登录' }
  }

  const session = await res.json()
  const { error } = await getSupabase().auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (error) {
    cleanOAuthParamsFromUrl()
    return { success: false, error: error.message }
  }

  // 登录成功：清掉 URL 上的 code/state，避免刷新重放
  cleanOAuthParamsFromUrl()
  return { success: true }
}

/** 用 replaceState 移除 URL 中的 OAuth 回跳参数（不留历史记录）。 */
function cleanOAuthParamsFromUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('userinfo')
  window.history.replaceState({}, '', url.toString())
}

// ── checklogin 中转（取回浏览器超星登录凭证）────────────────────
// 授权回跳拿到 code 后，先经超星 checklogin 接口中转一跳：超星读取浏览器超星 cookie，
// 302 回跳本页并追加 userinfo 参数（AES 密文）；再取回暂存的 code，将 userinfo 随包
// 在单次 exchange 内完成兑换。中转最多一次（一次性窗口标记防循环）；中转失败不阻断登录主链路。
const CX_CODE_KEY = 'cx_oauth_code'
// CX_RELAY_KEY 存“中转发起时间戳(ms)”：配合 RELAY_WINDOW_MS 判定“中转是否仍在进行中”。
const CX_RELAY_KEY = 'cx_checklogin_relay'
// 中转窗口：从发起 checklogin 导航到超星回跳本页的最长等待（含跨域往返 + 整页重载 + 水合）。
const RELAY_WINDOW_MS = 5000

/**
 * 入口页登录闭环编排（唯一公开挂载入口）：首次拿到 code → 暂存并中转 checklogin；
 * 中转回跳/已中转 → 观测 userinfo 后兑换 session。挂载点统一调用本函数。
 */
export function handleOAuthLoginFlow(): Promise<LoginResult> {
  if (inflight) {
    return inflight
  }
  inflight = doHandleOAuthLoginFlow().finally(() => {
    inflight = null
  })
  return inflight
}

async function doHandleOAuthLoginFlow(): Promise<LoginResult> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const userinfo = params.get('userinfo')
  // 中转窗口判定：CX_RELAY_KEY 存发起时间戳，距今 < RELAY_WINDOW_MS 视为“中转进行中”
  const relayTs = Number(sessionStorage.getItem(CX_RELAY_KEY) || '0')
  const inRelayWindow = relayTs > 0 && Date.now() - relayTs < RELAY_WINDOW_MS

  // 首次拿到 code 且不在中转窗口：暂存 code、记录中转发起时间戳、清理 URL，
  // 立即中转（time 有时效，取得地址后不得缓存）
  if (code && !inRelayWindow) {
    sessionStorage.setItem(CX_CODE_KEY, code)
    sessionStorage.setItem(CX_RELAY_KEY, String(Date.now()))
    cleanOAuthParamsFromUrl()
    try {
      const backurl = window.location.href.split('#')[0]
      const res = await fetch(
        `${AUTH_BASE}/v1/api/coder/proxy/auth/chaoxing-checklogin/url?backurl=${encodeURIComponent(backurl)}`,
        { headers: AUTH_HEADERS },
      )
      if (res.ok) {
        const { checkloginUrl } = await res.json()
        if (checkloginUrl) {
          // 导航是异步排定的：in-flight 去重 + 中转窗口保护共同确保并发再入不会抢跑兑换
          window.location.assign(checkloginUrl)
          // 页面即将跳转；若返回则视为失败（不应继续，避免 code 在中转未完成时被兑换）
          return { success: false }
        }
      }
      // 中转地址获取失败：清除时间戳、退出窗口，降级为不带 userinfo 的直兑（尽力而为）
      sessionStorage.removeItem(CX_RELAY_KEY)
    } catch {
      sessionStorage.removeItem(CX_RELAY_KEY)
    }
  }

  // 中转窗口保护（CRITICAL，防抢跑）：窗口内再次进入编排、却既无 code 也无 userinfo，
  // 说明 checklogin 导航尚未回跳。此时 MUST NOT 兑换、MUST NOT 清标记，等待真正的回跳。
  if (inRelayWindow && !code && !userinfo) {
    return { success: false }
  }

  // 中转回跳（带 userinfo）或已中转：归一化密文（URL 传参可能把 Base64 的 '+' 丢失为空格）
  const relayedUserinfo = userinfo ? userinfo.replace(/ /g, '+') : undefined

  // 兑换 session：优先取暂存 code（中转回跳后 URL 已无 code），其次兼容 URL 直回跳形态。
  // 中转标记与 URL 参数在整个 exchange 在途窗口保持存活（路由守卫依赖它们挂起回跳态），
  // 统一在结算后 finally 清理。
  const pendingCode = sessionStorage.getItem(CX_CODE_KEY) || code
  if (pendingCode) {
    try {
      return await doExchange(pendingCode, relayedUserinfo)
    } finally {
      sessionStorage.removeItem(CX_RELAY_KEY)
      sessionStorage.removeItem(CX_CODE_KEY)
      cleanOAuthParamsFromUrl()
    }
  }
  // 无 code 可兑（暂存丢失等）：清理标记防守卫永久挂起，走超时/失败降级路径
  sessionStorage.removeItem(CX_RELAY_KEY)
  cleanOAuthParamsFromUrl()
  return { success: false }
}
