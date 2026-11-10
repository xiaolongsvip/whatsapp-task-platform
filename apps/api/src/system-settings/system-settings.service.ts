import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@wtp/database";
import { randomUUID } from "node:crypto";

type JsonRecord = Record<string, unknown>;
const currencyDigits = (currency: string) => {
  try { return Math.max(0, new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2); }
  catch { return 2; }
};
const DEFAULT_ACCOUNT_SECURITY = { businessEmailVerification: false };
const DEFAULT_APP_SUPPORT = { supportUrl: "" };
const DEFAULT_VERSION = { currentVersion: "1.4.6", latestVersion: "1.4.6", versionCode: 146, updateType: "MAJOR", downloadUrl: "https://download.ee6868.com/appupdate/146/apprel_ac4add1c184e4efa9e0210f94ae7f152.apk", releaseNotes: "", releases: [
  { version: "1.4.6", versionCode: 146, fileName: "EasyEarn-1.4.6-146-release.apk", size: "20.7 MB", status: "PUBLISHED", updateType: "MAJOR", downloadUrl: "https://download.ee6868.com/appupdate/146/apprel_ac4add1c184e4efa9e0210f94ae7f152.apk", uploadedAt: "2026-11-06T10:37:00.000Z", verifiedAt: "2026-11-06T10:38:00.000Z", publishedAt: "2026-11-06T10:38:00.000Z" },
  { version: "1.4.5", versionCode: 145, fileName: "EasyEarn-1.4.5-145-release.apk", size: "20.6 MB", status: "REVOKED", updateType: "MAJOR", uploadedAt: "2026-11-03T11:18:00.000Z", verifiedAt: "2026-11-03T11:18:00.000Z", publishedAt: "2026-11-03T11:18:00.000Z" },
  { version: "1.4.4", versionCode: 144, fileName: "EasyEarn-1.4.4-144-release.apk", size: "20.6 MB", status: "REVOKED", updateType: "MAJOR", uploadedAt: "2026-11-03T06:39:00.000Z", verifiedAt: "2026-11-03T06:40:00.000Z", publishedAt: "2026-11-03T06:40:00.000Z" },
] as JsonRecord[] };
const DEFAULT_RISK = { singleDeviceSingleAccount: false, crossAccountScreenshotSimilarity: false, userRiskManualReview: false, manualReviewThreshold: 70 };
const DEFAULT_ARTICLES: JsonRecord[] = [];

@Injectable()
export class SystemSettingsService {
  private async read(key: string, fallback: unknown): Promise<any> {
    const row = await prisma.taskConfiguration.findUnique({ where: { key } });
    return row?.value ?? fallback;
  }
  async getConfig(key: string) {
    const fallback = key === "system.riskSettings" ? DEFAULT_RISK : DEFAULT_ACCOUNT_SECURITY;
    return this.read(key, fallback);
  }
  async getAll() {
    const [accountSecurity, support, version, risk, withdrawalRules, articles] = await Promise.all([
      this.read("system.accountSecurity", DEFAULT_ACCOUNT_SECURITY),
      this.read("system.appSupport", DEFAULT_APP_SUPPORT),
      this.read("system.appVersion", DEFAULT_VERSION),
      this.read("system.riskSettings", DEFAULT_RISK),
      this.read("system.withdrawalRules", []),
      this.read("system.helpArticles", DEFAULT_ARTICLES),
    ]);
    return { accountSecurity, support, version, risk, withdrawalRules, articles };
  }
  async saveConfig(key: string, value: JsonRecord, adminId: string) {
    let safe: JsonRecord;
    if (key === "system.riskSettings") {
      const threshold = Number(value.manualReviewThreshold ?? 70);
      if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
        throw new BadRequestException("人工审核风险阈值必须是 0 到 100 之间的整数。");
      }
      safe = {
        singleDeviceSingleAccount: Boolean(value.singleDeviceSingleAccount),
        crossAccountScreenshotSimilarity: Boolean(value.crossAccountScreenshotSimilarity),
        userRiskManualReview: Boolean(value.userRiskManualReview),
        manualReviewThreshold: threshold,
      };
    } else {
      safe = { businessEmailVerification: false };
    }
    await this.write(key, safe);
    await this.audit(adminId, "SYSTEM_SETTING_UPDATED", key, safe);
    return safe;
  }
  private async write(key: string, value: unknown) {
    await prisma.taskConfiguration.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } });
  }
  private async audit(adminId: string, action: string, targetId: string, metadata: unknown) {
    await prisma.auditEvent.create({ data: { actorType: "ADMIN", actorId: adminId, action, targetType: "SYSTEM_SETTING", targetId, metadata: metadata as any } });
  }
  async saveSupport(input: JsonRecord, adminId: string) {
    const supportUrl = String(input.supportUrl ?? "").trim();
    if (supportUrl) {
      let parsed: URL;
      try { parsed = new URL(supportUrl); }
      catch { throw new BadRequestException("客服链接格式无效，请填写完整的 HTTPS 地址"); }
      if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || supportUrl.length > 2048) {
        throw new BadRequestException("客服链接必须是有效的 HTTPS 地址，不能包含账号密码，且不能超过 2048 个字符");
      }
    }
    const safe = { supportUrl };
    await this.write("system.appSupport", safe);
    await this.audit(adminId, "APP_SUPPORT_URL_UPDATED", "system.appSupport", safe);
    return safe;
  }
  async getPublicSupportUrl() {
    const support = await this.read("system.appSupport", DEFAULT_APP_SUPPORT);
    const value = String(support?.supportUrl ?? "").trim();
    return value && /^https:\/\//i.test(value) ? value : null;
  }
  async getPublicUpdateInfo() {
    const config = await this.read("system.appVersion", DEFAULT_VERSION);
    const releases = Array.isArray(config.releases) ? config.releases : [];
    const published = releases.find((x: any) => x.status === "PUBLISHED" && String(x.version) === String(config.currentVersion))
      ?? releases.find((x: any) => x.status === "PUBLISHED");
    const updateType = String(published?.updateType ?? "MINOR");
    return {
      currentVersion: String(config.currentVersion ?? ""),
      latestVersion: String(published?.version ?? config.currentVersion ?? ""),
      versionCode: Number(published?.versionCode ?? 0),
      updateType,
      forceUpdate: updateType === "MAJOR",
      downloadUrl: String(published?.downloadUrl ?? ""),
      releaseNotes: String(published?.releaseNotes ?? ""),
    };
  }
  async saveVersion(input: JsonRecord, adminId: string) {
    const current = await this.read("system.appVersion", DEFAULT_VERSION);
    const latestVersion = String(input.latestVersion ?? "").trim();
    const versionCode = Number(input.versionCode);
    const downloadUrl = String(input.downloadUrl ?? "").trim();
    if (!/^\d+\.\d+\.\d+$/.test(latestVersion)) throw new BadRequestException("版本号必须使用 x.y.z 格式");
    if (!Number.isSafeInteger(versionCode) || versionCode < 1) throw new BadRequestException("版本代码必须是正整数");
    if (versionCode <= Number(current.versionCode ?? 0)) throw new BadRequestException("新版本代码必须大于当前线上版本代码");
    if (downloadUrl && !/^https:\/\//i.test(downloadUrl)) throw new BadRequestException("APK 下载地址必须使用 HTTPS");
    const release = { version: latestVersion, versionCode, updateType: input.updateType === "MAJOR" ? "MAJOR" : "MINOR", downloadUrl, releaseNotes: String(input.releaseNotes ?? "").slice(0, 5000), releasedAt: new Date().toISOString(), status: "DRAFT" };
    const releases = Array.isArray(current.releases) ? current.releases : [];
    const next = { ...current, latestVersion, versionCode, updateType: release.updateType, downloadUrl, releaseNotes: release.releaseNotes, releases: [release, ...releases].slice(0, 100) };
    await this.write("system.appVersion", next);
    await this.audit(adminId, "APP_VERSION_DRAFT_SAVED", latestVersion, { versionCode, updateType: release.updateType });
    return next;
  }
  async registerApkUpload(input: { fileName: string; size: number; downloadUrl: string; objectKey: string; sha256: string }, adminId: string) {
    const current = await this.read("system.appVersion", DEFAULT_VERSION);
    const releases = Array.isArray(current.releases) ? [...current.releases] : [];
    const code = Number(current.versionCode ?? 0);
    const version = String(current.latestVersion ?? "");
    if (!version || !code) throw new BadRequestException("请先填写最新版本名称和版本代码，再上传 APK");
    const release = { version, versionCode: code, updateType: current.updateType ?? "MINOR", downloadUrl: input.downloadUrl, objectKey: input.objectKey, fileName: input.fileName, size: input.size, sha256: input.sha256, releaseNotes: current.releaseNotes ?? "", status: "VERIFIED", uploadedAt: new Date().toISOString(), verifiedAt: new Date().toISOString() };
    const next = { ...current, downloadUrl: input.downloadUrl, releases: [release, ...releases.filter((x: any) => Number(x.versionCode) !== code)].slice(0, 100) };
    await this.write("system.appVersion", next);
    await this.audit(adminId, "APP_APK_UPLOADED_AND_VERIFIED", String(code), { fileName: input.fileName, size: input.size, objectKey: input.objectKey, sha256: input.sha256 });
    return { ...release };
  }
  async versionAction(versionCode: number, action: "PUBLISH" | "REVOKE", adminId: string) {
    if (!Number.isSafeInteger(versionCode) || versionCode < 1) throw new BadRequestException("版本代码无效");
    const current = await this.read("system.appVersion", DEFAULT_VERSION);
    const releases = Array.isArray(current.releases) ? [...current.releases] : [];
    const index = releases.findIndex((x: any) => Number(x.versionCode) === versionCode);
    if (index < 0) throw new NotFoundException("版本发布记录不存在");
    const release = { ...releases[index] } as any;
    if (action === "PUBLISH") {
      if (!release.downloadUrl || release.status !== "VERIFIED") throw new BadRequestException("该版本尚未上传并校验 APK，不能发布");
      const publishedCode = Number(
        releases.find((item: any) => item.status === "PUBLISHED" && String(item.version) === String(current.currentVersion))?.versionCode ?? 0,
      );
      if (Number(release.versionCode) <= publishedCode) {
        throw new BadRequestException("不能发布低于或等于当前线上版本代码的 APK");
      }
      release.status = "PUBLISHED";
      release.publishedAt = new Date().toISOString();
      current.currentVersion = release.version;
      current.latestVersion = release.version;
      current.versionCode = release.versionCode;
      current.updateType = release.updateType;
      current.downloadUrl = release.downloadUrl;
    } else {
      release.status = "REVOKED";
      release.revokedAt = new Date().toISOString();
      const liveRelease = releases.find((item: any) =>
        item.status === "PUBLISHED" && String(item.version) === String(current.currentVersion),
      );
      if (Number(liveRelease?.versionCode ?? 0) === versionCode) {
        const previous = releases.find((x: any, i: number) => i !== index && x.status === "PUBLISHED");
        current.currentVersion = previous?.version ?? "";
        current.latestVersion = previous?.version ?? "";
        current.versionCode = previous?.versionCode ?? 0;
        current.updateType = previous?.updateType ?? "MINOR";
        current.downloadUrl = previous?.downloadUrl ?? "";
      }
    }
    releases[index] = release;
    current.releases = releases;
    await this.write("system.appVersion", current);
    await this.audit(adminId, "APP_VERSION_" + action, String(versionCode), { version: release.version, status: release.status });
    return current;
  }
  async recordHelpAssetUpload(adminId: string, key: string, fileName: string, contentType: string, size: number) {
    await this.audit(adminId, "HELP_ASSET_UPLOAD_URL_CREATED", key, { fileName, contentType, size });
    return { key, fileName, contentType, size };
  }
  async listArticles(query: Record<string,string>) {
    const items = await this.read("system.helpArticles", DEFAULT_ARTICLES);
    const includeTrash = query.view === "trash";
    const search = (query.search ?? "").trim().toLowerCase();
    return (Array.isArray(items) ? items : []).filter((x: any) => Boolean(x.deletedAt) === includeTrash && (!search || String(x.title ?? "").toLowerCase().includes(search) || String(x.summary ?? "").toLowerCase().includes(search)));
  }
  async saveArticle(id: string | null, input: JsonRecord, adminId: string) {
    const items = await this.read("system.helpArticles", DEFAULT_ARTICLES) as JsonRecord[];
    const title = String(input.title ?? "").trim();
    if (!title) throw new BadRequestException("文章标题不能为空");
    const now = new Date().toISOString();
    const index = id ? items.findIndex(x => x.id === id && !x.deletedAt) : -1;
    if (id && index < 0) throw new NotFoundException("帮助文章不存在");
    const prior = index >= 0 ? items[index] : null;
    const version = Number(prior?.version ?? 0) + 1;
    const revision = { version, savedAt: now, title, summary: String(input.summary ?? ""), content: String(input.content ?? ""), language: String(input.language ?? "简体中文"), audience: String(input.audience ?? "后台操作员") };
    const article: JsonRecord = { ...(prior ?? {}), id: id ?? randomUUID(), ...revision, status: prior?.status ?? "DRAFT", pinned: Boolean(input.pinned ?? prior?.pinned), advanced: input.advanced ?? prior?.advanced ?? {}, revisions: [...(Array.isArray(prior?.revisions) ? prior!.revisions as JsonRecord[] : []), revision].slice(-30), updatedAt: now, updatedBy: adminId };
    if (index >= 0) items[index] = article; else items.unshift(article);
    await this.write("system.helpArticles", items);
    await this.audit(adminId, id ? "HELP_ARTICLE_UPDATED" : "HELP_ARTICLE_CREATED", String(article.id), { title, version });
    return article;
  }
  async articleAction(id: string, action: string, adminId: string) {
    const items = await this.read("system.helpArticles", DEFAULT_ARTICLES) as JsonRecord[];
    const item = items.find(x => x.id === id);
    if (!item) throw new NotFoundException("帮助文章不存在");
    if (action === "DELETE_PERMANENT") {
      if (!item.deletedAt) throw new BadRequestException("请先将文章移入回收站，再永久删除。");
      await this.write("system.helpArticles", items.filter(x => x.id !== id));
      await this.audit(adminId, "HELP_ARTICLE_DELETED_PERMANENTLY", id, { title: item.title });
      return { success: true, id };
    }
    if (action === "TRASH") item.deletedAt = new Date().toISOString();
    if (action === "RESTORE") delete item.deletedAt;
    if (action === "PUBLISH") { item.status = item.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"; item.publishedAt = item.status === "PUBLISHED" ? new Date().toISOString() : null; }
    if (action === "PIN") item.pinned = !item.pinned;
    item.updatedAt = new Date().toISOString();
    await this.write("system.helpArticles", items);
    await this.audit(adminId, "HELP_ARTICLE_" + action, id, { title: item.title });
    return item;
  }
  async recordExchangeRateRefresh(adminId: string, snapshot: { source: string; base: string; fetchedAt: string; providerUpdatedAt?: string; rates: Record<string, number>; stale?: boolean }) {
    const metadata = { source: snapshot.source, base: snapshot.base, fetchedAt: snapshot.fetchedAt, providerUpdatedAt: snapshot.providerUpdatedAt ?? null, currencyCount: Object.keys(snapshot.rates).length, stale: Boolean(snapshot.stale) };
    await this.audit(adminId, "EXCHANGE_RATES_REFRESHED", "system.exchangeRates.latest", metadata);
    return metadata;
  }

  async getPayoutCatalogs() {
    const value = await this.read("system.payoutCatalogs", { countries: [], currencies: [], methods: [] });
    return {
      countries: Array.isArray(value?.countries) ? value.countries : [],
      currencies: Array.isArray(value?.currencies) ? value.currencies : [],
      methods: Array.isArray(value?.methods) ? value.methods : [],
    };
  }

  async savePayoutCatalogs(input: JsonRecord, adminId: string) {
    const normalize = (value: unknown, pattern: RegExp, label: string) => {
      if (!Array.isArray(value)) throw new BadRequestException(label + "必须是数组。");
      const seen = new Set<string>();
      return value.map((raw: any) => {
        const code = String(raw?.code ?? "").trim().toUpperCase();
        const name = String(raw?.name ?? "").trim();
        if (!pattern.test(code) || !name || name.length > 100 || seen.has(code)) {
          throw new BadRequestException(label + "代码无效、名称为空或存在重复代码。");
        }
        seen.add(code);
        return { code, name, enabled: raw?.enabled !== false };
      });
    };
    const countries = normalize(input.countries, /^[A-Z]{2}$/, "国家目录");
    const currencies = normalize(input.currencies, /^[A-Z]{3}$/, "货币目录").map((item: any, index: number) => {
      const raw = (input.currencies as any[])[index];
      const fractionDigits = Number(raw?.fractionDigits ?? currencyDigits(item.code));
      if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 6) throw new BadRequestException("货币小数位必须是 0 到 6 的整数。");
      return { ...item, fractionDigits };
    });
    if (!Array.isArray(input.methods)) throw new BadRequestException("收款方式目录必须是数组。");
    const methodCodes = new Set<string>();
    const methods = input.methods.map((raw: any) => {
      const code = String(raw?.code ?? "").trim().toLowerCase();
      const name = String(raw?.name ?? "").trim();
      const channel = String(raw?.channel ?? code).trim().toLowerCase();
      const countryCodes = Array.isArray(raw?.countryCodes) ? raw.countryCodes.map((x: unknown) => String(x).trim().toUpperCase()) : [];
      const currencyCodes = Array.isArray(raw?.currencyCodes) ? raw.currencyCodes.map((x: unknown) => String(x).trim().toUpperCase()) : [];
      if (!/^[a-z0-9_-]{2,40}$/.test(code) || !/^[a-z0-9_-]{2,40}$/.test(channel) || !name || name.length > 100 || methodCodes.has(code)) throw new BadRequestException("收款方式代码、渠道或名称无效，或存在重复代码。");
      if (countryCodes.some((x: string) => !/^[A-Z]{2}$/.test(x) || !countries.some((v: any) => v.code === x)) || currencyCodes.some((x: string) => !/^[A-Z]{3}$/.test(x) || !currencies.some((v: any) => v.code === x))) throw new BadRequestException("收款方式关联了不存在的国家或货币。");
      methodCodes.add(code);
      return { code, name, channel, countryCodes, currencyCodes, enabled: raw?.enabled !== false };
    });
    const safe = { countries, currencies, methods, updatedAt: new Date().toISOString() };
    await this.write("system.payoutCatalogs", safe);
    await this.audit(adminId, "PAYOUT_CATALOGS_UPDATED", "system.payoutCatalogs", safe);
    return safe;
  }

  async listWithdrawalRules(query: Record<string,string>) {
    const items = await this.read("system.withdrawalRules", []) as JsonRecord[];
    return items.filter((x: any) => (!query.country || query.country === x.countryCode) && (!query.currency || query.currency === x.walletCurrency) && (!query.method || query.method === x.method) && (!query.status || query.status === x.status));
  }
  async saveWithdrawalRule(id: string | null, input: JsonRecord, adminId: string) {
    const items = await this.read("system.withdrawalRules", []) as JsonRecord[];
    const ruleId = id ?? randomUUID();
    const countryCode = String(input.countryCode ?? "").trim().toUpperCase();
    const walletCurrency = String(input.walletCurrency ?? "").trim().toUpperCase();
    const payoutCurrency = String(input.payoutCurrency ?? "").trim().toUpperCase();
    const method = String(input.method ?? "").trim().toUpperCase();
    const channels = Array.isArray(input.channels) ? input.channels.map(value => String(value).trim().toLowerCase()).filter(Boolean) : [];
    const min = Number(input.minimumAmount), max = Number(input.maximumAmount), daily = Number(input.dailyLimit);
    if (!/^(?:[A-Z]{2}|GLOBAL)$/.test(countryCode) || !/^[A-Z]{3}$/.test(walletCurrency) || !/^[A-Z]{3}$/.test(payoutCurrency) || !/^[A-Z0-9_-]{2,40}$/.test(method)) throw new BadRequestException("国家代码、钱包币种、代付币种和提现方式格式无效");
    if (channels.length === 0 || channels.some(channel => !/^[a-z0-9_-]{2,40}$/.test(channel))) throw new BadRequestException("请至少配置一个有效的收款渠道代码");
    const catalogValue = await this.read("system.payoutCatalogs", { countries: [], currencies: [], methods: [] });
    const countries = Array.isArray(catalogValue?.countries) ? catalogValue.countries : [];
    const currencies = Array.isArray(catalogValue?.currencies) ? catalogValue.currencies : [];
    const methods = Array.isArray(catalogValue?.methods) ? catalogValue.methods : [];
    if (countries.length && countryCode !== "GLOBAL" && !countries.some((x: any) => x.code === countryCode && x.enabled !== false)) throw new BadRequestException("提现规则引用的国家未配置或已停用。");
    if (currencies.length && (![walletCurrency, payoutCurrency].every(code => currencies.some((x: any) => x.code === code && x.enabled !== false)))) throw new BadRequestException("提现规则引用的钱包币种或出款币种未配置或已停用。");
    if (methods.length && channels.some(channel => !methods.some((x: any) => String(x.channel ?? x.code).toLowerCase() === channel && x.enabled !== false && (!Array.isArray(x.countryCodes) || x.countryCodes.length === 0 || countryCode === "GLOBAL" || x.countryCodes.includes(countryCode)) && (!Array.isArray(x.currencyCodes) || x.currencyCodes.length === 0 || x.currencyCodes.includes(payoutCurrency))))) throw new BadRequestException("提现规则包含未启用或不适用于该国家、币种的收款方式。");
    const scale = 10 ** currencyDigits(walletCurrency);
    const limits = [min, max, daily];
    if (!limits.every(value => Number.isFinite(value) && Number.isSafeInteger(Math.round(value * scale)) && Math.abs(value * scale - Math.round(value * scale)) < 1e-7) ||
        !(min > 0 && max >= min && daily > 0)) {
      throw new BadRequestException("提现限额必须是大于零且符合钱包币种小数位数的有效金额，且最高金额不能低于最低金额。");
    }
    const existingIndex = items.findIndex(x => x.id === ruleId);
    const existingRule = existingIndex >= 0 ? items[existingIndex] : null;
    if (existingRule?.status === "ARCHIVED" && input.status !== "ARCHIVED") {
      throw new BadRequestException("已归档的提现规则不能重新启用或取消归档，请新建规则。");
    }
    const rule = { id: ruleId, countryCode, countryName: String(input.countryName ?? countryCode), walletCurrency, payoutCurrency, method, channels, minimumAmount: min, maximumAmount: max, dailyLimit: daily, status: existingRule?.status === "ARCHIVED" ? "ARCHIVED" : input.status === "ARCHIVED" ? "ARCHIVED" : input.status === "DISABLED" ? "DISABLED" : "ENABLED", updatedAt: new Date().toISOString() };
    if (rule.status === "ENABLED" && items.some(x => x.id !== ruleId && x.status === "ENABLED" &&
      String(x.countryCode).toUpperCase() === countryCode &&
      String(x.payoutCurrency).toUpperCase() === payoutCurrency &&
      String(x.method).toUpperCase() === method)) {
      throw new BadRequestException("相同国家、出款币种和提现方式已有启用中的规则，请先停用旧规则。");
    }
    // Withdrawal lookup resolves a rule by country, payout currency and channel.
    // Reject overlapping channels here so an admin cannot save a rule that the
    // member APP cannot resolve deterministically.
    if (rule.status === "ENABLED" && items.some(x => x.id !== ruleId && x.status === "ENABLED" &&
      String(x.countryCode).toUpperCase() === countryCode &&
      String(x.payoutCurrency).toUpperCase() === payoutCurrency &&
      Array.isArray(x.channels) &&
      x.channels.some(channel => channels.includes(String(channel).trim().toLowerCase())))) {
      throw new BadRequestException("相同国家和出款币种的收款渠道已被其他启用规则占用，请调整渠道或停用旧规则。");
    }
    const index = items.findIndex(x => x.id === ruleId);
    if (index >= 0) items[index] = rule; else items.unshift(rule);
    await this.write("system.withdrawalRules", items);
    await this.audit(adminId, id ? "WITHDRAWAL_RULE_UPDATED" : "WITHDRAWAL_RULE_CREATED", ruleId, rule);
    return rule;
  }
  async toggleWithdrawalRule(id: string, adminId: string) {
    const items = await this.read("system.withdrawalRules", []) as JsonRecord[];
    const rule = items.find(x => x.id === id) as any;
    if (!rule) throw new NotFoundException("提现规则不存在");
    if (rule.status === "ARCHIVED") {
      throw new BadRequestException("已归档的提现规则不能重新启用，请新建规则。");
    }
    if (rule.status !== "ENABLED" && items.some(x => x.id !== id && x.status === "ENABLED" &&
      String(x.countryCode).toUpperCase() === String(rule.countryCode).toUpperCase() &&
      String(x.payoutCurrency).toUpperCase() === String(rule.payoutCurrency).toUpperCase() &&
      String(x.method).toUpperCase() === String(rule.method).toUpperCase())) {
      throw new BadRequestException("相同国家、出款币种和提现方式已有启用中的规则。");
    }
    const ruleChannels = Array.isArray(rule.channels) ? rule.channels.map((channel: unknown) => String(channel).trim().toLowerCase()) : [];
    if (rule.status !== "ENABLED" && items.some(x => x.id !== id && x.status === "ENABLED" &&
      String(x.countryCode).toUpperCase() === String(rule.countryCode).toUpperCase() &&
      String(x.payoutCurrency).toUpperCase() === String(rule.payoutCurrency).toUpperCase() &&
      Array.isArray(x.channels) &&
      x.channels.some(channel => ruleChannels.includes(String(channel).trim().toLowerCase())))) {
      throw new BadRequestException("相同国家和出款币种的收款渠道已被其他启用规则占用，请调整渠道或停用旧规则。");
    }
    rule.status = rule.status === "ENABLED" ? "DISABLED" : "ENABLED";
    rule.updatedAt = new Date().toISOString();
    await this.write("system.withdrawalRules", items);
    await this.audit(adminId, "WITHDRAWAL_RULE_STATUS_UPDATED", id, { status: rule.status });
    return rule;
  }
  async duplicateWithdrawalRule(id: string, adminId: string) {
    const items = await this.read("system.withdrawalRules", []) as JsonRecord[];
    const source = items.find(x => x.id === id);
    if (!source) throw new NotFoundException("提现规则不存在");
    const copy = { ...source, id: randomUUID(), status: "DISABLED", countryName: String(source.countryName) + " 副本", updatedAt: new Date().toISOString() };
    items.unshift(copy);
    await this.write("system.withdrawalRules", items);
    await this.audit(adminId, "WITHDRAWAL_RULE_DUPLICATED", String(copy.id), { sourceId: id });
    return copy;
  }
  async auditLogs(query: Record<string,string>) {
    const page = Math.max(1, Number(query.page ?? 1) || 1), pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20) || 20));
    const search = (query.search ?? "").trim();
    const where: any = {
      ...(search ? { OR: [
        { targetId: { contains: search, mode: "insensitive" } },
        { requestId: { contains: search, mode: "insensitive" } },
        { path: { contains: search, mode: "insensitive" } },
        { action: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search, mode: "insensitive" } },
      ] } : {}),
      ...(query.module ? { module: { contains: query.module, mode: "insensitive" } } : {}),
      ...(query.result ? { result: query.result } : {}),
      ...(query.method ? { method: query.method.toUpperCase() } : {}),
      ...(query.statusCode && Number.isInteger(Number(query.statusCode)) ? { statusCode: Number(query.statusCode) } : {}),
      ...(query.startDate || query.endDate ? { createdAt: {
        ...(query.startDate ? { gte: new Date(query.startDate + "T00:00:00.000Z") } : {}),
        ...(query.endDate ? { lt: new Date(new Date(query.endDate + "T00:00:00.000Z").getTime() + 86400000) } : {}),
      } } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.adminHttpRequestLog.count({ where }),
      prisma.adminHttpRequestLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page-1)*pageSize, take: pageSize }),
    ]);
    const ids = [...new Set(rows.map(x => x.adminUserId).filter((x): x is string => Boolean(x)))];
    const admins = ids.length ? await prisma.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
    const names = new Map(admins.map(x => [x.id, x.name || x.email]));
    return { page, pageSize, total, items: rows.map(x => ({
      id: x.id, requestId: x.requestId, createdAt: x.createdAt.toISOString(),
      actor: x.adminUserId ? names.get(x.adminUserId) ?? "Administrator" : "未识别管理员",
      actorId: x.adminUserId, module: x.module, action: x.action, targetId: x.targetId,
      result: x.result, statusCode: x.statusCode, ipAddress: x.ipAddress,
      userAgent: x.userAgent, durationMs: x.durationMs, errorCode: x.errorCode, metadata: x.requestData,
    })) };
  }
  async auditLogDetail(id: string) {
    const row = await prisma.adminHttpRequestLog.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("审计记录不存在");
    const admin = row.adminUserId ? await prisma.adminUser.findUnique({ where: { id: row.adminUserId }, select: { name: true, email: true } }) : null;
    return {
      id: row.id, requestId: row.requestId, createdAt: row.createdAt.toISOString(),
      actor: admin?.name ?? admin?.email ?? "未识别管理员", module: row.module,
      action: row.action, targetId: row.targetId, result: row.result,
      ipAddress: row.ipAddress, userAgent: row.userAgent, statusCode: row.statusCode,
      errorCode: row.errorCode, durationMs: row.durationMs,
      requestData: row.requestData ?? {}, processingResult: row.responseData ?? {},
      relatedRecords: { entityType: row.module, entityId: row.targetId },
    };
  }
}
