CREATE TABLE "task_groups" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "task_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_groups_name_key" ON "task_groups"("name");

ALTER TABLE "tasks" ADD COLUMN "group_id" UUID;

-- Preserve the existing grouping labels so existing task records remain organized.
INSERT INTO "task_groups" ("id", "name", "updated_at")
SELECT gen_random_uuid(), category, CURRENT_TIMESTAMP
FROM "tasks"
WHERE category IS NOT NULL AND btrim(category) <> ''
GROUP BY category
ON CONFLICT ("name") DO NOTHING;

UPDATE "tasks" AS task
SET "group_id" = task_group.id
FROM "task_groups" AS task_group
WHERE task_group.name = task.category;

CREATE INDEX "tasks_group_id_idx" ON "tasks"("group_id");

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "task_groups"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
