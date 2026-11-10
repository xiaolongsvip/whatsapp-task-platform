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

-- Existing task categories represent platforms, not task groups. Keep old tasks ungrouped.

CREATE INDEX "tasks_group_id_idx" ON "tasks"("group_id");

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "task_groups"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
