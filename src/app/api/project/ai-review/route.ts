import { NextResponse } from 'next/server'
import { Config, DocumentParseClient, LLMClient } from 'coder-coding-dev-sdk'
import { errorResponse, requireProfile } from '@/lib/server-auth'
import { getPrimaryTrip } from '@/lib/server-trip'
import { MEMORY_CARDS } from '@/lib/memory-cards'
import { STAGES } from '@/lib/study-trip'
import { MAX_PAPER_TEXT_CHARS } from '@/lib/project'
import { CLASS_REFERENCE_NOTE } from '@/lib/class-benchmark'
import { applyScoreFloor, scoreFloorPromptNote } from '@/lib/score-floor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** 论文解析的等待上限：解析任务本身最长保留 2 小时，这里只等一次请求的时间窗 */
const PARSE_TIMEOUT_MS = 120_000

/** 过程记录只用于判断「过程与反思」，不需要全文，合并后截断 */
const MAX_RECORD_CHARS = 5000
const MAX_FIELD_CHARS = 260
const MAX_MEMORY_CHARS = 200

/**
 * REE 研学项目评价维度（学校给定的正式标准）。
 * 满分合计 100，改动标准时只改这里与 buildPrompt 的描述即可，接口与页面无需调整。
 */
const RUBRIC: { label: string; max: number; focus: string; band: string }[] = [
  {
    label: '整体项目意识与自主策划',
    max: 15,
    focus: '是否把想法组织成有目标、有步骤、有成果预期的项目，并能解释自己的选择（问题/目标/受众、任务顺序、时间与分工、资源、成果预期与达成判断）。',
    band: '13-15 衔接完整且能解释选择与风险；10-12 结构较完整、部分理由待细化；7-9 有目标但任务联系弱；0-6 仅零散活动。',
  },
  {
    label: '创意与问题探索',
    max: 20,
    focus: '能否从真实经历发现值得探究的问题，形成自己的视角并尝试发展或检验（比较方案、说明价值与边界、发现新问题）。',
    band: '17-20 问题具体且能解释创意价值并有比较/尝试；13-16 方向清楚但验证不足；9-12 想法常见或宽泛；0-8 主要重复现成说法。',
  },
  {
    label: '研学联系与专业融合',
    max: 15,
    focus: '是否把研学中的具体观察与 REE 及自身专业知识建立有意义的联系（现场情境、专业方法的作用、对资源/环境/发展/利益关系的理解）。',
    band: '13-15 情境具体且专业方法真正参与分析；10-12 联系明确但可深化；7-9 以介绍或概念列举为主；0-6 联系薄弱或概念误用。',
  },
  {
    label: '研究方法与实施可行性',
    max: 15,
    focus: '方法是否适合问题、实施是否现实、判断是否有证据支持（方法理由、资料来源与适用范围、时间经费条件、成本与受益者、风险与替代方案）。',
    band: '13-15 方法匹配、条件现实、能识别限制；10-12 基本可行、部分证据待补；7-9 思路有但衔接不足；0-6 方法无法回答问题或依赖不具备的条件。',
  },
  {
    label: '协作与反馈利用',
    max: 10,
    focus: '能否通过分工、交流与反馈推进项目（个人项目看自我任务安排、自检与根据反馈调整）。',
    band: '9-10 过程清楚且反馈确实改变了决策；7-8 较明确但衔接不足；5-6 有分工或征求意见但整合弱；0-4 衔接或反馈处理存在明显问题。',
  },
  {
    label: '工具选择与人机协同',
    max: 10,
    focus: '能否按任务选择工具，发挥人的判断力并核验工具输出（使用或不使用 AI 的理由、分工、代表性提示与修改、事实与引用核验、采纳或拒绝的理由）。',
    band: '9-10 选择有依据且能核验改进；7-8 使用合理但核验说明不足；5-6 用于辅助任务、反思有限；0-4 缺少判断导致重要错误。',
  },
  {
    label: '过程记录、迭代与反思',
    max: 15,
    focus: '能否看见项目如何发展：最初想法与关键版本、现场观察与尝试、调整原因与具体变化、困难与应对、结论限制与下一步。',
    band: '13-15 关键过程可追溯并说明为何改、改了什么；10-12 过程可见、反思明确；7-9 以流水账为主；0-6 缺乏记录或反思笼统。',
  },
]

interface StageRow {
  stage: string
  answers: unknown
}

interface CheckinRow {
  card_id: string
  reflection: string
  photo_file_ids: unknown
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

/** 把阶段关键点整理成「阶段｜字段：内容」的行，空字段跳过 */
function buildStageRecords(rows: StageRow[]): string {
  const byStage = new Map(rows.map((row) => [row.stage, row.answers]))
  const lines: string[] = []
  let used = 0
  for (const stage of STAGES) {
    const answers = (byStage.get(stage.key) ?? {}) as Record<string, unknown>
    for (const field of stage.fields) {
      const value = typeof answers[field.key] === 'string' ? (answers[field.key] as string) : ''
      if (!value.trim()) continue
      const line = `- ${stage.title}｜${field.label}：${clip(value, MAX_FIELD_CHARS)}`
      if (used + line.length > MAX_RECORD_CHARS) return lines.join('\n')
      used += line.length
      lines.push(line)
    }
  }
  return lines.join('\n')
}

/** 研学回顾卡片：每站的自我记录与照片数量，是「过程与反思」的证据之一 */
function buildMemoryRecords(rows: CheckinRow[]): string {
  const byCard = new Map(rows.map((row) => [row.card_id, row]))
  const lines: string[] = []
  let used = 0
  for (const card of MEMORY_CARDS) {
    const row = byCard.get(card.id)
    const reflection = typeof row?.reflection === 'string' ? row.reflection.trim() : ''
    const photos = Array.isArray(row?.photo_file_ids) ? row.photo_file_ids.length : 0
    if (!reflection && photos === 0) continue
    const body = reflection ? clip(reflection, MAX_MEMORY_CHARS) : '只留下了照片'
    const line = `- 第 ${String(card.order).padStart(2, '0')} 站 ${card.title}（${card.day}）：${body}${photos > 0 ? `（${photos} 张照片）` : ''}`
    if (used + line.length > MAX_RECORD_CHARS) return lines.join('\n')
    used += line.length
    lines.push(line)
  }
  return lines.join('\n')
}

function buildPrompt(input: {
  student: string
  tripTitle: string
  dateRange: string
  title: string
  summary: string
  paperName: string
  paperText: string
  imageCount: number
  hasVideo: boolean
  stageText: string
  memoryText: string
}): string {
  const rubricLines = RUBRIC.map(
    (item, index) =>
      `${index + 1}. ${item.label}（${item.max} 分）\n   评价重点：${item.focus}\n   档位参考：${item.band}`,
  ).join('\n')

  return `你是本学期 REE（资源与环境经济学）课程「${input.tripTitle}」研学项目的学习评价助手。
请依据下面的标准评价这位学生提交的项目策划、创意、阶段成果和过程记录：帮助学生认识优点、发现问题、明确下一步，并为教师提供评分参考。

研学项目：${input.tripTitle}（${input.dateRange}）
学生：${input.student}
项目名称：${input.title || '（未填写）'}
项目介绍：${input.summary || '（未填写）'}
论文文件：${input.paperName}
附件：现场图片 ${input.imageCount} 张，${input.hasVideo ? '视频 1 段' : '无视频'}（图片与视频内容不参与文本评审，只作材料完整度参考）

### 论文正文
${input.paperText || '（论文正文为空）'}

### 过程记录（研学阶段关键点，按时间顺序）
${input.stageText || '（学生没有填写过程记录）'}

### 研学回顾卡片（每站自述与照片数量）
${input.memoryText || '（没有回顾记录）'}

### 一、评分维度与权重（合计 100 分）
${rubricLines}

### 二、按项目阶段调整
- 创意萌芽：判断问题价值、研学联系、初步思路与下一步，尚未实施不扣分，得分标注为「创意阶段建议分」。
- 方案策划：判断整体性、方法、分工、资源与验证计划，不按成果总结阶段要求。
- 实施探索：判断执行、证据积累、协作、工具使用与调整，认可有价值的试错。
- 成果总结：综合判断问题、方法、证据、成果、过程与反思，重点看结论与证据是否相称。

${CLASS_REFERENCE_NOTE}
${scoreFloorPromptNote(input.student)}

### 三、必须遵守的评价规则
1. 只依据上面列出的材料判断。不能根据项目名称、文字风格、专业标签或成果外观推断投入程度、真实性与研究水平。
2. 每项得分都要引用材料中的具体内容（原句、文件名、记录位置）；没有可核实依据时写「证据不足，暂不评分」，不得自动给零分。
3. 区分「尚未提供证据」与「明确未完成」：材料缺失只标注证据不足，只有材料明确显示不足才按档位扣分。
4. 证据不足时不给正式总分，只给已评部分的分数。
5. 同一问题首先归入最相关的维度，避免重复扣分。
6. 不预设所有项目都要完成同一种成果：报告、海报、视频、模型、原型、活动策划、艺术表达都可以，不以设备、预算或视觉精美程度替代内容评价。
7. 不以学生是否支持某项开发、治理或商业方案作为评分依据，看理由、证据与权衡。
8. 不因项目题目常见就认定缺乏创意；不因未使用 AI 而扣分；不凭文风判定使用 AI 或抄袭。
9. 个人项目不因没有组员扣分，小组项目不因人数多加分。
10. 鼓励区分现场观察、受访者说法、公开资料、假设与推断；发现可疑事实只提示需要核验，不直接认定造假。
11. 得分只是供师生讨论的建议；涉及疑似学术不端、贡献争议或证据真伪的问题，只列出疑点与所需材料，交教师判断。

### 四、输出格式（严格按下面七段输出，不要写开场白或结束语）
【1. 我理解的项目】
80-150 字，概括项目目标、研学联系、所用方法和当前阶段。不要替学生补出尚未说明的目标。

【2. 项目中最值得肯定的地方】
2-3 项，每项都要有具体证据及其价值，不要只写「很有创意」「完成得很好」。

【3. 分项评价】
七个维度逐项列出，每项包含：维度名（满分 X 分）、建议得分或「证据不足，暂不评分」、对应的具体证据、得分理由、一条可操作的改进建议。
每条格式：
- 维度名（满分 X 分）：建议得分 Y 分（或：证据不足，暂不评分）
  - 证据：…
  - 理由：…
  - 改进建议：…

【4. 综合判断】
- 若七个维度都有依据：单独一行写「总分：XX」（0-100 的整数，等于七项得分之和），再写「项目阶段：创意萌芽/方案策划/实施探索/成果总结」和「评价依据充分程度：较充分/一般/有限」。
- 若有维度证据不足：单独一行写「已评部分：A/B」（A 为已评维度得分之和，B 为这些维度的满分之和），并列出需要补充的材料；不要折算成 100 分总分。

【5. 下一步最值得做的三件事】
最多三项，按优先级排列，每条具体到学生可以立即开始执行（例如「比较两种方案的成本由谁承担」，而不是「深化研究」）。

【6. 一个值得继续追问的问题】
只提一个能推动项目前进的开放问题。

【7. 需要补充或教师复核的内容】
只列出会实质影响评价的缺口、争议或核验事项；没有则写「目前无」。

### 五、语气
尊重、具体、诚实，鼓励探索。可以指出问题，但评价作品、方法与证据，不评价学生的性格、天赋或态度。`
}

/** 只认「总分：XX」；证据不足时模型给的是「已评部分：A/B」，这里返回 null，不冒充总分 */
function parseAiScore(text: string): number | null {
  const matched = text.match(/总分[：:]\s*(\d{1,3})/)
  if (!matched) return null
  const value = Number(matched[1])
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

export async function POST(request: Request) {
  try {
    const auth = await requireProfile(request)
    if (!auth.ok) return auth.response
    if (auth.profile.role === 'teacher') {
      return NextResponse.json({ error: '教师端不参与 AI 评分' }, { status: 403 })
    }
    const trip = await getPrimaryTrip(auth.supabase)

    const { data: project, error: projectError } = await auth.supabase
      .from('project_submissions')
      .select(
        'id, title, summary, paper, images, video, paper_text, paper_parse_status, paper_parse_task_id, status, ai_score, best_ai_score',
      )
      .eq('trip_id', trip.id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (projectError) throw new Error(`读取项目失败: ${projectError.message}`)
    if (!project) return NextResponse.json({ error: '请先填写并保存作品' }, { status: 400 })

    const paper = project.paper as { fileId?: string; fileName?: string } | null
    if (!paper?.fileId) {
      return NextResponse.json({ error: '请先上传论文（PDF 或 Word）再生成 AI 评分' }, { status: 400 })
    }

    const images = Array.isArray(project.images) ? project.images : []
    const hasVideo = Boolean(project.video)
    const projectId = project.id as string
    const existingText = (project.paper_text as string) ?? ''
    const existingTaskId = (project.paper_parse_task_id as string | null) ?? null
    const paperName = paper.fileName || '论文.pdf'

    // 过程材料：阶段关键点 + 回顾卡片，用于判断「过程记录、迭代与反思」与「协作」
    const [recordsResult, checkinsResult] = await Promise.all([
      auth.supabase
        .from('stage_records')
        .select('stage, answers')
        .eq('trip_id', trip.id)
        .eq('user_id', auth.user.id),
      auth.supabase
        .from('memory_checkins')
        .select('card_id, reflection, photo_file_ids')
        .eq('trip_id', trip.id)
        .eq('user_id', auth.user.id),
    ])
    if (recordsResult.error) throw new Error(`读取过程记录失败: ${recordsResult.error.message}`)
    if (checkinsResult.error) throw new Error(`读取回顾记录失败: ${checkinsResult.error.message}`)

    const stageText = buildStageRecords((recordsResult.data ?? []) as StageRow[])
    const memoryText = buildMemoryRecords((checkinsResult.data ?? []) as CheckinRow[])

    const supabase = auth.supabase
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        }

        try {
          let paperText = existingText

          if (!paperText.trim()) {
            send({ type: 'stage', message: '正在解析论文正文…' })
            const parseClient = new DocumentParseClient(new Config())

            let taskId = existingTaskId
            if (!taskId) {
              const task = await parseClient.submit({ fileId: paper.fileId as string })
              taskId = task.taskId
              const { error: markError } = await supabase
                .from('project_submissions')
                .update({ paper_parse_status: 'pending', paper_parse_task_id: taskId })
                .eq('id', projectId)
              if (markError) throw new Error(`记录解析任务失败: ${markError.message}`)
            }

            const completed = await parseClient.waitForResult(taskId, {
              pollIntervalMs: 3000,
              timeoutMs: PARSE_TIMEOUT_MS,
            })
            const parsed = await parseClient.readResult(completed.taskId)
            paperText = (parsed.content ?? '').slice(0, MAX_PAPER_TEXT_CHARS)

            if (!paperText.trim()) {
              throw new Error('论文里没有解析出可读文字，请确认文件不是扫描图片版')
            }

            const { error: saveTextError } = await supabase
              .from('project_submissions')
              .update({
                paper_text: paperText,
                paper_parse_status: 'success',
              })
              .eq('id', projectId)
            if (saveTextError) throw new Error(`保存论文正文失败: ${saveTextError.message}`)
            send({ type: 'stage', message: '论文正文已解析，正在按评价标准打分…' })
          }

          const prompt = buildPrompt({
            student: auth.profile.display_name,
            tripTitle: trip.title,
            dateRange: `${trip.start_date.replace(/-/g, '.')} — ${trip.end_date.replace(/-/g, '.')}`,
            title: (project.title as string) ?? '',
            summary: (project.summary as string) ?? '',
            paperName,
            paperText,
            imageCount: images.length,
            hasVideo,
            stageText,
            memoryText,
          })

          const client = new LLMClient(new Config())
          const messages = [
            {
              role: 'system' as const,
              content:
                '你是本学期 REE（资源与环境经济学）课程河源万绿湖研学项目的学习评价助手。你只依据学生实际提交的材料评价，不编号外推断、不编造证据；证据不足时明确写「证据不足，暂不评分」，并尊重不同专业背景与成果形式。',
            },
            { role: 'user' as const, content: prompt },
          ]

          let collected = ''
          for await (const chunk of client.stream(messages, { temperature: 0.3, maxTokens: 3200 })) {
            if (chunk.content) {
              collected += chunk.content
              send({ type: 'delta', content: chunk.content })
            }
            if (chunk.done) break
          }

          const parsedScore = parseAiScore(collected)
          // 个案分数下限：教师要求该生得分率不低于 95%，这里在落库前统一兜底
          const { score: aiScore } = applyScoreFloor(auth.profile.display_name, parsedScore)
          const partial = aiScore === null && /已评部分/.test(collected)
          // 历次 AI 评分最高分：教师没给分时，最终成绩用它
          const previousBest =
            (project.best_ai_score as number | null) ?? (project.ai_score as number | null) ?? 0
          const bestAiScore = Math.max(previousBest, aiScore ?? 0)

          const { error: saveError } = await supabase
            .from('project_submissions')
            .update({
              ai_review: collected,
              ai_score: aiScore,
              best_ai_score: bestAiScore > 0 ? bestAiScore : null,
              ai_reviewed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', projectId)
          if (saveError) {
            send({ type: 'warning', message: `评分已生成，但保存失败: ${saveError.message}` })
          }
          send({ type: 'done', score: aiScore, partial })
        } catch (streamError) {
          const message = streamError instanceof Error ? streamError.message : 'AI 评分失败'
          // 解析失败要落库，避免下次仍拿着失效的 taskId 反复查询
          if (message.includes('解析') || message.includes('论文')) {
            await supabase
              .from('project_submissions')
              .update({ paper_parse_status: 'failed' })
              .eq('id', projectId)
          }
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
