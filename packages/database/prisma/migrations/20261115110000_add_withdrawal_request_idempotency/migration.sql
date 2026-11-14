ALTER TABLE "withdrawal_requests"
    ADD COLUMN "idempotency_key" VARCHAR(64);

CREATE UNIQUE INDEX "withdrawal_requests_idempotency_key_key"
    ON "withdrawal_requests"("idempotency_key");
