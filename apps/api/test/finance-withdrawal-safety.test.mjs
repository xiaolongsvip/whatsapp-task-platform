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
  for (const route of ['"users/dashboard"', '"users/promotion"', '"users/commission-records"', '"users/wallet-overview"', '"users/wallet-transactions?limit=$limit"', '"users/withdrawals"', '"users/payout-accounts"', '"users/team"', '"users/me/password"']) {
    assert.ok(repository.includes(route), "missing Android route: " + route);
  }
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
  assert.match(withdrawals, /paymentProviderConfig\.findUnique/);
  assert.match(withdrawals, /provider\.enabled/);
  assert.match(withdrawals, /provider\.supportedCurrencies\.some\(value => value\.trim\(\)\.toUpperCase\(\) === context\.payoutCurrency\)/);
  assert.match(withdrawals, /provider\.supportedChannels\.some/);
  assert.doesNotMatch(withdrawals, /channels\.includes\(account\.providerCode/);
});

test("legacy manual-pk accounts are resolved transactionally before a withdrawal is created", () => {
  const withdrawals = readFileSync(new URL("../src/users/withdrawals.service.ts", import.meta.url), "utf8");
  assert.match(withdrawals, /providerCode === "MANUAL-PK"/);
  assert.match(withdrawals, /legacy payout account cannot be matched to exactly one enabled provider/);
  assert.match(withdrawals, /tx\.payoutAccount\.update\(\{ where: \{ id: account\.id \}, data: \{ providerCode: resolvedProviderCode \} \}\)/);
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
  assert.match(finance, /scanLimitReached = approvedSubmissions\.length === 5000/);
  assert.match(finance, /scanLimitReached \? "INCOMPLETE"/);
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
  assert.match(controller, /expectedQuoteFetchedAt: body\.expectedRateFetchedAt/);
  assert.match(withdrawals, /WITHDRAWAL_QUOTE_CHANGED/);
  assert.match(withdrawals, /!sameRate \|\| !sameSource \|\| !sameObservation/);
  assert.match(withdrawals, /rate\.source === "IDENTITY"/);
  assert.match(repo, /expectedRateFetchedAt/);
  assert.match(app, /estimatedPayout != null/);
  assert.match(app, /AuthRepository\.createWithdrawal\(id, minor, quote/);
});
