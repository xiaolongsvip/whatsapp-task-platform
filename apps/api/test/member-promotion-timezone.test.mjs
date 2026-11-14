import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");

test("referral monthly commission window starts at local midnight on the first day of the month", () => {
  assert.match(service, /export function startOfMonth\(timezone: string\): Date/);
  const method = service.slice(service.indexOf("export function startOfMonth("), service.indexOf("export function startOfDay("));
  assert.match(method, /zonedParts\(now, timezone\)/);
  assert.match(method, /Date\.UTC\(local\.year, local\.month - 1, 1\)/);
  assert.match(method, /candidate = localMonthStartUtc - offset/);
  const promotion = service.slice(service.indexOf("async getPromotionSummary("), service.indexOf("async getWalletOverview("));
  assert.match(promotion, /const monthStart = startOfMonth\(timezone\)/);
  assert.doesNotMatch(promotion, /new Date\(Date\.UTC\(local\.year, local\.month - 1, 1\)\)/);
});
