/** Repository export: grades are based on submitted evidence, never identity. */
export interface ScoreRule { min: number; max: number; fillWhenNull: boolean }
export const SPECIAL_SCORE_RULES: Record<string, ScoreRule> = {}
export const DEFAULT_SCORE_RULE: ScoreRule = { min: 0, max: 100, fillWhenNull: false }
export function scoreRuleFor(_name: string | null | undefined): ScoreRule | null { return null }
export function scoreFloorFor(_name: string | null | undefined): number | null { return null }
export function applyScoreFloor(_name: string | null | undefined, score: number | null): { score: number | null; floored: boolean; floor: number | null } {
  return { score: typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null, floored: false, floor: null }
}
export function scoreFloorPromptNote(_name: string | null | undefined): string { return '' }
