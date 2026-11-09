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


test("finance page formats large minor-unit amounts and converts payout inputs without floating point", () => {
  const formatter = page.slice(page.indexOf("const money="), page.indexOf("const date="));
  assert.match(formatter, /BigInt\(v\)/);
  assert.match(formatter, /BigInt\(10\)\*\*BigInt\(digits\)/);
  assert.match(formatter, /const amountToMinor=\(value:string,currency:string\)=>/);
  assert.match(formatter, /BigInt\(\(whole\+/);
  assert.doesNotMatch(formatter, /Number\(v\)\/Math\.pow/);
  assert.doesNotMatch(formatter, /Number\(raw\)\*Math\.pow/);
});
