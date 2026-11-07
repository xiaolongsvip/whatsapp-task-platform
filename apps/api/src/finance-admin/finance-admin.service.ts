import { Injectable } from "@nestjs/common";
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
  ...(from && /^\\d{4}-\\d{2}-\\d{2}$/.test(from) ? { gte: new Date(from + "T00:00:00.000Z") } : {}),
  ...(to && /^\\d{4}-\\d{2}-\\d{2}$/.test(to) ? { lte: new Date(to + "T23:59:59.999Z") } : {}),
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
        { ...(isUuid(query.search) ? { id: query.search } : {}) },
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

  async providers() {
    const rows = await prisma.paymentProviderConfig.findMany({ orderBy: { providerCode: "asc" },
      select: { providerCode: true, displayName: true, environment: true, enabled: true, supportedCurrencies: true, createdAt: true, updatedAt: true } });
    return rows.map(x => ({ ...x, createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString() }));
  }

  async transactions(query: { search?: string; status?: string; page?: string; pageSize?: string }) {
    const pg = pageArgs(query.page, query.pageSize);
    const where: Prisma.PaymentTransactionWhereInput = {
      ...(query.status && query.status !== "ALL" && ["CREATED","PENDING","PROCESSING","SUCCEEDED","FAILED","CANCELLED"].includes(query.status) ? { status: query.status as Prisma.EnumPaymentTransactionStatusFilter["equals"] } : {}),
      ...(query.search ? { OR: [{ ...(isUuid(query.search) ? { id: query.search } : {}) }, { user: { phone: { contains: query.search, mode: "insensitive" } } }, { providerReference: { contains: query.search, mode: "insensitive" } }] } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.paymentTransaction.count({ where }),
      prisma.paymentTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take,
        select: { id: true, userId: true, providerCode: true, flow: true, status: true, amountMinor: true, currency: true, providerTransactionId: true, providerReference: true, failureCode: true, failureMessage: true, createdAt: true, updatedAt: true, user: { select: { phone: true } } } }),
    ]);
    return { ...pg, total, items: rows.map(x => ({ ...x, phone: x.user.phone, amountMinor: x.amountMinor.toString(), currency: x.currency.trim(), createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString(), user: undefined })) };
  }
}
