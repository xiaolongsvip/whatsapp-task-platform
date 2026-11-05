-- AI-generated reviews do not have a human admin reviewer.
ALTER TABLE "task_reviews"
  ALTER COLUMN "reviewer_admin_id" DROP NOT NULL;
