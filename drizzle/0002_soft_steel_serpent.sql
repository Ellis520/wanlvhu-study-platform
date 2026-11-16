CREATE TABLE "post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "post_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_favorites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "post_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_likes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"class_name" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_favorites" ADD CONSTRAINT "post_favorites_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_favorites" ADD CONSTRAINT "post_favorites_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_comments_post_idx" ON "post_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_comments_created_at_idx" ON "post_comments" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_favorites_post_user_key" ON "post_favorites" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "post_favorites_user_idx" ON "post_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_likes_post_user_key" ON "post_likes" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "post_likes_post_idx" ON "post_likes" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "posts_user_idx" ON "posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "posts_class_idx" ON "posts" USING btree ("class_name");--> statement-breakpoint
CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE POLICY "post_comments_visible_select" ON "post_comments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM posts p WHERE p.id = "post_comments"."post_id"));--> statement-breakpoint
CREATE POLICY "post_comments_owner_insert" ON "post_comments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "post_comments"."user_id" AND EXISTS (SELECT 1 FROM posts p WHERE p.id = "post_comments"."post_id"));--> statement-breakpoint
CREATE POLICY "post_comments_delete" ON "post_comments" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = "post_comments"."user_id" OR EXISTS (SELECT 1 FROM posts p WHERE p.id = "post_comments"."post_id" AND p.user_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "post_favorites_owner_select" ON "post_favorites" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "post_favorites"."user_id");--> statement-breakpoint
CREATE POLICY "post_favorites_owner_insert" ON "post_favorites" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "post_favorites"."user_id" AND EXISTS (SELECT 1 FROM posts p WHERE p.id = "post_favorites"."post_id"));--> statement-breakpoint
CREATE POLICY "post_favorites_owner_delete" ON "post_favorites" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = "post_favorites"."user_id");--> statement-breakpoint
CREATE POLICY "post_likes_visible_select" ON "post_likes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM posts p WHERE p.id = "post_likes"."post_id"));--> statement-breakpoint
CREATE POLICY "post_likes_owner_insert" ON "post_likes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "post_likes"."user_id" AND EXISTS (SELECT 1 FROM posts p WHERE p.id = "post_likes"."post_id"));--> statement-breakpoint
CREATE POLICY "post_likes_owner_delete" ON "post_likes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = "post_likes"."user_id");--> statement-breakpoint
CREATE POLICY "posts_class_select" ON "posts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (("posts"."class_name" <> '' AND "posts"."class_name" = (SELECT p.class_name FROM profiles p WHERE p.id = (SELECT auth.uid()))) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'teacher') OR (SELECT auth.uid()) = "posts"."user_id");--> statement-breakpoint
CREATE POLICY "posts_owner_insert" ON "posts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "posts"."user_id");--> statement-breakpoint
CREATE POLICY "posts_owner_delete" ON "posts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = "posts"."user_id");


-- === Coder managed grants ===
REVOKE ALL ON TABLE posts FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE posts TO authenticated;


REVOKE ALL ON TABLE post_likes FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE post_likes TO authenticated;


REVOKE ALL ON TABLE post_favorites FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE post_favorites TO authenticated;


REVOKE ALL ON TABLE post_comments FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE post_comments TO authenticated;
