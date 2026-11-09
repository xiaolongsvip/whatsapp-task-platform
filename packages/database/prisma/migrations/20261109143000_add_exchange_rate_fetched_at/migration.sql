ALTER TABLE "withdrawal_requests"
  ADD COLUMN "exchange_rate_fetched_at" TIMESTAMP(3);
ALTER TABLE "withdrawal_requests"
  ADD COLUMN "exchange_rate_provider_updated_at" TIMESTAMP(3);
ALTER TABLE "withdrawal_requests"
  ADD COLUMN "exchange_rate_effective_at" TIMESTAMP(3);
