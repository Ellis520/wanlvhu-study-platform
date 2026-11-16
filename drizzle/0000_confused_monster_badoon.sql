CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"class_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"title" text DEFAULT '万绿湖绿色发展区研学报告' NOT NULL,
	"highlights" text DEFAULT '' NOT NULL,
	"reflection" text DEFAULT '' NOT NULL,
	"action_plan" text DEFAULT '' NOT NULL,
	"rule_score" integer,
	"rule_detail" jsonb,
	"ai_review" text,
	"ai_score" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"teacher_comment" text,
	"teacher_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stage_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "study_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"destination" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_trips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_trip_id_study_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "study_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_records" ADD CONSTRAINT "stage_records_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_records" ADD CONSTRAINT "stage_records_trip_id_study_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "study_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_role_idx" ON "profiles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_user_trip_key" ON "reports" USING btree ("user_id","trip_id");--> statement-breakpoint
CREATE INDEX "reports_trip_idx" ON "reports" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_records_user_trip_stage_key" ON "stage_records" USING btree ("user_id","trip_id","stage");--> statement-breakpoint
CREATE INDEX "stage_records_trip_idx" ON "stage_records" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "study_trips_start_date_idx" ON "study_trips" USING btree ("start_date");--> statement-breakpoint
CREATE POLICY "profiles_select_authenticated" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "profiles_insert_self" ON "profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "profiles"."id");--> statement-breakpoint
CREATE POLICY "profiles_update_self" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "profiles"."id") WITH CHECK ((SELECT auth.uid()) = "profiles"."id");--> statement-breakpoint
CREATE POLICY "reports_owner_select" ON "reports" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "reports"."user_id" OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'teacher'));--> statement-breakpoint
CREATE POLICY "reports_owner_insert" ON "reports" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "reports"."user_id");--> statement-breakpoint
CREATE POLICY "reports_owner_update" ON "reports" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "reports"."user_id" OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'teacher')) WITH CHECK ((SELECT auth.uid()) = "reports"."user_id" OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'teacher'));--> statement-breakpoint
CREATE POLICY "reports_owner_delete" ON "reports" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = "reports"."user_id");--> statement-breakpoint
CREATE POLICY "stage_records_owner_select" ON "stage_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "stage_records"."user_id" OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'teacher'));--> statement-breakpoint
CREATE POLICY "stage_records_owner_insert" ON "stage_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "stage_records"."user_id");--> statement-breakpoint
CREATE POLICY "stage_records_owner_update" ON "stage_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "stage_records"."user_id") WITH CHECK ((SELECT auth.uid()) = "stage_records"."user_id");--> statement-breakpoint
CREATE POLICY "stage_records_owner_delete" ON "stage_records" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = "stage_records"."user_id");--> statement-breakpoint
CREATE POLICY "study_trips_select_authenticated" ON "study_trips" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

-- === managed grants ===
REVOKE ALL ON TABLE profiles FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE profiles TO authenticated;

REVOKE ALL ON TABLE study_trips FROM anon, authenticated;
GRANT SELECT ON TABLE study_trips TO authenticated;

REVOKE ALL ON TABLE stage_records FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE stage_records TO authenticated;

REVOKE ALL ON TABLE reports FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE reports TO authenticated;

-- === seed 研学项目 ===
INSERT INTO study_trips (id, title, destination, start_date, end_date, summary)
VALUES (
	'11111111-1111-4111-8111-111111111111',
	'万绿湖绿色发展区研学',
	'广东省河源市万绿湖绿色发展区',
	'2026-11-14',
	'2026-11-15',
	'两日研学，沿着「水—湿地—绿色产业」三条线索观察万绿湖：11 月 14 日上午抵达并参观水库大坝与水文化展馆，下午进入湿地片区做生态观察；11 月 15 日上午走访绿色发展产业园与生态农业基地，下午分组汇报与总结。'
)
ON CONFLICT (id) DO NOTHING;
