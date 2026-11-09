import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { prisma } from "@wtp/database";

type PayoutAccountInput = {
  countryCode: string;
  currency: string;
  providerCode: string;
  methodCode: string;
  accountHolder: string;
  accountNumber: string;
  phoneNumber?: string;
};

function encryptionKey(): Buffer {
  const raw = process.env.PAYOUT_DATA_ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new InternalServerErrorException("PAYOUT_DATA_ENCRYPTION_KEY must be configured as 32-byte hex.");
  }
  return Buffer.from(raw, "hex");
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    accountDetailsCiphertext: ciphertext.toString("base64"),
    accountDetailsIv: iv.toString("base64"),
    accountDetailsTag: cipher.getAuthTag().toString("base64"),
  };
}

@Injectable()
export class PayoutAccountsService {
  async options() {
    const rulesRow = await prisma.taskConfiguration.findUnique({ where: { key: "system.withdrawalRules" }, select: { value: true } });
    const rules = Array.isArray(rulesRow?.value) ? rulesRow.value as Array<Record<string, unknown>> : [{ id: "default-pk-usd-local", countryCode: "PK", countryName: "Pakistan", walletCurrency: "USD", payoutCurrency: "PKR", method: "LOCAL_ACCOUNT", channels: ["jazzcash", "easypaisa"], minimumAmount: 1, maximumAmount: 1000, dailyLimit: 5000000, status: "ENABLED" }];
    const providers = await prisma.paymentProviderConfig.findMany({
      where: { enabled: true },
      select: { providerCode: true, displayName: true, countryCode: true, methodCode: true, supportedChannels: true, supportedCurrencies: true },
      orderBy: { displayName: "asc" },
    });
    const catalogRow = await prisma.taskConfiguration.findUnique({ where: { key: "system.payoutCatalogs" }, select: { value: true } });
    const catalogs = catalogRow?.value as any;
    const countryCatalog = Array.isArray(catalogs?.countries) ? catalogs.countries : [];
    const currencyCatalog = Array.isArray(catalogs?.currencies) ? catalogs.currencies : [];
    const methodCatalog = Array.isArray(catalogs?.methods) ? catalogs.methods : [];
    const items: Array<Record<string, unknown>> = [];
    for (const rule of rules.filter(item => item.status === "ENABLED")) {
      const ruleCountry = String(rule.countryCode ?? "").trim().toUpperCase();
      const walletCurrency = String(rule.walletCurrency ?? "").trim().toUpperCase();
      const payoutCurrency = String(rule.payoutCurrency ?? "").trim().toUpperCase();
      const channels = Array.isArray(rule.channels) ? rule.channels.map(value => String(value).trim().toLowerCase()) : [];
      if (!/^[A-Z]{3}$/.test(walletCurrency) || !/^[A-Z]{3}$/.test(payoutCurrency)) continue;
      const configuredCountry = countryCatalog.find((item: any) => String(item.code).toUpperCase() === ruleCountry);
      const configuredCurrency = currencyCatalog.find((item: any) => String(item.code).toUpperCase() === payoutCurrency);
      if (countryCatalog.length && ruleCountry !== "GLOBAL" && (!configuredCountry || configuredCountry.enabled === false)) continue;
      const configuredWalletCurrency = currencyCatalog.find((item: any) => String(item.code).toUpperCase() === walletCurrency);
      if (currencyCatalog.length && (!configuredCurrency || configuredCurrency.enabled === false || !configuredWalletCurrency || configuredWalletCurrency.enabled === false)) continue;
      for (const channel of channels) {
        const configuredMethod = methodCatalog.find((item: any) => String(item.channel ?? item.code).toLowerCase() === channel);
        if (methodCatalog.length && (!configuredMethod || configuredMethod.enabled === false)) continue;
        if (configuredMethod?.countryCodes?.length && !configuredMethod.countryCodes.map((x: string) => x.toUpperCase()).includes(ruleCountry)) continue;
        if (configuredMethod?.currencyCodes?.length && !configuredMethod.currencyCodes.map((x: string) => x.toUpperCase()).includes(payoutCurrency)) continue;
        const duplicateRules = rules.filter(other =>
          other.status === "ENABLED" &&
          String(other.countryCode ?? "").trim().toUpperCase() === ruleCountry &&
          String(other.payoutCurrency ?? "").trim().toUpperCase() === payoutCurrency &&
          Array.isArray(other.channels) && other.channels.some(value => String(value).trim().toLowerCase() === channel)
        );
        if (duplicateRules.length > 1) continue;
        const matches = providers.filter(provider =>
          (ruleCountry === "GLOBAL" || [ruleCountry, "GLOBAL"].includes(provider.countryCode.trim().toUpperCase())) &&
          provider.supportedCurrencies.some(value => value.trim().toUpperCase() === payoutCurrency) &&
          provider.supportedChannels.some(value => value.trim().toLowerCase() === channel) &&
          [String(rule.method ?? "").trim().toUpperCase(), channel.toUpperCase()].includes(provider.methodCode.trim().toUpperCase())
        );
        for (const provider of matches) {
          const countryCode = ruleCountry === "GLOBAL" ? provider.countryCode.trim().toUpperCase() : ruleCountry;
          if (!/^[A-Z]{2}$/.test(countryCode)) continue;
          if (ruleCountry === "GLOBAL" && rules.some(other =>
            other.status === "ENABLED" &&
            String(other.countryCode ?? "").trim().toUpperCase() === countryCode &&
            String(other.payoutCurrency ?? "").trim().toUpperCase() === payoutCurrency &&
            Array.isArray(other.channels) && other.channels.some(value => String(value).trim().toLowerCase() === channel)
          )) continue;
          items.push({
            countryCode, countryName: ruleCountry === "GLOBAL" ? countryCode : String(rule.countryName ?? countryCode),
            walletCurrency, payoutCurrency, methodCode: channel,
            methodName: channel.replace(/[_-]/g, " ").replace(/\b\w/g, value => value.toUpperCase()),
            providerCode: provider.providerCode, providerName: provider.displayName,
            minimumAmount: Number(rule.minimumAmount ?? 0),
            maximumAmount: Number(rule.maximumAmount ?? 0),
            dailyLimit: Number(rule.dailyLimit ?? 0),
          });
        }
      }
    }
    const unique = new Map(items.map(item => [String(item.providerCode) + "|" + String(item.countryCode) + "|" + String(item.walletCurrency) + "|" + String(item.payoutCurrency) + "|" + String(item.methodCode), item]));
    return { items: [...unique.values()] };
  }
  async list(userId: string) {
    const rows = await prisma.payoutAccount.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: {
        id: true, countryCode: true, currency: true, providerCode: true,
        methodCode: true, accountHolder: true, maskedAccount: true,
        isDefault: true, createdAt: true,
      },
    });
    return { items: rows.map((row) => ({ ...row, currency: row.currency.trim(), countryCode: row.countryCode.trim(), createdAt: row.createdAt.toISOString() })) };
  }

  async create(userId: string, input: PayoutAccountInput) {
    const countryCode = input.countryCode.trim().toUpperCase();
    const currency = input.currency.trim().toUpperCase();
    const providerCode = input.providerCode.trim().toLowerCase();
    const methodCode = input.methodCode.trim().toLowerCase();
    const accountNumber = input.accountNumber.replace(/\s+/g, "");
    const accountHolder = input.accountHolder.trim();
    if (!/^[A-Z]{2}$/.test(countryCode) || !/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException("Invalid country or currency code.");
    }
    if (!/^[a-z0-9_-]{2,40}$/.test(providerCode) || !/^[a-z0-9_-]{2,40}$/.test(methodCode)) {
      throw new BadRequestException("Invalid payout provider or method.");
    }
    if (accountNumber.length < 5 || accountNumber.length > 80 || !accountHolder || accountHolder.length > 120) {
      throw new BadRequestException("Invalid payout account details.");
    }
    const rulesRow = await prisma.taskConfiguration.findUnique({ where: { key: "system.withdrawalRules" }, select: { value: true } });
    const rules = Array.isArray(rulesRow?.value) ? rulesRow.value as Array<Record<string, unknown>> : [{ id: "default-pk-usd-local", countryCode: "PK", countryName: "Pakistan", walletCurrency: "USD", payoutCurrency: "PKR", method: "LOCAL_ACCOUNT", channels: ["jazzcash", "easypaisa"], minimumAmount: 1, maximumAmount: 1000, dailyLimit: 5000000, status: "ENABLED" }];
    const matchesRule = (rule: Record<string, unknown>) =>
      rule.status === "ENABLED" &&
      String(rule.payoutCurrency ?? "").trim().toUpperCase() === currency &&
      Array.isArray(rule.channels) && rule.channels.some(channel => String(channel).trim().toLowerCase() === methodCode);
    const exactRules = rules.filter(rule => String(rule.countryCode ?? "").trim().toUpperCase() === countryCode && matchesRule(rule));
    const globalRules = exactRules.length === 0 ? rules.filter(rule => String(rule.countryCode ?? "").trim().toUpperCase() === "GLOBAL" && matchesRule(rule)) : [];
    const matchingRules = exactRules.length > 0 ? exactRules : globalRules;
    if (matchingRules.length > 1) throw new BadRequestException("Multiple withdrawal rules match this payout account. Please contact support.");
    const eligibleRule = matchingRules[0];
    if (!eligibleRule) throw new BadRequestException("This country, payout currency and method are not currently enabled for withdrawals.");
    const ruleMethod = String(eligibleRule.method ?? "").trim().toUpperCase();
    const providerMatchesMethod = (provider: { methodCode: string; supportedChannels: string[] }) =>
      [ruleMethod, methodCode.toUpperCase()].includes(provider.methodCode.trim().toUpperCase()) &&
      provider.supportedChannels.some(channel => channel.trim().toLowerCase() === methodCode);

    // Older APP versions send the legacy "manual-pk" placeholder. Resolve it
    // only when one enabled provider matches the configured withdrawal rule.
    let resolvedProviderCode = providerCode.toUpperCase();
    if (providerCode === "manual-pk") {
      const candidates = await prisma.paymentProviderConfig.findMany({
        where: { enabled: true, countryCode: { in: [countryCode, "GLOBAL"] }, supportedCurrencies: { has: currency } },
        select: { providerCode: true, methodCode: true, supportedChannels: true },
      });
      const matches = candidates.filter(provider => providerMatchesMethod(provider));
      if (matches.length !== 1) {
        throw new BadRequestException(matches.length === 0
          ? "No enabled payout provider is configured for this country, currency and method."
          : "More than one payout provider matches this account method. Please contact support.");
      }
      resolvedProviderCode = matches[0].providerCode;
    } else {
      const provider = await prisma.paymentProviderConfig.findUnique({
        where: { providerCode: resolvedProviderCode },
        select: { providerCode: true, countryCode: true, methodCode: true, supportedChannels: true, supportedCurrencies: true, enabled: true },
      });
      if (!provider || !provider.enabled ||
        ![countryCode, "GLOBAL"].includes(provider.countryCode.trim().toUpperCase()) ||
        !provider.supportedCurrencies.some(value => value.trim().toUpperCase() === currency) ||
        !providerMatchesMethod(provider)) {
        throw new BadRequestException("The selected payout provider is not enabled for this country, currency and method.");
      }
    }
    const details = JSON.stringify({ accountNumber, phoneNumber: input.phoneNumber?.trim() || null });
    const encrypted = encrypt(details);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const row = await prisma.$transaction(async (tx) => {
          const existing = await tx.payoutAccount.count({ where: { userId, status: "ACTIVE" } });
          return tx.payoutAccount.create({
            data: {
              userId, countryCode, currency, providerCode: resolvedProviderCode, methodCode, accountHolder,
              ...encrypted,
              maskedAccount: accountNumber.length <= 4 ? "••••" : "••••" + accountNumber.slice(-4),
              isDefault: existing === 0,
            },
            select: {
              id: true, countryCode: true, currency: true, providerCode: true,
              methodCode: true, accountHolder: true, maskedAccount: true,
              isDefault: true, createdAt: true,
            },
          });
        }, { isolationLevel: "Serializable" });
        return { ...row, countryCode: row.countryCode.trim(), currency: row.currency.trim(), createdAt: row.createdAt.toISOString() };
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
        if (code === "P2034" && attempt < 2) continue;
        throw error;
      }
    }
    throw new BadRequestException("Unable to save payout account. Please try again.");
  }

  async remove(userId: string, accountId: string) {
    return prisma.$transaction(async (tx) => {
      const account = await tx.payoutAccount.findFirst({
        where: { id: accountId, userId, status: "ACTIVE" },
      });
      if (!account) throw new BadRequestException("Payout account not found.");

      const linked = await tx.withdrawalRequest.count({
        where: {
          payoutAccountId: accountId,
          status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] },
        },
      });
      if (linked > 0) {
        throw new BadRequestException("This payout account is linked to a pending withdrawal.");
      }

      await tx.payoutAccount.update({
        where: { id: accountId },
        data: { status: "DISABLED", isDefault: false },
      });

      // Only replace the default when the removed account was the default.
      // Removing a secondary account must not create a second default.
      if (account.isDefault) {
        const replacement = await tx.payoutAccount.findFirst({
          where: { userId, status: "ACTIVE" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        if (replacement) {
          await tx.payoutAccount.update({
            where: { id: replacement.id },
            data: { isDefault: true },
          });
        }
      }
      return { success: true };
    }, { isolationLevel: "Serializable" });
  }
}
