import { NextResponse } from 'next/server'
import { Config, LLMClient } from 'coder-coding-dev-sdk'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { getPrimaryTrip } from '@/lib/server-trip'
import { MEMORY_CARDS } from '@/lib/memory-cards'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** 模型用这一行把「整篇回顾」和「逐站一句」分开 */
const SITES_MARK = '---SITES---'
const MAX_NOTE_LENGTH = 60

interface CheckinRow {
  card_id: string
  reflection: string
  photo_file_ids: unknown
}

interface JourneyEntry {
  order: number
  title: string
  day: string
  reflection: string
  photoCount: number
}

export interface StationNote {
  order: number
  note: string
}

function readPhotoCount(value: unknown): number {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item).length : 0
}

/** 12 站里只把学生真正写过或拍过的站交给模型，避免它替学生编造见闻 */
function collectEntries(rows: CheckinRow[]): JourneyEntry[] {
  const byCard = new Map(rows.map((row) => [row.card_id, row]))
  return MEMORY_CARDS.map((card) => {
    const row = byCard.get(card.id)
    return {
      order: card.order,
      title: card.title,
      day: card.day,
      reflection: (row?.reflection ?? '').trim(),
      photoCount: readPhotoCount(row?.photo_file_ids),
    }
  }).filter((entry) => entry.reflection.length > 0 || entry.photoCount > 0)
}

function buildPrompt(input: {
  student: string
  tripTitle: string
  dateRange: string
  entries: JourneyEntry[]
}): string {
  const lines = input.entries
    .map((entry) => {
      const head = `${String(entry.order).padStart(2, '0')}. ${entry.title}（${entry.day}）`
      if (entry.reflection) return `${head}\n   他/她写道：${entry.reflection.replace(/\s+/g, ' ')}`
      return `${head}\n   （这一站只留下了照片，没有写字）`
    })
    .join('\n')

  return `请为下面这位学生写一次「研学之旅回顾」。\n\n行程：${input.tripTitle}（${input.dateRange}）\n学生：${input.student}\n他/她在路上记下的片段（按走过的顺序）：\n${lines}\n\n输出分两部分。\n\n第一部分：回顾正文\n- 用第二人称「你」，像返程的大巴上陪着这位学生回望这两天。\n- 350-500 字，分三个自然段：出发时带着的问题、路上的见闻、归途的收获与一句约定。\n- 必须落到具体细节：引用他/她写过的地名、数字、画面或原话，不要泛泛而谈。\n- 语气亲和、有温度，但克制：不喊口号，不用「赋能」「沉浸式」「心灵洗礼」这类词，不堆排比句。\n- 只写他/她真实写下的内容，没有记录的站点不要编造；也不要描述或提到照片。\n- 不要标题、不要小标题、不要列表、不要表情符号，只输出三个自然段，段与段之间空一行。\n\n第二部分：逐站一句\n- 正文写完后另起一行，只输出 ${SITES_MARK}（单独一行，前后不加任何字）。\n- 然后每个有记录的站一行，格式为「序号|一句话」。\n- 每句不超过 40 字，平静地写这一站他/她看到了什么、留下了什么，不评价、不抒情、不加引号。\n- 只写上面列出过的站，顺序与行程一致。\n- 示例：\n03|你把水面的颜色和岸边的树影都记了下来。\n08|你和同伴在田埂上蹲了很久，写下了泥土的气味。`
}

/** 解析「序号|一句话」，同一站只取第一句，超长截断 */
function parseSites(text: string): StationNote[] {
  const byOrder = new Map<number, string>()
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim().replace(/^[-*·\s]+/, '')
    if (!line) continue
    const match = line.match(/^(\d{1,2})\s*[|｜:：.、]\s*(.+)$/)
    if (!match) continue
    const order = Number.parseInt(match[1], 10)
    const note = match[2].replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH)
    if (!Number.isInteger(order) || !note) continue
    if (!byOrder.has(order)) byOrder.set(order, note)
  }
  return [...byOrder.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([order, note]) => ({ order, note }))
}

/**
 * 回顾时刻末站：只依据学生写下的文字生成回顾（不把照片交给模型）。
 * 流式先出正文，模型说完 12 站小结后，一次性把「逐站一句」下发给前端。
 */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response

    const trip = await getPrimaryTrip(auth.supabase)
    const { data, error } = await auth.supabase
      .from('memory_checkins')
      .select('card_id, reflection, photo_file_ids')
      .eq('trip_id', trip.id)
      .eq('user_id', auth.user.id)
    if (error) throw new Error(`读取打卡记录失败: ${error.message}`)

    const entries = collectEntries((data ?? []) as CheckinRow[])
    if (entries.length === 0) {
      return NextResponse.json({ error: '先在任何一站写几句或传一张照片，再来回顾这一趟' }, { status: 400 })
    }

    const prompt = buildPrompt({
      student: auth.profile.display_name,
      tripTitle: trip.title,
      dateRange: `${trip.start_date.replace(/-/g, '.')} — ${trip.end_date.replace(/-/g, '.')}`,
      entries,
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        }

        let inSites = false
        let pending = ''
        let siteText = ''

        /** 正文与逐站段落之间靠分隔符切开，注意分隔符可能被切在两个 chunk 里 */
        const consume = (text: string) => {
          pending += text
          if (inSites) return
          const index = pending.indexOf(SITES_MARK)
          if (index === -1) {
            const keep = Math.max(0, pending.length - (SITES_MARK.length - 1))
            const emit = pending.slice(0, keep)
            pending = pending.slice(keep)
            if (emit) send({ type: 'delta', content: emit })
            return
          }
          const emit = pending.slice(0, index).replace(/\s+$/, '')
          if (emit) send({ type: 'delta', content: emit })
          siteText = pending.slice(index + SITES_MARK.length)
          pending = ''
          inSites = true
        }

        try {
          const client = new LLMClient(new Config())
          const messages = [
            {
              role: 'system' as const,
              content:
                '你是一位陪学生走完两天研学的语文老师，擅长把零散的现场笔记写成克制而有温度的短文。你只使用学生写下的内容，不虚构见闻，也不替学生下结论。',
            },
            { role: 'user' as const, content: prompt },
          ]

          for await (const chunk of client.stream(messages, { temperature: 0.85, maxTokens: 1600 })) {
            if (chunk.content) consume(chunk.content)
            if (chunk.done) break
          }

          // 模型没输出分隔符：把残留当正文，逐站小结留空
          if (!inSites && pending) {
            send({ type: 'delta', content: pending })
            pending = ''
          }

          if (inSites) siteText += pending
          const sites = parseSites(siteText)
          if (sites.length > 0) send({ type: 'sites', sites })
          send({ type: 'done', stationCount: entries.length, noteCount: sites.length })
        } catch (streamError) {
          const message = streamError instanceof Error ? streamError.message : '生成回顾失败'
          send({ type: 'error', message })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
