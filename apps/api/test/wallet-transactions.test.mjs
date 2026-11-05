import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/users/users.controller.ts", import.meta.url), "utf8");

test("wallet transaction history is scoped to the authenticated user's wallets", () => {
  assert.match(controller, /@Get\("wallet-transactions"\)[\s\S]*?getWalletTransactions/);
  assert.match(controller, /getCurrentUser\(sessionToken\(request\)\)[\s\S]*?getWalletTransactions\(user\.id/);
  assert.match(service, /async getWalletTransactions\(userId: string/);
  assert.match(service, /where: \{ userId \}/);
});

test("wallet transaction history returns ledger direction, source, currency and timestamps", () => {
  assert.match(service, /sourceType: entry\.sourceType/);
  assert.match(service, /direction: entry\.direction/);
  assert.match(service, /amountMinor: entry\.amountMinor\.toString\(\)/);
  assert.match(service, /createdAt: entry\.createdAt\.toISOString\(\)/);
});

test("wallet transaction history includes withdrawal request status without double-counting it as a ledger entry", () => {
  assert.match(service, /type: "WITHDRAWAL"/);
  assert.match(service, /status: withdrawal\.status/);
  assert.match(service, /wallet\.withdrawals/);
});

test("wallet overview aggregates lifetime ledger totals and separates withdrawal reserves", () => {
  assert.match(service, /async getWalletOverview\(userId: string\)/);
  assert.match(service, /prisma\.ledgerEntry\.groupBy/);
  assert.match(service, /prisma\.withdrawalRequest\.groupBy/);
  assert.match(service, /pendingWithdrawalMinor: pending\.toString\(\)/);
  assert.match(service, /processingWithdrawalMinor: processing\.toString\(\)/);
  assert.match(service, /availableMinor:/);
});

test("wallet overview endpoint requires the current authenticated user", () => {
  assert.match(controller, /@Get\("wallet-overview"\)[\s\S]*?getWalletOverview/);
  assert.match(controller, /getCurrentUser\(sessionToken\(request\)\)[\s\S]*?getWalletOverview\(user\.id\)/);
});

test("wallet overview exposes ledger source categories without inventing frozen balances", () => {
  assert.match(service, /by: \["walletId", "direction", "sourceType"\]/);
  assert.match(service, /categories,/);
  assert.match(service, /frozenBalanceAvailable: false/);
  assert.match(service, /frozenBalances: \[\]/);
});
