CREATE TABLE "risk_rules" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "impact_score" INTEGER NOT NULL DEFAULT 0,
  "execution_order" INTEGER NOT NULL DEFAULT 100,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "risk_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "risk_rules_status_execution_order_idx" ON "risk_rules"("status", "execution_order");
CREATE INDEX "risk_rules_category_idx" ON "risk_rules"("category");
