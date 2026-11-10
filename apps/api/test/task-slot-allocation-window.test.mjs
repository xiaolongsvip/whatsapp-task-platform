import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("number allocator only assigns inventory to published tasks inside their active time window", async () => {
  const source = await readSource("../src/tasks/task-slot-allocation.ts");
  const targetSelection = source.slice(source.indexOf("const targetTask ="), source.indexOf("if (!targetTask)"));
  assert.match(targetSelection, /status: "PUBLISHED"/);
  assert.match(targetSelection, /startsAt: null/);
  assert.match(targetSelection, /startsAt: \{ lte: now \}/);
  assert.match(targetSelection, /endsAt: null/);
  assert.match(targetSelection, /endsAt: \{ gte: now \}/);
  assert.match(targetSelection, /orderBy: \[\{ createdAt: "asc" \}, \{ id: "asc" \}\]/);
});

test("allocator reclaims unclaimed slots from paused, closed, future and expired tasks", async () => {
  const source = await readSource("../src/tasks/task-slot-allocation.ts");
  const inactiveSelection = source.slice(source.indexOf("const inactiveTasks ="), source.indexOf("const inactiveTaskIds"));
  assert.match(inactiveSelection, /status: \{ in: \["PAUSED", "CLOSED"\] \}/);
  assert.match(inactiveSelection, /status: "PUBLISHED"/);
  assert.match(inactiveSelection, /startsAt: \{ gt: now \}/);
  assert.match(inactiveSelection, /endsAt: \{ lt: now \}/);
  assert.match(source, /status: "AVAILABLE",\s*claimId: null/);
  assert.match(source, /data: \{ taskId: targetTask\.id \}/);
});

test("task hall and claim endpoint use the same start and end eligibility window", async () => {
  const source = await readSource("../src/tasks/tasks.service.ts");
  const listPublished = source.slice(source.indexOf("async listPublished"), source.indexOf("async claim"));
  assert.match(listPublished, /startsAt: \{ lte: now \}/);
  assert.match(listPublished, /endsAt: \{ gte: now \}/);
  assert.match(source, /if \(task\.startsAt && task\.startsAt > now\)/);
  assert.match(source, /if \(task\.endsAt && task\.endsAt < now\)/);
});

test("scheduled allocator runs periodically and is registered in the tasks module", async () => {
  const worker = await readSource("../src/tasks/task-slot-allocation.worker.ts");
  const module = await readSource("../src/tasks/tasks.module.ts");
  assert.match(worker, /setInterval/);
  assert.match(worker, /ALLOCATION_INTERVAL_MS = 60_000/);
  assert.match(worker, /allocateAvailableNumbersToOldestPublishedTask/);
  assert.match(worker, /TASK_SLOT_ALLOCATION_WORKER_ENABLED === "false"/);
  assert.match(module, /TaskSlotAllocationWorker/);
});
