CREATE TABLE "ai_review_configs" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "api_key_ciphertext" TEXT,
    "api_key_iv" TEXT,
    "api_key_tag" TEXT,
    "base_url" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    "model" TEXT NOT NULL DEFAULT 'gpt-4.1',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "approve_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "reject_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "system_prompt" TEXT,
    "updated_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_review_configs_pkey" PRIMARY KEY ("id")
);