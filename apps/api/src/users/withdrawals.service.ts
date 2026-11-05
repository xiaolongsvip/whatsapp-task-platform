import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@wtp/database";

const RESERVED_STATUSES = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] as const;

@Injectable()
export class WithdrawalsService {
  async create(userId: string, payoutAccountId: string, amountMinorInput: string) {
    const amountMinor = BigInt(amountMinorInput);
    if (amountMinor <= 0n) {
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
          const wallet = await tx.wallet.findUnique({
            where: { userId_currency: { userId, currency } },
            select: { id: true, currency: true },
          });
          if (!wallet) {
            throw new BadRequestException("No wallet is available for this payout currency.");
          }

          const [entries, withdrawals] = await Promise.all([
            tx.ledgerEntry.findMany({
              where: { walletId: wallet.id },
              select: { direction: true, amountMinor: true },
            }),
            tx.withdrawalRequest.findMany({
              where: { walletId: wallet.id, status: { in: [...RESERVED_STATUSES] } },
              select: { amountMinor: true },
            }),
          ]);

          const credited = entries
            .filter((entry) => entry.direction === "CREDIT")
            .reduce((sum, entry) => sum + entry.amountMinor, 0n);
          const debited = entries
            .filter((entry) => entry.direction === "DEBIT")
            .reduce((sum, entry) => sum + entry.amountMinor, 0n);
          const reserved = withdrawals.reduce((sum, item) => sum + item.amountMinor, 0n);
          const available = credited - debited - reserved;

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
