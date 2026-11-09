import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../../admin/src/app/users/page.tsx", import.meta.url), "utf8");

test("admin user wallet balances use the ISO currency fraction digits and precise integer formatting", () => {
  const helper = page.slice(page.indexOf("function formatMinor("), page.indexOf("\nconst money"));
  assert.match(helper, /BigInt\(minor\)/);
  assert.match(helper, /maximumFractionDigits/);
  assert.match(helper, /BigInt\(10\) \*\* BigInt\(digits\)/);
  assert.doesNotMatch(helper, /\/\s*100/);
});
