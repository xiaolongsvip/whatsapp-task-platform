import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");

test("member promotion commission totals include only commissions posted to the member wallet", () => {
  const method = service.slice(service.indexOf("async getPromotionSummary("), service.indexOf("async getWalletOverview("));
  assert.match(method, /idempotencyKey: true/);
  assert.match(method, /direction: "CREDIT"/);
  assert.match(method, /sourceType: "REFERRAL_COMMISSION"/);
  assert.match(method, /wallet: \{ userId \}/);
  assert.match(method, /creditsByKey\.get\(row\.idempotencyKey\)/);
  assert.match(method, /todayCommissions: sumCredited\(todayRewards\)/);
  assert.match(method, /totalCommissions: sumCredited\(rewards\)/);
  assert.match(method, /monthCommissions: sumCredited\(monthRewards\)/);
  assert.doesNotMatch(method, /todayCommissions: sum\(todayRewards\)/);
  assert.doesNotMatch(method, /totalCommissions: sum\(rewards\)/);
});

test("member commission summary batches ledger lookups to avoid oversized IN queries", () => {
  const method = service.slice(service.indexOf("async getPromotionSummary("), service.indexOf("async getWalletOverview("));
  assert.match(method, /for \(let offset = 0; offset < rewardKeys\.length; offset \+= 500\)/);
  assert.match(method, /rewardKeys\.slice\(offset, offset \+ 500\)/);
});

test("member promotion summary also verifies referral credit amount and currency", () => {
  const method = service.slice(service.indexOf("async getPromotionSummary("), service.indexOf("async getWalletOverview("));
  assert.match(method, /select: \{ idempotencyKey: true, amountMinor: true, currency: true \}/);
  assert.match(method, /credit\.amountMinor !== row\.amountMinor/);
  assert.match(method, /credit\.currency\.trim\(\)\.toUpperCase\(\) !== row\.currency\.trim\(\)\.toUpperCase\(\)/);
});
