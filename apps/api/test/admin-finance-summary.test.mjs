import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../admin/src/app/finance/page.tsx", import.meta.url), "utf8");

test("finance dashboard actual payout total comes from successful PAYOUT transactions by payout currency", () => {
  assert.match(service, /paymentTransaction\.groupBy\(\{ by: \["currency"\], where: \{ flow: "PAYOUT", status: "SUCCEEDED" \}/);
  assert.match(service, /successfulPayouts: successfulPayoutGroups\.map/);
  assert.match(page, /successfulPayouts:Array<\{currency:string;count:number;amountMinor:string\}>/);
  assert.match(page, /\["总的已代付金额",summary\.successfulPayouts\]/);
  assert.match(page, /money\(x\.amountMinor,x\.currency\)/);
  assert.doesNotMatch(page, /x\.amount\/100/);
});
