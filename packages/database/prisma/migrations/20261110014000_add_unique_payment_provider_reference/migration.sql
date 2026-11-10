-- Prevent two concurrent payout registrations from reusing the same provider reference.
-- Fail explicitly rather than silently choosing a winner if historical duplicates exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM payment_transactions
    WHERE provider_reference IS NOT NULL
    GROUP BY provider_code, provider_reference, flow
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add payout reference uniqueness: duplicate provider_code/provider_reference/flow values already exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "payment_transactions_provider_code_provider_reference_flow_key"
ON "payment_transactions"("provider_code", "provider_reference", "flow");
