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

test("task record detail drawer renders the VOIDED status label", async () => {
  const source = await readSource("../../admin/src/app/tasks/page.tsx");
  assert.equal((source.match(/VOIDED:"已作废"/g) || []).length, 4);
});


test("voiding an unfinished task number recycles its slot instead of stranding it as VOIDED", async () => {
  const source = await readSource("../src/task-admin/task-admin.service.ts");
  const body = source.slice(source.indexOf("async voidTaskRecord("), source.indexOf("async deleteTaskRecord("));
  assert.match(body, /status: "AVAILABLE",\s*claimId: null,\s*assignedAt: null/);
  assert.match(body, /usedAt: null/);
  assert.match(body, /currentNumber\?\.status === "AVAILABLE"/);
  assert.match(body, /currentNumber\.consentStatus === "GRANTED"/);
  assert.match(body, /allocateAvailableNumbersToOldestPublishedTask\(tx\)/);
  assert.match(body, /status: "USED" \|\| slot\.claim\?\.status === "APPROVED"/);
  assert.match(body, /status: \{ in: \["SUBMITTED", "UNDER_REVIEW"\] \}/);
  assert.match(body, /recycledToPool: true/);
  assert.doesNotMatch(body, /data: \{ status: "VOIDED", releasedAt:/);
});

test("admin task records UI describes the action as recycling and reassigning the number", async () => {
  const source = await readSource("../../admin/src/app/tasks/page.tsx");
  assert.match(source, /回收并重新分配/);
  assert.match(source, /未完成号码将返回可分配库存/);
  assert.match(source, /号码已回收到可分配库存/);
});
