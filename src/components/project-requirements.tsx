'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { FileText, ClipboardCheck, ListChecks } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/** 强调关键词，表格正文保持轻量字重 */
function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>
}

const FORMAT_ROWS: Array<{ item: string; detail: ReactNode }> = [
  {
    item: '课程报告',
    detail: (
      <>
        完成一份<B>3000 字以上</B>的课程报告，体现问题意识、专业思考与研究能力。
      </>
    ),
  },
  { item: '报告内容与表达', detail: <>结构清晰、逻辑严谨、论述充分、图文并茂。图片、图表应服务于分析，说明来源，避免仅作装饰。</> },
  { item: '报告文件格式', detail: <>使用 <B>Word 格式</B>，文件命名为：<B>学号＋姓名＋论文题目</B>。</> },
  { item: '报告封面', detail: <>写明题目、专业、姓名等信息，建议同时标明学号与课程名称。</> },
  { item: '纸张与打印', detail: <>按 A4 纸、双面打印的要求准备。</> },
  { item: '页边距', detail: <>上边距 25 mm，下边距 20 mm，左右边距均为 30 mm。</> },
  { item: '正文字体与字号', detail: <>正文使用宋体、小四号。</> },
  { item: '行距与标题间距', detail: <>正文采用 1.5 倍行距；章、节标题段前、段后各空 0.5 行。</> },
  { item: '多媒体展示', detail: <>在课程报告基础上，准备 PPT、小视频、智能体或其他形式的展示，突出核心问题、探索过程与主要成果。</> },
  { item: '展示分享时间', detail: <><B>11 月 30 日晚上</B>。报告提交截止时间、展示时长等，以教师后续通知为准。</> },
]

const SCORE_ROWS: Array<{
  name: string
  score: number
  need: string
  focus: string
}> = [
  {
    name: '整体项目意识与自主策划',
    score: 15,
    need: '明确研究什么、为什么研究、面向谁；安排任务、时间与预期成果。报告从问题提出到结论形成完整结构，展示能提炼主线。',
    focus: '目标清楚、结构完整、逻辑连贯。能说明各项任务怎样共同服务于项目目标。',
  },
  {
    name: '创意与问题探索',
    score: 20,
    need: '从研学观察中提出具体问题，展示自己的视角、创意或改进方案，并解释其价值。',
    focus: '有自主思考，探索具体而有意义。认可小而深入的创新，也认可有依据的尝试与调整。',
  },
  {
    name: '研学联系与专业融合',
    score: 15,
    need: '联系具体参访地点、经历或发现，运用自己的专业知识，并结合适当的 REE 概念分析问题。',
    focus: '学科知识真正帮助理解问题。联系自然、概念准确，能够解释资源、环境、发展或利益关系。',
  },
  {
    name: '研究方法、证据与可行性',
    score: 15,
    need: '说明调查、分析、设计或验证方法；提供现场记录、可靠资料或测试结果，交代来源、条件与局限。',
    focus: '方法适当、论述充分、结论有依据。体现学术素养与研究能力，能够区分事实、假设和个人判断。',
  },
  {
    name: '协作与反馈利用',
    score: 10,
    need: '小组展示分工、共同决策、成果整合及反馈后的修改；个人项目展示自检、评审或反馈利用。',
    focus: '合作和反馈能够推动项目。贡献具体可说明，报告与展示形成相互衔接的整体。',
  },
  {
    name: '工具选择与人机协同',
    score: 10,
    need: '说明 AI 等工具承担的任务，展示代表性的使用、核验与修改过程，解释人的判断与选择。',
    focus: '工具使用合理，学生对成果负责。能检查事实、引用、分析与代码，理解并解释最终作品。',
  },
  {
    name: '过程记录、迭代与反思',
    score: 15,
    need: '保留草稿、观察、讨论、测试、版本变化等关键记录；在报告或展示中说明调整原因与学习收获。',
    focus: '过程真实可追溯，反思具体。能解释“为什么改、改了什么、产生什么影响”，并认识不足与下一步。',
  },
]

const OUTLINE_ROWS: Array<{ part: string; question: string }> = [
  { part: '项目背景与问题提出', question: '研学中的什么经历引发了这个项目？具体想探索什么，为什么值得做？' },
  { part: '专业视角与研究思路', question: '运用了哪些专业知识和 REE 概念？准备怎样研究或设计？' },
  { part: '项目实施与分析', question: '做了什么、依据是什么、发现了什么？关键判断怎样形成？' },
  { part: '成果与讨论', question: '形成了什么成果？有什么价值、成本、适用条件或不同选择？' },
  { part: '总结与反思', question: '回答了哪些问题？经历了哪些调整？还有什么局限与下一步？' },
  { part: '参考资料与必要附件', question: '资料从哪里来？哪些过程记录、协作材料或人机协同片段能够支持报告？' },
]

function SectionTitle({ icon, index, title }: { icon: ReactNode; index: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/40 text-primary">
        {icon}
      </span>
      <h3 className="font-serif text-base tracking-tight">
        <span className="mr-1.5 text-[11px] tracking-[0.2em] text-primary">{index}</span>
        {title}
      </h3>
    </div>
  )
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`border-b border-border/70 bg-muted/40 px-3 py-2 text-left text-[11px] font-medium tracking-wide text-muted-foreground ${className}`}
    >
      {children}
    </th>
  )
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <td className={`border-b border-border/40 px-3 py-2.5 align-top text-xs leading-6 ${className}`}>
      {children}
    </td>
  )
}

/** 项目要求：卡片 + 弹窗全文（学生端项目页顶部入口） */
export function ProjectRequirementsCard() {
  const [open, setOpen] = useState(false)

  return (
    <section className="eco-card flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 text-primary">
          <ListChecks className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-serif text-base tracking-tight">项目要求</h2>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            3000 字以上课程报告 + 多媒体展示 · 七维度 100 分 · 提交截止与展示时间以教师通知为准
          </p>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button type="button" className="eco-btn-solid rounded-md px-4 py-2 text-sm text-primary-foreground">
            查看
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[88vh] w-full max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border/60 px-5 py-4 sm:px-6">
            <DialogTitle className="font-serif text-lg">项目要求与评价标准</DialogTitle>
            <DialogDescription className="text-xs leading-6">
              结合河源研学经历、REE 课程知识及自身专业，自主策划、开展探索，形成课程报告，并通过多媒体分享成果。
              请从项目开始时保留关键过程记录，呈现自己的思考、合作与成长。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(88vh-7rem)] space-y-7 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="space-y-3">
              <SectionTitle
                icon={<FileText className="size-3.5" aria-hidden="true" />}
                index="一"
                title="需要准备的成果与格式要求"
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse">
                  <thead>
                    <tr>
                      <Th className="w-32">项目</Th>
                      <Th>具体要求</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {FORMAT_ROWS.map((row) => (
                      <tr key={row.item}>
                        <Td className="font-medium">{row.item}</Td>
                        <Td className="text-muted-foreground">{row.detail}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <SectionTitle
                icon={<ClipboardCheck className="size-3.5" aria-hidden="true" />}
                index="二"
                title="项目中要体现什么，评分重点是什么"
              />
              <p className="text-[11px] leading-6 text-muted-foreground">
                以下为建议评价权重，总分 100 分；最终评分安排以教师确认的标准为准。
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr>
                      <Th className="w-40">评价维度</Th>
                      <Th className="w-16 text-right">分值</Th>
                      <Th className="w-[34%]">项目中需要体现什么</Th>
                      <Th>评分重点</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCORE_ROWS.map((row) => (
                      <tr key={row.name}>
                        <Td className="font-medium">{row.name}</Td>
                        <Td className="text-right font-serif text-sm text-primary">{row.score}</Td>
                        <Td className="text-muted-foreground">{row.need}</Td>
                        <Td className="text-muted-foreground">{row.focus}</Td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30">
                      <Td className="font-medium">合计</Td>
                      <Td className="text-right font-serif text-sm text-primary">100</Td>
                      <Td className="text-muted-foreground">
                        以课程报告系统呈现研究，以多媒体展示清楚传达成果，并用过程记录支撑探索经历。
                      </Td>
                      <Td className="text-muted-foreground">重视自主策划、创意、专业运用、研究证据与学习成长。</Td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <SectionTitle
                icon={<ListChecks className="size-3.5" aria-hidden="true" />}
                index="三"
                title="报告组织建议"
              />
              <p className="text-[11px] leading-6 text-muted-foreground">
                以下结构供参考，可根据项目类型调整。
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse">
                  <thead>
                    <tr>
                      <Th className="w-48">建议部分</Th>
                      <Th>需要回答的问题</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {OUTLINE_ROWS.map((row) => (
                      <tr key={row.part}>
                        <Td className="font-medium">{row.part}</Td>
                        <Td className="text-muted-foreground">{row.question}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-xs font-medium text-primary">提交前请记住</p>
              <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
                多媒体形式可以自由选择，课程报告仍需按要求完成。报告与展示可以各有侧重，但核心问题、事实与结论应保持一致。
                制作精美不能替代充分论证，材料数量也不能替代真实、具体的探索。
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
