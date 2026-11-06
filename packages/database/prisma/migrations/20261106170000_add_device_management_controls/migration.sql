CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'BLOCKED');

ALTER TABLE "user_devices"
  ADD COLUMN "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "is_flagged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "flag_reason" TEXT,
  ADD COLUMN "status_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "user_device_events"
  ADD COLUMN "sdk_int" INTEGER,
  ADD COLUMN "actor_id" UUID,
  ADD COLUMN "reason" TEXT;

CREATE INDEX "user_devices_device_identifier_idx" ON "user_devices"("device_identifier");
CREATE INDEX "user_devices_status_is_flagged_idx" ON "user_devices"("status", "is_flagged");
