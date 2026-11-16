CREATE POLICY "posts_owner_update" ON "posts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "posts"."user_id") WITH CHECK ((SELECT auth.uid()) = "posts"."user_id");

-- === managed grants ===
-- 允许学生覆盖更新自己已发表的「研学之旅」回顾（补拍照片后重新发表即可刷新快照），可见性维持最小集不变
GRANT UPDATE ON TABLE posts TO authenticated;
