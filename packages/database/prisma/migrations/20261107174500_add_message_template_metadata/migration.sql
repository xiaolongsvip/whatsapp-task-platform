ALTER TABLE "message_templates"
  ADD COLUMN "platform_code" VARCHAR(40),
  ADD COLUMN "language" VARCHAR(40),
  ADD COLUMN "keywords" TEXT;
