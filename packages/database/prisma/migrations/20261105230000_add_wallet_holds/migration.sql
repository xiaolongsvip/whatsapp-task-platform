CREATE TYPE "WalletHoldStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CAPTURED');
CREATE TYPE "WalletHoldEventType" AS ENUM ('FROZEN', 'RELEASED', 'CAPTURED');

CREATE TABLE "wallet_holds" (
  "id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "WalletHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason" VARCHAR(500) NOT NULL,
  "reference_type" VARCHAR(80),
  "reference_id" VARCHAR(160),
  "idempotency_key" TEXT NOT NULL,
  "created_by_admin_id" UUID NOT NULL,
  "resolved_by_admin_id" UUID,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wallet_holds_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "wallet_hold_events" (
  "id" UUID NOT NULL,
  "hold_id" UUID NOT NULL,
  "event_type" "WalletHoldEventType" NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "admin_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_hold_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wallet_holds_idempotency_key_key" ON "wallet_holds"("idempotency_key");
CREATE UNIQUE INDEX "wallet_hold_events_idempotency_key_key" ON "wallet_hold_events"("idempotency_key");
CREATE INDEX "wallet_holds_wallet_id_status_created_at_idx" ON "wallet_holds"("wallet_id","status","created_at");
CREATE INDEX "wallet_holds_reference_type_reference_id_idx" ON "wallet_holds"("reference_type","reference_id");
CREATE INDEX "wallet_hold_events_hold_id_created_at_idx" ON "wallet_hold_events"("hold_id","created_at");
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_resolved_by_admin_id_fkey" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wallet_hold_events" ADD CONSTRAINT "wallet_hold_events_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "wallet_holds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wallet_hold_events" ADD CONSTRAINT "wallet_hold_events_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
