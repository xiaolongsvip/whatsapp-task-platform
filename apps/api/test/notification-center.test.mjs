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


test("notice and template writes commit business rows and audit events atomically", async () => {
  const service = await read("../src/notifications/notifications.service.ts");
  const createNotice = service.slice(service.indexOf("async create("), service.indexOf("async update("));
  const createTemplate = service.slice(service.indexOf("async createTemplate("), service.indexOf("async updateTemplate("));
  const updateTemplate = service.slice(service.indexOf("async updateTemplate("), service.indexOf("async toggleTemplate("));
  const toggleTemplate = service.slice(service.indexOf("async toggleTemplate("), service.indexOf("async publicAnnouncements("));

  for (const [name, method, write] of [
    ["notice creation", createNotice, "tx.adminNotification.create"],
    ["template creation", createTemplate, "tx.notificationTemplate.create"],
    ["template update", updateTemplate, "tx.notificationTemplate.update"],
    ["template toggle", toggleTemplate, "tx.notificationTemplate.update"],
  ]) {
    assert.match(method, /prisma\.\$transaction/, name + " must use a transaction");
    assert.ok(method.includes(write), name + " must write through the transaction client");
    assert.match(method, /tx\.auditEvent\.create/, name + " must persist its audit event in the same transaction");
  }
});


test("member notification inbox stores per-user read receipts with unique ownership and cascading references", async () => {
  const schema = await read("../../../packages/database/prisma/schema.prisma");
  const migration = await read("../../../packages/database/prisma/migrations/20261115100000_add_notification_read_receipts/migration.sql");
  assert.match(schema, /model NotificationReadReceipt \\{/);
  assert.match(schema, /notificationReads\\s+NotificationReadReceipt\\[\\]/);
  assert.match(schema, /readReceipts\\s+NotificationReadReceipt\\[\\]/);
  assert.match(schema, /@@unique\\(\\[userId, notificationId\\]\\)/);
  assert.match(migration, /CREATE TABLE "notification_read_receipts"/);
  assert.match(migration, /notification_read_receipts_user_id_notification_id_key/);
  assert.match(migration, /REFERENCES "users"\\("id"\\) ON DELETE CASCADE/);
  assert.match(migration, /REFERENCES "admin_notifications"\\("id"\\) ON DELETE CASCADE/);
});

test("member notification endpoints require a logged-in user and expose list, read and read-all operations", async () => {
  const controller = await read("../src/notifications/member-notifications.controller.ts");
  const module = await read("../src/notifications/notifications.module.ts");
  assert.match(controller, /@Controller\\("users\\/notifications"\\)/);
  assert.match(controller, /@Get\\(\\)/);
  assert.match(controller, /this\\.auth\\.getCurrentUser\\(sessionToken\\(request\\)\\)/);
  assert.match(controller, /@Patch\\(":id\\/read"\\)/);
  assert.match(controller, /@Post\\("read-all"\\)/);
  assert.match(module, /AuthModule/);
  assert.match(module, /MemberNotificationsController/);
});

test("member inbox only returns published notices targeted to the current user and uses stable cursor pagination", async () => {
  const service = await read("../src/notifications/notifications.service.ts");
  const list = service.slice(service.indexOf("async listForMember("), service.indexOf("async markMemberNotificationRead("));
  assert.match(list, /status: "PUBLISHED"/);
  assert.match(list, /publishedAt: \\{ not: null \\}/);
  assert.match(list, /target: \\{ in: targetFilter \\}/);
  assert.match(list, /readReceipts: \\{ none: \\{ userId \\} \\}/);
  assert.match(list, /orderBy: \\[\\{ publishedAt: "desc" \\}, \\{ id: "desc" \\}\\]/);
  assert.match(list, /take: take \\+ 1/);
  assert.match(list, /nextCursor: hasMore/);
  assert.match(list, /unreadCount/);
  assert.match(list, /readReceipts: \\{/);
  assert.match(list, /isRead: readAt !== null/);
});

test("member read operations are user-scoped, idempotent and support mark-all without duplicate receipts", async () => {
  const service = await read("../src/notifications/notifications.service.ts");
  const markRead = service.slice(service.indexOf("async markMemberNotificationRead("), service.indexOf("async markAllMemberNotificationsRead("));
  const markAll = service.slice(service.indexOf("async markAllMemberNotificationsRead("), service.indexOf("async publicAnnouncements("));
  assert.match(markRead, /target: \\{ in: targetFilter \\}/);
  assert.match(markRead, /userId_notificationId: \\{ userId, notificationId \\}/);
  assert.match(markRead, /notificationReadReceipt\\.upsert/);
  assert.match(markAll, /readReceipts: \\{ none: \\{ userId \\} \\}/);
  assert.match(markAll, /notificationReadReceipt\\.createMany/);
  assert.match(markAll, /skipDuplicates: true/);
});

test("Android notification inbox loads pages, marks read, marks all read and displays unread count entry point", async () => {
  const app = await read("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt");
  const screen = await read("../../../android/app/src/main/java/com/wtp/app/ui/MemberNotificationsScreen.kt");
  const repository = await read("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt");
  assert.match(repository, /fun notifications\\(limit: Int = 30/);
  assert.match(repository, /fun markNotificationRead\\(/);
  assert.match(repository, /fun markAllNotificationsRead\\(/);
  assert.match(screen, /AuthRepository\\.notifications\\(30/);
  assert.match(screen, /AuthRepository\\.markNotificationRead\\(id\\)/);
  assert.match(screen, /AuthRepository\\.markAllNotificationsRead\\(\\)/);
  assert.match(screen, /nextCursor/);
  assert.match(app, /MemberNotificationsScreen/);
  assert.match(app, /unreadNotificationCount/);
  assert.match(app, /onNotifications = \\{ showNotifications = true \\}/);
});
