CREATE TABLE "task_configurations" (
  "key" VARCHAR(80) NOT NULL,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_configurations_pkey" PRIMARY KEY ("key")
);
