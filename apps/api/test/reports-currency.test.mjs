import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../../admin/src/app/reports/page.tsx", import.meta.url), "utf8");

test("reports format minor-unit amounts with the ISO currency precision and preserve large integer precision", () => {
  const money = page.slice(page.indexOf("function money("), page.indexOf("\nfunction amountLines"));
  assert.match(money, /resolvedOptions\(\)\.maximumFractionDigits/);
  assert.match(money, /BigInt\(minor\)/);
  assert.match(money, /BigInt\(10\) \*\* BigInt\(digits\)/);
  assert.doesNotMatch(money, /Number\(minor\)\s*\/\s*100/);
});


test("cross-currency finance report compares expected payout amount and actual payout in payout currency", () => {
  const service = readFileSync(new URL("../src/reports/reports.service.ts", import.meta.url), "utf8");
  assert.match(service, /COALESCE\(NULLIF\(BTRIM\(payout_currency\), ''\), currency\)/);
  assert.match(service, /SUM\(COALESCE\(payout_amount_minor, amount_minor\)\)/);
  assert.match(service, /expectedPayoutApplications\.find/);
  assert.match(service, /actualPayout\.find/);
  assert.match(service, /顶部提现申请金额按钱包扣款币种统计/);
});
