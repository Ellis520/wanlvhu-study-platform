import { NextResponse } from 'next/server'
import { Config, LLMClient } from 'coder-coding-dev-sdk'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { getPrimaryTrip } from '@/lib/server-trip'
import { REPORT_FIELDS, STAGES, computeRuleScore, type Answers } from '@/lib/study-trip'
import { CLASS_REFERENCE_NOTE } from '@/lib/class-benchmark'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function buildPrompt(input: {
  student: string
  tripTitle: string
  answers: Answers
  report: { highlights: string; reflection: string; action_plan: string }
  ruleScore: ReturnType<typeof computeRuleScore>
}): string {
  const recordLines = STAGES.map((stage) => {
    const body = stage.fields
      .map((field) => {
        const value = (input.answers[field.key] ?? '').trim()
        return `- ${field.label}${field.time ? `（${field.time}${field.place ? ' · ' + field.place : ''}）` : ''}：${value || '（未填写）'}`
      })
      .join('\n')
    return `## ${stage.title}\n${body}`
  }).join('\n\n')

  const dimensionLines = input.ruleScore.dimensions
    .map((dimension) => `- ${dimension.label}：${dimension.score}/${dimension.max}（${dimension.comment}）`)
    .join('\n')

  return `请评价下面这位学生的研学学习报告。

研学项目：${input.tripTitle}
学生：${input.student}

### 一、三阶段关键点记录
${recordLines}

### 二、报告正文
【${REPORT_FIELDS[0].label}】
${input.report.highlights || '（未填写）'}

【${REPORT_FIELDS[1].label}】
${input.report.reflection || '（未填写）'}

【${REPORT_FIELDS[2].label}】
${input.report.action_plan || '（未填写）'}

### 三、系统规则评分（供参考，不要简单重复）
总分 ${input.ruleScore.total}/100，等级「${input.ruleScore.level}」
${dimensionLines}
${input.ruleScore.missing.length ? `尚未填写的关键点：${input.ruleScore.missing.join('、')}` : '所有必填关键点均已完成'}

${CLASS_REFERENCE_NOTE}

### 四、输出要求
严格按以下结构输出 Markdown，总字数 600-900 字：
1. **一句话总评**：用一句话概括这份报告的水平。
2. **分维度点评**：分别点评「观察记录的完整性」「数据与证据的使用」「思考深度」「绿色发展理念的理解」「行动方案的可行性」五个维度，每个维度 2-3 句，必须引用报告中的具体内容作为依据。
3. **总分**：单独一行写「总分：XX」（0-100 的整数）。
4. **三条改进建议**：用有序列表给出可操作的建议，每条说明「怎么做」而不是「要重视」。
语气体贴、具体、像指导老师面批，不使用夸张赞美。`
}

/** AI 点评：SSE 流式返回，结束后落库 */
export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    const trip = await getPrimaryTrip(auth.supabase)

    const [{ data: records, error: recordsError }, { data: report, error: reportError }] =
      await Promise.all([
        auth.supabase
          .from('stage_records')
          .select('stage, answers')
          .eq('trip_id', trip.id)
          .eq('user_id', auth.user.id),
        auth.supabase
          .from('reports')
          .select('id, highlights, reflection, action_plan')
          .eq('trip_id', trip.id)
          .eq('user_id', auth.user.id)
          .maybeSingle(),
      ])
    if (recordsError) throw new Error(`读取记录失败: ${recordsError.message}`)
    if (reportError) throw new Error(`读取报告失败: ${reportError.message}`)
    if (!report) {
      return NextResponse.json({ error: '请先填写并保存报告正文，再生成 AI 点评' }, { status: 400 })
    }

    const answers: Answers = {}
    for (const row of records ?? []) {
      Object.assign(answers, (row.answers ?? {}) as Answers)
    }
    const ruleScore = computeRuleScore([answers], report)
    const prompt = buildPrompt({
      student: auth.profile.display_name,
      tripTitle: trip.title,
      answers,
      report: {
        highlights: report.highlights ?? '',
        reflection: report.reflection ?? '',
        action_plan: report.action_plan ?? '',
      },
      ruleScore,
    })

    const reportId = report.id as string
    const supabase = auth.supabase
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        }

        let collected = ''
        try {
          const client = new LLMClient(new Config())
          const messages = [
            {
              role: 'system' as const,
              content:
                '你是一位带学生做生态与可持续发展主题研学的地理教师，擅长用具体、克制、可执行的语言评价学生的研学报告。你只依据学生实际写下的内容点评，不臆造学生没写的事实。',
            },
            { role: 'user' as const, content: prompt },
          ]

          for await (const chunk of client.stream(messages, { temperature: 0.5, maxTokens: 2000 })) {
            if (chunk.content) {
              collected += chunk.content
              send({ type: 'delta', content: chunk.content })
            }
            if (chunk.done) break
          }

          const matched = collected.match(/总分[：:]\s*(\d{1,3})/)
          const aiScore = matched ? Math.max(0, Math.min(100, Number(matched[1]))) : null

          const { error: saveError } = await supabase
            .from('reports')
            .update({
              ai_review: collected,
              ai_score: aiScore,
              updated_at: new Date().toISOString(),
            })
            .eq('id', reportId)
          if (saveError) {
            send({ type: 'warning', message: `点评已生成，但保存失败: ${saveError.message}` })
          }
          send({ type: 'done', score: aiScore })
        } catch (streamError) {
          const message = streamError instanceof Error ? streamError.message : 'AI 点评失败'
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
