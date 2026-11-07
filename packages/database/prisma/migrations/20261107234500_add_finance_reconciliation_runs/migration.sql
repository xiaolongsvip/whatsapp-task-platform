CREATE TABLE "finance_reconciliation_runs" (
  "id" UUID NOT NULL,
  "trigger_type" VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  "status" VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
  "checked_count" INTEGER NOT NULL DEFAULT 0,
  "exception_count" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB,
  "items" JSONB,
  "created_by_admin_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "finance_reconciliation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "finance_reconciliation_runs_created_at_idx" ON "finance_reconciliation_runs"("created_at");
CREATE INDEX "finance_reconciliation_runs_status_created_at_idx" ON "finance_reconciliation_runs"("status", "created_at");
