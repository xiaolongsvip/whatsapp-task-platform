import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("shared unsuccessful-claim inventory helper releases assignments and makes only consented numbers available", async () => {
  const helper = await read("../src/tasks/task-claim-inventory.ts");
  assert.match(helper, /contactAssignment\.findUnique/);
  assert.match(helper, /status: "RELEASED"/);
  assert.match(helper, /status: "ASSIGNED",\s*consentStatus: "GRANTED"/);
  assert.match(helper, /status: "AVAILABLE"/);
  assert.match(helper, /status: "VOIDED"/);
  assert.match(helper, /claimId: null/);
  assert.match(helper, /reservationWasActive/);
  assert.match(helper, /claimedCount: \{ decrement: 1 \}/);
});

test("automatic AI rejection immediately recycles unsuccessful task inventory and keeps automatic decisions", async () => {
  const worker = await read("../src/ai-config/ai-review.worker.ts");
  const reject = worker.slice(worker.indexOf("private async reject("), worker.indexOf("private async retryOrEscalate("));
  assert.match(reject, /data: \{ status: "REJECTED" \}/);
  assert.match(reject, /recycleUnsuccessfulTaskClaimInventory/);
  assert.match(reject, /allocateAvailableNumbersToOldestPublishedTask/);
  assert.match(reject, /current\.submission\.claim\.status/);
  assert.doesNotMatch(reject, /NEEDS_REVIEW.*自动拒绝/);
});

test("manual rejection recycles inventory while retaining the rejected submission and claim history", async () => {
  const service = await read("../src/ai-config/ai-review-admin.service.ts");
  const reject = service.slice(service.indexOf('} else {\n        await tx.taskSubmission.update({ where: { id: submission.id }, data: { status: "REJECTED" }'), service.indexOf("if (submission.aiReviewJob)"));
  assert.match(reject, /data: \{ status: "REJECTED" \}/);
  assert.match(reject, /recycleUnsuccessfulTaskClaimInventory\(tx, claim\.id, claim\.taskId\)/);
  assert.match(reject, /allocateAvailableNumbersToOldestPublishedTask\(tx\)/);
});

test("rejected claims cannot be restarted or continue reserving a user's active-task slot", async () => {
  const service = await read("../src/tasks/tasks.service.ts");
  const start = service.slice(service.indexOf("async startClaim("), service.indexOf("async cancelClaim("));
  assert.match(start, /if \(!\["CLAIMED", "IN_PROGRESS"\]\.includes\(claim\.status\)\)/);
  assert.doesNotMatch(start, /includes\(claim\.status\)[\s\S]{0,100}REJECTED/);
  const claim = service.slice(service.indexOf("const activeClaims"), service.indexOf("if (activeClaims >= 1)"));
  assert.match(claim, /status: \{ in: \["CLAIMED", "IN_PROGRESS"\] \}/);
  assert.doesNotMatch(claim, /REJECTED/);
});

test("expiry recovery does not overwrite newly rejected claims after their inventory was already released", async () => {
  const service = await read("../src/tasks/tasks.service.ts");
  const expiry = service.slice(service.indexOf("private async expireOverdueClaims("), service.indexOf("async submitEvidence("));
  assert.match(expiry, /if \(claim\.status === "REJECTED" && !reservationWasActive\) continue/);
  assert.match(expiry, /if \(reservationWasActive\)[\s\S]*claimedCount: \{ gt: 0 \}/);
});


test("Android app treats rejected claims as history, not active work, and clears their capture session", async () => {
  const screen = await read("../../../android/app/src/main/java/com/wtp/app/ui/TaskHallScreen.kt");
  assert.match(screen, /val expirableStatuses = setOf\("CLAIMED", "IN_PROGRESS"\)/);
  assert.match(screen, /setOf\("CLAIMED", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW"\)/);
  assert.match(screen, /CaptureSessionState\.clearActiveClaim\(\)/);
  assert.match(screen, /该号码已回收到可分配号码池/);
  assert.match(screen, /号码已回收/);
  assert.doesNotMatch(screen, /Rejected — you can try again before the deadline/);
});


test("admin recycling a previously AI-rejected claim does not decrement claimedCount twice", async () => {
  const admin = await read("../src/task-admin/task-admin.service.ts");
  const body = admin.slice(admin.indexOf("async voidTaskRecord("), admin.indexOf("async deleteTaskRecord("));
  assert.match(body, /const assignmentWasActive = claim\.contactAssignment\?\.status === "ASSIGNED"/);
  assert.match(body, /const slotWasActive = slot\.status === "ASSIGNED" && slot\.claimId === claim\.id/);
  assert.match(body, /if \(\["CLAIMED", "IN_PROGRESS"\]\.includes\(claim\.status\)\)/);
  assert.match(body, /claim\.status === "REJECTED" && \(assignmentWasActive \|\| slotWasActive\)/);
  assert.doesNotMatch(body, /if \(\["CLAIMED", "IN_PROGRESS", "REJECTED"\]\.includes\(claim\.status\)\)\s*\{[\s\S]{0,160}status: "CANCELLED"/);
  assert.match(body, /action: "TASK_RECORD_VOID"/);
});

test("user cancellation and expiry both clear slot linkage and rerun FIFO allocation", async () => {
  const service = await read("../src/tasks/tasks.service.ts");
  const cancel = service.slice(service.indexOf("async cancelClaim("), service.indexOf("private async expireOverdueClaims("));
  assert.match(cancel, /claimId: null/);
  assert.match(cancel, /status: numberReturnedToPool \? "AVAILABLE" : "VOIDED"/);
  assert.match(cancel, /allocateAvailableNumbersToOldestPublishedTask\(tx\)/);
  const expiry = service.slice(service.indexOf("private async expireOverdueClaims("), service.indexOf("async submitEvidence("));
  assert.match(expiry, /recycleUnsuccessfulTaskClaimInventory\(tx, claim\.id, claim\.taskId, now\)/);
  assert.match(expiry, /allocateAvailableNumbersToOldestPublishedTask\(tx\)/);
  assert.match(expiry, /if \(claim\.status !== "REJECTED"\)/);
});

test("bulk recycle endpoint reports recycling instead of terminal voiding", async () => {
  const admin = await read("../src/task-admin/task-admin.service.ts");
  const bulk = admin.slice(admin.indexOf("async bulkVoidTaskRecords("), admin.indexOf("async bulkDeleteTaskRecords("));
  assert.match(bulk, /action: "RECYCLE"/);
  assert.match(bulk, /号码已回收并重新分配/);
});


test("FIFO allocator repairs legacy VOIDED slots only when the underlying number is available and consented", async () => {
  const allocator = await read("../src/tasks/task-slot-allocation.ts");
  const recovery = allocator.slice(allocator.indexOf("Recover legacy voided rows"), allocator.indexOf("const targetTask"));
  assert.match(recovery, /status: "VOIDED"/);
  assert.match(recovery, /status: "AVAILABLE", consentStatus: "GRANTED"/);
  assert.match(recovery, /status: "AVAILABLE",\s*claimId: null/);
  assert.match(recovery, /assignedAt: null/);
});


test("shared inventory release locks number, slot, and assignment in a deterministic order", async () => {
  const helper = await read("../src/tasks/task-claim-inventory.ts");
  const numberLock = helper.indexOf("FROM contact_numbers");
  const slotLock = helper.indexOf("FROM task_slots");
  const assignmentLock = helper.indexOf("FROM contact_assignments");
  assert.ok(numberLock >= 0 && slotLock > numberLock && assignmentLock > slotLock);
  const service = await read("../src/tasks/tasks.service.ts");
  const cancel = service.slice(service.indexOf("async cancelClaim("), service.indexOf("private async expireOverdueClaims("));
  const cancelNumberLock = cancel.indexOf("FROM contact_numbers");
  const cancelSlotLock = cancel.indexOf("FROM task_slots");
  const cancelAssignmentLock = cancel.indexOf("FROM contact_assignments");
  assert.ok(cancelNumberLock >= 0 && cancelSlotLock > cancelNumberLock && cancelAssignmentLock > cancelSlotLock);
});
