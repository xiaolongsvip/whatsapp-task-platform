import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../../admin/src/app/finance/page.tsx", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/finance-admin/finance-admin.controller.ts", import.meta.url), "utf8");

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

test("admin reconciliation detail displays referral beneficiary, expected amount and ledger mismatch details", () => {
  assert.match(adminPage, /x\.beneficiaryId/);
  assert.match(adminPage, /x\.walletUserId/);
  assert.match(adminPage, /x\.actualSourceType/);
  assert.match(adminPage, /x\.actualWalletUserId/);
  assert.match(adminPage, /x\.expectedAmountMinor/);
  assert.match(adminPage, /x\.expectedWalletUserId/);
  assert.match(adminPage, /x\.actualWalletUserId/);
  assert.match(adminPage, /x\.expectedWalletId/);
  assert.match(adminPage, /x\.actualWalletId/);
});


test("finance reconciliation verifies task reward credits belong to the task claimant wallet", () => {
  const method = service.slice(service.indexOf("async runFinanceReconciliation("), service.indexOf("async reconciliationRuns("));
  assert.match(method, /sourceType: "TASK_REWARD"[\s\S]*?select: \{ sourceId: true, walletId: true, direction: true, amountMinor: true, currency: true, wallet: \{ select: \{ userId: true \} \} \}/);
  assert.match(method, /entry\.wallet\.userId !== x\.claim\.userId/);
  assert.match(method, /actualWalletUserId: entry\.wallet\.userId/);
  assert.match(method, /expectedWalletUserId: x\.claim\.userId/);
});

test("finance reconciliation verifies withdrawal debits belong to the withdrawal wallet", () => {
  const method = service.slice(service.indexOf("async runFinanceReconciliation("), service.indexOf("async reconciliationRuns("));
  assert.match(method, /sourceType: "WITHDRAWAL_PAYOUT"[\s\S]*?select: \{ sourceId: true, walletId: true, direction: true, amountMinor: true, currency: true, wallet: \{ select: \{ userId: true \} \} \}/);
  assert.match(method, /entry\.walletId !== x\.walletId/);
  assert.match(method, /expectedWalletId: x\.walletId/);
  assert.match(method, /actualWalletId: entry\.walletId/);
});

test("finance reconciliation scans all task reward ledger entries and flags entries without an approved claim", () => {
  const method = service.slice(service.indexOf("async runFinanceReconciliation("), service.indexOf("async reconciliationRuns("));
  assert.match(method, /where: \{ sourceType: "TASK_REWARD" \ }, skip, take/);
  assert.match(method, /fetchAll\(\(skip, take\) => prisma\.ledgerEntry\.findMany/);
  assert.match(method, /TASK_REWARD_ORPHAN_LEDGER/);
  assert.match(method, /approvedClaimIds\.has\(entry\.sourceId\)/);
});

test("finance reconciliation persists all exception details and paginates run details", () => {
  assert.match(service, /items: items as Prisma\.InputJsonValue/);
  assert.doesNotMatch(service, /items: items\.slice\(0, 500\) as Prisma\.InputJsonValue/);
  assert.match(service, /itemsPageSize: 50/);
  assert.match(service, /allItems\.slice\(pg\.skip, pg\.skip \+ pg\.pageSize\)/);
  assert.match(controller, /reconciliationRunDetail\(id, query\)/);
  assert.match(adminPage, /loadReconciliationPage/);
  assert.match(adminPage, /异常明细/);
  assert.match(adminPage, /上一页/);
  assert.match(adminPage, /下一页/);
});
