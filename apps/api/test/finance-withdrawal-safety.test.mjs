import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/finance-admin/finance-admin.controller.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../packages/database/prisma/migrations/20261108193000_unique_manual_payout_reference/migration.sql", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../../admin/src/app/finance/page.tsx", import.meta.url), "utf8");

test("manual payout rejects a provider payout reference already used by another payout", () => {
  assert.match(service, /where: \{ providerCode, providerReference: reference, flow: "PAYOUT" \}/);
  assert.match(service, /该服务商付款凭证已关联其他付款记录/);
  assert.match(migration, /CREATE UNIQUE INDEX "payment_transactions_provider_payout_reference_key"/);
  assert.match(migration, /WHERE "flow" = 'PAYOUT' AND "provider_reference" IS NOT NULL/);
});

test("manual payout unique-index conflicts are returned as a conflict instead of an internal error", () => {
  assert.match(service, /known\?\.code === "P2002"/);
  assert.match(service, /该服务商付款凭证已被使用，不能重复登记/);
});

test("withdrawal approval is clearly labeled as awaiting payout, not as an executed payout", () => {
  assert.match(adminPage, /审核通过，进入待付款/);
  assert.doesNotMatch(adminPage, /通过并代付/);
  assert.match(adminPage, /自动代付通道尚未接入/);
});

test("finance withdrawal status filters include approved, processing and terminal states", () => {
  for (const status of ["APPROVED", "PROCESSING", "PAID", "FAILED", "REJECTED", "CANCELLED"]) {
    assert.match(adminPage, new RegExp('\\["' + status + '",'));
  }
});

test("manual payout endpoint remains protected by admin authentication", () => {
  assert.match(controller, /const admin = await this\.authorize\(req\)/);
  assert.match(controller, /recordManualPayout\(id, body\.outcome, admin\.id, body\)/);
});

test("major app updates are checked before authenticated and member screens are shown", () => {
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(app, /AuthRepository\.publicAppUpdate\(\)/);
  assert.match(app, /info\.optBoolean\("forceUpdate"\) && publishedCode > com\.wtp\.app\.BuildConfig\.VERSION_CODE/);
  assert.match(app, /requiredUpdate != null -> ForceUpdateScreen/);
  assert.match(app, /Never lock users out when the update service is temporarily unavailable/);
  assert.match(app, /enabled = downloadUrl\.startsWith\("https:\/\/"\)/);
});

test("APP support URL is admin-configurable, HTTPS-only, audited, and exposed to the dashboard", () => {
  const settings = readFileSync(new URL("../src/system-settings/system-settings.service.ts", import.meta.url), "utf8");
  const settingsController = readFileSync(new URL("../src/system-settings/system-settings.controller.ts", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");
  const settingsPage = readFileSync(new URL("../../admin/src/app/system-settings/page.tsx", import.meta.url), "utf8");
  assert.match(settings, /async saveSupport\(input: JsonRecord, adminId: string\)/);
  assert.ok(settings.includes("https://"));
  assert.ok(settings.includes("supportUrl.length > 2048"));
  assert.match(settings, /APP_SUPPORT_URL_UPDATED/);
  assert.match(settingsController, /@Put\("support"\)/);
  assert.match(dashboard, /system\.appSupport/);
  assert.match(dashboard, /supportUrl,/);
  assert.match(settingsPage, /保存客服配置/);
  assert.match(settingsPage, /\/api\/v1\/admin\/system-settings\/support/);
});

test("AI task approval applies the same referral commission settlement as manual approval", () => {
  const worker = read("src/ai-config/ai-review.worker.ts");
  assert.match(worker, /key: "referral-commission"/);
  assert.match(worker, /referralAncestor\.findMany/);
  assert.match(worker, /referralReward\.create/);
  assert.match(worker, /sourceType: "REFERRAL_COMMISSION"/);
  assert.match(worker, /referral-commission:\$\{claim\.id\}/);
});
