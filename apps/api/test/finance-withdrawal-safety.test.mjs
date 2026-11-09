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
  const worker = readFileSync(new URL("../src/ai-config/ai-review.worker.ts", import.meta.url), "utf8");
  assert.match(worker, /key: "referral-commission"/);
  assert.match(worker, /referralAncestor\.findMany/);
  assert.match(worker, /referralReward\.create/);
  assert.match(worker, /sourceType: "REFERRAL_COMMISSION"/);
  assert.match(worker, /referral-commission:\$\{claim\.id\}/);
});

test("help asset uploads use collision-resistant object keys", () => {
  const controller = readFileSync(new URL("../src/system-settings/system-settings.controller.ts", import.meta.url), "utf8");
  assert.match(controller, /const key = "help-assets\/" \+ randomUUID\(\) \+ "-" \+ safeName/);
  assert.doesNotMatch(controller, /const key = "help-assets\/" \+ Date\.now\(\)/);
});

test("admin APP version page immediately adds a successfully uploaded APK to release history", () => {
  const page = readFileSync(new URL("../../admin/src/app/system-settings/page.tsx", import.meta.url), "utf8");
  assert.match(page, /releases:\[v,\.\.\.\(Array\.isArray\(x\.releases\)\?x\.releases\.filter/);
  assert.match(page, /Number\(r\.versionCode\)!==Number\(v\.versionCode\)/);
});

test("revoking the live APP release restores the previous published release even when a newer draft exists", () => {
  const settings = readFileSync(new URL("../src/system-settings/system-settings.service.ts", import.meta.url), "utf8");
  assert.match(settings, /const liveRelease = releases\.find\(\(item: any\) =>[\s\S]*?String\(item\.version\) === String\(current\.currentVersion\)/);
  assert.match(settings, /Number\(liveRelease\?\.versionCode \?\? 0\) === versionCode/);
  assert.doesNotMatch(settings, /if \(Number\(current\.versionCode\) === versionCode\)/);
});

test("APP version publishing rejects a verified APK whose version code is not newer than the live release", () => {
  const settings = readFileSync(new URL("../src/system-settings/system-settings.service.ts", import.meta.url), "utf8");
  assert.match(settings, /const publishedCode = Number\([\s\S]*?status === "PUBLISHED"[\s\S]*?current\.currentVersion/);
  assert.match(settings, /Number\(release\.versionCode\) <= publishedCode/);
  assert.match(settings, /不能发布低于或等于当前线上版本代码的 APK/);
});

test("APK upload validates ZIP directory and Android manifest before marking a release verified", () => {
  const controller = readFileSync(new URL("../src/system-settings/system-settings.controller.ts", import.meta.url), "utf8");
  assert.match(controller, /function isApkArchive\(buffer: Buffer\)/);
  assert.match(controller, /0x06054b50/);
  assert.match(controller, /0x02014b50/);
  assert.match(controller, /name === "AndroidManifest\.xml"/);
  assert.match(controller, /缺少 AndroidManifest\.xml/);
  assert.match(controller, /randomUUID\(\)/);
});


test("member dashboard returns pending task reward totals and lifetime credited earnings by currency", () => {
  const dashboard = readFileSync(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(dashboard, /status: \{ in: \["SUBMITTED", "UNDER_REVIEW"\] \}, claim: \{ userId \}/);
  assert.match(dashboard, /pendingRewardTotals\.set\(currency, \(pendingRewardTotals\.get\(currency\) \?\? 0n\) \+ task\.rewardMinor\)/);
  assert.match(dashboard, /entry\.direction === "CREDIT"/);
  assert.match(dashboard, /pendingRewards,/);
  assert.match(dashboard, /totalEarnings,/);
  assert.match(app, /dashboard\?\.optJSONArray\("pendingRewards"\)/);
  assert.match(app, /dashboard\?\.optJSONArray\("totalEarnings"\)/);
  assert.doesNotMatch(app, /"Pending rewards" else "待审核奖励", "—"/);
  assert.doesNotMatch(app, /"Total earnings" else "累计收益", "—"/);
});

test("member withdrawals and payout-account management do not require email verification", () => {
  const usersController = readFileSync(new URL("../src/users/users.controller.ts", import.meta.url), "utf8");
  const usersModule = readFileSync(new URL("../src/users/users.module.ts", import.meta.url), "utf8");
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  const payoutAccounts = readFileSync(new URL("../src/users/payout-accounts.service.ts", import.meta.url), "utf8");
  assert.doesNotMatch(usersController, /email-verification\/(send|verify)/);
  assert.doesNotMatch(usersModule, /EmailVerificationService/);
  assert.doesNotMatch(withdrawals, /requireVerified|EmailVerificationService/);
  assert.doesNotMatch(payoutAccounts, /requireVerified|EmailVerificationService/);
});

test("archived withdrawal rules cannot be re-enabled through toggle or edit APIs", () => {
  const settings = readFileSync(new URL("../src/system-settings/system-settings.service.ts", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../../admin/src/app/system-settings/page.tsx", import.meta.url), "utf8");
  assert.match(settings, /existingRule\?\.status === "ARCHIVED" && input\.status !== "ARCHIVED"/);
  assert.match(settings, /if \(rule\.status === "ARCHIVED"\) \{\s*throw new BadRequestException\("已归档的提现规则不能重新启用/);
  assert.match(adminPage, /disabled=\{r\.status==="ARCHIVED"\}/);
  assert.match(adminPage, /disabled=\{ruleForm\.status==="ARCHIVED"\}/);
});


test("withdrawal rule limits reject unsupported precision and non-finite values", () => {
  const settings = readFileSync(new URL("../src/system-settings/system-settings.service.ts", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../../admin/src/app/system-settings/page.tsx", import.meta.url), "utf8");
  assert.ok(settings.includes("Number.isFinite(value)"));
  assert.ok(settings.includes("Math.abs(value * 100 - Math.round(value * 100)) < 1e-7"));
  assert.equal((adminPage.match(/step="0.01"/g) ?? []).length, 3);
  assert.ok(!adminPage.includes('step="0.001"'));
});


test("daily withdrawal limit uses the member profile timezone instead of UTC midnight", () => {
  const service = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  const controller = readFileSync(new URL("../src/users/users.controller.ts", import.meta.url), "utf8");
  assert.ok(service.includes('import { startOfDay } from "./dashboard.service";'));
  assert.ok(service.includes('timezone = "UTC"'));
  assert.ok(service.includes("const dayStart = startOfDay(timezone)"));
  assert.ok(controller.includes('user.profile?.timezone ?? "UTC"'));
  assert.ok(!service.includes("dayStart.setUTCHours(0, 0, 0, 0)"));
});
