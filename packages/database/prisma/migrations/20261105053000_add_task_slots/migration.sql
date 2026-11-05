-- Add per-number task slots without deleting existing business data.
CREATE TYPE "TaskSlotStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'USED');

CREATE TABLE "task_slots" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "contact_number_id" UUID NOT NULL,
    "claim_id" UUID,
    "status" "TaskSlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "assigned_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "task_slots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_slots_contact_number_id_key" ON "task_slots"("contact_number_id");
CREATE UNIQUE INDEX "task_slots_claim_id_key" ON "task_slots"("claim_id");
CREATE INDEX "task_slots_task_id_status_created_at_idx" ON "task_slots"("task_id", "status", "created_at");

DROP INDEX IF EXISTS "task_claims_task_id_user_id_key";
CREATE INDEX "task_claims_task_id_user_id_status_idx" ON "task_claims"("task_id", "user_id", "status");

ALTER TABLE "task_slots"
  ADD CONSTRAINT "task_slots_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_slots"
  ADD CONSTRAINT "task_slots_contact_number_id_fkey"
  FOREIGN KEY ("contact_number_id") REFERENCES "contact_numbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_slots"
  ADD CONSTRAINT "task_slots_claim_id_fkey"
  FOREIGN KEY ("claim_id") REFERENCES "task_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill currently available and consented numbers to the oldest published task.
-- If no task is published yet, numbers remain in the pool for the next publish.
INSERT INTO "task_slots" (
  "id", "task_id", "contact_number_id", "status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  target_task.id,
  number.id,
  'AVAILABLE'::"TaskSlotStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "contact_numbers" AS number
CROSS JOIN LATERAL (
  SELECT task.id
  FROM "tasks" AS task
  WHERE task.status = 'PUBLISHED'
    AND (task.ends_at IS NULL OR task.ends_at >= CURRENT_TIMESTAMP)
  ORDER BY task.created_at ASC, task.id ASC
  LIMIT 1
) AS target_task
WHERE number.status = 'AVAILABLE'
  AND number.consent_status = 'GRANTED'
  AND NOT EXISTS (
    SELECT 1 FROM "task_slots" AS existing_slot
    WHERE existing_slot.contact_number_id = number.id
  );
