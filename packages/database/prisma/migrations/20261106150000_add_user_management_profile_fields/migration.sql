ALTER TABLE "user_profiles"
  ADD COLUMN "daily_task_limit" INTEGER,
  ADD COLUMN "min_claim_interval_seconds" INTEGER,
  ADD COLUMN "reputation_score" INTEGER NOT NULL DEFAULT 60;
