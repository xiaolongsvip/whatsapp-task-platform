-- A provider payout reference must not be reused for a second payout.
-- NULL references remain allowed for non-manual/provider-created transactions.
CREATE UNIQUE INDEX "payment_transactions_provider_payout_reference_key"
  ON "payment_transactions" ("provider_code", "provider_reference")
  WHERE "flow" = 'PAYOUT' AND "provider_reference" IS NOT NULL;
