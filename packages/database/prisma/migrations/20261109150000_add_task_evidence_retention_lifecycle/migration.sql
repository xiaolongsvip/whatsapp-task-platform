ALTER TABLE "task_submissions"
  ADD COLUMN "evidence_deleted_at" TIMESTAMP(3),
  ADD COLUMN "evidence_delete_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "evidence_delete_next_attempt_at" TIMESTAMP(3),
  ADD COLUMN "evidence_delete_locked_at" TIMESTAMP(3),
  ADD COLUMN "evidence_delete_last_error" TEXT;

CREATE INDEX "task_submissions_status_submitted_evidence_deleted_idx"
  ON "task_submissions"("status", "submitted_at", "evidence_deleted_at");

CREATE INDEX "task_submissions_evidence_delete_retry_idx"
  ON "task_submissions"("evidence_delete_next_attempt_at", "evidence_delete_locked_at");
