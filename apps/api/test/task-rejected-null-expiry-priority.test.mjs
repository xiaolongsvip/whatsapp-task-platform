import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("legacy rejected claims with null expiry are prioritized for inventory recovery", async () => {
  const service = await readFile(path.resolve(here, "../src/tasks/tasks.service.ts"), "utf8");
  const expiry = service.slice(service.indexOf("private async expireOverdueClaims("), service.indexOf("async submitEvidence("));
  const queries = expiry.match(/ORDER BY expires_at ASC NULLS FIRST, claimed_at ASC, id ASC/g) ?? [];
  assert.equal(queries.length, 2, "both user-scoped and global expiry scans must prioritize null-expiry legacy rejections");
  assert.match(expiry, /claim\.status = 'REJECTED'[\s\S]*?claim\.expires_at IS NULL OR claim\.expires_at <=/);
  assert.match(expiry, /status = 'REJECTED'[\s\S]*?expires_at IS NULL OR expires_at <=/);
});
