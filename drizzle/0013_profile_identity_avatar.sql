-- 资料页需要姓名 + 学号 + 头像：profiles 补充学号与头像字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS student_code text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_preset text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- 学号在名册里唯一，避免同名同号歧义
CREATE UNIQUE INDEX IF NOT EXISTS class_roster_code_key
  ON class_roster (student_code)
  WHERE student_code IS NOT NULL;

/**
 * 学生登录后用自己的学号认领名册里那一行。
 * 学生无权读整张名册，所以用 SECURITY DEFINER 只做「学号 + 姓名」精确匹配并绑定 user_id，
 * 仅返回布尔值，不泄露其它行数据。
 */
CREATE OR REPLACE FUNCTION claim_roster_row(p_code text, p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO matched
  FROM class_roster
  WHERE student_code = btrim(p_code)
    AND display_name = btrim(p_name);

  IF matched = 0 THEN
    RETURN false;
  END IF;

  UPDATE class_roster
  SET user_id = auth.uid()
  WHERE student_code = btrim(p_code)
    AND display_name = btrim(p_name);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION claim_roster_row(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION claim_roster_row(text, text) TO authenticated;

-- === managed grants ===
REVOKE ALL ON profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;
