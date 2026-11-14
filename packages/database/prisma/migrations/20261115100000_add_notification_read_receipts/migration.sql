CREATE TABLE "notification_read_receipts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_read_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_read_receipts_user_id_notification_id_key"
    ON "notification_read_receipts"("user_id", "notification_id");

CREATE INDEX "notification_read_receipts_user_id_read_at_idx"
    ON "notification_read_receipts"("user_id", "read_at");

CREATE INDEX "notification_read_receipts_notification_id_idx"
    ON "notification_read_receipts"("notification_id");

ALTER TABLE "notification_read_receipts"
    ADD CONSTRAINT "notification_read_receipts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_read_receipts"
    ADD CONSTRAINT "notification_read_receipts_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "admin_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
