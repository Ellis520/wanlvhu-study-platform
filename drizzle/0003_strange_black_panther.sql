CREATE TABLE "project_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"paper" jsonb,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video" jsonb,
	"paper_text" text DEFAULT '' NOT NULL,
	"paper_parse_status" text DEFAULT 'none' NOT NULL,
	"paper_parse_task_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"ai_score" integer,
	"ai_review" text,
	"ai_reviewed_at" timestamp with time zone,
	"teacher_score" integer,
	"teacher_comment" text,
	"teacher_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_trip_id_study_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "study_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_submissions_user_trip_key" ON "project_submissions" USING btree ("user_id","trip_id");--> statement-breakpoint
CREATE INDEX "project_submissions_trip_idx" ON "project_submissions" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "project_submissions_status_idx" ON "project_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_submissions_submitted_at_idx" ON "project_submissions" USING btree ("submitted_at");--> statement-breakpoint
CREATE POLICY "project_submissions_owner_select" ON "project_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "project_submissions"."user_id" OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'teacher'));--> statement-breakpoint
CREATE POLICY "project_submissions_owner_insert" ON "project_submissions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "project_submissions"."user_id");--> statement-breakpoint
CREATE POLICY "project_submissions_owner_update" ON "project_submissions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "project_submissions"."user_id" OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'teacher')) WITH CHECK ((SELECT auth.uid()) = "project_submissions"."user_id" OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'teacher'));--> statement-breakpoint
CREATE POLICY "project_submissions_owner_delete" ON "project_submissions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = "project_submissions"."user_id");--> statement-breakpoint

-- === managed grants ===
REVOKE ALL ON TABLE project_submissions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_submissions TO authenticated;
