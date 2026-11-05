CREATE TYPE "PayoutAccountStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "PaymentFlow" AS ENUM ('DEPOSIT', 'PAYOUT');
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('CREATED', 'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

ALTER TABLE "withdrawal_requests"
ADD COLUMN "payout_account_id" UUID;

CREATE TABLE "payout_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider_code" TEXT NOT NULL,
    "method_code" TEXT NOT NULL,
    "account_holder" TEXT NOT NULL,
    "account_details_ciphertext" TEXT NOT NULL,
    "account_details_iv" TEXT NOT NULL,
    "account_details_tag" TEXT NOT NULL,
    "masked_account" TEXT NOT NULL,
    "status" "PayoutAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_provider_configs" (
    "id" UUID NOT NULL,
    "provider_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'SANDBOX',
    "credentials_ciphertext" TEXT,
    "credentials_iv" TEXT,
    "credentials_tag" TEXT,
    "webhook_secret_ciphertext" TEXT,
    "webhook_secret_iv" TEXT,
    "webhook_secret_tag" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "supported_currencies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_provider_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_id" UUID,
    "withdrawal_request_id" UUID,
    "provider_code" TEXT NOT NULL,
    "flow" "PaymentFlow" NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'CREATED',
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "provider_transaction_id" TEXT,
    "provider_reference" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_provider_configs_provider_code_key" ON "payment_provider_configs"("provider_code");
CREATE UNIQUE INDEX "payment_transactions_idempotency_key_key" ON "payment_transactions"("idempotency_key");
CREATE UNIQUE INDEX "payment_transactions_provider_code_provider_transaction_id_key" ON "payment_transactions"("provider_code", "provider_transaction_id");
CREATE INDEX "payout_accounts_user_id_status_created_at_idx" ON "payout_accounts"("user_id", "status", "created_at");
CREATE INDEX "payment_transactions_user_id_created_at_idx" ON "payment_transactions"("user_id", "created_at");
CREATE INDEX "payment_transactions_status_created_at_idx" ON "payment_transactions"("status", "created_at");
CREATE INDEX "payment_transactions_withdrawal_request_id_idx" ON "payment_transactions"("withdrawal_request_id");
CREATE INDEX "withdrawal_requests_payout_account_id_idx" ON "withdrawal_requests"("payout_account_id");

ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_wallet_id_fkey"
FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_withdrawal_request_id_fkey"
FOREIGN KEY ("withdrawal_request_id") REFERENCES "withdrawal_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_provider_code_fkey"
FOREIGN KEY ("provider_code") REFERENCES "payment_provider_configs"("provider_code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_payout_account_id_fkey"
FOREIGN KEY ("payout_account_id") REFERENCES "payout_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
