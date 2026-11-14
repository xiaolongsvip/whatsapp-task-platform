import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const has = (source, fragment, label = fragment) =>
  assert.ok(source.includes(fragment), `Expected source to contain: ${label}`);

const guard = read("../src/permissions-admin/admin-permission.guard.ts");
const worker = read("../src/ai-config/ai-review.worker.ts");
const review = read("../src/ai-config/ai-review-admin.service.ts");
const tasks = read("../src/tasks/tasks.service.ts");
const controller = read("../src/tasks/tasks.controller.ts");
const androidRepo = read("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt");
const androidScreen = read("../../../android/app/src/main/java/com/wtp/app/ui/TaskHallScreen.kt");
const capture = read("../../../android/app/src/main/java/com/wtp/app/capture/ScreenCaptureService.kt");
const wallet = read("../src/users/dashboard.service.ts");

test("AI review routes require fine-grained permissions and default deny", () => {
  for (const fragment of [
    "reviews.risk.read", "reviews.risk.manage", "reviews.evidence.read",
    "reviews.ai.read", "reviews.manage", "reviews.ai.retry",
    "reviews.settings.manage", "该后台接口尚未配置权限映射，已按默认拒绝策略阻止访问",
  ]) has(guard, fragment);
  has(guard, "/admin/ai-reviews/");
  has(guard, "/admin/task-submissions/");
});

test("claim and evidence submission enforce throttling, idempotency and evidence limits", () => {
  has(controller, '@Throttle({ default: { limit: 10, ttl: 60_000 } })');
  has(controller, '@Headers("idempotency-key")');
  has(controller, "fileSize: 8 * 1024 * 1024");
  has(tasks, "idempotencyKey: key");
  has(tasks, "FOR UPDATE");
  has(tasks, "contentSha256");
});

test("AI approval and rejection remain confidence-gated and uncertain decisions escalate", () => {
  has(worker, "config.approveThreshold");
  has(worker, "config.rejectThreshold");
  has(worker, "parsed.checks.length > 0");
  has(worker, "check.passed === true");
  has(worker, 'status: "NEEDS_REVIEW"');
  has(worker, "confidentApprove");
  has(worker, "await this.approve");
  has(worker, "await this.reject");
});

test("AI and manual approvals retain matching task reward and referral idempotency keys", () => {
  const aiApprove = worker.slice(worker.indexOf("private async approve("), worker.indexOf("private async reject("));
  const approvalStart = review.indexOf('if (decision === "APPROVE")');
  const manualApprove = review.slice(approvalStart, review.indexOf("} else {", approvalStart));
  has(aiApprove, "task-reward:");
  has(manualApprove, "task-reward:");
  has(aiApprove, "referral-commission:");
  has(manualApprove, "referral-commission:");
  has(aiApprove, "APPROVED");
  has(manualApprove, "APPROVED");
});

test("AI and manual rejection recycle unsuccessful inventory", () => {
  const aiReject = worker.slice(worker.indexOf("private async reject("), worker.indexOf("private async retryOrEscalate("));
  has(aiReject, 'status: "REJECTED"');
  has(aiReject, "recycleUnsuccessfulTaskClaimInventory");
  has(review, "recycleUnsuccessfulTaskClaimInventory(tx, claim.id, claim.taskId)");
});

test("Android retries the original screenshot for the original claim with the same key", () => {
  has(capture, "lastCaptureClaimId.value");
  has(capture, "pendingIdempotencyKey.value");
  has(capture, "uploadEvidence(retryClaimId, retryPath, retryKey)");
  has(capture, "markLastCaptureUploaded");
  has(androidRepo, "submitTaskEvidence");
  has(androidRepo, "Idempotency-Key");
});

test("Android refreshes authoritative claim state after upload and app resume", () => {
  has(androidScreen, "AuthRepository.myTaskClaims()");
  has(androidScreen, "LaunchedEffect(uploadMessage)");
  has(androidScreen, "LifecycleEventEffect(Lifecycle.Event.ON_RESUME)");
  has(androidScreen, 'optJSONArray("claims")');
});

test("wallet history separates posted ledger movements from pending withdrawal workflow rows", () => {
  has(wallet, 'direction: "PENDING"');
  has(wallet, "withdrawal.status");
  has(wallet, 'status: "POSTED"');
  has(wallet, 'not: "PAID"');
});
