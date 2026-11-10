import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/admin-referrals/admin-referrals.service.ts", import.meta.url), "utf8");

test("referral commission listing filters status and paginates in SQL instead of loading all rows", () => {
  const method = service.slice(service.indexOf("async listCommissions("), service.indexOf("async getSettings()"));
  assert.match(method, /\$queryRawUnsafe[\s\S]*?COUNT\(\*\)::bigint AS total/);
  assert.match(method, /credit\.id IS NOT NULL/);
  assert.match(method, /credit\.id IS NULL/);
  assert.match(method, /LIMIT \$\{limit\} OFFSET \$\{offset\}/);
  assert.match(method, /rowParams = \[\.\.\.params\]/);
  assert.doesNotMatch(method, /referralReward\.findMany/);
  assert.doesNotMatch(method, /matching\.slice/);
});

test("referral commission statistics aggregate credited and pending amounts per currency in the database", () => {
  const method = service.slice(service.indexOf("async listCommissions("), service.indexOf("async getSettings()"));
  assert.match(method, /COUNT\(\*\) FILTER \(WHERE credit\.id IS NOT NULL\)/);
  assert.match(method, /COUNT\(\*\) FILTER \(WHERE credit\.id IS NULL\)/);
  assert.match(method, /SUM\(rr\.amount_minor\) FILTER/);
  assert.match(method, /GROUP BY rr\.currency/);
});

test("referral commission search includes source and beneficiary identifiers and profile fields", () => {
  const method = service.slice(service.indexOf("async listCommissions("), service.indexOf("async getSettings()"));
  for (const field of ["rr.source_event_id", "source_user.phone", "source_user.referral_code", "beneficiary.phone", "beneficiary.referral_code", "rr.source_user_id", "rr.beneficiary_id"]) {
    assert.ok(method.includes(field), "missing commission search field: " + field);
  }
});


test("referral commission search only casts canonical UUID strings to UUID", () => {
  const method = service.slice(service.indexOf("async listCommissions("), service.indexOf("async getSettings()"));
  assert.match(method, /\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-8\]\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}\$/i);
  assert.match(method, /fields\.push\("rr\.source_user_id = " \+ id \+ "::uuid"\)/);
  assert.match(method, /fields\.push\("rr\.beneficiary_id = " \+ id \+ "::uuid"\)/);
});
