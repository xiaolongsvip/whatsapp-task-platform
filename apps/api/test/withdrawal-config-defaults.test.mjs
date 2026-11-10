import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../src/system-settings/system-settings.service.ts", import.meta.url), "utf8");

test("withdrawal settings do not invent a legacy Pakistan USD-to-PKR default rule", () => {
  assert.doesNotMatch(settings, /default-pk-usd-local|jazzcash|easypaisa/i);
  assert.doesNotMatch(settings, /DEFAULT_RULES/);
  assert.match(settings, /this\.read\("system\.withdrawalRules", \[\]\)/);
  assert.match(settings, /this\.read\("system\.withdrawalRules", \[\]\) as JsonRecord\[\]/);
});

test("withdrawal rule reads and edits preserve explicitly stored administrator rules", () => {
  assert.match(settings, /async listWithdrawalRules\([\s\S]*?this\.read\("system\.withdrawalRules", \[\]\)/);
  assert.match(settings, /async saveWithdrawalRule\([\s\S]*?this\.read\("system\.withdrawalRules", \[\]\)/);
  assert.match(settings, /await this\.write\("system\.withdrawalRules", items\)/);
});
