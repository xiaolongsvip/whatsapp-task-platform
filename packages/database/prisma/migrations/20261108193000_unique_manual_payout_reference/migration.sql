-- Refuse to install the constraint if legacy payout references are already duplicated.
-- This is a read-only preflight: it never changes or deletes historical transactions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payment_transactions"
    WHERE "flow" = 'PAYOUT'
      AND "provider_reference" IS NOT NULL
    GROUP BY "provider_code", "provider_reference"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add unique payout reference index: duplicate provider_code/provider_reference pairs already exist in payment_transactions. Review and reconcile legacy payout records before retrying this migration.';
  END IF;
END
$$;

-- A provider payout reference must not be reused for a second payout.
-- NULL references remain allowed for non-manual/provider-created transactions.
CREATE UNIQUE INDEX "payment_transactions_provider_payout_reference_key"
  ON "payment_transactions" ("provider_code", "provider_reference")
  WHERE "flow" = 'PAYOUT' AND "provider_reference" IS NOT NULL;
