import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/admin-users/admin-users.service.ts", import.meta.url), "utf8");

test("user detail calculates lifetime wallet balances with database aggregates", () => {
  const detail = service.slice(service.indexOf("async detail("), service.indexOf("async deviceHistory("));
  assert.match(detail, /ledgerEntry\.groupBy\(\{ by: \["currency", "direction"\]/);
  assert.match(detail, /entry\._sum\.amountMinor/);
  assert.doesNotMatch(detail, /wallets: \{ include: \{ entries:/);
  assert.doesNotMatch(detail, /for \(const wallet of user\.wallets\) for \(const entry of wallet\.entries\)/);
});

test("user detail withdrawal totals cover all history while returning only the newest 100 rows", () => {
  const detail = service.slice(service.indexOf("async detail("), service.indexOf("async deviceHistory("));
  assert.match(detail, /withdrawalRequest\.groupBy\(\{ by: \["status"\]/);
  assert.match(detail, /withdrawalRequest\.findMany\([\s\S]*?orderBy: \{ createdAt: "desc" \}, take: 100/);
  assert.match(detail, /total: withdrawalTotal, pending: withdrawalPending, paid: withdrawalPaid/);
  assert.doesNotMatch(detail, /total: withdrawals\.length/);
});
