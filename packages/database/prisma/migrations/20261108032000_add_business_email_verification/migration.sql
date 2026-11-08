ALTER TABLE "user_profiles" ADD COLUMN "email" VARCHAR(254);
ALTER TABLE "user_profiles" ADD COLUMN "email_verified_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "user_profiles_email_key" ON "user_profiles"("email");
CREATE TABLE "email_verification_challenges" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "code_hash" CHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_verification_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_verification_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "email_verification_challenges_user_id_created_at_idx" ON "email_verification_challenges"("user_id","created_at");
CREATE INDEX "email_verification_challenges_email_expires_at_idx" ON "email_verification_challenges"("email","expires_at");
