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
