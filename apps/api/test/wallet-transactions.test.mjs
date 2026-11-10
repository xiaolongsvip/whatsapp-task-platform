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

test("paid withdrawals are represented by their posted ledger debit only once", () => {
  assert.match(service, /where: \{ status: \{ not: "PAID" \} \}/);
  assert.match(service, /PAID withdrawals already have a corresponding WITHDRAWAL_PAYOUT ledger debit/);
});

test("wallet hold idempotency keys cannot be reused for a different freeze or resolution", () => {
  const holds = readFileSync(new URL("../src/wallet-holds-admin/wallet-holds-admin.service.ts", import.meta.url), "utf8");
  assert.match(holds, /sameRequest = existing\.walletId === input\.walletId/);
  assert.match(holds, /existing\.amountMinor === amount/);
  assert.match(holds, /prior\.holdId !== holdId \|\| prior\.eventType !== eventType/);
  assert.match(holds, /幂等键已用于不同的冻结请求/);
  assert.match(holds, /幂等键已用于其他冻结资金操作/);
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

test("wallet overview exposes ledger categories and subtracts active frozen holds", () => {
  assert.match(service, /by: \["walletId", "direction", "sourceType"\]/);
  assert.match(service, /categories,/);
  assert.match(service, /prisma\.walletHold\.groupBy/);
  assert.match(service, /frozenMinor: frozen\.toString\(\)/);
  assert.match(service, /frozenBalanceAvailable: true/);
});

test("admin wallet hold endpoints require an active admin session", () => {
  const controller = readFileSync(new URL("../src/wallet-holds-admin/wallet-holds-admin.controller.ts", import.meta.url), "utf8");
  assert.match(controller, /getCurrentAdmin\(sessionToken\(req\)\)/);
  assert.match(controller, /@Post\(":id\/release"\)/);
  assert.match(controller, /@Post\(":id\/capture"\)/);
});

test("wallet hold capture writes a debit ledger entry and immutable event", () => {
  const holds = readFileSync(new URL("../src/wallet-holds-admin/wallet-holds-admin.service.ts", import.meta.url), "utf8");
  assert.match(holds, /sourceType: "WALLET_HOLD_CAPTURE"/);
  assert.match(holds, /direction: "DEBIT"/);
  assert.match(holds, /walletHoldEvent\.create/);
  assert.match(holds, /isolationLevel: "Serializable"/);
});

test("wallet overview returns the same response collections when the user has no wallets", () => {
  assert.match(service, /if \(!walletIds\.length\) return \{ items: \[\], totals: \[\], categories: \[\], frozenBalances: \[\], frozenBalanceAvailable: true \};/);
});

test("Android wallet screen displays the frozen amount returned by the wallet overview API", () => {
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(app, /val frozen = total\("frozenMinor"\)/);
  assert.match(app, /"Frozen" else "风险冻结", frozen,/);
});
test("admin wallet hold records support server-backed pagination", () => {
  const page = readFileSync(new URL("../../admin/src/app/wallet-holds/page.tsx", import.meta.url), "utf8");
  assert.match(page, /"&page=" \+ page \+ "&pageSize=" \+ pageSize/);
  assert.match(page, /上一页/);
  assert.match(page, /下一页/);
});


test("freezing funds calculates available balance with database aggregates instead of loading all ledger rows", () => {
  const holds = readFileSync(new URL("../src/wallet-holds-admin/wallet-holds-admin.service.ts", import.meta.url), "utf8");
  assert.match(holds, /ledgerEntry\.groupBy\(\{ by: \["direction"\]/);
  assert.match(holds, /withdrawalRequest\.aggregate\([\s\S]*?_sum: \{ amountMinor: true \}/);
  assert.doesNotMatch(holds, /ledgerEntry\.findMany\(\{ where: \{ walletId: wallet\.id \}/);
});

test("withdrawal creation calculates available balance with database aggregates", () => {
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  assert.match(withdrawals, /ledgerEntry\.groupBy\(\{ by: \["direction"\]/);
  assert.match(withdrawals, /withdrawalRequest\.aggregate\([\s\S]*?_sum: \{ amountMinor: true \}/);
  assert.doesNotMatch(withdrawals, /ledgerEntry\.findMany\(\{ where: \{ walletId: wallet\.id \}/);
});


test("Android wallet recognizes the backend referral commission ledger source type", () => {
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(app, /"REFERRAL_COMMISSION", "REFERRAL_REWARD" -> if \(en\) "Referral commission" else "邀请佣金"/);
  assert.match(app, /"REFERRAL_COMMISSION", "REFERRAL_REWARD" -> if \(en\) "Referral commissions" else "邀请佣金"/);
  assert.ok((app.match(/"REFERRAL_COMMISSION", "REFERRAL_REWARD" ->/g) || []).length >= 3);
});


test("posted withdrawal ledger debits remain in the withdrawals category while requests are not shown as posted debits", () => {
  assert.match(service, /entry\.sourceType === "WITHDRAWAL_PAYOUT" \? "WITHDRAWAL"/);
  assert.match(service, /direction: "PENDING"/);
  assert.match(service, /non-paid request reserves funds but is not yet a posted ledger debit/);
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(app, /"WITHDRAWAL", "WITHDRAWAL_PAYOUT" -> if \(en\) "Withdrawal" else "提现"/);
  assert.match(app, /if \(item\.optString\("direction"\) == "CREDIT"\) "\+" else if \(item\.optString\("direction"\) == "DEBIT"\) "−" else ""/);
  assert.ok((app.match(/item\.optString\("direction"\) == "DEBIT"\) "−" else ""/g) || []).length >= 2);
});
