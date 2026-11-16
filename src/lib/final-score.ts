/**
 * 项目作品的最终成绩口径（教师要求）。
 *
 * 规则：
 * 1. 教师给了分 → 最终成绩就是教师评分，即使 AI 分更高也不覆盖教师判断。
 * 2. 教师没给分 → 最终成绩取该生历次 AI 评分中的最高分（best_ai_score），
 *    缺失时退回当前 ai_score（老数据没有 best_ai_score 时的兜底）。
 * 3. 两者都没有 → 还没有最终成绩。
 *
 * 学生端与教师端所有「最终成绩 / 项目得分」的展示都走这里，避免各处口径不一致。
 */

export type ScoreSource = 'teacher' | 'ai' | 'none'

export interface ScoreInput {
  teacher_score?: number | null
  best_ai_score?: number | null
  ai_score?: number | null
}

export interface FinalScore {
  score: number | null
  source: ScoreSource
}

export function resolveFinalScore(row: ScoreInput | null | undefined): FinalScore {
  if (!row) return { score: null, source: 'none' }
  if (row.teacher_score != null) return { score: row.teacher_score, source: 'teacher' }
  const ai = row.best_ai_score ?? row.ai_score ?? null
  return ai != null ? { score: ai, source: 'ai' } : { score: null, source: 'none' }
}

/** 展示用来源文案：教师分优先，没有教师分时说明取的是 AI 最高分 */
export function scoreSourceLabel(source: ScoreSource): string {
  if (source === 'teacher') return '教师评分'
  if (source === 'ai') return 'AI 最高分'
  return '尚未评分'
}

/** 把 0-100 的分数格式化成 "95/100"，无分时返回 "—" */
export function formatScore(score: number | null): string {
  return score == null ? '—' : `${score}/100`
}
