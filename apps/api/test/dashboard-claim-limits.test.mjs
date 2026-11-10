import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("dashboard uses the same global claim limits as task claim enforcement", async () => {
  const dashboard = await readFile(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");
  const tasks = await readFile(new URL("../src/tasks/tasks.service.ts", import.meta.url), "utf8");

  assert.match(dashboard, /taskConfiguration\.findUnique\(\{ where: \{ key: "claim-limits" \}/);
  assert.match(dashboard, /profile\?\.dailyTaskLimit \?\? positiveInteger\(globalLimits\.dailyLimit, 20\)/);
  assert.match(dashboard, /profile\?\.minClaimIntervalSeconds \?\? positiveInteger\(globalLimits\.minimumIntervalSeconds, 60\)/);
  assert.match(tasks, /taskConfiguration\.findUnique\(\{ where: \{ key: "claim-limits" \}/);
  assert.match(tasks, /userPolicy\?\.dailyTaskLimit \?\? positiveInteger\(globalLimits\.dailyLimit, DAILY_TASK_LIMIT\)/);
  assert.match(tasks, /userPolicy\?\.minClaimIntervalSeconds \?\? positiveInteger\(globalLimits\.minimumIntervalSeconds, DEFAULT_MIN_CLAIM_INTERVAL_SECONDS\)/);
});
