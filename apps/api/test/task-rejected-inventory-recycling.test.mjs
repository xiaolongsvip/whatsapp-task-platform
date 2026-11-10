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
