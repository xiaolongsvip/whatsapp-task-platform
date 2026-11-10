ALTER TABLE "withdrawal_requests"
  ADD COLUMN "payout_currency" CHAR(3),
  ADD COLUMN "payout_amount_minor" BIGINT,
  ADD COLUMN "exchange_rate" DECIMAL(30,12),
  ADD COLUMN "exchange_rate_source" VARCHAR(80),
  ADD COLUMN "fee_amount_minor" BIGINT,
  ADD COLUMN "fee_currency" CHAR(3),
  ADD COLUMN "payout_method" VARCHAR(40),
  ADD COLUMN "payout_provider_code" VARCHAR(80),
  ADD COLUMN "payout_network" VARCHAR(20);

ALTER TABLE "payout_accounts"
  ADD COLUMN "bank_code" VARCHAR(80),
  ADD COLUMN "network" VARCHAR(20);

CREATE INDEX "withdrawal_requests_payout_currency_status_created_at_idx"
  ON "withdrawal_requests" ("payout_currency", "status", "created_at");
