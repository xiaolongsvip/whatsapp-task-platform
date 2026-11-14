import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("notification schema and migration persist notices and reusable templates", async () => {
  const schema = await read("../../../packages/database/prisma/schema.prisma");
  const migration = await read("../../../packages/database/prisma/migrations/20261114120000_add_in_app_notification_center/migration.sql");
  assert.match(schema, /model AdminNotification \{/);
  assert.match(schema, /model NotificationTemplate \{/);
  assert.match(migration, /CREATE TABLE "admin_notifications"/);
  assert.match(migration, /CREATE TABLE "notification_templates"/);
  assert.match(migration, /target_check/);
  assert.match(migration, /status_check/);
});

test("admin notification endpoints use role permissions for read, manage, template edits and publish", async () => {
  const controller = await read("../src/notifications/notifications.controller.ts");
  const guard = await read("../src/permissions-admin/admin-permission.guard.ts");
  const catalog = await read("../src/permissions-admin/permissions-admin.service.ts");
  assert.match(controller, /@Controller\("admin\/notifications"\)/);
  assert.match(controller, /@Get\("records"\)/);
  assert.match(controller, /@Get\("templates"\)/);
  assert.match(controller, /@Post\(":id\/publish"\)/);
  assert.match(controller, /@Post\(":id\/disable"\)/);
  assert.ok(guard.includes('if (is(/^\\/admin\\/notifications\\/records$/)) return "notifications.read";'));
  assert.ok(guard.includes('if (is(/^\\/admin\\/notifications\\/templates$/)) return method === "GET" ? "notifications.read" : "notifications.templates.manage";'));
  assert.ok(guard.includes('if (is(/^\\/admin\\/notifications\\/[^/]+\\/publish$/)) return "notifications.manage";'));
  assert.match(catalog, /\["notifications\.read"/);
  assert.match(catalog, /\["notifications\.manage"/);
  assert.match(catalog, /\["notifications\.templates\.manage"/);
});

test("only draft notices can be edited or published and publication snapshots audience count transactionally", async () => {
  const service = await read("../src/notifications/notifications.service.ts");
  const update = service.slice(service.indexOf("async update("), service.indexOf("async publish("));
  const publish = service.slice(service.indexOf("async publish("), service.indexOf("async disable("));
  assert.match(update, /FOR UPDATE/);
  assert.match(update, /existing\.status !== "DRAFT"/);
  assert.match(publish, /FOR UPDATE/);
  assert.match(publish, /existing\.status !== "DRAFT"/);
  assert.match(publish, /tx\.user\.count/);
  assert.match(publish, /recipientCount/);
  assert.match(publish, /status: "PUBLISHED"/);
  assert.match(publish, /APP_NOTICE_PUBLISHED/);
});

test("disabling a published notice removes it from the app feed while retaining its history", async () => {
  const service = await read("../src/notifications/notifications.service.ts");
  const disable = service.slice(service.indexOf("async disable("), service.indexOf("async listTemplates("));
  const dashboard = await read("../src/users/dashboard.service.ts");
  assert.match(disable, /FOR UPDATE/);
  assert.match(disable, /status !== "PUBLISHED"/);
  assert.match(disable, /status: "DISABLED"/);
  assert.match(disable, /APP_NOTICE_DISABLED/);
  assert.match(dashboard, /adminNotification\.findMany/);
  assert.match(dashboard, /status: "PUBLISHED"/);
  assert.match(dashboard, /target: \{ in: noticeTargets \}/);
  assert.match(dashboard, /take: 5/);
  assert.match(dashboard, /const announcements = noticeRows\.map/);
});

test("published history excludes drafts and reports in-app audience snapshots, not push delivery", async () => {
  const service = await read("../src/notifications/notifications.service.ts");
  const history = service.slice(service.indexOf("async listRecords("), service.indexOf("async create("));
  const page = await read("../../admin/src/app/notifications/page.tsx");
  assert.match(history, /publishedAt: \{ not: null \}/);
  assert.match(history, /publishedAt\?\.toISOString/);
  assert.match(history, /deliveryMode: "IN_APP"/);
  assert.match(page, /\/api\/v1\/admin\/notifications\/records/);
  assert.match(page, /目标账户数（发布时）/);
  assert.match(page, /不包含 FCM、短信或手机系统级推送/);
});

test("admin UI saves drafts, publishes and disables notices, and persists template CRUD", async () => {
  const page = await read("../../admin/src/app/notifications/page.tsx");
  assert.match(page, /\/api\/v1\/admin\/notifications"/);
  assert.ok(page.includes('api("/api/v1/admin/notifications/"+editingNotice.id'));
  assert.match(page, /\/publish/);
  assert.match(page, /\/disable/);
  assert.match(page, /\/templates/);
  assert.match(page, /保存草稿/);
  assert.match(page, /保存模板/);
  assert.doesNotMatch(page, /当前为页面框架/);
});

test("Android dashboard announcement ticker reads the same dashboard announcements contract", async () => {
  const app = await read("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt");
  const repository = await read("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt");
  assert.match(app, /AuthRepository\.dashboard\(\)/);
  assert.match(app, /AnnouncementTicker\(dataAnnouncements\(data\)/);
  assert.match(app, /values = data\?\.optJSONArray\("announcements"\)/);
  assert.match(repository, /fun dashboard\(\): JSONObject = request\("GET", "users\/dashboard"\)/);
});
