ALTER TABLE "payment_provider_configs"
  ADD COLUMN "country_code" TEXT NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN "method_code" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
  ADD COLUMN "api_base_url" TEXT,
  ADD COLUMN "merchant_id" TEXT;

CREATE INDEX "payment_provider_configs_country_code_idx"
  ON "payment_provider_configs"("country_code");
