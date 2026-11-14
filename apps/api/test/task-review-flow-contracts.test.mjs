import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const guard = read("../src/permissions-admin/admin-permission.guard.ts");
const worker = read("../src/ai-config/ai-review.worker.ts");
const review = read("../src/ai-config/ai-review-admin.service.ts");
const tasks = read("../src/tasks/tasks.service.ts");
const controller = read("../src/tasks/tasks.controller.ts");
const androidRepo = read("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt");
const androidScreen = read("../../../android/app/src/main/java/com/wtp/app/ui/TaskHallScreen.kt");
const capture = read("../../../android/app/src/main/java/com/wtp/app/capture/ScreenCaptureService.kt");
const wallet = read("../src/users/dashboard.service.ts");

test("AI review routes require the intended fine-grained permissions", () => {
  assert.match(guard, /admin\\/ai-reviews\\\/(?:risk\\/events|risk\\/users|risk\\/rules/);
  assert.match(guard, /reviews\\.risk\\.read/);
  assert.match(guard, /reviews\\.risk\\.manage/);
  assert.match(guard, /admin\\/ai-reviews\\/evidence/);
  assert.match(guard, /reviews\\.evidence\\.read/);
  assert.match(guard, /reviews\\.ai\\.read/);
  assert.match(guard, /reviews\\.manage/);
  assert.match(guard, /reviews\\.ai\\.retry/);
  assert.match(guard, /reviews\\.settings\\.manage/);
  assert.match(guard, /该后台接口尚未配置权限映射，已按默认拒绝策略阻止访问/);
});

test("claim and evidence submission routes are authenticated, throttled, and idempotent", () => {
  assert.match(controller, /@Throttle\\(\\{ default: \\{ limit: 10, ttl: 60_000 \\} \\}\\)/);
  assert.match(controller, /@Headers\\("idempotency-key"\\)/);
  assert.match(controller, /fileSize: 8 \\* 1024 \\* 1024/);
  assert.match(tasks, /where: \\{ idempotencyKey: key \\}/);
  assert.match(tasks, /FOR UPDATE/);
  assert.match(tasks, /contentSha256/);
});

test("AI decisions settle only above configured confidence gates; uncertain results never pay automatically", () => {
  assert.match(worker, /parsed\\.confidence >= config\\.approveThreshold/);
  assert.match(worker, /parsed\\.confidence >= config\\.rejectThreshold/);
  assert.match(worker, /parsed\\.checks\\.length > 0/);
  assert.match(worker, /parsed\\.checks\\.every\\(\\(check\\) => check\\.passed === true\\)/);
  assert.match(worker, /status: "NEEDS_REVIEW"/);
  assert.match(worker, /if \\(confidentApprove\\)[\\s\\S]*?await this\\.approve/);
  assert.match(worker, /else \\{[\\s\\S]*?await this\\.reject/);
});

test("AI and manual approvals use the same task reward key and referral commission key shape", () => {
  const aiApprove = worker.slice(worker.indexOf("private async approve("), worker.indexOf("private async reject("));
  const manualApprove = review.slice(review.indexOf('if (decision === "APPROVE")'), review.indexOf("} else {", review.indexOf('if (decision === "APPROVE")')));
  assert.match(aiApprove, /task-reward:\\$\\{claim\\.id\\}/);
  assert.match(manualApprove, /task-reward:\\$\\{claim\\.id\\}/);
  assert.match(aiApprove, /referral-commission:\\$\\{claim\\.id\\}:L/);
  assert.match(manualApprove, /referral-commission:\\$\\{claim\\.id\\}:L/);
  assert.match(aiApprove, /prisma\\.|tx\\.ledgerEntry\\.createMany/);
  assert.match(aiApprove, /taskSubmission\\.update[\\s\\S]*?status: "APPROVED"/);
  assert.match(manualApprove, /taskSubmission\\.update[\\s\\S]*?status: "APPROVED"/);
});

test("rejected work returns inventory while preserving the rejection history", () => {
  const aiReject = worker.slice(worker.indexOf("private async reject("), worker.indexOf("private async retryOrEscalate("));
  assert.match(aiReject, /status: "REJECTED"/);
  assert.match(aiReject, /recycleUnsuccessfulTaskClaimInventory/);
  assert.match(review, /recycleUnsuccessfulTaskClaimInventory\\(tx, claim\\.id, claim\\.taskId\\)/);
});

test("Android retries the exact failed screenshot against the original claim with the same idempotency key", () => {
  assert.match(capture, /lastCaptureClaimId\\.value/);
  assert.match(capture, /pendingIdempotencyKey\\.value/);
  assert.match(capture, /uploadEvidence\\(retryClaimId, retryPath, retryKey\\)/);
  assert.match(capture, /markLastCaptureUploaded/);
  assert.match(androidRepo, /submitTaskEvidence/);
  assert.match(androidRepo, /Idempotency-Key/);
});

test("Android reloads authoritative task and claim status after upload and when returning to the app", () => {
  assert.match(androidScreen, /AuthRepository\\.myTaskClaims\\(\\)/);
  assert.match(androidScreen, /LaunchedEffect\\(uploadMessage\\)/);
  assert.match(androidScreen, /LifecycleEventEffect\\(Lifecycle\\.Event\\.ON_RESUME\\)/);
  assert.match(androidScreen, /claims = result\\.second\\.optJSONArray\\("claims"\\)/);
});

test("wallet history distinguishes posted ledger movements from pending withdrawal workflow rows", () => {
  assert.match(wallet, /direction: "PENDING"/);
  assert.match(wallet, /status: withdrawal\\.status/);
  assert.match(wallet, /status: "POSTED"/);
  assert.match(wallet, /status: \\{ not: "PAID" \}/);
});
