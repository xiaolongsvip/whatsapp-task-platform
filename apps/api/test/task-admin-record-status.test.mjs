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
  assert.match(body, /slot\.status === "USED" \|\| slot\.claim\?\.status === "APPROVED"/);
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


test("admin record deletion eligibility uses the underlying inventory status", async () => {
  const service = await readSource("../src/task-admin/task-admin.service.ts");
  const admin = await readSource("../../admin/src/app/tasks/page.tsx");
  assert.match(service, /inventoryStatus: slot\.status/);
  assert.match(admin, /inventoryStatus: "AVAILABLE" \| "ASSIGNED" \| "USED" \| "VOIDED"/);
  assert.match(admin, /item\.taskStatus\s*!==\s*"PUBLISHED"\s*&&\s*item\.inventoryStatus\s*===\s*"AVAILABLE"\s*&&\s*!item\.claimId/);
  assert.match(admin, /record\.taskStatus\s*===\s*"PUBLISHED"\s*\|\|\s*record\.inventoryStatus\s*!==\s*"AVAILABLE"\s*\|\|\s*Boolean\(record\.claimId\)/);
  assert.match(service, /slot\.status !== "AVAILABLE" \|\| slot\.claimId/);
});


test("admin task record filters are wired to the backend query parameters", async () => {
  const admin = await readSource("../../admin/src/app/tasks/page.tsx");
  const controller = await readSource("../src/task-admin/task-admin.controller.ts");
  const service = await readSource("../src/task-admin/task-admin.service.ts");
  assert.match(admin, /params\.set\("useStage", useStageFilter\)/);
  assert.match(admin, /params\.set\("reviewResult", reviewResultFilter\)/);
  assert.match(admin, /params\.set\("taskId", taskIdFilter\.trim\(\)\)/);
  assert.match(admin, /aria-label="使用阶段筛选"/);
  assert.match(admin, /aria-label="审核结果筛选"/);
  assert.match(admin, /aria-label="任务完整编号筛选"/);
  assert.match(controller, /@Query\("useStage"\) useStage\?: string/);
  assert.match(controller, /@Query\("reviewResult"\) reviewResult\?: string/);
  assert.match(controller, /@Query\("taskId"\) taskId\?: string/);
  assert.match(service, /if \(input\.useStage === "USED"\)/);
  assert.match(service, /if \(input\.reviewResult === "APPROVED"\)/);
});


test("new task default reward amount matches the API two-decimal validation", async () => {
  const page = await readSource("../../admin/src/app/tasks/new/page.tsx");
  const dto = await readSource("../src/task-admin/task-admin.dto.ts");
  const match = page.match(/rewardAmount: "([^"]+)"/);
  assert.ok(match, "new task form must define a default reward amount");
  assert.match(match[1], /^\\d{1,8}(?:\\.\\d{1,2})?$/);
  assert.match(dto, /@Matches\\(\/\\^\\\\d\\{1,8\\}\\(\?:\\\\\\.\\d\\{1,2\\}\\)\?\\$\//);
});
