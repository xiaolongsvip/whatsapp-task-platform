import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/users/users.controller.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt", import.meta.url), "utf8");
const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");

test("commission history uses a stable user-scoped cursor and reports page-scoped pending totals", () => {
  assert.match(dashboard, /getCommissionRecords\(userId: string, limit = 100, beforeCreatedAt\?: string, beforeId\?: string\)/);
  assert.match(dashboard, /where: \{ beneficiaryId: userId, \.\.\.\(cursorFilter \?\? \{\}\) \}/);
  assert.match(dashboard, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  assert.match(dashboard, /pendingCommissions: totals\(pending\)/);
  assert.match(dashboard, /Pending totals describe this page only/);
  assert.match(dashboard, /nextCursor: hasMore && pageRows\.length/);
  assert.match(controller, /@Get\("commission-records"\)[\s\S]*?@Query\("beforeCreatedAt"\)[\s\S]*?@Query\("beforeId"\)/);
  assert.match(repository, /commissionRecords\(limit: Int = 100, beforeCreatedAt: String\? = null, beforeId: String\? = null\)/);
  assert.match(app, /AuthRepository\.commissionRecords\(100, beforeCreatedAt, beforeId\)/);
  assert.match(app, /Pending on loaded pages/);
  assert.match(app, /加载更多/);
});

test("team history uses a stable compound cursor and preserves full level counts", () => {
  assert.match(dashboard, /getTeamMembers\(userId: string, limit = 300, beforeCreatedAt\?: string, beforeUserId\?: string, beforeDepth\?: number\)/);
  assert.match(dashboard, /where: \{ ancestorUserId: userId, depth: \{ in: \[1, 2, 3\] \}, \.\.\.\(cursorFilter \?\? \{\}\) \}/);
  assert.match(dashboard, /orderBy: \[\{ createdAt: "desc" \}, \{ descendantUserId: "desc" \}, \{ depth: "desc" \}\]/);
  assert.match(dashboard, /counts: \{ level1: counts\[0\], level2: counts\[1\], level3: counts\[2\] \}/);
  assert.match(dashboard, /nextCursor: hasMore && pageRows\.length/);
  assert.match(controller, /@Get\("team"\)[\s\S]*?@Query\("beforeUserId"\)[\s\S]*?@Query\("beforeDepth"\)/);
  assert.match(repository, /teamMembers\(limit: Int = 300, beforeCreatedAt: String\? = null, beforeUserId: String\? = null, beforeDepth: Int\? = null\)/);
  assert.match(app, /AuthRepository\.teamMembers\(300, beforeCreatedAt, beforeUserId, beforeDepth\)/);
  assert.match(app, /private fun TeamDataScreen/);
  assert.match(app, /Unable to load more team members/);
});

test("member commission history requires the exact referral credit type, owner, amount and currency", () => {
  const method = dashboard.slice(dashboard.indexOf("async getCommissionRecords("), dashboard.indexOf("async getTeamMembers("));
  assert.match(method, /sourceType: "REFERRAL_COMMISSION"/);
  assert.match(method, /wallet: \{ userId \}/);
  assert.match(method, /amountMinor === row\.amountMinor/);
  assert.match(method, /credit\.currency\.trim\(\)\.toUpperCase\(\) === row\.currency\.trim\(\)\.toUpperCase\(\)/);
  assert.match(method, /status: isCredited\(row\) \? "CREDITED" : "PENDING"/);
});
