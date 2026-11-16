import { getSupabase } from '@/lib/supabase'

const AUTH_HEADER = 'Authorization'

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return headers
}

async function withToken(headers: Headers): Promise<Headers> {
  const { data } = await getSupabase().auth.getSession()
  const token = data.session?.access_token
  if (token) headers.set(AUTH_HEADER, `Bearer ${token}`)
  return headers
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text()
  const payload = text ? (JSON.parse(text) as unknown) : null
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `请求失败(${response.status})`
    throw new Error(message)
  }
  return payload as T
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await withToken(buildHeaders())
  const response = await fetch(path, { headers, cache: 'no-store' })
  return parse<T>(response)
}

export async function apiSend<T>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const headers = await withToken(buildHeaders({ body: body ? 'json' : undefined }))
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  return parse<T>(response)
}

/** 上传文件（FormData），不设置 Content-Type，交给浏览器带 boundary */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const headers = await withToken(buildHeaders())
  const response = await fetch(path, { method: 'POST', headers, body: form, cache: 'no-store' })
  return parse<T>(response)
}

/** 上传原始二进制（如作品 zip 压缩包），请求体直接是文件内容，便于服务端流式落盘 */
export async function apiUploadBinary<T>(
  path: string,
  file: Blob,
  contentType: string,
): Promise<T> {
  const headers = await withToken(buildHeaders())
  headers.set('Content-Type', contentType)
  const response = await fetch(path, { method: 'POST', headers, body: file, cache: 'no-store' })
  return parse<T>(response)
}

/**
 * 下载二进制响应（如学生作品 zip）。
 * 服务端 zip 链接是流式接口且带鉴权，必须用 fetch 取 blob 再触发保存，
 * 直接用 <a download> 会忽略文件名并在新标签里打开。
 */
export async function downloadFromApi(path: string, fallbackName: string): Promise<void> {
  const headers = await withToken(new Headers())
  const response = await fetch(path, { headers, cache: 'no-store' })

  if (!response.ok) {
    const text = await response.text()
    let message = `下载失败(${response.status})`
    try {
      const payload = JSON.parse(text) as { error?: string }
      if (payload?.error) message = payload.error
    } catch {
      // 保留默认提示
    }
    throw new Error(message)
  }

  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  const fileName = encoded ? decodeURIComponent(encoded[1]) : fallbackName

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface StreamHandlers {
  onDelta: (text: string) => void
  /** partial 为 true 表示模型只给了「已评部分」分数，没有正式总分 */
  onDone: (payload: { score?: number | null; partial?: boolean }) => void
  onError: (message: string) => void
  /** 服务端阶段提示，如「正在解析论文正文…」 */
  onStage?: (message: string) => void
  /** 非致命警告，如「已生成但保存失败」 */
  onWarning?: (message: string) => void
}

/** SSE 流式请求：逐块读取 data: {...} 并回调，用于 AI 点评打字机渲染 */
export async function apiStream(path: string, handlers: StreamHandlers): Promise<void> {
  const headers = await withToken(buildHeaders({ body: 'json' }))
  const response = await fetch(path, { method: 'POST', headers, cache: 'no-store' })

  if (!response.ok) {
    const text = await response.text()
    let message = `请求失败(${response.status})`
    try {
      const payload = JSON.parse(text) as { error?: string }
      if (payload?.error) message = payload.error
    } catch {
      // 保留默认提示
    }
    handlers.onError(message)
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    handlers.onError('无法读取流式响应')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.split('\n').find((item) => item.startsWith('data:'))
      if (!line) continue
      const raw = line.slice(5).trim()
      if (!raw) continue
      try {
        const event = JSON.parse(raw) as {
          type: string
          content?: string
          message?: string
          score?: number | null
          partial?: boolean
        }
        if (event.type === 'delta' && event.content) handlers.onDelta(event.content)
        else if (event.type === 'done')
          handlers.onDone({ score: event.score ?? null, partial: Boolean(event.partial) })
        else if (event.type === 'error') handlers.onError(event.message ?? 'AI 点评失败')
        else if (event.type === 'stage' && event.message) handlers.onStage?.(event.message)
        else if (event.type === 'warning' && event.message) handlers.onWarning?.(event.message)
      } catch {
        // 忽略无法解析的片段
      }
    }
  }
}
