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

test("task hall and claim endpoint use the same start and end eligibility window", async () => {
  const source = await readSource("../src/tasks/tasks.service.ts");
  const listPublished = source.slice(source.indexOf("async listPublished"), source.indexOf("async claim"));
  assert.match(listPublished, /startsAt: \{ lte: now \}/);
  assert.match(listPublished, /endsAt: \{ gte: now \}/);
  assert.match(source, /if \(task\.startsAt && task\.startsAt > now\)/);
  assert.match(source, /if \(task\.endsAt && task\.endsAt < now\)/);
});
