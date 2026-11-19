-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('CLAIMED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContactNumberStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'USED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ContactConsentStatus" AS ENUM ('UNKNOWN', 'GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ContactAssignmentStatus" AS ENUM ('ASSIGNED', 'RELEASED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "referral_code" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "referral_edges" (
    "id" UUID NOT NULL,
    "invitee_user_id" UUID NOT NULL,
    "inviter_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_ancestors" (
    "descendant_user_id" UUID NOT NULL,
    "ancestor_user_id" UUID NOT NULL,
    "depth" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_ancestors_pkey" PRIMARY KEY ("descendant_user_id","depth")
);

-- CreateTable
CREATE TABLE "contact_import_batches" (
    "id" UUID NOT NULL,
    "file_name" TEXT,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_numbers" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "status" "ContactNumberStatus" NOT NULL DEFAULT 'AVAILABLE',
    "consent_status" "ContactConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consent_source" TEXT,
    "consented_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "import_batch_id" UUID,
    "import_order" BIGSERIAL NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_consent_events" (
    "id" UUID NOT NULL,
    "contact_number_id" UUID NOT NULL,
    "status" "ContactConsentStatus" NOT NULL,
    "source" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_assignments" (
    "id" UUID NOT NULL,
    "contact_number_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ContactAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "contact_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "reward_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "capacity" INTEGER,
    "claimed_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "message_template" TEXT,
    "link_url" TEXT,
    "preview_title" TEXT,
    "preview_description" TEXT,
    "preview_image_url" TEXT,
    "policy_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_claims" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'CLAIMED',
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,

    CONSTRAINT "task_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_submissions" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "note" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "idempotency_key" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "original_name" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_reviews" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "reviewer_admin_id" UUID NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "reason" TEXT,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_rewards" (
    "id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "source_user_id" UUID NOT NULL,
    "source_event_id" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "reviewed_by_id" UUID,
    "payout_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user_roles" (
    "admin_user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("admin_user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_status_created_at_idx" ON "users"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_expires_at_idx" ON "auth_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "referral_edges_invitee_user_id_key" ON "referral_edges"("invitee_user_id");

-- CreateIndex
CREATE INDEX "referral_edges_inviter_user_id_created_at_idx" ON "referral_edges"("inviter_user_id", "created_at");

-- CreateIndex
CREATE INDEX "referral_ancestors_ancestor_user_id_depth_idx" ON "referral_ancestors"("ancestor_user_id", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "referral_ancestors_descendant_user_id_ancestor_user_id_key" ON "referral_ancestors"("descendant_user_id", "ancestor_user_id");

-- CreateIndex
CREATE INDEX "contact_import_batches_created_at_idx" ON "contact_import_batches"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contact_numbers_phone_e164_key" ON "contact_numbers"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "contact_numbers_import_order_key" ON "contact_numbers"("import_order");

-- CreateIndex
CREATE INDEX "contact_numbers_status_consent_status_import_order_idx" ON "contact_numbers"("status", "consent_status", "import_order");

-- CreateIndex
CREATE INDEX "contact_numbers_import_batch_id_import_order_idx" ON "contact_numbers"("import_batch_id", "import_order");

-- CreateIndex
CREATE INDEX "contact_consent_events_contact_number_id_recorded_at_idx" ON "contact_consent_events"("contact_number_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "contact_assignments_claim_id_key" ON "contact_assignments"("claim_id");

-- CreateIndex
CREATE INDEX "contact_assignments_contact_number_id_status_assigned_at_idx" ON "contact_assignments"("contact_number_id", "status", "assigned_at");

-- CreateIndex
CREATE INDEX "contact_assignments_user_id_assigned_at_idx" ON "contact_assignments"("user_id", "assigned_at");

-- CreateIndex
CREATE INDEX "tasks_status_starts_at_ends_at_idx" ON "tasks"("status", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_claims_idempotency_key_key" ON "task_claims"("idempotency_key");

-- CreateIndex
CREATE INDEX "task_claims_user_id_status_claimed_at_idx" ON "task_claims"("user_id", "status", "claimed_at");

-- CreateIndex
CREATE INDEX "task_claims_task_id_status_idx" ON "task_claims"("task_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_claims_task_id_user_id_key" ON "task_claims"("task_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_submissions_idempotency_key_key" ON "task_submissions"("idempotency_key");

-- CreateIndex
CREATE INDEX "task_submissions_status_submitted_at_idx" ON "task_submissions"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "task_submissions_claim_id_submitted_at_idx" ON "task_submissions"("claim_id", "submitted_at");

-- CreateIndex
CREATE INDEX "task_reviews_submission_id_reviewed_at_idx" ON "task_reviews"("submission_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_currency_key" ON "wallets"("user_id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_idempotency_key_key" ON "ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_entries_wallet_id_created_at_idx" ON "ledger_entries"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_source_type_source_id_idx" ON "ledger_entries"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_rewards_idempotency_key_key" ON "referral_rewards"("idempotency_key");

-- CreateIndex
CREATE INDEX "referral_rewards_beneficiary_id_created_at_idx" ON "referral_rewards"("beneficiary_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "referral_rewards_beneficiary_id_source_event_id_depth_key" ON "referral_rewards"("beneficiary_id", "source_event_id", "depth");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_created_at_idx" ON "withdrawal_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_user_id_key" ON "admin_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_user_id_expires_at_idx" ON "admin_sessions"("admin_user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "audit_events_actor_type_actor_id_created_at_idx" ON "audit_events"("actor_type", "actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_target_type_target_id_created_at_idx" ON "audit_events"("target_type", "target_id", "created_at");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_edges" ADD CONSTRAINT "referral_edges_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_edges" ADD CONSTRAINT "referral_edges_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_ancestors" ADD CONSTRAINT "referral_ancestors_descendant_user_id_fkey" FOREIGN KEY ("descendant_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_ancestors" ADD CONSTRAINT "referral_ancestors_ancestor_user_id_fkey" FOREIGN KEY ("ancestor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_import_batches" ADD CONSTRAINT "contact_import_batches_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_numbers" ADD CONSTRAINT "contact_numbers_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "contact_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_consent_events" ADD CONSTRAINT "contact_consent_events_contact_number_id_fkey" FOREIGN KEY ("contact_number_id") REFERENCES "contact_numbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_contact_number_id_fkey" FOREIGN KEY ("contact_number_id") REFERENCES "contact_numbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "task_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_claims" ADD CONSTRAINT "task_claims_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_claims" ADD CONSTRAINT "task_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "task_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_reviewer_admin_id_fkey" FOREIGN KEY ("reviewer_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
