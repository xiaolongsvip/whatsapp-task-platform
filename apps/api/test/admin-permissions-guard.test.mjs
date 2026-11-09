import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guard = readFileSync(new URL("../src/permissions-admin/admin-permission.guard.ts", import.meta.url), "utf8");
const referrals = readFileSync(new URL("../src/admin-referrals/admin-referrals.service.ts", import.meta.url), "utf8");
const financePage = readFileSync(new URL("../../admin/src/app/finance/page.tsx", import.meta.url), "utf8");

test("manual finance adjustments require wallet read and wallet balance adjustment permissions", () => {
  const mapping = guard.split("\n").find((line) => line.includes("adjustments$/"));
  assert.ok(mapping?.includes('method === "GET" ? "finance.wallets.read" : "finance.wallets.adjust"'));
  assert.match(financePage, /新建任务调账/);
  assert.match(financePage, /将立即写入钱包流水/);
});

test("referral commission endpoint uses database pagination and does not load all reward rows", () => {
  const method = referrals.slice(referrals.indexOf("async listCommissions("), referrals.indexOf("async getSettings()"));
  assert.match(method, /\$queryRawUnsafe[\s\S]*?COUNT\(\*\)::bigint AS total/);
  assert.match(method, /LIMIT \$\{limit\} OFFSET \$\{offset\}/);
  assert.doesNotMatch(method, /referralReward\.findMany/);
  assert.doesNotMatch(method, /matching\.slice/);
});
