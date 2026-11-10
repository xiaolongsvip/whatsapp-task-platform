ALTER TABLE "payment_provider_configs"
  ADD COLUMN "service_provider_name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "supported_channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "minimum_payout_minor" BIGINT,
  ADD COLUMN "maximum_payout_minor" BIGINT;
