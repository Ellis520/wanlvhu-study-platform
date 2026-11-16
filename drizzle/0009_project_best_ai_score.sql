-- 历次 AI 评分中的最高分：教师没有给分时，最终成绩取这个分数
ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS best_ai_score integer;

-- 回填历史数据：现有 ai_score 视为已出现的最高分
UPDATE project_submissions
SET best_ai_score = ai_score
WHERE best_ai_score IS NULL
  AND ai_score IS NOT NULL;

-- === managed grants ===
-- 新增列沿用 project_submissions 的表级权限（authenticated 的 SELECT/INSERT/UPDATE + RLS 过滤），
-- 不需要额外列级授权，也不在此处提升任何角色的权限。
