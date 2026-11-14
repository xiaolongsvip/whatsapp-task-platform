CREATE TABLE "admin_notifications" (
    "id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "content" TEXT NOT NULL,
    "target" VARCHAR(20) NOT NULL DEFAULT 'ALL',
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_admin_id" UUID,
    "published_by_admin_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_notifications_target_check" CHECK ("target" IN ('ALL', 'ACTIVE')),
    CONSTRAINT "admin_notifications_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'DISABLED'))
);

CREATE INDEX "admin_notifications_status_published_at_idx"
    ON "admin_notifications"("status", "published_at");
CREATE INDEX "admin_notifications_created_at_idx"
    ON "admin_notifications"("created_at");

CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_admin_id" UUID,
    "updated_by_admin_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_templates_enabled_updated_at_idx"
    ON "notification_templates"("enabled", "updated_at");
CREATE INDEX "notification_templates_name_idx"
    ON "notification_templates"("name");
