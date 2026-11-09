import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../../admin/src/app/reports/page.tsx", import.meta.url), "utf8");

test("reports format minor-unit amounts with the ISO currency precision and preserve large integer precision", () => {
  const money = page.slice(page.indexOf("function money("), page.indexOf("\nfunction amountLines"));
  assert.match(money, /resolvedOptions\(\)\.maximumFractionDigits/);
  assert.match(money, /BigInt\(minor\)/);
  assert.match(money, /10n \*\* BigInt\(digits\)/);
  assert.doesNotMatch(money, /Number\(minor\)\s*\/\s*100/);
});
