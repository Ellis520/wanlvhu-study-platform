ALTER TABLE "posts" ADD COLUMN "journey" jsonb;

-- === managed grants ===
-- 本次只新增「研学之旅」快照列，posts 的可见性与读写权限维持最小集不变
REVOKE ALL ON TABLE posts FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE posts TO authenticated;