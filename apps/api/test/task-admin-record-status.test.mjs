import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("task record status counters exclude VOIDED rows from frozen, closed and completed buckets", async () => {
  const source = await readSource("../src/task-admin/task-admin.service.ts");
  const statusFilters = source.slice(source.indexOf('const statusWhere ='), source.indexOf('const selectedWhere ='));
  for (const status of ["COMPLETED", "CLOSED", "FROZEN"]) {
    const start = statusFilters.indexOf(`case "${status}":`);
    assert.notEqual(start, -1, `missing ${status} filter`);
    const next = statusFilters.indexOf('case "', start + 6);
    const block = statusFilters.slice(start, next < 0 ? undefined : next);
    assert.match(block, /status: \{ not: "VOIDED" \}/, `${status} must not count voided records`);
  }
  assert.match(statusFilters, /case "VOIDED":[\s\S]*?return \{ status: "VOIDED" \}/);
});

test("task edit does not overwrite an existing capacity with an implicit null", async () => {
  const source = await readSource("../../admin/src/app/tasks/page.tsx");
  const saveBody = source.slice(source.indexOf("const body = {"), source.indexOf("await api<AdminTask>("));
  assert.doesNotMatch(saveBody, /capacity\s*:/);
});
