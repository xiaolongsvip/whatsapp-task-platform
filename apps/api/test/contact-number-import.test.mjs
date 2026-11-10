import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.resolve(here, "../src/contact-numbers/contact-numbers.service.ts"), "utf8");

function part(start, end) {
  const a = source.indexOf(start);
  assert.notEqual(a, -1);
  const b = source.indexOf(end, a + start.length);
  assert.notEqual(b, -1);
  return source.slice(a, b);
}

test("import normalizes, rejects invalid entries and counts in-file duplicates", () => {
  const body = part("async importNumbers(", "async summary(");
  assert.match(body, /normalizePhone\(item\.phone\)/);
  assert.match(body, /invalidCount\s*\+=\s*1/);
  assert.match(body, /seen\.has\(phone\)/);
  assert.match(body, /duplicateCount\s*\+=\s*1/);
});

test("import locks inventory before writing batch and filters existing numbers", () => {
  const body = part("async importNumbers(", "async summary(");
  assert.ok(body.indexOf("pg_advisory_xact_lock(1732050807)") < body.indexOf("tx.contactImportBatch.create"));
  assert.match(body, /newPhones = normalized\.filter/);
  assert.match(body, /skipDuplicates: true/);
});

test("only inserted numbers receive consent events and trigger allocation", () => {
  const body = part("async importNumbers(", "async summary(");
  assert.match(body, /if \(inserted\.length\)[\s\S]*?contactConsentEvent\.createMany/);
  assert.match(body, /const allocation = inserted\.length\s*\?/);
  assert.match(body, /taskId: null, allocatedCount: 0, reassignedCount: 0/);
});

test("manual additions lock inventory before inserting", () => {
  const body = part("async addSingle(", "async samplingNumbers(");
  assert.ok(body.indexOf("pg_advisory_xact_lock(1732050807)") < body.indexOf("tx.contactNumber.create"));
});

test("clear-all locks before reading inventory and rejects active assignments", () => {
  const body = part("async deleteSamplingNumbers(", "async block(");
  assert.ok(body.indexOf("pg_advisory_xact_lock(1732050807)") < body.indexOf("tx.contactNumber.findMany({ select: { id: true } })"));
  assert.match(body, /activeAssignments > 0 \|\| activeSlots > 0/);
  assert.match(body, /throw new ConflictException/);
});
