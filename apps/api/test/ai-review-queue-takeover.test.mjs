import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/ai-config/ai-review-admin.service.ts", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../../admin/src/app/ai-reviews/page.tsx", import.meta.url), "utf8");

test("stale pending and retry AI jobs become eligible for manual review after ten minutes", () => {
  assert.match(service, /AI_REVIEW_STALE_AFTER_MS = 10 \* 60 \* 1000/);
  assert.match(service, /job\.status === "PENDING" \|\| job\.status === "RETRY"\) return job\.updatedAt\.getTime\(\) <= cutoff/);
  assert.match(service, /job\.status === "PROCESSING"\) return !job\.lockedAt \|\| job\.lockedAt\.getTime\(\) <= cutoff/);
  assert.match(service, /staleAiReviewJobWhere\(staleCutoff\)/);
});

test("manual review list includes stale AI queue jobs and excludes them from fresh smart review", () => {
  assert.match(service, /const manualReviewWhere = \{/);
  assert.match(service, /aiReviewJob: \{ is: staleAiReviewJobWhere\(staleCutoff\) as never \}/);
  assert.match(service, /updatedAt: \{ gt: staleCutoff \}/);
  assert.match(service, /lockedAt: \{ gt: staleCutoff \}/);
  assert.match(service, /!isStaleAiReviewJob\(job\) \? "SMART_REVIEW"/);
});

test("admin can take over only NEEDS_REVIEW or stale AI jobs, preserving lock-based decision serialization", () => {
  assert.match(service, /submission\.aiReviewJob\.status !== "NEEDS_REVIEW"[\s\S]*?!isStaleAiReviewJob\(submission\.aiReviewJob\)/);
  assert.match(service, /SELECT id FROM task_submissions WHERE id = \$\{submissionId\}::uuid FOR UPDATE/);
  assert.match(service, /status: "COMPLETED",[\s\S]*?lockedAt: null/);
  assert.match(adminPage, /selected\.status === "MANUAL_REVIEW"/);
  assert.match(adminPage, /decide\("APPROVE"\)/);
  assert.match(adminPage, /decide\("REJECT"\)/);
});


test("AI worker recovers PROCESSING jobs whose lease timestamp is NULL as well as expired leases", () => {
  const worker = readFileSync(new URL("../src/ai-config/ai-review.worker.ts", import.meta.url), "utf8");
  assert.match(worker, /status = 'PROCESSING'[\s\S]*?locked_at IS NULL[\s\S]*?locked_at < NOW\(\) - INTERVAL '10 minutes'/);
  assert.match(worker, /FOR UPDATE SKIP LOCKED/);
  assert.match(worker, /attempt_count = attempt_count \+ 1/);
});

test("AI worker supports bounded local concurrency while defaulting to one job", () => {
  const worker = readFileSync(new URL("../src/ai-config/ai-review.worker.ts", import.meta.url), "utf8");
  const env = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");
  assert.match(worker, /AI_REVIEW_WORKER_CONCURRENCY \?\? "1"/);
  assert.match(worker, /configured >= 1 && configured <= 20/);
  assert.match(worker, /while \(this\.activeWorkers < this\.maxConcurrentJobs\)/);
  assert.match(worker, /this\.activeWorkers \+= 1/);
  assert.match(worker, /this\.activeWorkers = Math\.max\(0, this\.activeWorkers - 1\)/);
  assert.match(worker, /FOR UPDATE SKIP LOCKED/);
  assert.doesNotMatch(worker, /private running = false/);
  assert.match(env, /AI_REVIEW_WORKER_CONCURRENCY=1/);
});


test("AI review dispatcher fills all configured free slots in one pass and refills on completion", () => {
  const worker = readFileSync(new URL("../src/ai-config/ai-review.worker.ts", import.meta.url), "utf8");
  const tick = worker.slice(worker.indexOf("private async tick()"), worker.indexOf("private async processJob("));
  assert.match(worker, /private dispatching = false/);
  assert.match(worker, /private refillRequested = false/);
  assert.match(tick, /while \(this\.activeWorkers < this\.maxConcurrentJobs\)/);
  assert.match(tick, /void this\.processJob\(jobId\)/);
  assert.match(tick, /finally\(\(\) => \{[\s\S]*?this\.activeWorkers = Math\.max\(0, this\.activeWorkers - 1\)[\s\S]*?void this\.tick\(\)/);
  assert.match(tick, /if \(this\.refillRequested\)/);
  assert.match(tick, /FOR UPDATE SKIP LOCKED/);
});
