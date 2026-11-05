CREATE TYPE "AiReviewJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'NEEDS_REVIEW');

CREATE TABLE "ai_review_jobs" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "status" "AiReviewJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "decision" TEXT,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "extracted_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_review_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_review_jobs_submission_id_key" ON "ai_review_jobs"("submission_id");
CREATE INDEX "ai_review_jobs_status_next_attempt_at_created_at_idx"
ON "ai_review_jobs"("status", "next_attempt_at", "created_at");

ALTER TABLE "ai_review_jobs"
ADD CONSTRAINT "ai_review_jobs_submission_id_fkey"
FOREIGN KEY ("submission_id") REFERENCES "task_submissions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
