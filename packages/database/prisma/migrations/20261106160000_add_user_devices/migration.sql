CREATE TABLE "user_devices" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "device_identifier" TEXT NOT NULL,
  "manufacturer" TEXT,
  "model" TEXT NOT NULL,
  "android_version" TEXT,
  "sdk_int" INTEGER,
  "app_version" TEXT NOT NULL,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "user_device_events" (
  "id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "event_type" TEXT NOT NULL,
  "manufacturer" TEXT,
  "model" TEXT NOT NULL,
  "android_version" TEXT,
  "app_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_device_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_devices_user_id_device_identifier_key" ON "user_devices"("user_id","device_identifier");
CREATE INDEX "user_devices_user_id_last_seen_at_idx" ON "user_devices"("user_id","last_seen_at");
CREATE INDEX "user_device_events_device_id_created_at_idx" ON "user_device_events"("device_id","created_at");
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_device_events" ADD CONSTRAINT "user_device_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "user_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
