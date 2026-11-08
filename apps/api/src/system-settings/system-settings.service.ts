import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@wtp/database";
import { randomUUID } from "node:crypto";

type JsonRecord = Record<string, unknown>;
const DEFAULT_ACCOUNT_SECURITY = { businessEmailVerification: false };
const DEFAULT_APP_SUPPORT = { supportUrl: "" };
const DEFAULT_VERSION = { currentVersion: "1.4.6", latestVersion: "1.4.6", versionCode: 146, updateType: "MAJOR", downloadUrl: "https://download.ee6868.com/appupdate/146/apprel_ac4add1c184e4efa9e0210f94ae7f152.apk", releaseNotes: "", releases: [
  { version: "1.4.6", versionCode: 146, fileName: "EasyEarn-1.4.6-146-release.apk", size: "20.7 MB", status: "PUBLISHED", updateType: "MAJOR", downloadUrl: "https://download.ee6868.com/appupdate/146/apprel_ac4add1c184e4efa9e0210f94ae7f152.apk", uploadedAt: "2026-11-06T10:37:00.000Z", verifiedAt: "2026-11-06T10:38:00.000Z", publishedAt: "2026-11-06T10:38:00.000Z" },
  { version: "1.4.5", versionCode: 145, fileName: "EasyEarn-1.4.5-145-release.apk", size: "20.6 MB", status: "REVOKED", updateType: "MAJOR", uploadedAt: "2026-11-03T11:18:00.000Z", verifiedAt: "2026-11-03T11:18:00.000Z", publishedAt: "2026-11-03T11:18:00.000Z" },
  { version: "1.4.4", versionCode: 144, fileName: "EasyEarn-1.4.4-144-release.apk", size: "20.6 MB", status: "REVOKED", updateType: "MAJOR", uploadedAt: "2026-11-03T06:39:00.000Z", verifiedAt: "2026-11-03T06:40:00.000Z", publishedAt: "2026-11-03T06:40:00.000Z" },
] as JsonRecord[] };
const DEFAULT_RISK = { singleDeviceSingleAccount: false, crossAccountScreenshotSimilarity: false, userRiskManualReview: false, manualReviewThreshold: 70 };
const DEFAULT_RULES: JsonRecord[] = [{ id: "default-pk-usd-local", countryCode: "PK", countryName: "Pakistan", walletCurrency: "USD", payoutCurrency: "PKR", method: "LOCAL_ACCOUNT", channels: ["jazzcash", "easypaisa"], minimumAmount: 1, maximumAmount: 1000, dailyLimit: 5000000, status: "ENABLED" }];
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
      this.read("system.withdrawalRules", DEFAULT_RULES),
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
      safe = { businessEmailVerification: Boolean(value.businessEmailVerification) };
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
    if (supportUrl && (!/^https:\/\//i.test(supportUrl) || supportUrl.length > 2048)) {
      throw new BadRequestException("客服链接必须是有效的 HTTPS 地址，且不能超过 2048 个字符");
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
      if (Number(current.versionCode) === versionCode) {
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
  async listWithdrawalRules(query: Record<string,string>) {
    const items = await this.read("system.withdrawalRules", DEFAULT_RULES) as JsonRecord[];
    return items.filter((x: any) => (!query.country || query.country === x.countryCode) && (!query.currency || query.currency === x.walletCurrency) && (!query.method || query.method === x.method) && (!query.status || query.status === x.status));
  }
  async saveWithdrawalRule(id: string | null, input: JsonRecord, adminId: string) {
    const items = await this.read("system.withdrawalRules", DEFAULT_RULES) as JsonRecord[];
    const ruleId = id ?? randomUUID();
    const countryCode = String(input.countryCode ?? "").trim().toUpperCase();
    const walletCurrency = String(input.walletCurrency ?? "").trim().toUpperCase();
    const payoutCurrency = String(input.payoutCurrency ?? "").trim().toUpperCase();
    const method = String(input.method ?? "").trim().toUpperCase();
    const min = Number(input.minimumAmount), max = Number(input.maximumAmount), daily = Number(input.dailyLimit);
    if (!/^(?:[A-Z]{2}|GLOBAL)$/.test(countryCode) || !/^[A-Z]{3}$/.test(walletCurrency) || !/^[A-Z]{3}$/.test(payoutCurrency) || !method) throw new BadRequestException("国家代码、钱包币种、代付币种和提现方式格式无效");
    if (!(min > 0 && max >= min && daily > 0)) throw new BadRequestException("请检查最低、最高和每日提现限额");
    const rule = { id: ruleId, countryCode, countryName: String(input.countryName ?? countryCode), walletCurrency, payoutCurrency, method, channels: Array.isArray(input.channels) ? input.channels.map(String) : [], minimumAmount: min, maximumAmount: max, dailyLimit: daily, status: input.status === "ARCHIVED" ? "ARCHIVED" : input.status === "DISABLED" ? "DISABLED" : "ENABLED", updatedAt: new Date().toISOString() };
    if (rule.status === "ENABLED" && items.some(x => x.id !== ruleId && x.status === "ENABLED" &&
      String(x.countryCode).toUpperCase() === countryCode &&
      String(x.walletCurrency).toUpperCase() === walletCurrency &&
      String(x.method).toUpperCase() === method)) {
      throw new BadRequestException("相同国家、钱包币种和提现方式已有启用中的规则，请先停用旧规则。");
    }
    const index = items.findIndex(x => x.id === ruleId);
    if (index >= 0) items[index] = rule; else items.unshift(rule);
    await this.write("system.withdrawalRules", items);
    await this.audit(adminId, id ? "WITHDRAWAL_RULE_UPDATED" : "WITHDRAWAL_RULE_CREATED", ruleId, rule);
    return rule;
  }
  async toggleWithdrawalRule(id: string, adminId: string) {
    const items = await this.read("system.withdrawalRules", DEFAULT_RULES) as JsonRecord[];
    const rule = items.find(x => x.id === id) as any;
    if (!rule) throw new NotFoundException("提现规则不存在");
    if (rule.status !== "ENABLED" && items.some(x => x.id !== id && x.status === "ENABLED" &&
      String(x.countryCode).toUpperCase() === String(rule.countryCode).toUpperCase() &&
      String(x.walletCurrency).toUpperCase() === String(rule.walletCurrency).toUpperCase() &&
      String(x.method).toUpperCase() === String(rule.method).toUpperCase())) {
      throw new BadRequestException("相同国家、钱包币种和提现方式已有启用中的规则。");
    }
    rule.status = rule.status === "ENABLED" ? "DISABLED" : "ENABLED";
    rule.updatedAt = new Date().toISOString();
    await this.write("system.withdrawalRules", items);
    await this.audit(adminId, "WITHDRAWAL_RULE_STATUS_UPDATED", id, { status: rule.status });
    return rule;
  }
  async duplicateWithdrawalRule(id: string, adminId: string) {
    const items = await this.read("system.withdrawalRules", DEFAULT_RULES) as JsonRecord[];
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
