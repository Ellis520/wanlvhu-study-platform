CREATE TABLE "memory_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"card_order" integer DEFAULT 0 NOT NULL,
	"reflection" text DEFAULT '' NOT NULL,
	"photo_file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memory_checkins" ADD CONSTRAINT "memory_checkins_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_checkins" ADD CONSTRAINT "memory_checkins_trip_id_study_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "study_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_checkins_user_card_key" ON "memory_checkins" USING btree ("user_id","trip_id","card_id");--> statement-breakpoint
CREATE INDEX "memory_checkins_trip_idx" ON "memory_checkins" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "memory_checkins_user_idx" ON "memory_checkins" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "memory_checkins_owner_select" ON "memory_checkins" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "memory_checkins"."user_id");--> statement-breakpoint
CREATE POLICY "memory_checkins_owner_insert" ON "memory_checkins" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "memory_checkins"."user_id");--> statement-breakpoint
CREATE POLICY "memory_checkins_owner_update" ON "memory_checkins" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "memory_checkins"."user_id") WITH CHECK ((SELECT auth.uid()) = "memory_checkins"."user_id");--> statement-breakpoint
CREATE POLICY "memory_checkins_owner_delete" ON "memory_checkins" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = "memory_checkins"."user_id");


-- === Coder managed grants ===
REVOKE ALL ON TABLE memory_checkins FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE memory_checkins TO authenticated;
