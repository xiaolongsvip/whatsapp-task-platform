import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@wtp/database";
import { EmailVerificationService } from "./email-verification.service";

const RESERVED_STATUSES = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] as const;

@Injectable()
export class WithdrawalsService {\n  constructor(private readonly emailVerification: EmailVerificationService) {}\n
  async create(userId: string, payoutAccountId: string, amountMinorInput: string) {
    const amountMinor = BigInt(amountMinorInput);
    if (amountMinor <= 0n || amountMinor > 9223372036854775807n) {
      throw new BadRequestException("Withdrawal amount must be greater than zero.");
    }

    // Serializable isolation prevents concurrent requests from spending the same
    // available balance. Retry serialization conflicts a small number of times.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
          const account = await tx.payoutAccount.findFirst({
            where: { id: payoutAccountId, userId, status: "ACTIVE" },
            select: { id: true, currency: true },
          });
          if (!account) {
            throw new BadRequestException("Select an active payout account belonging to your account.");
          }

          const currency = account.currency.trim().toUpperCase();
          const rulesRow = await tx.taskConfiguration.findUnique({ where: { key: "system.withdrawalRules" }, select: { value: true } });
          const rules = Array.isArray(rulesRow?.value) ? rulesRow.value as Array<Record<string, unknown>> : [{
            countryCode: "PK", walletCurrency: "USD", method: "LOCAL_ACCOUNT", status: "ENABLED",
            minimumAmount: 1, maximumAmount: 1000, dailyLimit: 5000000, channels: ["jazzcash", "easypaisa"],
          }];
          const activeRules = rules.filter(rule => rule.status === "ENABLED");
          const accountCountry = account.countryCode.trim().toUpperCase();
          const accountMethod = account.methodCode.trim().toUpperCase();
          const rule = activeRules.find(item =>
            String(item.countryCode ?? "").toUpperCase() === accountCountry &&
            String(item.walletCurrency ?? "").toUpperCase() === currency &&
            String(item.method ?? "").toUpperCase() === accountMethod
          ) ?? activeRules.find(item =>
            String(item.countryCode ?? "").toUpperCase() === "GLOBAL" &&
            String(item.walletCurrency ?? "").toUpperCase() === currency &&
            String(item.method ?? "").toUpperCase() === accountMethod
          );
          if (!rule) throw new BadRequestException("No active withdrawal rule is configured for this country, wallet currency and payout method.");
          const channels = Array.isArray(rule.channels) ? rule.channels.map(x => String(x).toLowerCase()) : [];
          if (channels.length && !channels.includes(account.providerCode.trim().toLowerCase())) {
            throw new BadRequestException("The selected payout channel is not enabled by the current withdrawal rule.");
          }
          const minimumMinor = BigInt(Math.round(Number(rule.minimumAmount ?? 0) * 100));
          const maximumMinor = BigInt(Math.round(Number(rule.maximumAmount ?? 0) * 100));
          const dailyLimitMinor = BigInt(Math.round(Number(rule.dailyLimit ?? 0) * 100));
          if (amountMinor < minimumMinor) throw new BadRequestException("Withdrawal amount is below the configured minimum.");
          if (maximumMinor <= 0n || amountMinor > maximumMinor) throw new BadRequestException("Withdrawal amount exceeds the configured per-request maximum.");
          if (dailyLimitMinor <= 0n) throw new BadRequestException("The daily withdrawal limit is not configured correctly.");
          const wallet = await tx.wallet.findUnique({
            where: { userId_currency: { userId, currency } },
            select: { id: true, currency: true },
          });
          if (!wallet) {
            throw new BadRequestException("No wallet is available for this payout currency.");
          }
          const dayStart = new Date();
          dayStart.setUTCHours(0, 0, 0, 0);
          const dailyUsed = await tx.withdrawalRequest.aggregate({
            where: { walletId: wallet.id, createdAt: { gte: dayStart }, status: { notIn: ["REJECTED", "FAILED", "CANCELLED"] } },
            _sum: { amountMinor: true },
          });
          if ((dailyUsed._sum.amountMinor ?? 0n) + amountMinor > dailyLimitMinor) {
            throw new BadRequestException("This withdrawal would exceed the configured daily withdrawal limit.");
          }

          const [entries, withdrawals, holds] = await Promise.all([
            tx.ledgerEntry.findMany({
              where: { walletId: wallet.id },
              select: { direction: true, amountMinor: true },
            }),
            tx.withdrawalRequest.findMany({
              where: { walletId: wallet.id, status: { in: [...RESERVED_STATUSES] } },
              select: { amountMinor: true },
            }),
            tx.walletHold.aggregate({ where: { walletId: wallet.id, status: "ACTIVE" }, _sum: { amountMinor: true } }),
          ]);

          const credited = entries
            .filter((entry) => entry.direction === "CREDIT")
            .reduce((sum, entry) => sum + entry.amountMinor, 0n);
          const debited = entries
            .filter((entry) => entry.direction === "DEBIT")
            .reduce((sum, entry) => sum + entry.amountMinor, 0n);
          const reserved = withdrawals.reduce((sum, item) => sum + item.amountMinor, 0n);
          const frozen = holds._sum.amountMinor ?? 0n;
          const available = credited - debited - reserved - frozen;

          if (amountMinor > available) {
            throw new BadRequestException("Insufficient available balance.");
          }

          const request = await tx.withdrawalRequest.create({
            data: {
              walletId: wallet.id,
              payoutAccountId: account.id,
              amountMinor,
              currency,
              status: "REQUESTED",
            },
            select: {
              id: true,
              amountMinor: true,
              currency: true,
              status: true,
              payoutAccountId: true,
              createdAt: true,
            },
          });

          return {
            success: true,
            item: {
              ...request,
              amountMinor: request.amountMinor.toString(),
              currency: request.currency.trim(),
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
