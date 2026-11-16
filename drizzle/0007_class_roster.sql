CREATE TABLE "class_roster" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_no" integer NOT NULL,
	"display_name" text NOT NULL,
	"class_name" text DEFAULT '' NOT NULL,
	"user_id" uuid,
	"reference_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_roster" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_roster" ADD CONSTRAINT "class_roster_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_roster_student_no_key" ON "class_roster" USING btree ("student_no");--> statement-breakpoint
CREATE INDEX "class_roster_name_idx" ON "class_roster" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "class_roster_user_idx" ON "class_roster" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "class_roster_teacher_select" ON "class_roster" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'teacher'));--> statement-breakpoint

-- === managed grants ===
-- 名册只读：教师端展示全班任务完成情况；写入只走迁移，不向业务开放
REVOKE ALL ON TABLE class_roster FROM anon, authenticated;
GRANT SELECT ON TABLE class_roster TO authenticated;--> statement-breakpoint

-- === roster seed（37 名学生；reference_score 仅供服务端 AI 评分校准，不对页面展示）===
-- Real class roster seed omitted from repository export.
