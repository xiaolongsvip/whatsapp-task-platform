ALTER TABLE "task_submissions" ADD COLUMN "content_sha256" CHAR(64);
CREATE INDEX "task_submissions_content_sha256_idx" ON "task_submissions"("content_sha256");