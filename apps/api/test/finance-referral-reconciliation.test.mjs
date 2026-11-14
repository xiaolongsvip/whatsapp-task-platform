import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");

test("finance reconciliation checks referral rewards against posted wallet ledger entries", () => {
  const method = service.slice(service.indexOf("async runFinanceReconciliation("), service.indexOf("async reconciliationRuns("));
  assert.match(method, /prisma\.referralReward\.findMany/);
  assert.match(method, /entry\.sourceType !== "REFERRAL_COMMISSION"/);
  assert.match(method, /direction !== "CREDIT"/);
  assert.match(method, /entry\.amountMinor !== reward\.amountMinor/);
  assert.match(method, /actualCurrency !== expectedCurrency/);
  assert.match(method, /entry\.wallet\.userId !== reward\.beneficiaryId/);
  assert.match(method, /REFERRAL_COMMISSION_LEDGER_MISSING/);
  assert.match(method, /REFERRAL_COMMISSION_LEDGER_MISMATCH/);
  assert.match(method, /REFERRAL_COMMISSION_REWARD_MISSING/);
  assert.match(method, /referralCommissionsChecked: referralRewards\.length/);
  assert.match(method, /referralCommissionLedgerEntriesChecked: referralCredits\.length/);
  assert.match(method, /referralKeys\.slice\(offset, offset \+ 500\)/);
});
