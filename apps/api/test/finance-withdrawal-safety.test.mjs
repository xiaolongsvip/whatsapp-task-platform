import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const service = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/finance-admin/finance-admin.controller.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../packages/database/prisma/migrations/20261108193000_unique_manual_payout_reference/migration.sql", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../../admin/src/app/finance/page.tsx", import.meta.url), "utf8");
const adminPermissionGuard = readFileSync(new URL("../src/permissions-admin/admin-permission.guard.ts", import.meta.url), "utf8");
const adminHttpAuditInterceptor = readFileSync(new URL("../src/system-settings/admin-http-audit.interceptor.ts", import.meta.url), "utf8");
const dashboardService = readFileSync(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");
const usersController = readFileSync(new URL("../src/users/users.controller.ts", import.meta.url), "utf8");
const androidAuthRepository = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt", import.meta.url), "utf8");
const androidApp = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");


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
  assert.match(settings, /const liveRelease = releases\.find\(\(item: any\) =>[\s\S]*?status === "PUBLISHED"[\s\S]*?current\.currentVersion/);
  assert.match(settings, /const liveVersionCode = Number\(liveRelease\?\.versionCode \?\? 0\)/);
  assert.match(settings, /Number\(release\.versionCode\) <= liveVersionCode/);
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


test("AI review retains automatic approval and automatic rejection with uncertain cases escalated", () => {
  const worker = readFileSync(new URL("../src/ai-config/ai-review.worker.ts", import.meta.url), "utf8");
  assert.match(worker, /parsed\.decision === "APPROVE"/);
  assert.match(worker, /parsed\.confidence >= config\.approveThreshold/);
  assert.match(worker, /parsed\.decision === "REJECT"/);
  assert.match(worker, /parsed\.confidence >= config\.rejectThreshold/);
  assert.match(worker, /await this\.approve\(job\.id, parsed\)/);
  assert.match(worker, /await this\.reject\(job\.id, parsed\)/);
  assert.match(worker, /status: "NEEDS_REVIEW"/);
  assert.match(worker, /status: "APPROVED"/);
  assert.match(worker, /status: "REJECTED"/);
});

test("Android member API paths have matching authenticated API controllers", () => {
  const repository = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../src/auth/auth.controller.ts", import.meta.url), "utf8");
  const users = readFileSync(new URL("../src/users/users.controller.ts", import.meta.url), "utf8");
  const tasks = readFileSync(new URL("../src/tasks/tasks.controller.ts", import.meta.url), "utf8");
  const updates = readFileSync(new URL("../src/system-settings/public-app-update.controller.ts", import.meta.url), "utf8");
  for (const route of ['"auth/login"', '"auth/register"', '"auth/refresh"', '"auth/logout"']) {
    assert.ok(repository.includes(route), "missing Android route: " + route);
  }
  for (const route of ['"users/dashboard"', '"users/promotion"', '"users/wallet-overview"', '"users/wallet-transactions?limit=$limit"', '"users/withdrawals"', '"users/payout-accounts"', '"users/me/password"']) {
    assert.ok(repository.includes(route), "missing Android route: " + route);
  }
  assert.match(repository, /append\("users\/commission-records\?limit=\$limit"\)/);
  assert.match(repository, /fun commissionRecords\(limit: Int = 100/);
  assert.match(repository, /append\("users\/team\?limit=\$limit"\)/);
  assert.match(repository, /fun teamMembers\(limit: Int = 300/);
  assert.match(auth, /@Post\("login"\)/);
  assert.match(users, /@Get\("dashboard"\)/);
  assert.match(users, /@Get\("wallet-overview"\)/);
  assert.match(users, /@Post\("withdrawals"\)/);
  assert.match(tasks, /@Post\(":taskId\/claims"\)/);
  assert.match(updates, /@Get\("update"\)/);
  assert.match(updates, /@Get\("support"\)/);
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


test("withdrawal rules reject overlapping enabled payout channels at save and re-enable time", () => {
  const settings = readFileSync(new URL("../src/system-settings/system-settings.service.ts", import.meta.url), "utf8");
  assert.match(settings, /x\.channels\.some\(channel => channels\.includes\(String\(channel\)\.trim\(\)\.toLowerCase\(\)\)\)/);
  assert.match(settings, /相同国家和出款币种的收款渠道已被其他启用规则占用/);
  assert.match(settings, /ruleChannels\.includes\(String\(channel\)\.trim\(\)\.toLowerCase\(\)\)/);
});

test("withdrawal rule limits reject unsupported precision and non-finite values", () => {
  const settings = readFileSync(new URL("../src/system-settings/system-settings.service.ts", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../../admin/src/app/system-settings/page.tsx", import.meta.url), "utf8");
  assert.ok(settings.includes("Number.isFinite(value)"));
  assert.ok(settings.includes("const scale = 10 ** currencyDigits(walletCurrency)"));
  assert.ok(settings.includes("Math.abs(value * scale - Math.round(value * scale)) < 1e-7"));
  assert.equal((adminPage.match(/step="any"/g) ?? []).length, 4);
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

test("APP withdrawal hint does not claim there is no minimum when backend rules enforce limits", () => {
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  assert.match(app, /提现限额以平台当前规则为准/);
  assert.doesNotMatch(app, /不设置最低提现金额/);
  assert.match(withdrawals, /minimumMinor = configuredMinor\(context\.rule\.minimumAmount, context\.walletCurrency\)/);
});

test("member payout accounts resolve the legacy APP provider placeholder to one enabled configured provider", () => {
  const accounts = readFileSync(new URL("../src/users/payout-accounts.service.ts", import.meta.url), "utf8");
  assert.match(accounts, /providerCode === "manual-pk"/);
  assert.match(accounts, /paymentProviderConfig\.findMany/);
  assert.match(accounts, /matches\.length !== 1/);
  assert.match(accounts, /providerCode: resolvedProviderCode/);
  assert.match(accounts, /supportedCurrencies: \{ has: currency \}/);
});

test("withdrawal creation validates provider configuration and matches rule channels to payout method", () => {
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  assert.match(withdrawals, /channels\.some\(channel => String\(channel\)\.trim\(\)\.toUpperCase\(\) === methodCode\)/);
  assert.match(withdrawals, /paymentProviderConfig\.findMany/);
  assert.match(withdrawals, /tx\.paymentProviderConfig\.findFirst/);
  assert.match(withdrawals, /provider\.enabled/);
  assert.match(withdrawals, /provider\.supportedCurrencies\.some\(value => value\.trim\(\)\.toUpperCase\(\) === context\.payoutCurrency\)/);
  assert.match(withdrawals, /provider\.supportedChannels\.some/);
  assert.doesNotMatch(withdrawals, /channels\.includes\(account\.providerCode/);
});

test("legacy manual-pk accounts are resolved transactionally before a withdrawal is created", () => {
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  assert.match(withdrawals, /providerCode === "MANUAL-PK"/);
  assert.match(withdrawals, /legacy payout account cannot be matched to exactly one enabled provider/);
  assert.match(withdrawals, /tx\.payoutAccount\.update\(\{ where: \{ id: account\.id \}, data: \{ providerCode: context\.providerCode \} \}\)/);
});

test("live exchange rates are fetched server-side, cached, and never silently replaced by an expired rate", () => {
  const rates = readFileSync(new URL("../src/users/exchange-rates.service.ts", import.meta.url), "utf8");
  assert.match(rates, /https:\/\/api\.exchangerate\.dev\/v1\/latest\/USD/);
  assert.match(rates, /REFRESH_INTERVAL_MS = process\.env\.EXCHANGERATE_DEV_RATE_MODE/);
  assert.match(rates, /MAX_CACHE_AGE_MS = 30 \* 60 \* 1000/);
  assert.match(rates, /不会使用过期汇率创建跨币种提现/);
  assert.match(rates, /EXCHANGERATE_DEV_API_KEY/);
  assert.match(rates, /EXCHANGERATE_DEV_RATE_MODE/);
  assert.match(rates, /providerUpdatedAt/);
  assert.match(rates, /toPayoutMinor/);
});

test("payout providers accept catalog-configured countries and currencies instead of a fixed country allowlist", () => {
  const finance = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
  assert.match(finance, /private async validateProviderInput/);
  assert.match(finance, /\^\(GLOBAL\|\[A-Z\]\{2\}\)\$/);
  assert.doesNotMatch(finance, /GLOBAL\|PK\|NG\|BD/);
  assert.match(finance, /system\.payoutCatalogs/);
  assert.match(finance, /服务商引用的国家未配置或已停用/);
  assert.match(finance, /服务商引用了未配置或已停用的出款币种/);
  assert.match(finance, /await this\.validateProviderInput/);
});

test("finance provider editor loads country and channel choices from payout catalogs and respects currency precision", () => {
  const admin = readFileSync(new URL("../../admin/src/app/finance/page.tsx", import.meta.url), "utf8");
  const finance = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
  assert.match(admin, /admin\/system-settings\/payout-catalogs/);
  assert.match(admin, /providerCatalogs\.countries/);
  assert.match(admin, /providerCatalogs\.methods/);
  assert.match(admin, /currencyDigits\(limitCurrency\)/);
  assert.match(finance, /!\/\^\\d\+\$\/\.test\(minimumRaw\)/);
});

test("APP payout options are derived from enabled admin withdrawal rules and payment providers", () => {
  const accounts = readFileSync(new URL("../src/users/payout-accounts.service.ts", import.meta.url), "utf8");
  const usersController = readFileSync(new URL("../src/users/users.controller.ts", import.meta.url), "utf8");
  assert.match(accounts, /async options\(\)/);
  assert.match(accounts, /system\.withdrawalRules/);
  assert.match(accounts, /where: \{ enabled: true \}/);
  assert.match(accounts, /supportedCurrencies/);
  assert.match(accounts, /supportedChannels/);
  assert.match(usersController, /@Get\("payout-options"\)/);
});

test("withdrawal amount is reserved in wallet currency and converted payout amount and FX snapshot are stored", () => {
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  assert.match(withdrawals, /walletCurrency: context\.walletCurrency/);
  assert.match(withdrawals, /payoutCurrency: context\.payoutCurrency, payoutAmountMinor/);
  assert.match(withdrawals, /exchangeRate: rate\.rate\.toFixed\(12\)/);
  assert.match(withdrawals, /exchangeRateSource: rate\.source/);
  assert.match(withdrawals, /feeAmountMinor: 0n/);
});

test("manual payout records actual paid amount in payout currency while wallet ledger debit stays in wallet currency", () => {
  assert.match(service, /amountMinor: actualPayoutAmountMinor,\s*currency: payoutCurrency/);
  assert.match(service, /direction: "DEBIT", amountMinor: withdrawal\.amountMinor, currency: withdrawal\.currency/);
  assert.match(service, /withdrawal\.payoutProviderCode \?\? payoutAccount\.providerCode/);
});

test("APP payout account form no longer hardcodes Pakistan or JazzCash and reads configured options", () => {
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  const repo = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt", import.meta.url), "utf8");
  const start = app.indexOf("private fun AddPayoutAccountScreen");
  const end = app.indexOf("@Composable\nprivate fun WalletMiniMetric", start);
  const screen = app.slice(start, end);
  assert.match(screen, /AuthRepository\.payoutOptions\(\)/);
  assert.match(screen, /option\.optString\("providerCode"\)/);
  assert.doesNotMatch(screen, /Pakistan|JazzCash|EasyPaisa|manual-pk/);
  assert.match(repo, /fun payoutOptions\(\)/);
  assert.match(repo, /fun withdrawalQuote\(/);
});

test("withdrawal requests persist the exact exchange-rate observation timestamp", () => {
  const schema = readFileSync(new URL("../../../packages/database/prisma/schema.prisma", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../../packages/database/prisma/migrations/20261109143000_add_exchange_rate_fetched_at/migration.sql", import.meta.url), "utf8");
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  assert.match(schema, /exchangeRateFetchedAt DateTime\?\s+@map\("exchange_rate_fetched_at"\)/);
  assert.match(migration, /ADD COLUMN "exchange_rate_fetched_at" TIMESTAMP\(3\)/);
  assert.match(schema, /exchangeRateProviderUpdatedAt DateTime\?\s+@map\("exchange_rate_provider_updated_at"\)/);
  assert.match(migration, /ADD COLUMN "exchange_rate_provider_updated_at" TIMESTAMP\(3\)/);
  assert.match(schema, /exchangeRateEffectiveAt DateTime\?\s+@map\("exchange_rate_effective_at"\)/);
  assert.match(migration, /ADD COLUMN "exchange_rate_effective_at" TIMESTAMP\(3\)/);
  assert.match(withdrawals, /exchangeRateFetchedAt: new Date\(rate\.fetchedAt\)/);
  assert.match(withdrawals, /exchangeRateProviderUpdatedAt: rate\.providerUpdatedAt \? new Date/);
  assert.match(withdrawals, /exchangeRateEffectiveAt: rate\.effectiveAt \? new Date/);
});

test("admin withdrawal configuration accepts arbitrary country, wallet currency, payout currency and method codes", () => {
  const settings = readFileSync(new URL("../src/system-settings/system-settings.service.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../admin/src/app/system-settings/page.tsx", import.meta.url), "utf8");
  assert.match(settings, /walletCurrency = String\(input\.walletCurrency/);
  assert.match(settings, /payoutCurrency = String\(input\.payoutCurrency/);
  assert.match(settings, /method = String\(input\.method/);
  assert.match(page, /提现方式代码 \*/);
  assert.match(page, /ruleForm\.payoutCurrency/);
  assert.match(page, /ruleForm\.channels/);
  assert.doesNotMatch(page, /<option>USDT<\/option>/);
});

test("APP withdrawal history shows both wallet debit and frozen payout amount", () => {
  const dashboard = readFileSync(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(dashboard, /payoutAmountMinor: \(row\.payoutAmountMinor \?\? row\.amountMinor\)\.toString\(\)/);
  assert.match(dashboard, /exchangeRateFetchedAt/);
  assert.match(app, /预计到账：/);
  assert.match(app, /钱包扣款：/);
});

test("admin payout settlement uses the frozen payout amount and currency", () => {
  assert.match(service, /receiveAmountMinor: \(x\.payoutAmountMinor \?\? x\.amountMinor\)\.toString\(\)/);
  assert.match(service, /currency: payoutCurrency/);
  assert.match(adminPage, /money\(x\.receiveAmountMinor\|\|x\.amountMinor,x\.payoutCurrency\|\|x\.currency\)/);
});

test("cross-currency manual settlement requires the actual paid amount instead of treating indicative FX as settlement", () => {
  const service = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
  const controller = readFileSync(new URL("../src/finance-admin/finance-admin.controller.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../admin/src/app/finance/page.tsx", import.meta.url), "utf8");
  assert.match(service, /input\.payoutAmountMinor/);
  assert.match(service, /跨币种提现必须填写实际出款金额/);
  assert.match(service, /estimatedPayoutAmountMinor/);
  assert.match(service, /actualPayoutAmountMinor/);
  assert.match(controller, /payoutAmountMinor\?: string/);
  assert.match(page, /实际出款金额/);
  assert.match(page, /payoutAmountMinor:actualPayoutAmountMinor/);
});

test("APP withdrawal history prefers actual settled amount after payment", () => {
  const dashboard = readFileSync(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(dashboard, /actualPayoutAmountMinor: row\.paymentTransactions\[0\]/);
  assert.match(app, /hasActualPayout/);
  assert.match(app, /实际到账：/);
});

test("Android withdrawal estimate uses the server-calculated payout amount for the exact requested wallet amount", () => {
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(app, /AuthRepository\.withdrawalQuote\(selectedId, minor\)/);
  assert.match(app, /optString\("payoutAmountMinor"\)/);
  assert.match(app, /quote\?\.optString\("amountMinor"\) != requestedMinor\.toString\(\)/);
  assert.doesNotMatch(app, /multiply\(java\.math\.BigDecimal\(quote!!\.optString\("rate"\)\)\)/);
});

test("live FX mode requires a provider API key and the example environment selects live mode", () => {
  const fx = readFileSync(new URL("../src/users/exchange-rates.service.ts", import.meta.url), "utf8");
  const env = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");
  assert.match(fx, /liveMode && !apiKey/);
  assert.match(fx, /Live exchange-rate mode requires EXCHANGERATE_DEV_API_KEY/);
  assert.match(env, /EXCHANGERATE_DEV_RATE_MODE=live/);
});

test("manual FX overrides are admin-managed, audited, expire safely, and take precedence over API rates", () => {
  const rates = readFileSync(new URL("../src/users/exchange-rates.service.ts", import.meta.url), "utf8");
  const controller = readFileSync(new URL("../src/system-settings/system-settings.controller.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../admin/src/app/system-settings/page.tsx", import.meta.url), "utf8");
  assert.match(rates, /system\.exchangeRates\.manual/);
  assert.match(rates, /MANUAL_EXCHANGE_RATE_UPDATED/);
  assert.match(rates, /MANUAL_EXCHANGE_RATE_DISABLED/);
  assert.match(rates, /管理员设置的手动汇率已过期/);
  assert.match(rates, /source: "MANUAL_ADMIN"/);
  assert.match(controller, /@Get\("exchange-rates\/manual"\)/);
  assert.match(controller, /@Put\("exchange-rates\/manual"\)/);
  assert.match(controller, /@Post\("exchange-rates\/manual\/disable"\)/);
  assert.match(page, /保存并启用手动汇率/);
  assert.match(page, /停用/);
  assert.match(page, /有效截止时间/);
});

test("admin-managed payout catalogs validate and expose countries, currencies and methods to APP options", () => {
  const settings = readFileSync(new URL("../src/system-settings/system-settings.service.ts", import.meta.url), "utf8");
  const settingsController = readFileSync(new URL("../src/system-settings/system-settings.controller.ts", import.meta.url), "utf8");
  const accounts = readFileSync(new URL("../src/users/payout-accounts.service.ts", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../../admin/src/app/system-settings/page.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(settings, /async getPayoutCatalogs\(\)/);
  assert.match(settings, /async savePayoutCatalogs\(/);
  assert.match(settings, /PAYOUT_CATALOGS_UPDATED/);
  assert.match(settingsController, /@Get\("payout-catalogs"\)/);
  assert.match(settingsController, /@Put\("payout-catalogs"\)/);
  assert.match(accounts, /system\.payoutCatalogs/);
  assert.match(accounts, /configuredMethod\?\.name/);
  assert.match(accounts, /configuredCurrency\?\.name/);
  assert.match(accounts, /configuredCountry/);
  assert.match(admin, /国家、货币与收款方式目录/);
  assert.match(admin, /保存目录配置/);
  assert.match(app, /AuthRepository\.payoutOptions\(\)/);
  assert.match(app, /options = response\.optJSONArray\("items"\)/);
});

test("payout catalog availability is enforced at account creation and again during withdrawal", () => {
  const accounts = readFileSync(new URL("../src/users/payout-accounts.service.ts", import.meta.url), "utf8");
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../src/system-settings/system-settings.service.ts", import.meta.url), "utf8");
  assert.match(accounts, /This payout country is not currently available/);
  assert.match(accounts, /This payout method is not currently available/);
  assert.match(withdrawals, /This payout country is no longer available/);
  assert.match(withdrawals, /payout country, currency or method configuration changed/);
  assert.match(settings, /提现规则引用的钱包币种或出款币种未配置或已停用/);
  assert.match(settings, /提现规则包含未启用或不适用于该国家、币种的收款方式/);
});

test("provider codes are resolved case-insensitively and the persisted canonical provider code is reused", () => {
  const accounts = readFileSync(new URL("../src/users/payout-accounts.service.ts", import.meta.url), "utf8");
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  assert.match(accounts, /providerCode: \{ equals: resolvedProviderCode, mode: "insensitive" \}/);
  assert.match(accounts, /resolvedProviderCode = provider.providerCode/);
  assert.match(withdrawals, /providerCode: \{ equals: context.providerCode, mode: "insensitive" \}/);
  assert.match(withdrawals, /provider.providerCode.trim\(\).toUpperCase\(\) === providerCode.trim\(\).toUpperCase\(\)/);
});
test("admin payout catalog editor splits entries on real newline characters", () => {
  const admin = readFileSync(new URL("../../admin/src/app/system-settings/page.tsx", import.meta.url), "utf8");
  assert.match(admin, /value\.split\("\\n"\)/);
  assert.doesNotMatch(admin, /value\.split\("\\\\n"\)/);
});

test("withdrawal quote and create reject malformed or out-of-range minor-unit amounts", () => {
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  assert.match(withdrawals, /if \(!\/\^\[0-9\]\+\$\/\.test\(amountMinorInput\)\) throw new BadRequestException\("Withdrawal amount is invalid\."\)/);
  assert.match(withdrawals, /amountMinor > 9223372036854775807n/);
  assert.match(withdrawals, /The wallet currency for this withdrawal rule is no longer available/);
  assert.match(withdrawals, /currentWalletCurrency\.enabled === false/);
});

test("withdrawal records freeze wallet debit, payout conversion and FX provenance", () => {
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  const finance = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
  assert.match(withdrawals, /amountMinor, currency: context\.walletCurrency/);
  assert.match(withdrawals, /payoutCurrency: context\.payoutCurrency, payoutAmountMinor/);
  assert.match(withdrawals, /exchangeRateSource: rate\.source/);
  assert.match(withdrawals, /exchangeRateProviderUpdatedAt/);
  assert.match(withdrawals, /exchangeRateEffectiveAt/);
  assert.match(finance, /actualPayoutAmountMinor/);
  assert.match(finance, /estimatedPayoutAmountMinor/);
  assert.match(finance, /idempotencyKey: "withdrawal-payout:" \+ id/);
});

test("manual payout requires an audited note when actual payout differs from the frozen estimate", () => {
  const finance = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
  assert.match(finance, /actualPayoutAmountMinor !== estimatedPayoutAmountMinor && !note/);
  assert.match(finance, /实际出款金额与提现报价不一致，必须填写差异说明/);
  assert.match(finance, /actualPayoutAmountMinor: actualPayoutAmountMinor\.toString\(\)/);
});

test("finance reconciliation validates ledger direction, amount, currency and duplicate settlement rows", () => {
  const finance = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
  assert.match(finance, /TASK_REWARD_AMOUNT_MISMATCH/);
  assert.match(finance, /WITHDRAWAL_LEDGER_AMOUNT_MISMATCH/);
  assert.match(finance, /WITHDRAWAL_PAYOUT_AMOUNT_MISMATCH/);
  assert.match(finance, /TASK_REWARD_DUPLICATE/);
  assert.match(finance, /WITHDRAWAL_LEDGER_DUPLICATE/);
  assert.match(finance, /WITHDRAWAL_TRANSACTION_DUPLICATE/);
  assert.match(finance, /amountDirectionCurrencyChecks: true/);
});

test("reconciliation does not report success when scan limit is reached and checks payment metadata", () => {
  const finance = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../../admin/src/app/finance/page.tsx", import.meta.url), "utf8");
  assert.match(finance, /const batchSize = 1000/);
  assert.match(finance, /fetchAll = async/);
  assert.match(finance, /skip, take/);
  assert.match(finance, /scanLimitReached = false/);
  assert.doesNotMatch(finance, /take: 5000/);
  assert.match(finance, /metadataActualAmount !== transaction\.amountMinor\.toString\(\)/);
  assert.match(admin, /x\.status==="INCOMPLETE"\?"扫描不完整"/);
  assert.match(admin, /reconciliationDetail\.status==="INCOMPLETE"\?"扫描不完整"/);
});


test("withdrawal submission requires the displayed FX quote and rejects changed rate observations", () => {
  const dto = readFileSync(new URL("../src/users/create-withdrawal.dto.ts", import.meta.url), "utf8");
  const controller = readFileSync(new URL("../src/users/users.controller.ts", import.meta.url), "utf8");
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  const repo = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(dto, /expectedRate!/);
  assert.match(dto, /expectedRateSource!/);
  assert.match(dto, /expectedRateFetchedAt!/);
  assert.match(dto, /expectedQuoteAmountMinor!/);
  assert.match(dto, /expectedWalletCurrency!/);
  assert.match(dto, /expectedPayoutCurrency!/);
  assert.match(dto, /expectedPayoutAmountMinor!/);
  assert.ok(dto.includes("A-Za-z0-9_.\\/-"));
  assert.match(controller, /fetchedAt: body\.expectedRateFetchedAt/);
  assert.match(withdrawals, /WITHDRAWAL_QUOTE_CHANGED/);
  assert.ok(withdrawals.includes("!sameRate || !sameSource || !sameObservation || !sameAmount || !sameCurrencies"));
  assert.match(withdrawals, /rate\.source === "IDENTITY"/);
  assert.match(repo, /expectedRateFetchedAt/);
  assert.match(repo, /expectedQuoteAmountMinor/);
  assert.match(repo, /expectedPayoutAmountMinor/);
  assert.match(app, /estimatedPayout != null/);
  assert.match(app, /withdrawalQuote\(id, minor\)/);
  assert.match(app, /payout estimate no longer matches/);
  assert.match(app, /AuthRepository\.createWithdrawal\(id, minor, quote/);
});

test("manual wallet adjustments convert amounts using ISO currency fraction digits", () => {
  assert.match(service, /function majorToMinor/);
  assert.match(service, /maximumFractionDigits/);
  assert.ok(service.includes("10n ** BigInt(digits)"));
  assert.ok(service.includes("最多保留 ${digits} 位小数"));
});

test("task settlements paginate from a database anti-join without truncating at 5000 approved submissions", () => {
  const start = service.indexOf("async taskSettlements(");
  const end = service.indexOf("async pendingPayouts(", start);
  const implementation = service.slice(start, end);
  assert.ok(implementation.includes("NOT EXISTS"));
  assert.ok(implementation.includes("ledger_entries le"));
  assert.ok(implementation.includes("le.source_type = 'TASK_REWARD'"));
  assert.ok(implementation.includes("COUNT(*)::bigint AS total"));
  assert.ok(implementation.includes("LIMIT ${pg.take}"));
  assert.ok(implementation.includes("OFFSET ${pg.skip}"));
  assert.ok(!implementation.includes("take: 5000"));
});


test("finance reconciliation compares successful payout amount with the withdrawal snapshot", () => {
  assert.match(service, /transaction\.amountMinor !== expectedAmount/);
  assert.match(service, /WITHDRAWAL_PAYOUT_AMOUNT_MISMATCH/);
});

test("finance reconciliation reports successful payout transactions without a linked withdrawal", () => {
  assert.match(service, /PAYOUT_WITHDRAWAL_LINK_MISSING/);
  assert.match(service, /存在成功代付交易，但没有关联提现申请/);
});


test("risk events retain the risk-only scope while applying keyword, status and level filters before pagination", () => {
  const admin = readFileSync(new URL("../src/ai-config/ai-review-admin.service.ts", import.meta.url), "utf8");
  const method = admin.slice(admin.indexOf("async listRiskEvents("), admin.indexOf("async listRiskUsers("));
  assert.match(method, /target_type = 'RISK_EVENT' OR LEFT\(action, 5\) = 'RISK_'/);
  assert.match(method, /target_type <> 'RISK_RULE'/);
  assert.match(method, /metadata->>'status'/);
  assert.match(method, /metadata->>'riskType'/);
  assert.match(method, /metadata->>'riskLevel'/);
  assert.match(method, /LIMIT \$\{pageSize\} OFFSET \$\{skip\}/);
  assert.doesNotMatch(method, /where\.OR =/);
});


test("risk records admin UI paginates event and user lists and opens event details", () => {
  const page = readFileSync(new URL("../../admin/src/app/ai-reviews/RiskRecords.tsx", import.meta.url), "utf8");
  assert.match(page, /page:String\(eventPage\),pageSize:"20"/);
  assert.match(page, /page:String\(userPage\),pageSize:"20"/);
  assert.match(page, /setEventTotal\(Number\(b\.total\|\|0\)\)/);
  assert.match(page, /setUserTotal\(Number\(b\.total\|\|0\)\)/);
  assert.match(page, /onClick=\{\(\)=>setDetailEvent\(x\)\}/);
  assert.match(page, /上一页/);
  assert.match(page, /下一页/);
});


test("withdrawal options, quotes and submissions never fall back to an implicit Pakistan payout rule", () => {
  const accounts = readFileSync(new URL("../src/users/payout-accounts.service.ts", import.meta.url), "utf8");
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  assert.match(accounts, /const rules = Array\.isArray\(rulesRow\?\.value\) \? rulesRow\.value as Array<Record<string, unknown>> : \[\];/);
  assert.equal((withdrawals.match(/const rules = Array\.isArray\(rulesRow\?\.value\) \? rulesRow\.value as Array<Record<string, unknown>> : \[\];/g) || []).length, 2);
  assert.doesNotMatch(accounts + withdrawals, /default-pk-usd-local|channels: \["jazzcash", "easypaisa"\]/);
  assert.match(withdrawals, /No active withdrawal rule is configured for this payout account/);
});


test("manual payout atomically claims the withdrawal state before writing success ledger entries", () => {
  const start = service.indexOf("async recordManualPayout(");
  const end = service.indexOf("\n  async ", start + 10);
  const method = service.slice(start, end > 0 ? end : undefined);
  const paidStart = method.indexOf('if (outcome === "PAID")');
  const claimIndex = method.indexOf("const claimed = await tx.withdrawalRequest.updateMany", paidStart);
  const transactionIndex = method.indexOf("const transaction = await tx.paymentTransaction.create", paidStart);
  assert.ok(claimIndex >= 0, "successful payout must claim PAID state");
  assert.ok(transactionIndex > claimIndex, "payout transaction must be created after state claim");
  assert.match(method.slice(claimIndex, transactionIndex), /status: "PAID"/);
  assert.match(method.slice(claimIndex, transactionIndex), /claimed.count !== 1/);
});

test("manual payout failure uses a stable idempotency key and claims FAILED state before inserting the failed transaction", () => {
  const start = service.indexOf("async recordManualPayout(");
  const end = service.indexOf("\n  async ", start + 10);
  const method = service.slice(start, end > 0 ? end : undefined);
  const failStart = method.indexOf('const changed = await tx.withdrawalRequest.updateMany', method.indexOf('if (outcome === "PAID")') + 1);
  const createIndex = method.indexOf("const transaction = await tx.paymentTransaction.create", failStart);
  assert.ok(failStart >= 0, "failure branch must claim FAILED state");
  assert.ok(createIndex > failStart, "failed transaction must be created after state claim");
  assert.match(method.slice(failStart, createIndex), /status: "FAILED"/);
  assert.match(method.slice(createIndex), /manual-payout-failed:" \+ id/);
  assert.doesNotMatch(method.slice(createIndex), /Date\.now\(\)/);
});


test("payment provider references are protected by a database unique constraint and a fail-safe migration", () => {
  const schema = readFileSync(new URL("../../../packages/database/prisma/schema.prisma", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../../packages/database/prisma/migrations/20261110014000_add_unique_payment_provider_reference/migration.sql", import.meta.url), "utf8");
  assert.match(schema, /@@unique\(\[providerCode, providerReference, flow\]\)/);
  assert.match(migration, /GROUP BY provider_code, provider_reference, flow/);
  assert.match(migration, /HAVING COUNT\(\*\) > 1/);
  assert.match(migration, /RAISE EXCEPTION/);
  assert.match(migration, /CREATE UNIQUE INDEX/);
});

test("manual payout maps provider-reference uniqueness conflicts to a clear duplicate-reference response", () => {
  const finance = readFileSync(new URL("../src/finance-admin/finance-admin.service.ts", import.meta.url), "utf8");
  assert.match(finance, /target\.includes\("provider_reference"\)/);
  assert.match(finance, /该服务商付款凭证已被使用，不能重复登记/);
});


test("member withdrawal history exposes the admin rejection note only for the member's own withdrawal records", () => {
  const dashboard = readFileSync(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(dashboard, /targetType: "WITHDRAWAL_REQUEST"/);
  assert.match(dashboard, /targetId: \{ in: pageRows\.map\(\(row\) => row\.id\) \}/);
  assert.match(dashboard, /action: "WITHDRAWAL_REJECTED"/);
  assert.match(dashboard, /metadata\.note/);
  assert.match(dashboard, /rejectionReason: row\.status === "REJECTED" \? rejectionReasons\.get\(row\.id\) \?\? null : null/);
  assert.match(app, /item\.optString\("rejectionReason"\)/);
  assert.match(app, /拒绝原因：/);
});


test("approved withdrawals can enter processing exactly once with an audited transition and pay permission", () => {
  assert.match(service, /async startWithdrawalProcessing\(id: string, adminId: string\)/);
  assert.match(service, /where: \{ id, status: "APPROVED" \}[\s\S]*?status: "PROCESSING"/);
  assert.match(service, /WITHDRAWAL_PAYOUT_PROCESSING_STARTED/);
  assert.match(service, /balanceReservationRetained: true/);
  assert.match(controller, /@Post\("withdrawals\/:id\/processing"\)/);
  assert.match(controller, /startWithdrawalProcessing\(id, admin\.id\)/);
  const guard = readFileSync(new URL("../src/permissions-admin/admin-permission.guard.ts", import.meta.url), "utf8");
  assert.match(guard, /path\.endsWith\("\/processing"\)\) return "finance\.withdrawals\.pay"/);
  assert.match(adminPage, /startPayoutProcessing/);
  assert.match(adminPage, /开始付款处理/);
});


test("wallet transaction history supports stable cursor pagination end to end", () => {
  assert.match(dashboardService, /getWalletTransactions\(userId: string, limit = 100, beforeCreatedAt\?: string, beforeId\?: string\)/);
  assert.match(dashboardService, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  assert.match(dashboardService, /nextCursor: hasMore && last \? \{ createdAt: last.createdAt, id: last.id \} : null/);
  assert.match(usersController, /@Query\("beforeCreatedAt"\)/);
  assert.match(usersController, /@Query\("beforeId"\)/);
  assert.match(androidAuthRepository, /walletTransactions\(limit: Int = 100, beforeCreatedAt: String\? = null, beforeId: String\? = null\)/);
  assert.match(androidApp, /fun loadMore\(\)/);
  assert.match(androidApp, /AuthRepository\.walletTransactions\(100, beforeCreatedAt, beforeId\)/);
  assert.match(androidApp, /"Load more"/);
  assert.doesNotMatch(androidApp, /Showing the latest records/);
});


test("TRC20 payout accounts require a checksummed TRON mainnet address and use a dedicated APP address field", () => {
  const payoutAccounts = readFileSync(new URL("../src/users/payout-accounts.service.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(payoutAccounts, /TRON_BASE58_ALPHABET/);
  assert.match(payoutAccounts, /decoded\[0\] !== 0x41/);
  assert.match(payoutAccounts, /createHash\("sha256"\)/);
  assert.match(payoutAccounts, /isTrc20Method && !isValidTronAddress\(accountNumber\)/);
  assert.match(payoutAccounts, /Invalid TRON mainnet address for the TRC20 network/);
  assert.match(app, /val isTrc20 = methodCode\.contains\("TRC20", ignoreCase = true\)/);
  assert.match(app, /TRON 钱包地址（TRC20）/);
  assert.match(app, /if \(isTrc20\) "TRC20 wallet" else holder/);
  assert.match(adminPage, /TRC20 钱包地址无需填写姓名/);
  assert.match(adminPage, /不能填写 ERC20 或 BEP20 地址/);

  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const validTronAddress = (value) => {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return false;
    let number = 0n;
    for (const character of value) {
      const digit = alphabet.indexOf(character);
      if (digit < 0) return false;
      number = number * 58n + BigInt(digit);
    }
    let hex = number.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    const decoded = Buffer.from(hex, "hex");
    if (decoded.length !== 25 || decoded[0] !== 0x41) return false;
    const first = createHash("sha256").update(decoded.subarray(0, 21)).digest();
    return createHash("sha256").update(first).digest().subarray(0, 4).equals(decoded.subarray(21));
  };
  assert.equal(validTronAddress("TJRabPrwbZy45sbavfcjinPJC18kjpRTv8"), true);
  assert.equal(validTronAddress("TJRabPrwbZy45sbavfcjinPJC18kjpRTv9"), false);
  assert.equal(validTronAddress("0JRabPrwbZy45sbavfcjinPJC18kjpRTv8"), false);
});


test("full payout account details require payout permission and every reveal is audited", () => {
  assert.match(controller, /@Get\("payout-accounts\/:id\/sensitive-details"\)/);
  assert.match(controller, /payoutAccountSensitiveDetails\(id, admin\.id\)/);
  assert.match(controller, /Cache-Control", "no-store, private"/);
  assert.match(adminPermissionGuard, /sensitive-details/);
  assert.match(adminPermissionGuard, /finance\.withdrawals\.pay/);
  assert.match(adminHttpAuditInterceptor, /account\.\?number/);
  assert.match(adminHttpAuditInterceptor, /wallet\.\?address/);
  assert.match(adminHttpAuditInterceptor, /iban/);
  assert.match(adminHttpAuditInterceptor, /phone\|mobile\|telephone/);
  assert.match(service, /async payoutAccountSensitiveDetails\(id: string, adminId: string\)/);
  assert.match(service, /accountNumber: typeof parsed\.accountNumber === "string"/);
  assert.match(service, /PAYOUT_ACCOUNT_SENSITIVE_DETAILS_VIEWED/);
  assert.match(service, /无法解密收款账号/);
  assert.match(adminPage, /查看完整收款账号（需打款权限）/);
  assert.match(adminPage, /sensitiveAccountDetails\?\.accountNumber/);
});


test("member withdrawal history uses stable cursor pagination end to end", () => {
  const dashboard = readFileSync(new URL("../src/users/dashboard.service.ts", import.meta.url), "utf8");
  const controller = readFileSync(new URL("../src/users/users.controller.ts", import.meta.url), "utf8");
  const repo = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt", import.meta.url), "utf8");
  assert.match(dashboard, /getWithdrawalHistory\(userId: string, limit = 50, beforeCreatedAt\?: string, beforeId\?: string\)/);
  assert.match(dashboard, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  assert.match(dashboard, /nextCursor: hasMore && pageRows\.length/);
  assert.match(controller, /@Query\("beforeCreatedAt"\)/);
  assert.match(controller, /@Query\("beforeId"\)/);
  assert.match(repo, /withdrawalHistory\(limit: Int = 50, beforeCreatedAt: String\? = null, beforeId: String\? = null\)/);
  assert.match(app, /AuthRepository\.withdrawalHistory\(/);
  assert.match(app, /loadPage\(false\)/);
  assert.match(app, /"Load more"/);
  assert.match(app, /error != null && items == null/);
  assert.match(app, /"Retry loading"/);
});


test("admin withdrawal review and processing transitions refresh their detail and audit history", () => {
  const reviewStart = adminPage.indexOf("async function reviewWithdrawal(");
  const processingStart = adminPage.indexOf("async function startPayoutProcessing(", reviewStart);
  const payoutStart = adminPage.indexOf("async function recordPayout(", processingStart);
  assert.ok(reviewStart >= 0 && processingStart > reviewStart && payoutStart > processingStart);
  const reviewHandler = adminPage.slice(reviewStart, processingStart);
  const processingHandler = adminPage.slice(processingStart, payoutStart);
  assert.match(reviewHandler, /setWithdrawalDetail\(await get<Row>\("\/api\/v1\/admin\/finance\/withdrawals\/"\+encodeURIComponent\(withdrawalDetail\.id\)\)\)/);
  assert.match(processingHandler, /setWithdrawalDetail\(await get<Row>\("\/api\/v1\/admin\/finance\/withdrawals\/"\+encodeURIComponent\(withdrawalDetail\.id\)\)\)/);
  assert.match(reviewHandler, /审核操作已成功，但详情历史刷新失败/);
  assert.match(processingHandler, /已开始付款处理，但详情历史刷新失败/);
});


test("standard payout-account details mask account phone numbers and audited reveal is required for full values", () => {
  const detailStart = service.indexOf("async payoutAccountDetail(");
  const sensitiveStart = service.indexOf("async payoutAccountSensitiveDetails(", detailStart);
  assert.ok(detailStart >= 0 && sensitiveStart > detailStart);
  const standardDetail = service.slice(detailStart, sensitiveStart);
  assert.match(standardDetail, /maskedPhoneNumber/);
  assert.doesNotMatch(standardDetail, /phoneNumber: details\.phoneNumber/);
  assert.match(adminPage, /payoutAccountSensitiveDetails\?\.accountNumber/);
  assert.match(adminPage, /payoutAccountSensitiveDetails\?\.phoneNumber/);
  assert.match(adminPage, /maskedPhoneNumber/);
  assert.match(adminPage, /revealPayoutAccountDetails/);
  assert.match(adminPage, /查看完整收款信息（需打款权限）/);
});


test("FX conversion rejects rates and converted amounts that round to zero while preserving valid currency precision", () => {
  const rates = readFileSync(new URL("../src/users/exchange-rates.service.ts", import.meta.url), "utf8");
  const start = rates.indexOf("toPayoutMinor(");
  const method = rates.slice(start, rates.indexOf("\n  }", start) + 4);
  assert.match(method, /!Number\.isFinite\(rate\) \|\| rate <= 0/);
  assert.match(method, /rateText = rate\.toFixed\(12\)/);
  assert.match(method, /\/\^\\d\+\\\.\\d\{12\}\$\//);
  assert.match(method, /scaledRate <= 0n/);
  assert.match(method, /payoutMinor <= 0n/);
  assert.match(method, /below one minor currency unit/);

  const convert = (amountMinor, fromDigits, toDigits, rate) => {
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("invalid rate");
    const rateText = rate.toFixed(12);
    if (!/^\d+\.\d{12}$/.test(rateText)) throw new Error("unsupported precision");
    const scaledRate = BigInt(rateText.replace(".", ""));
    if (scaledRate <= 0n) throw new Error("rate too small");
    const numerator = amountMinor * scaledRate * (10n ** BigInt(toDigits));
    const denominator = 1_000_000_000_000n * (10n ** BigInt(fromDigits));
    const payoutMinor = (numerator + denominator / 2n) / denominator;
    if (payoutMinor <= 0n) throw new Error("payout rounds to zero");
    return payoutMinor;
  };
  assert.throws(() => convert(100n, 2, 2, 0.0000000000001), /rate too small/);
  assert.throws(() => convert(1n, 2, 0, 1), /payout rounds to zero/);
  assert.equal(convert(12500n, 2, 2, 1.23456789), 15432n);
  assert.equal(convert(10000n, 2, 0, 150), 15000n);
});
