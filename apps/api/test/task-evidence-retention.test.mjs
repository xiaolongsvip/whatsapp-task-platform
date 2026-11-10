import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("evidence retention only deletes terminal submissions and claims work without duplicate workers", async () => {
  const source = await readSource("../src/tasks/tasks.service.ts");
  const cleanup = source.slice(source.indexOf("private async cleanupExpiredEvidence"), source.indexOf("async listPublished"));
  assert.ok(cleanup.includes("status IN ('APPROVED', 'REJECTED')"));
  assert.ok(cleanup.includes("evidence_deleted_at IS NULL"));
  assert.ok(cleanup.includes("FOR UPDATE SKIP LOCKED"));
  assert.ok(cleanup.includes("evidence_delete_locked_at"));
  assert.ok(cleanup.includes("this.storage.deleteObject"));
  assert.ok(cleanup.includes("evidenceDeleteNextAttemptAt"));
  assert.ok(cleanup.includes("evidenceDeleteLastError"));
  assert.ok(cleanup.includes("Math.min(24 * 60"));
});

test("evidence administration reports persisted retention status instead of placeholder values", async () => {
  const source = await readSource("../src/ai-config/ai-review-admin.service.ts");
  const listing = source.slice(source.indexOf("async listEvidenceRecords"), source.indexOf("async rerunAiReview"));
  assert.ok(listing.includes("evidenceDeletedAt"));
  assert.ok(listing.includes("evidenceDeleteAttempts"));
  assert.ok(listing.includes("evidenceDeleteLastError"));
  assert.ok(!listing.includes('retentionStatus: "NORMAL"'));
  assert.ok(!listing.includes("deletedObjects: 0"));
  assert.ok(source.includes("if (submission.evidenceDeletedAt) throw new NotFoundException"));
});


test("evidence task-type filter composes with keyword search instead of replacing it", async () => {
  const source = await readSource("../src/ai-config/ai-review-admin.service.ts");
  const listing = source.slice(source.indexOf("async listEvidenceRecords"), source.indexOf("async rerunAiReview"));
  assert.ok(listing.includes('if (input.taskType === "TASK") where.AND = [...(where.AND ?? []),'));
  assert.ok(listing.includes('if (keyword) where.OR = ['));
});
