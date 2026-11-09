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
  assert.match(cleanup, /status IN \\('APPROVED', 'REJECTED'\\)/);
  assert.match(cleanup, /evidence_deleted_at IS NULL/);
  assert.match(cleanup, /FOR UPDATE SKIP LOCKED/);
  assert.match(cleanup, /evidence_delete_locked_at/);
  assert.match(cleanup, /this\\.storage\\.deleteObject/);
  assert.match(cleanup, /evidenceDeleteNextAttemptAt/);
  assert.match(cleanup, /evidenceDeleteLastError/);
  assert.match(cleanup, /Math\\.min\\(24 \\* 60/);
});

test("evidence administration reports persisted retention status instead of placeholder values", async () => {
  const source = await readSource("../src/ai-config/ai-review-admin.service.ts");
  const listing = source.slice(source.indexOf("async listEvidenceRecords"), source.indexOf("async rerunAiReview"));
  assert.match(listing, /evidenceDeletedAt/);
  assert.match(listing, /evidenceDeleteAttempts/);
  assert.match(listing, /evidenceDeleteLastError/);
  assert.doesNotMatch(listing, /retentionStatus: "NORMAL"/);
  assert.doesNotMatch(listing, /deletedObjects: 0/);
  assert.match(source, /if \\(submission\\.evidenceDeletedAt\\) throw new NotFoundException/);
});
