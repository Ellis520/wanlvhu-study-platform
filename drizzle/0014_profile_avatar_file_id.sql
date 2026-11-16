-- 头像统一存「预置 key」或「对象存储 fileId」，avatar_url 作废（profiles 为空表，删除无数据风险）
ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_url;

-- 学号在名册里唯一，避免同名同号歧义
CREATE UNIQUE INDEX IF NOT EXISTS class_roster_code_key
  ON class_roster (student_code)
  WHERE student_code IS NOT NULL;
