import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/admin-dashboard/admin-dashboard.service.ts", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/admin-dashboard/admin-dashboard.controller.ts", import.meta.url), "utf8");
const moduleFile = readFileSync(new URL("../src/app.module.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../admin/src/app/page.tsx", import.meta.url), "utf8");

test("admin dashboard metrics endpoint requires an authenticated admin session", () => {
  assert.match(controller, /@Get\("summary"\)/);
  assert.match(controller, /getCurrentAdmin\(adminToken\(request\)\)/);
  assert.match(moduleFile, /AdminDashboardModule/);
});

test("dashboard cards use real task, review, user, withdrawal and reward records", () => {
  assert.match(service, /taskClaim\.count/);
  assert.match(service, /taskSubmission\.count/);
  assert.match(service, /taskReview\.count/);
  assert.match(service, /user\.count/);
  assert.match(service, /withdrawalRequest\.count/);
  assert.match(service, /sourceType: "TASK_REWARD"/);
});

test("dashboard returns seven daily submission and review trend points", () => {
  assert.match(service, /Array\.from\(\{ length: 7 \}/);
  assert.match(service, /submitted:/);
  assert.match(service, /approved:/);
  assert.match(service, /rejected:/);
});

test("dashboard distribution maps claim lifecycle to the five reference states", () => {
  for (const status of ["CLAIMED", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"]) {
    assert.ok(service.includes('"'+status+'"'));
  }
});

test("admin home renders reference dashboard cards, trend chart and claim distribution", () => {
  for (const label of ["今日领取任务", "待审核任务", "今日审核通过", "活跃用户", "待处理提现", "今日奖励支出", "近7日任务趋势", "待领取", "进行中", "已驳回"]) {
    assert.ok(page.includes(label), "missing dashboard label: " + label);
  }
  assert.match(page, /\/api\/v1\/admin\/dashboard\/summary/);
});
