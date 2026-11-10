CREATE TABLE "object_storage_configs" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "endpoint" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'auto',
    "access_key_ciphertext" TEXT,
    "access_key_iv" TEXT,
    "access_key_tag" TEXT,
    "secret_key_ciphertext" TEXT,
    "secret_key_iv" TEXT,
    "secret_key_tag" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "object_storage_configs_pkey" PRIMARY KEY ("id")
);