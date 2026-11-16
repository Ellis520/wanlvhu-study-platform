-- 分享圈可见性修正：原来的 posts_class_select 要求「发布时班级非空且与查看者班级相同」，
-- 导致未填班级的学生动态只有自己和老师能看到，后加入、换了班级的同学也看不到旧动态。
-- 现在分享圈对所有登录用户开放（公共广场），写入/删除/更新仍严格限定作者本人。
DROP POLICY IF EXISTS "posts_class_select" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_public_select" ON "posts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint

-- === managed grants ===
REVOKE ALL ON TABLE posts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE posts TO authenticated;
