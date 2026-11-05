import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) =>
  readFile(path.resolve(here, relativePath), "utf8");

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `Missing section start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `Missing section end: ${end}`);
  return source.slice(from, to);
}

test("claim reserves contact number before task slot", async () => {
  const source = await readSource("../src/tasks/tasks.service.ts");
  const body = section(source, "async claimTask(", "async startClaim(");
  const numberLock = body.indexOf("tx.contactNumber.updateMany");
  const slotLock = body.indexOf("tx.taskSlot.updateMany");
  assert.ok(numberLock >= 0, "contact number reservation must exist");
  assert.ok(slotLock > numberLock, "number must be reserved before slot");
});

test("cancel and expiry release number before slot", async () => {
  const source = await readSource("../src/tasks/tasks.service.ts");
  const cancel = section(source, "async cancelClaim(", "private async expireOverdueClaims(");
  assert.ok(cancel.indexOf("tx.contactNumber.updateMany") < cancel.indexOf("tx.taskSlot.updateMany"));

  const expiry = section(source, "private async expireOverdueClaims(", "async submitEvidence(");
  assert.ok(expiry.indexOf("tx.contactNumber.updateMany") < expiry.indexOf("tx.taskSlot.updateMany"));
});

test("admin block locks claims, then number, then retires slots", async () => {
  const source = await readSource("../src/contact-numbers/contact-numbers.service.ts");
  const body = section(source, "async block(", "\n  }\n}");
  const claimLock = body.indexOf("FROM task_claims");
  const numberLock = body.indexOf("FROM contact_numbers");
  const slotUpdate = body.indexOf("tx.taskSlot.updateMany");
  assert.ok(claimLock >= 0 && numberLock > claimLock && slotUpdate > numberLock);
  assert.match(body, /status: \{ in: \["AVAILABLE", "ASSIGNED"\] \}/);
  assert.match(body, /status: "USED"/);
});

test("admin block refuses pending review before mutating assignments", async () => {
  const source = await readSource("../src/contact-numbers/contact-numbers.service.ts");
  const body = section(source, "async block(", "\n  }\n}");
  const pendingGuard = body.indexOf("assignments.some");
  const firstMutation = body.indexOf("tx.taskClaim.update");
  assert.ok(pendingGuard >= 0 && firstMutation > pendingGuard);
  assert.match(body, /SUBMITTED", "UNDER_REVIEW/);
});

test("repeated block returns before writing another revocation event", async () => {
  const source = await readSource("../src/contact-numbers/contact-numbers.service.ts");
  const body = section(source, "async block(", "\n  }\n}");
  const idempotentGuard = body.indexOf('number.status === "BLOCKED"');
  const eventWrite = body.indexOf("tx.contactConsentEvent.create");
  assert.ok(idempotentGuard >= 0 && eventWrite > idempotentGuard);
  assert.match(body, /alreadyBlocked: true/);
});
