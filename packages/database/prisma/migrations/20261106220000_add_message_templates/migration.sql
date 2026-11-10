CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "platform" VARCHAR(40) NOT NULL DEFAULT 'WhatsApp',
    "action" VARCHAR(40) NOT NULL DEFAULT 'MESSAGE',
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_templates_enabled_platform_action_idx"
    ON "message_templates"("enabled", "platform", "action");

CREATE INDEX "message_templates_name_idx"
    ON "message_templates"("name");
