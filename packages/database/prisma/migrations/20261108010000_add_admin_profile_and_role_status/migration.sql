ALTER TABLE "admin_users"
  ADD COLUMN "name" VARCHAR(120) NOT NULL DEFAULT 'Administrator',
  ADD COLUMN "login" VARCHAR(80),
  ADD COLUMN "phone" VARCHAR(40);

UPDATE "admin_users"
SET "login" = LEFT("email", 80),
    "name" = COALESCE(NULLIF(SPLIT_PART("email", '@', 1), ''), 'Administrator');

ALTER TABLE "admin_users" ALTER COLUMN "login" SET NOT NULL;
CREATE UNIQUE INDEX "admin_users_login_key" ON "admin_users"("login");

ALTER TABLE "roles"
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
