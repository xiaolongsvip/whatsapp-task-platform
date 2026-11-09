import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@wtp/database";
import { startOfDay } from "./dashboard.service";
import { ExchangeRatesService } from "./exchange-rates.service";

const RESERVED_STATUSES = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] as const;
const currencyDigits = (currency: string) => {
  try { return Math.max(0, new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits); }
  catch { return 2; }
};
const configuredMinor = (amount: unknown, currency: string) =>
  BigInt(Math.round(Number(amount ?? 0) * (10 ** currencyDigits(currency))));

type WithdrawalContext = {
  account: { id: string; currency: string; countryCode: string; methodCode: string; providerCode: string };
  rule: Record<string, unknown>;
  providerCode: string;
  walletCurrency: string;
  payoutCurrency: string;
  countryCode: string;
  methodCode: string;
};

@Injectable()
export class WithdrawalsService {
  constructor(private readonly exchangeRates: ExchangeRatesService) {}

  private async context(userId: string, payoutAccountId: string): Promise<WithdrawalContext> {
    const account = await prisma.payoutAccount.findFirst({
      where: { id: payoutAccountId, userId, status: "ACTIVE" },
      select: { id: true, currency: true, countryCode: true, methodCode: true, providerCode: true },
    });
    if (!account) throw new BadRequestException("Select an active payout account belonging to your account.");
    const payoutCurrency = account.currency.trim().toUpperCase();
    const countryCode = account.countryCode.trim().toUpperCase();
    const methodCode = account.methodCode.trim().toUpperCase();
    const rulesRow = await prisma.taskConfiguration.findUnique({ where: { key: "system.withdrawalRules" }, select: { value: true } });
    const rules = Array.isArray(rulesRow?.value) ? rulesRow.value as Array<Record<string, unknown>> : [{ countryCode: "PK", walletCurrency: "USD", payoutCurrency: "PKR", method: "LOCAL_ACCOUNT", status: "ENABLED", minimumAmount: 1, maximumAmount: 1000, dailyLimit: 5000000, channels: ["jazzcash", "easypaisa"] }];
    const matchesRule = (item: Record<string, unknown>) =>
      item.status === "ENABLED" &&
      String(item.payoutCurrency ?? "").trim().toUpperCase() === payoutCurrency &&
      Array.isArray(item.channels) && item.channels.some(channel => String(channel).trim().toUpperCase() === methodCode);
    const exactRules = rules.filter(item => String(item.countryCode ?? "").trim().toUpperCase() === countryCode && matchesRule(item));
    const globalRules = exactRules.length === 0 ? rules.filter(item => String(item.countryCode ?? "").trim().toUpperCase() === "GLOBAL" && matchesRule(item)) : [];
    const matchingRules = exactRules.length > 0 ? exactRules : globalRules;
    if (matchingRules.length > 1) throw new BadRequestException("Multiple withdrawal rules match this payout account. Please ask the administrator to resolve the configuration.");
    const rule = matchingRules[0];
    if (!rule) throw new BadRequestException("No active withdrawal rule is configured for this payout account.");
    const walletCurrency = String(rule.walletCurrency ?? "").trim().toUpperCase();
    const ruleMethod = String(rule.method ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(walletCurrency) || !/^[A-Z]{3}$/.test(payoutCurrency)) {
      throw new BadRequestException("The withdrawal rule contains an invalid wallet or payout currency.");
    }
    const providers = await prisma.paymentProviderConfig.findMany({
      where: { enabled: true, countryCode: { in: [countryCode, "GLOBAL"] }, supportedCurrencies: { has: payoutCurrency } },
      select: { providerCode: true, methodCode: true, supportedChannels: true },
    });
    const matches = providers.filter(provider =>
      [ruleMethod, methodCode].includes(provider.methodCode.trim().toUpperCase()) &&
      provider.supportedChannels.some(channel => channel.trim().toUpperCase() === methodCode)
    );
    let providerCode = account.providerCode.trim().toUpperCase();
    if (providerCode === "MANUAL-PK") {
      if (matches.length !== 1) throw new BadRequestException("The legacy payout account cannot be matched to exactly one enabled provider. Please update the payout account.");
      providerCode = matches[0].providerCode;
    }
    if (!matches.some(provider => provider.providerCode === providerCode)) {
      throw new BadRequestException("The selected payout provider is not enabled for this country, currency and method.");
    }
    return { account, rule, providerCode, walletCurrency, payoutCurrency, countryCode, methodCode };
  }

  async quote(userId: string, payoutAccountId: string, amountMinorInput?: string) {
    const context = await this.context(userId, payoutAccountId);
    const rate = await this.exchangeRates.getRate(context.walletCurrency, context.payoutCurrency);
    const amountMinor = amountMinorInput ? BigInt(amountMinorInput) : null;
    const payoutAmountMinor = amountMinor === null ? null :
      this.exchangeRates.toPayoutMinor(amountMinor, context.walletCurrency, context.payoutCurrency, rate.rate);
    return {
      walletCurrency: context.walletCurrency,
      payoutCurrency: context.payoutCurrency,
      rate: rate.rate.toFixed(12),
      rateSource: rate.source,
      rateFetchedAt: rate.fetchedAt,
      rateProviderUpdatedAt: rate.providerUpdatedAt ?? null,
      rateEffectiveAt: rate.effectiveAt ?? null,
      rateMarketSession: rate.marketSession ?? null,
      rateStale: rate.stale,
      amountMinor: amountMinor?.toString() ?? null,
      payoutAmountMinor: payoutAmountMinor?.toString() ?? null,
      feeAmountMinor: "0",
      feeCurrency: context.payoutCurrency,
      minimumAmount: Number(context.rule.minimumAmount ?? 0),
      maximumAmount: Number(context.rule.maximumAmount ?? 0),
      dailyLimit: Number(context.rule.dailyLimit ?? 0),
      providerCode: context.providerCode,
    };
  }

  async create(userId: string, payoutAccountId: string, amountMinorInput: string, timezone = "UTC") {
    let amountMinor: bigint;
    try { amountMinor = BigInt(amountMinorInput); }
    catch { throw new BadRequestException("Withdrawal amount is invalid."); }
    if (amountMinor <= 0n || amountMinor > 9223372036854775807n) {
      throw new BadRequestException("Withdrawal amount must be greater than zero.");
    }

    // Fetch the latest rate before opening the serializable transaction. The exact
    // rate and converted payout amount are then frozen on the withdrawal record.
    const context = await this.context(userId, payoutAccountId);
    const rate = await this.exchangeRates.getRate(context.walletCurrency, context.payoutCurrency);
    const payoutAmountMinor = this.exchangeRates.toPayoutMinor(amountMinor, context.walletCurrency, context.payoutCurrency, rate.rate);
    const minimumMinor = configuredMinor(context.rule.minimumAmount, context.walletCurrency);
    const maximumMinor = configuredMinor(context.rule.maximumAmount, context.walletCurrency);
    const dailyLimitMinor = configuredMinor(context.rule.dailyLimit, context.walletCurrency);
    if (amountMinor < minimumMinor) throw new BadRequestException("Withdrawal amount is below the configured minimum.");
    if (maximumMinor <= 0n || amountMinor > maximumMinor) throw new BadRequestException("Withdrawal amount exceeds the configured per-request maximum.");
    if (dailyLimitMinor <= 0n) throw new BadRequestException("The daily withdrawal limit is not configured correctly.");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
          const account = await tx.payoutAccount.findFirst({
            where: { id: payoutAccountId, userId, status: "ACTIVE" },
            select: { id: true, currency: true, countryCode: true, methodCode: true, providerCode: true },
          });
          if (!account || account.currency.trim().toUpperCase() !== context.payoutCurrency ||
            account.countryCode.trim().toUpperCase() !== context.countryCode ||
            account.methodCode.trim().toUpperCase() !== context.methodCode) {
            throw new BadRequestException("The payout account changed. Please refresh and try again.");
          }
          const rulesRow = await tx.taskConfiguration.findUnique({ where: { key: "system.withdrawalRules" }, select: { value: true } });
          const rules = Array.isArray(rulesRow?.value) ? rulesRow.value as Array<Record<string, unknown>> : [{ countryCode: "PK", walletCurrency: "USD", payoutCurrency: "PKR", method: "LOCAL_ACCOUNT", status: "ENABLED", minimumAmount: 1, maximumAmount: 1000, dailyLimit: 5000000, channels: ["jazzcash", "easypaisa"] }];
          const matchesCurrentRule = (item: Record<string, unknown>) =>
            item.status === "ENABLED" &&
            String(item.walletCurrency ?? "").trim().toUpperCase() === context.walletCurrency &&
            String(item.payoutCurrency ?? "").trim().toUpperCase() === context.payoutCurrency &&
            Array.isArray(item.channels) && item.channels.some(channel => String(channel).trim().toUpperCase() === context.methodCode);
          const exactCurrentRules = rules.filter(item => String(item.countryCode ?? "").trim().toUpperCase() === context.countryCode && matchesCurrentRule(item));
          const globalCurrentRules = exactCurrentRules.length === 0 ? rules.filter(item => String(item.countryCode ?? "").trim().toUpperCase() === "GLOBAL" && matchesCurrentRule(item)) : [];
          const matchingCurrentRules = exactCurrentRules.length > 0 ? exactCurrentRules : globalCurrentRules;
          if (matchingCurrentRules.length !== 1) throw new BadRequestException("The withdrawal configuration changed or is ambiguous. Please refresh and contact support.");
          const currentRule = matchingCurrentRules[0];
          const currentMinimumMinor = configuredMinor(currentRule.minimumAmount, context.walletCurrency);
          const currentMaximumMinor = configuredMinor(currentRule.maximumAmount, context.walletCurrency);
          const currentDailyLimitMinor = configuredMinor(currentRule.dailyLimit, context.walletCurrency);
          if (amountMinor < currentMinimumMinor || currentMaximumMinor <= 0n || amountMinor > currentMaximumMinor || currentDailyLimitMinor <= 0n) {
            throw new BadRequestException("Withdrawal limits changed. Please refresh the quote and try again.");
          }
          const provider = await tx.paymentProviderConfig.findUnique({
            where: { providerCode: context.providerCode },
            select: { providerCode: true, countryCode: true, methodCode: true, supportedChannels: true, supportedCurrencies: true, enabled: true },
          });
          const ruleMethod = String(currentRule.method ?? "").trim().toUpperCase();
          if (!provider || !provider.enabled ||
            ![context.countryCode, "GLOBAL"].includes(provider.countryCode.trim().toUpperCase()) ||
            ![ruleMethod, context.methodCode].includes(provider.methodCode.trim().toUpperCase()) ||
            !provider.supportedCurrencies.some(value => value.trim().toUpperCase() === context.payoutCurrency) ||
            !provider.supportedChannels.some(channel => channel.trim().toUpperCase() === context.methodCode)) {
            throw new BadRequestException("The selected payout provider is no longer enabled for this withdrawal.");
          }
          if (account.providerCode.trim().toUpperCase() === "MANUAL-PK") {
            await tx.payoutAccount.update({ where: { id: account.id }, data: { providerCode: context.providerCode } });
          }

          const wallet = await tx.wallet.findUnique({
            where: { userId_currency: { userId, currency: context.walletCurrency } },
            select: { id: true, currency: true },
          });
          if (!wallet) throw new BadRequestException("No wallet is available for " + context.walletCurrency + ".");
          const dayStart = startOfDay(timezone);
          const dailyUsed = await tx.withdrawalRequest.aggregate({
            where: { walletId: wallet.id, createdAt: { gte: dayStart }, status: { notIn: ["REJECTED", "FAILED", "CANCELLED"] } },
            _sum: { amountMinor: true },
          });
          if ((dailyUsed._sum.amountMinor ?? 0n) + amountMinor > currentDailyLimitMinor) {
            throw new BadRequestException("This withdrawal would exceed the configured daily withdrawal limit.");
          }
          const [entries, withdrawals, holds] = await Promise.all([
            tx.ledgerEntry.findMany({ where: { walletId: wallet.id }, select: { direction: true, amountMinor: true } }),
            tx.withdrawalRequest.findMany({ where: { walletId: wallet.id, status: { in: [...RESERVED_STATUSES] } }, select: { amountMinor: true } }),
            tx.walletHold.aggregate({ where: { walletId: wallet.id, status: "ACTIVE" }, _sum: { amountMinor: true } }),
          ]);
          const credited = entries.filter(entry => entry.direction === "CREDIT").reduce((sum, entry) => sum + entry.amountMinor, 0n);
          const debited = entries.filter(entry => entry.direction === "DEBIT").reduce((sum, entry) => sum + entry.amountMinor, 0n);
          const reserved = withdrawals.reduce((sum, item) => sum + item.amountMinor, 0n);
          const frozen = holds._sum.amountMinor ?? 0n;
          const available = credited - debited - reserved - frozen;
          if (amountMinor > available) throw new BadRequestException("Insufficient available balance.");

          const request = await tx.withdrawalRequest.create({
            data: {
              walletId: wallet.id, payoutAccountId: account.id,
              amountMinor, currency: context.walletCurrency,
              payoutCurrency: context.payoutCurrency, payoutAmountMinor,
              exchangeRate: rate.rate.toFixed(12), exchangeRateSource: rate.source, exchangeRateFetchedAt: new Date(rate.fetchedAt), exchangeRateProviderUpdatedAt: rate.providerUpdatedAt ? new Date(rate.providerUpdatedAt) : null, exchangeRateEffectiveAt: rate.effectiveAt ? new Date(rate.effectiveAt) : null,
              feeAmountMinor: 0n, feeCurrency: context.payoutCurrency,
              payoutMethod: context.methodCode, payoutProviderCode: context.providerCode,
              status: "REQUESTED",
            },
            select: {
              id: true, amountMinor: true, currency: true, payoutCurrency: true,
              payoutAmountMinor: true, exchangeRate: true, exchangeRateSource: true,
              feeAmountMinor: true, feeCurrency: true, status: true, payoutAccountId: true, createdAt: true,
            },
          });
          return {
            success: true,
            item: {
              ...request,
              amountMinor: request.amountMinor.toString(),
              currency: request.currency.trim(),
              payoutCurrency: request.payoutCurrency?.trim() ?? context.payoutCurrency,
              payoutAmountMinor: request.payoutAmountMinor?.toString() ?? payoutAmountMinor.toString(),
              exchangeRate: request.exchangeRate?.toString() ?? rate.rate.toFixed(12),
              feeAmountMinor: request.feeAmountMinor?.toString() ?? "0",
              feeCurrency: request.feeCurrency?.trim() ?? context.payoutCurrency,
              createdAt: request.createdAt.toISOString(),
            },
            availableBalanceMinor: (available - amountMinor).toString(),
          };
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
        if (code === "P2034" && attempt < 2) continue;
        throw error;
      }
    }
    throw new BadRequestException("Unable to create withdrawal request. Please try again.");
  }
}
