ALTER TABLE "project_submissions" ADD COLUMN "submit_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- 历史提交补一次版本计数，避免旧作品显示「第 0 次提交」
UPDATE "project_submissions" SET "submit_count" = 1 WHERE "status" = 'submitted' AND "submit_count" = 0;