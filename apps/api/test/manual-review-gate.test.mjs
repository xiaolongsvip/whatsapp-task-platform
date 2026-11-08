import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../src/ai-config/ai-review.worker.ts", import.meta.url), "utf8");
const adminReview = readFileSync(new URL("../src/ai-config/ai-review-admin.service.ts", import.meta.url), "utf8");

test("AI worker only produces a review recommendation and never settles task rewards", () => {
  assert.match(worker, /status: "NEEDS_REVIEW"/);
  assert.match(worker, /decision: parsed\.decision/);
  assert.match(worker, /confidence: parsed\.confidence/);
  assert.match(worker, /data: \{ status: "UNDER_REVIEW" \}/);
  assert.doesNotMatch(worker, /ledgerEntry/);
  assert.doesNotMatch(worker, /private async approve\(/);
  assert.doesNotMatch(worker, /private async reject\(/);
});

test("manual review requires an AI job to be in NEEDS_REVIEW before an admin can decide", () => {
  assert.match(adminReview, /submission\.aiReviewJob\.status !== "NEEDS_REVIEW"/);
  assert.match(adminReview, /只有尚未完成审核的提交才能重新触发 AI 审核/);
});

test("only the manual approval transaction credits task rewards", () => {
  const approval = adminReview.slice(
    adminReview.indexOf('if (decision === "APPROVE")'),
    adminReview.indexOf('} else {', adminReview.indexOf('if (decision === "APPROVE")')),
  );
  assert.match(approval, /sourceType: "TASK_REWARD"/);
  assert.match(approval, /direction: "CREDIT"/);
  assert.match(approval, /idempotencyKey: `task-reward:\$\{claim\.id\}`/);
  assert.match(approval, /taskSubmission\.update[\s\S]*status: "APPROVED"/);
  assert.match(approval, /taskClaim\.update[\s\S]*status: "APPROVED"/);
});
