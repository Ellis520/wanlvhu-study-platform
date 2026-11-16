export type StageKey = 'before' | 'during' | 'after'

export interface FieldDef {
  key: string
  label: string
  time?: string
  place?: string
  hint: string
  required: boolean
  rows: number
}

export interface StageDef {
  key: StageKey
  title: string
  window: string
  intro: string
  fields: FieldDef[]
}

export const STAGES: StageDef[] = [
  {
    key: 'before',
    title: '出发前',
    window: '11 月 13 日前完成',
    intro: '带着问题出发，比带着手机出发更重要。先把你知道的写下来，把你想知道的问出来。',
    fields: [
      {
        key: 'before_research',
        label: '行前资料预习',
        hint: '查地图和资料，弄清万绿湖与新丰江水库的关系：水从哪里来、供到哪里去，这里为什么被叫作「珠三角的水塔」。至少写下 3 条关键信息。',
        required: true,
        rows: 5,
      },
      {
        key: 'before_question',
        label: '我带着的三个问题',
        hint: '写下 3 个你最想在现场搞清楚的问题。越具体，越容易在博物馆、工厂或游船上找到答案。',
        required: true,
        rows: 5,
      },
      {
        key: 'before_route',
        label: '我的路线预习',
        hint: '照着行程表在纸上画一遍两天路线，标出你最期待的 2 个点，并说明为什么。',
        required: true,
        rows: 5,
      },
      {
        key: 'before_plan',
        label: '行前准备与安全约定',
        hint: '集合时间、随身物品、需要注意的安全事项（乘船、临水、集体行动），写清楚你打算怎么做到。',
        required: true,
        rows: 4,
      },
      {
        key: 'before_goal',
        label: '我的研学目标',
        hint: '这两天结束时，你希望自己带回什么？可以是一个答案，也可以是一种改变。',
        required: false,
        rows: 3,
      },
    ],
  },
  {
    key: 'during',
    title: '学习中',
    window: '11 月 14 日 - 15 日 现场记录',
    intro:
      '现场记录不怕零碎，怕的是只写「很美」「很震撼」。时间、地点、数字、讲解原话、你的疑问，都值得写下来。',
    fields: [
      {
        key: 'during_1114_museum',
        label: '河源市博物馆 · 历史底色',
        time: '11/14 10:30',
        place: '河源市博物馆',
        hint: '河源因水而兴。记下 2 条与东江、客家迁徙或城市变迁有关的信息，说明它们如何解释今天的河源。',
        required: true,
        rows: 4,
      },
      {
        key: 'during_1114_dinosaur',
        label: '恐龙博物馆 · 资源与名片',
        time: '11/14 11:35',
        place: '河源恐龙博物馆',
        hint: '记下 3 个带数字的信息（蛋化石数量、种类、年代），再想一想：一种资源如何变成一座城市的名片？',
        required: true,
        rows: 4,
      },
      {
        key: 'during_1114_dam',
        label: '新丰江大坝 · 一座坝的三件事',
        time: '11/14 14:10',
        place: '新丰江大坝',
        hint: '站在坝上看坝体、水面与下游河道。写清这座坝同时承担的防洪、供水、发电功能，各自对应的关键数据。',
        required: true,
        rows: 4,
      },
      {
        key: 'during_1114_nongfu',
        label: '农夫山泉工厂 · 一瓶水的链条',
        time: '11/14 15:05',
        place: '农夫山泉广东万绿湖有限公司',
        hint: '水从湖里到瓶里要经过哪几步？哪一步最花成本？写出一条完整链条和一个让你意外的细节。',
        required: true,
        rows: 4,
      },
      {
        key: 'during_1114_industry',
        label: '水经济产业链 · 粤海水务与金地创谷',
        time: '11/14 15:50',
        place: '粤海水务 / 金地创谷',
        hint: '一天里你看了从原水到产业的一串环节。把「水—企业—城市」的关系写成一条链，标注每一环靠什么运转。',
        required: true,
        rows: 4,
      },
      {
        key: 'during_1115_jiulihu',
        label: '九里湖 · 治理现场',
        time: '11/15 08:55',
        place: '九里湖水环境治理提升工程',
        hint: '治理前是什么样、做了什么、现在怎样？重点记下工程使用的三个具体手段（截污、清淤、生态修复……）。',
        required: true,
        rows: 4,
      },
      {
        key: 'during_1115_port',
        label: '新港镇远眺与生态展厅',
        time: '11/15 09:30',
        place: '新港镇远眺点 / 万绿湖生态展厅',
        hint: '先从高处看镇与湖的关系，再从展厅看数据：记下 1 条空间观察和 2 个带单位的数字。',
        required: true,
        rows: 4,
      },
      {
        key: 'during_1115_boat',
        label: '万绿湖游船 · 两小时看水质',
        time: '11/15 10:20',
        place: '万绿湖（航程约 120 分钟）',
        hint: '船上能看到的：水色与透明度、岸边植被、船只与游客活动、水面漂浮物。至少写 2 条观察和 1 个疑问。',
        required: true,
        rows: 5,
      },
      {
        key: 'during_1115_village',
        label: '南园古村 · 村落活化',
        time: '11/15 14:30',
        place: '南园古村',
        hint: '老房子被用来做什么？谁在这里生活、谁在这里经营？写清一种「保护与使用」的具体做法。',
        required: true,
        rows: 4,
      },
      {
        key: 'during_1115_coffee',
        label: '糖巢创客社区 · 青年与乡村',
        time: '11/15 15:20',
        place: '糖巢创客社区',
        hint: '这里的人在做什么生意？和本地的水、农产品、旅游有什么关系？记下你问到的一句话。',
        required: false,
        rows: 4,
      },
    ],
  },
  {
    key: 'after',
    title: '参观后',
    window: '11 月 16 日 - 18 日 整理成文',
    intro: '把零散的记录整理成一条解释得通的线索：我看到了什么，说明了什么，我准备做什么。',
    fields: [
      {
        key: 'after_finding',
        label: '我的核心发现',
        hint: '从「一条水脉 / 一座古村 / 一个产业」中挑一条最有感触的线索，说清现象、原因和它与人生活的关系。',
        required: true,
        rows: 5,
      },
      {
        key: 'after_data',
        label: '数据与证据整理',
        hint: '把现场的数据、照片说明整理成可以引用的证据，注明来源（展板 / 讲解 / 自己测量）。',
        required: false,
        rows: 4,
      },
      {
        key: 'after_think',
        label: '我的思考',
        hint: '河源把「护水」和「发展」放在同一张桌上谈。这对你理解绿色发展意味着什么？哪些日常行为和这湖清水相关？',
        required: true,
        rows: 5,
      },
      {
        key: 'after_action',
        label: '我的绿色行动',
        hint: '写 2-3 件具体可执行的事，带时间和频率，别写「以后要爱护环境」这类空话。',
        required: true,
        rows: 4,
      },
    ],
  },
]

export const REPORT_FIELDS = [
  {
    key: 'highlights' as const,
    label: '研学成果摘要',
    hint: '用一段话概括这两天的观察与结论，相当于报告的开篇。建议 200 字以上。',
    minLength: 200,
    rows: 7,
  },
  {
    key: 'reflection' as const,
    label: '深度反思',
    hint: '回答一个问题：这一湖清水，靠什么维持？我能做的那一份是什么？建议 150 字以上。',
    minLength: 150,
    rows: 6,
  },
  {
    key: 'action_plan' as const,
    label: '个人绿色行动方案',
    hint: '把参观后的承诺写成可执行、可检查的行动，建议 100 字以上。',
    minLength: 100,
    rows: 5,
  },
]

export type Answers = Record<string, string>

export function countChars(text: string | null | undefined): number {
  if (!text) return 0
  return text.replace(/\s/g, '').length
}

export function allFields(): FieldDef[] {
  return STAGES.flatMap((stage) => stage.fields)
}

export function countFilledFields(answersList: Answers[]): number {
  const merged: Answers = {}
  for (const answers of answersList) {
    for (const [key, value] of Object.entries(answers ?? {})) {
      if (typeof value === 'string' && value.trim()) merged[key] = value
    }
  }
  return allFields().filter((field) => countChars(merged[field.key]) >= 10).length
}

export interface ScoreDimension {
  key: string
  label: string
  score: number
  max: number
  comment: string
}

export interface RuleScoreResult {
  total: number
  level: string
  dimensions: ScoreDimension[]
  missing: string[]
  totalChars: number
}

const THINK_KEYWORDS = ['生态', '可持续', '绿色', '保护', '循环', '责任', '发展', '节水', '环境', '水质']
const ACTION_KEYWORDS = ['每周', '每天', '每月', '计划', '参与', '减少', '坚持', '监督', '宣传', '记录']

function hitCount(text: string, keywords: string[]): number {
  return keywords.reduce((acc, keyword) => (text.includes(keyword) ? acc + 1 : acc), 0)
}

function clampScore(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)))
}

/** 规则评分：100 分制，五个维度，完全基于学生实际填写内容计算 */
export function computeRuleScore(
  answersList: Answers[],
  report: { highlights?: string | null; reflection?: string | null; action_plan?: string | null },
): RuleScoreResult {
  const merged: Answers = {}
  for (const answers of answersList) {
    for (const [key, value] of Object.entries(answers ?? {})) {
      if (typeof value === 'string' && value.trim()) merged[key] = value
    }
  }

  const requiredFields = allFields().filter((field) => field.required)
  const filledRequired = requiredFields.filter((field) => countChars(merged[field.key]) >= 10)
  const coverage = requiredFields.length
    ? (filledRequired.length / requiredFields.length) * 30
    : 0

  const recordChars = allFields().reduce((acc, field) => acc + countChars(merged[field.key]), 0)
  const reportChars =
    countChars(report.highlights) + countChars(report.reflection) + countChars(report.action_plan)
  const totalChars = recordChars + reportChars
  const detail = (totalChars / 900) * 20

  const evidenceRecords = allFields().filter((field) => {
    const text = merged[field.key] ?? ''
    if (countChars(text) < 20) return false
    const hasNumber = /\d/.test(text)
    const hasQualifier = /(公里|平方|米|立方米|亿|万|吨|升|天|小时|类|级|度|%|％)/.test(text)
    return hasNumber || hasQualifier || text.includes('来源')
  }).length
  const evidence = (evidenceRecords / 10) * 20

  const reflectionText = `${report.reflection ?? ''}`
  const thinking = (countChars(reflectionText) / 200) * 9 + (hitCount(reflectionText, THINK_KEYWORDS) / 5) * 6

  const actionText = `${report.action_plan ?? ''}`
  const action =
    (countChars(actionText) / 150) * 8 + (hitCount(actionText, ACTION_KEYWORDS) / 3) * 7

  const dimensions: ScoreDimension[] = [
    {
      key: 'coverage',
      label: '关键点覆盖',
      score: clampScore(coverage, 30),
      max: 30,
      comment: `必填关键点已完成 ${filledRequired.length}/${requiredFields.length} 项`,
    },
    {
      key: 'detail',
      label: '记录详实度',
      score: clampScore(detail, 20),
      max: 20,
      comment: `记录与报告合计 ${totalChars} 字（900 字为满分基准）`,
    },
    {
      key: 'evidence',
      label: '数据与证据',
      score: clampScore(evidence, 20),
      max: 20,
      comment: `${evidenceRecords} 条记录包含数字、单位或来源信息`,
    },
    {
      key: 'thinking',
      label: '思考深度',
      score: clampScore(thinking, 15),
      max: 15,
      comment: `反思 ${countChars(reflectionText)} 字，命中 ${hitCount(reflectionText, THINK_KEYWORDS)} 个绿色主题关键词`,
    },
    {
      key: 'action',
      label: '行动可执行',
      score: clampScore(action, 15),
      max: 15,
      comment: `行动方案 ${countChars(actionText)} 字，命中 ${hitCount(actionText, ACTION_KEYWORDS)} 个可执行要素`,
    },
  ]

  const total = dimensions.reduce((acc, item) => acc + item.score, 0)
  const level = total >= 90 ? '优秀' : total >= 75 ? '良好' : total >= 60 ? '合格' : '待完善'
  const missing = requiredFields
    .filter((field) => countChars(merged[field.key]) < 10)
    .map((field) => field.label)

  return { total, level, dimensions, missing, totalChars }
}
