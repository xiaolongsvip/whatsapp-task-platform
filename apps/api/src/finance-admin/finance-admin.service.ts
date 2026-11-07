import { Injectable, BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { createCipheriv, randomBytes } from "node:crypto";
import { prisma, type Prisma } from "@wtp/database";

const RESERVED = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] as const;
const PAGE_MAX = 100;
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const pageArgs = (page?: string, pageSize?: string) => {
  const p = Math.max(1, Number.parseInt(page || "1", 10) || 1);
  const size = Math.min(PAGE_MAX, Math.max(1, Number.parseInt(pageSize || "20", 10) || 20));
  return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
};
const dateRange = (from?: string, to?: string) => ({
  ...(from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? { gte: new Date(from + "T00:00:00.000Z") } : {}),
  ...(to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? { lte: new Date(to + "T23:59:59.999Z") } : {}),
});

@Injectable()
export class FinanceAdminService {
  async summary() {
    const [walletCount, withdrawalGroups, providerCount, enabledProviderCount, transactionGroups, ledgerGroups] = await Promise.all([
      prisma.wallet.count(),
      prisma.withdrawalRequest.groupBy({ by: ["status", "currency"], _count: { _all: true }, _sum: { amountMinor: true } }),
      prisma.paymentProviderConfig.count(),
      prisma.paymentProviderConfig.count({ where: { enabled: true } }),
      prisma.paymentTransaction.groupBy({ by: ["status", "currency"], _count: { _all: true }, _sum: { amountMinor: true } }),
      prisma.ledgerEntry.groupBy({ by: ["direction", "currency"], _count: { _all: true }, _sum: { amountMinor: true } }),
    ]);
    return {
      walletCount, providerCount, enabledProviderCount,
      withdrawals: withdrawalGroups.map(x => ({ status: x.status, currency: x.currency.trim(), count: x._count._all, amountMinor: (x._sum.amountMinor ?? 0n).toString() })),
      transactions: transactionGroups.map(x => ({ status: x.status, currency: x.currency.trim(), count: x._count._all, amountMinor: (x._sum.amountMinor ?? 0n).toString() })),
      ledger: ledgerGroups.map(x => ({ direction: x.direction, currency: x.currency.trim(), count: x._count._all, amountMinor: (x._sum.amountMinor ?? 0n).toString() })),
    };
  }

  async withdrawals(query: { search?: string; status?: string; country?: string; from?: string; to?: string; page?: string; pageSize?: string }) {
    const pg = pageArgs(query.page, query.pageSize);
    const where: Prisma.WithdrawalRequestWhereInput = {
      ...(query.status && query.status !== "ALL" && ["REQUESTED","UNDER_REVIEW","APPROVED","REJECTED","PROCESSING","PAID","FAILED","CANCELLED"].includes(query.status) ? { status: query.status as Prisma.EnumWithdrawalStatusFilter["equals"] } : {}),
      ...(query.from || query.to ? { createdAt: dateRange(query.from, query.to) } : {}),
      ...(query.country ? { payoutAccount: { countryCode: query.country.toUpperCase() } } : {}),
      ...(query.search ? { OR: [
        ...(isUuid(query.search) ? [{ id: query.search }] : []),
        { wallet: { user: { phone: { contains: query.search, mode: "insensitive" } } } },
        { payoutAccount: { accountHolder: { contains: query.search, mode: "insensitive" } } },
      ] } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.withdrawalRequest.count({ where }),
      prisma.withdrawalRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take,
        include: { wallet: { select: { id: true, userId: true, currency: true, user: { select: { phone: true } } } },
          payoutAccount: { select: { id: true, countryCode: true, providerCode: true, methodCode: true, accountHolder: true, maskedAccount: true } } } }),
    ]);
    return { ...pg, total, items: rows.map(x => ({
      id: x.id, userId: x.wallet.userId, phone: x.wallet.user.phone, walletId: x.walletId,
      amountMinor: x.amountMinor.toString(), currency: x.currency.trim(), status: x.status,
      createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString(), payoutReference: x.payoutReference,
      payoutAccount: x.payoutAccount ? { id: x.payoutAccount.id, countryCode: x.payoutAccount.countryCode.trim(), providerCode: x.payoutAccount.providerCode, methodCode: x.payoutAccount.methodCode, accountHolder: x.payoutAccount.accountHolder, maskedAccount: x.payoutAccount.maskedAccount } : null,
    })) };
  }

  async withdrawalDetail(id: string) {
    if (!isUuid(id)) throw new BadRequestException("提现单 ID 格式不正确");
    const row = await prisma.withdrawalRequest.findUnique({
      where: { id },
      include: {
        wallet: { select: { id: true, userId: true, currency: true, user: { select: { phone: true } } } },
        payoutAccount: { select: { id: true, countryCode: true, currency: true, providerCode: true, methodCode: true, accountHolder: true, maskedAccount: true, status: true } },
        paymentTransactions: { orderBy: { createdAt: "desc" }, select: { id: true, providerCode: true, flow: true, status: true, amountMinor: true, currency: true, providerTransactionId: true, providerReference: true, failureCode: true, failureMessage: true, createdAt: true, updatedAt: true } },
      },
    });
    if (!row) throw new NotFoundException("提现申请不存在");
    return {
      id: row.id, userId: row.wallet.userId, phone: row.wallet.user.phone, walletId: row.walletId,
      amountMinor: row.amountMinor.toString(), currency: row.currency.trim(), status: row.status,
      payoutReference: row.payoutReference, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      payoutAccount: row.payoutAccount ? { ...row.payoutAccount, countryCode: row.payoutAccount.countryCode.trim(), currency: row.payoutAccount.currency.trim() } : null,
      paymentTransactions: row.paymentTransactions.map(x => ({ ...x, amountMinor: x.amountMinor.toString(), currency: x.currency.trim(), createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString() })),
    };
  }

  async reviewWithdrawal(id: string, action: string, adminId: string, note?: string) {
    if (!isUuid(id)) throw new BadRequestException("提现单 ID 格式不正确");
    if (!["START_REVIEW", "APPROVE", "REJECT"].includes(action)) throw new BadRequestException("不支持的提现审核操作");
    const cleanNote = typeof note === "string" ? note.trim() : "";
    if (action === "REJECT" && (!cleanNote || cleanNote.length > 500)) throw new BadRequestException("拒绝提现必须填写 1–500 个字符的原因");
    const current = await prisma.withdrawalRequest.findUnique({ where: { id }, select: { id: true, status: true, walletId: true, amountMinor: true, currency: true } });
    if (!current) throw new NotFoundException("提现申请不存在");
    const expected = action === "START_REVIEW" ? "REQUESTED" : "UNDER_REVIEW";
    const next = action === "START_REVIEW" ? "UNDER_REVIEW" : action === "APPROVE" ? "APPROVED" : "REJECTED";
    if (current.status !== expected) throw new ConflictException(`提现单当前状态为 ${current.status}，不能执行此操作`);
    await prisma.$transaction(async tx => {
      const changed = await tx.withdrawalRequest.updateMany({ where: { id, status: expected }, data: { status: next, reviewedById: adminId } });
      if (changed.count !== 1) throw new ConflictException("提现单状态已变化，请刷新后重试");
      await tx.auditEvent.create({
        data: {
          actorType: "ADMIN", actorId: adminId,
          action: action === "START_REVIEW" ? "WITHDRAWAL_REVIEW_STARTED" : action === "APPROVE" ? "WITHDRAWAL_APPROVED" : "WITHDRAWAL_REJECTED",
          targetType: "WITHDRAWAL_REQUEST", targetId: id,
          metadata: { fromStatus: expected, toStatus: next, amountMinor: current.amountMinor.toString(), currency: current.currency.trim(), note: cleanNote || null, balanceReservationReleased: action === "REJECT" },
        },
      });
    }, { isolationLevel: "Serializable" });
    return { id, status: next, balanceReservationReleased: action === "REJECT" };
  }

  async wallets(query: { search?: string; currency?: string; page?: string; pageSize?: string }) {
    const pg = pageArgs(query.page, query.pageSize);
    const where: Prisma.WalletWhereInput = {
      ...(query.currency ? { currency: query.currency.toUpperCase() } : {}),
      ...(query.search ? { OR: [{ user: { phone: { contains: query.search, mode: "insensitive" } } }, ...(isUuid(query.search) ? [{ id: query.search }] : [])] } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.wallet.count({ where }),
      prisma.wallet.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take,
        select: { id: true, userId: true, currency: true, createdAt: true, user: { select: { phone: true } } } }),
    ]);
    const ids = rows.map(x => x.id);
    const [ledger, holds, reserved] = ids.length ? await Promise.all([
      prisma.ledgerEntry.groupBy({ by: ["walletId", "direction"], where: { walletId: { in: ids } }, _sum: { amountMinor: true } }),
      prisma.walletHold.groupBy({ by: ["walletId"], where: { walletId: { in: ids }, status: "ACTIVE" }, _sum: { amountMinor: true } }),
      prisma.withdrawalRequest.groupBy({ by: ["walletId"], where: { walletId: { in: ids }, status: { in: [...RESERVED] } }, _sum: { amountMinor: true } }),
    ]) : [[], [], []];
    const sum = (walletId: string, direction: "CREDIT" | "DEBIT") => ledger.find(x => x.walletId === walletId && x.direction === direction)?._sum.amountMinor ?? 0n;
    return { ...pg, total, items: rows.map(w => {
      const credits = sum(w.id, "CREDIT"), debits = sum(w.id, "DEBIT");
      const frozen = holds.find(x => x.walletId === w.id)?._sum.amountMinor ?? 0n;
      const pending = reserved.find(x => x.walletId === w.id)?._sum.amountMinor ?? 0n;
      const balance = credits - debits;
      return { id: w.id, userId: w.userId, phone: w.user.phone, currency: w.currency.trim(),
        availableMinor: (balance - frozen - pending).toString(), frozenMinor: frozen.toString(),
        pendingWithdrawalMinor: pending.toString(), withdrawalTotalMinor: pending.toString(), createdAt: w.createdAt.toISOString() };
    }) };
  }

  async ledger(walletId: string, page?: string, pageSize?: string) {
    const pg = pageArgs(page, pageSize);
    const where = { walletId };
    const [wallet, total, rows] = await prisma.$transaction([
      prisma.wallet.findUnique({ where: { id: walletId }, select: { id: true, userId: true, currency: true, user: { select: { phone: true } } } }),
      prisma.ledgerEntry.count({ where }),
      prisma.ledgerEntry.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take }),
    ]);
    if (!wallet) return { ...pg, total: 0, wallet: null, items: [] };
    return { ...pg, total, wallet: { id: wallet.id, userId: wallet.userId, phone: wallet.user.phone, currency: wallet.currency.trim() },
      items: rows.map(x => ({ id: x.id, sourceType: x.sourceType, sourceId: x.sourceId, direction: x.direction, amountMinor: x.amountMinor.toString(), currency: x.currency.trim(), createdAt: x.createdAt.toISOString() })) };
  }

  async payoutAccounts(query: { search?: string; status?: string; country?: string; page?: string; pageSize?: string }) {
    const pg = pageArgs(query.page, query.pageSize);
    const where: Prisma.PayoutAccountWhereInput = {
      ...(query.status && query.status !== "ALL" ? { status: query.status === "DISABLED" ? "DISABLED" : "ACTIVE" } : {}),
      ...(query.country ? { countryCode: query.country.toUpperCase() } : {}),
      ...(query.search ? { OR: [{ user: { phone: { contains: query.search, mode: "insensitive" } } }, { accountHolder: { contains: query.search, mode: "insensitive" } }, { maskedAccount: { contains: query.search, mode: "insensitive" } }] } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.payoutAccount.count({ where }),
      prisma.payoutAccount.findMany({ where, orderBy: { updatedAt: "desc" }, skip: pg.skip, take: pg.take,
        select: { id: true, userId: true, countryCode: true, currency: true, providerCode: true, methodCode: true, accountHolder: true, maskedAccount: true, status: true, isDefault: true, createdAt: true, updatedAt: true, user: { select: { phone: true } } } }),
    ]);
    return { ...pg, total, items: rows.map(x => ({ ...x, countryCode: x.countryCode.trim(), currency: x.currency.trim(), createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString() })) };
  }

  private encryptProviderSecret(value: string): { ciphertext: string; iv: string; tag: string } {
    const raw = process.env.FINANCE_CREDENTIALS_KEY;
    if (!raw || !/^[0-9a-f]{64}$/i.test(raw)) {
      throw new BadRequestException("服务端未配置 FINANCE_CREDENTIALS_KEY（需要 64 位十六进制 AES-256 密钥）");
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(raw, "hex"), iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
  }

  private validateProviderInput(input: Record<string, unknown>) {
    const providerCode = typeof input.providerCode === "string" ? input.providerCode.trim().toUpperCase() : "";
    const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
    const countryCode = typeof input.countryCode === "string" ? input.countryCode.trim().toUpperCase() : "";
    const methodCode = typeof input.methodCode === "string" ? input.methodCode.trim().toUpperCase() : "";
    const environment = typeof input.environment === "string" ? input.environment.trim().toUpperCase() : "SANDBOX";
    const apiBaseUrl = typeof input.apiBaseUrl === "string" ? input.apiBaseUrl.trim() : "";
    const merchantId = typeof input.merchantId === "string" ? input.merchantId.trim() : "";
    const supportedCurrencies = Array.isArray(input.supportedCurrencies) ? input.supportedCurrencies.map(x => String(x).trim().toUpperCase()).filter(Boolean) : [];
    const credentials = typeof input.credentials === "string" ? input.credentials.trim() : "";
    const webhookSecret = typeof input.webhookSecret === "string" ? input.webhookSecret.trim() : "";
    if (!/^[A-Z0-9_-]{2,40}$/.test(providerCode)) throw new BadRequestException("服务商代码格式不正确");
    if (!displayName || displayName.length > 80) throw new BadRequestException("请填写代付方式名称（最多 80 个字符）");
    if (!/^(GLOBAL|PK|NG|BD)$/.test(countryCode)) throw new BadRequestException("国家/地区暂只支持 GLOBAL、PK、NG、BD");
    if (!/^[A-Z0-9_-]{2,40}$/.test(methodCode)) throw new BadRequestException("收款渠道代码格式不正确");
    if (!["SANDBOX","PRODUCTION"].includes(environment)) throw new BadRequestException("环境必须是 SANDBOX 或 PRODUCTION");
    if (apiBaseUrl) {
      let parsed: URL;
      try { parsed = new URL(apiBaseUrl); } catch { throw new BadRequestException("API 地址格式不正确"); }
      if (parsed.protocol !== "https:" && !(environment === "SANDBOX" && parsed.hostname === "localhost" && parsed.protocol === "http:")) {
        throw new BadRequestException("API 地址必须使用 HTTPS（沙箱 localhost 除外）");
      }
    }
    if (supportedCurrencies.length > 10 || supportedCurrencies.some(x => !/^[A-Z]{3}$/.test(x))) throw new BadRequestException("出款币种必须为 3 位 ISO 币种代码");
    if (credentials.length > 12000 || webhookSecret.length > 4000) throw new BadRequestException("密钥内容过长");
    return { providerCode, displayName, countryCode, methodCode, environment, apiBaseUrl: apiBaseUrl || null, merchantId: merchantId || null, supportedCurrencies: [...new Set(supportedCurrencies)], credentials, webhookSecret };
  }

  async createProvider(input: Record<string, unknown>) {
    const v = this.validateProviderInput(input);
    const exists = await prisma.paymentProviderConfig.findUnique({ where: { providerCode: v.providerCode } });
    if (exists) throw new ConflictException("服务商代码已存在");
    const credentials = v.credentials ? this.encryptProviderSecret(v.credentials) : null;
    const webhook = v.webhookSecret ? this.encryptProviderSecret(v.webhookSecret) : null;
    const row = await prisma.paymentProviderConfig.create({ data: {
      providerCode: v.providerCode, displayName: v.displayName, countryCode: v.countryCode, methodCode: v.methodCode,
      environment: v.environment, apiBaseUrl: v.apiBaseUrl, merchantId: v.merchantId, supportedCurrencies: v.supportedCurrencies,
      enabled: false,
      ...(credentials ? { credentialsCiphertext: credentials.ciphertext, credentialsIv: credentials.iv, credentialsTag: credentials.tag } : {}),
      ...(webhook ? { webhookSecretCiphertext: webhook.ciphertext, webhookSecretIv: webhook.iv, webhookSecretTag: webhook.tag } : {}),
    }});
    return { ...row, credentialsConfigured: Boolean(credentials), webhookSecretConfigured: Boolean(webhook), credentialsCiphertext: undefined, credentialsIv: undefined, credentialsTag: undefined, webhookSecretCiphertext: undefined, webhookSecretIv: undefined, webhookSecretTag: undefined };
  }

  async updateProvider(providerCode: string, input: Record<string, unknown>) {
    const current = await prisma.paymentProviderConfig.findUnique({ where: { providerCode } });
    if (!current) throw new NotFoundException("代付配置不存在");
    const v = this.validateProviderInput({ ...input, providerCode: current.providerCode });
    const credentials = v.credentials ? this.encryptProviderSecret(v.credentials) : null;
    const webhook = v.webhookSecret ? this.encryptProviderSecret(v.webhookSecret) : null;
    const row = await prisma.paymentProviderConfig.update({ where: { providerCode }, data: {
      displayName: v.displayName, countryCode: v.countryCode, methodCode: v.methodCode, environment: v.environment,
      apiBaseUrl: v.apiBaseUrl, merchantId: v.merchantId, supportedCurrencies: v.supportedCurrencies,
      ...(credentials ? { credentialsCiphertext: credentials.ciphertext, credentialsIv: credentials.iv, credentialsTag: credentials.tag } : {}),
      ...(webhook ? { webhookSecretCiphertext: webhook.ciphertext, webhookSecretIv: webhook.iv, webhookSecretTag: webhook.tag } : {}),
    }});
    return { ...row, credentialsConfigured: Boolean(credentials || current.credentialsCiphertext), webhookSecretConfigured: Boolean(webhook || current.webhookSecretCiphertext), credentialsCiphertext: undefined, credentialsIv: undefined, credentialsTag: undefined, webhookSecretCiphertext: undefined, webhookSecretIv: undefined, webhookSecretTag: undefined };
  }

  async setProviderEnabled(providerCode: string, enabled: boolean) {
    const current = await prisma.paymentProviderConfig.findUnique({ where: { providerCode } });
    if (!current) throw new NotFoundException("代付配置不存在");
    if (enabled && (!current.credentialsCiphertext || !current.apiBaseUrl || !current.merchantId || !current.supportedCurrencies.length)) {
      throw new BadRequestException("启用前必须配置 API 地址、商户号、API 密钥和出款币种");
    }
    const row = await prisma.paymentProviderConfig.update({ where: { providerCode }, data: { enabled } });
    return { providerCode: row.providerCode, enabled: row.enabled, updatedAt: row.updatedAt.toISOString() };
  }

  async providers() {
    const rows = await prisma.paymentProviderConfig.findMany({ orderBy: { providerCode: "asc" },
      select: { providerCode: true, displayName: true, countryCode: true, methodCode: true, apiBaseUrl: true, merchantId: true, environment: true, enabled: true, supportedCurrencies: true, credentialsCiphertext: true, webhookSecretCiphertext: true, createdAt: true, updatedAt: true } });
    return rows.map(x => ({ providerCode: x.providerCode, displayName: x.displayName, countryCode: x.countryCode, methodCode: x.methodCode, apiBaseUrl: x.apiBaseUrl, merchantId: x.merchantId, environment: x.environment, enabled: x.enabled, supportedCurrencies: x.supportedCurrencies, credentialsConfigured: Boolean(x.credentialsCiphertext), webhookSecretConfigured: Boolean(x.webhookSecretCiphertext), createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString() }));
  }

  async transactions(query: { search?: string; status?: string; page?: string; pageSize?: string }) {
    const pg = pageArgs(query.page, query.pageSize);
    const where: Prisma.PaymentTransactionWhereInput = {
      ...(query.status && query.status !== "ALL" && ["CREATED","PENDING","PROCESSING","SUCCEEDED","FAILED","CANCELLED"].includes(query.status) ? { status: query.status as Prisma.EnumPaymentTransactionStatusFilter["equals"] } : {}),
      ...(query.search ? { OR: [...(isUuid(query.search) ? [{ id: query.search }] : []), { user: { phone: { contains: query.search, mode: "insensitive" } } }, { providerReference: { contains: query.search, mode: "insensitive" } }] } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.paymentTransaction.count({ where }),
      prisma.paymentTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take,
        select: { id: true, userId: true, providerCode: true, flow: true, status: true, amountMinor: true, currency: true, providerTransactionId: true, providerReference: true, failureCode: true, failureMessage: true, createdAt: true, updatedAt: true, user: { select: { phone: true } } } }),
    ]);
    return { ...pg, total, items: rows.map(x => ({ ...x, phone: x.user.phone, amountMinor: x.amountMinor.toString(), currency: x.currency.trim(), createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString(), user: undefined })) };
  }
}
