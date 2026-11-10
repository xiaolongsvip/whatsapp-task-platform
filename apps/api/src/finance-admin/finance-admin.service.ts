import { Injectable, BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@wtp/database";

const RESERVED = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] as const;
const PAGE_MAX = 100;
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const pageArgs = (page?: string, pageSize?: string) => {
  const p = Math.max(1, Number.parseInt(page || "1", 10) || 1);
  const size = Math.min(PAGE_MAX, Math.max(1, Number.parseInt(pageSize || "20", 10) || 20));
  return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
};
function majorToMinor(amount: string, currency: string): bigint {
  let digits: number;
  try {
    digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    throw new BadRequestException("币种代码无效，无法确定金额精度");
  }
  const fractionPattern = digits === 0 ? "" : `(?:\\.\\d{1,${digits}})?`;
  const pattern = new RegExp(`^(?:0|[1-9]\\d{0,11})${fractionPattern}$`);
  if (!pattern.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new BadRequestException(`金额必须大于 0，${currency} 最多保留 ${digits} 位小数`);
  }
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * (10n ** BigInt(digits)) + BigInt((fraction + "0".repeat(digits)).slice(0, digits) || "0");
}
const dateRange = (from?: string, to?: string) => ({
  ...(from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? { gte: new Date(from + "T00:00:00.000Z") } : {}),
  ...(to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? { lte: new Date(to + "T23:59:59.999Z") } : {}),
});

@Injectable()
export class FinanceAdminService {
  async summary() {
    const [walletCount, withdrawalGroups, providerCount, enabledProviderCount, transactionGroups, ledgerGroups, holdGroups, reservedGroups, successfulPayoutGroups] = await Promise.all([
      prisma.wallet.count(),
      prisma.withdrawalRequest.groupBy({ by: ["status", "currency"], _count: { _all: true }, _sum: { amountMinor: true } }),
      prisma.paymentProviderConfig.count(),
      prisma.paymentProviderConfig.count({ where: { enabled: true } }),
      prisma.paymentTransaction.groupBy({ by: ["status", "currency"], _count: { _all: true }, _sum: { amountMinor: true } }),
      prisma.ledgerEntry.groupBy({ by: ["direction", "currency"], _count: { _all: true }, _sum: { amountMinor: true } }),
      prisma.walletHold.groupBy({ by: ["currency"], where: { status: "ACTIVE" }, _sum: { amountMinor: true } }),
      prisma.withdrawalRequest.groupBy({ by: ["currency"], where: { status: { in: [...RESERVED] } }, _sum: { amountMinor: true } }),
      prisma.paymentTransaction.groupBy({ by: ["currency"], where: { flow: "PAYOUT", status: "SUCCEEDED" }, _count: { _all: true }, _sum: { amountMinor: true } }),
    ]);
    const currencies = new Set([...ledgerGroups.map(x => x.currency.trim()), ...holdGroups.map(x => x.currency.trim()), ...reservedGroups.map(x => x.currency.trim())]);
    const walletBalances = [...currencies].sort().map(currency => {
      const credits = ledgerGroups.find(x => x.currency.trim() === currency && x.direction === "CREDIT")?._sum.amountMinor ?? 0n;
      const debits = ledgerGroups.find(x => x.currency.trim() === currency && x.direction === "DEBIT")?._sum.amountMinor ?? 0n;
      const frozen = holdGroups.find(x => x.currency.trim() === currency)?._sum.amountMinor ?? 0n;
      const reserved = reservedGroups.find(x => x.currency.trim() === currency)?._sum.amountMinor ?? 0n;
      return { currency, availableMinor: (credits - debits - frozen - reserved).toString(), frozenMinor: frozen.toString(), withdrawalReservedMinor: reserved.toString() };
    });
    return {
      walletCount, providerCount, enabledProviderCount, walletBalances,
      withdrawals: withdrawalGroups.map(x => ({ status: x.status, currency: x.currency.trim(), count: x._count._all, amountMinor: (x._sum.amountMinor ?? 0n).toString() })),
      transactions: transactionGroups.map(x => ({ status: x.status, currency: x.currency.trim(), count: x._count._all, amountMinor: (x._sum.amountMinor ?? 0n).toString() })),
      successfulPayouts: successfulPayoutGroups.map(x => ({ currency: x.currency.trim(), count: x._count._all, amountMinor: (x._sum.amountMinor ?? 0n).toString() })),
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
      amountMinor: x.amountMinor.toString(), currency: x.currency.trim(), payoutCurrency: x.payoutCurrency?.trim() ?? x.currency.trim(), payoutAmountMinor: (x.payoutAmountMinor ?? x.amountMinor).toString(), exchangeRate: x.exchangeRate?.toString() ?? null, exchangeRateSource: x.exchangeRateSource, exchangeRateFetchedAt: x.exchangeRateFetchedAt?.toISOString() ?? null, exchangeRateProviderUpdatedAt: x.exchangeRateProviderUpdatedAt?.toISOString() ?? null, exchangeRateEffectiveAt: x.exchangeRateEffectiveAt?.toISOString() ?? null, feeAmountMinor: (x.feeAmountMinor ?? 0n).toString(), feeCurrency: x.feeCurrency?.trim() ?? x.payoutCurrency?.trim() ?? x.currency.trim(), status: x.status,
      createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString(), payoutReference: x.payoutReference,
      payoutAccount: x.payoutAccount ? { id: x.payoutAccount.id, countryCode: x.payoutAccount.countryCode.trim(), providerCode: x.payoutProviderCode ?? x.payoutAccount.providerCode, methodCode: x.payoutAccount.methodCode, accountHolder: x.payoutAccount.accountHolder, maskedAccount: x.payoutAccount.maskedAccount } : null,
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
    const reviewHistory = await prisma.auditEvent.findMany({ where: { targetType: "WITHDRAWAL_REQUEST", targetId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { action: true, metadata: true, actorId: true, createdAt: true } });
    return {
      id: row.id, userId: row.wallet.userId, phone: row.wallet.user.phone, walletId: row.walletId,
      amountMinor: row.amountMinor.toString(), currency: row.currency.trim(), payoutCurrency: row.payoutCurrency?.trim() ?? row.currency.trim(), payoutAmountMinor: (row.payoutAmountMinor ?? row.amountMinor).toString(), exchangeRate: row.exchangeRate?.toString() ?? null, exchangeRateSource: row.exchangeRateSource, exchangeRateFetchedAt: row.exchangeRateFetchedAt?.toISOString() ?? null, exchangeRateProviderUpdatedAt: row.exchangeRateProviderUpdatedAt?.toISOString() ?? null, exchangeRateEffectiveAt: row.exchangeRateEffectiveAt?.toISOString() ?? null, feeAmountMinor: (row.feeAmountMinor ?? 0n).toString(), feeCurrency: row.feeCurrency?.trim() ?? row.payoutCurrency?.trim() ?? row.currency.trim(), status: row.status,
      payoutReference: row.payoutReference, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      payoutAccount: row.payoutAccount ? { ...row.payoutAccount, providerCode: row.payoutProviderCode ?? row.payoutAccount.providerCode, countryCode: row.payoutAccount.countryCode.trim(), currency: row.payoutAccount.currency.trim() } : null,
      paymentTransactions: row.paymentTransactions.map(x => ({ ...x, amountMinor: x.amountMinor.toString(), currency: x.currency.trim(), createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString() })),
      reviewHistory: reviewHistory.map(x => ({ action: x.action, metadata: x.metadata, actorId: x.actorId, createdAt: x.createdAt.toISOString() })),
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

  async recordManualPayout(id: string, outcome: "PAID" | "FAILED", adminId: string, input: { providerCode?: string; reference?: string; note?: string; payoutAmountMinor?: string }) {
    if (!isUuid(id)) throw new BadRequestException("提现单 ID 格式不正确");
    const reference = typeof input.reference === "string" ? input.reference.trim().slice(0, 160) : "";
    const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
    const requestedProviderCode = typeof input.providerCode === "string" ? input.providerCode.trim() : "";
    if (outcome === "PAID" && (!reference || !requestedProviderCode)) throw new BadRequestException("确认付款必须填写服务商代码和付款凭证/流水号");
    if (outcome === "FAILED" && !note) throw new BadRequestException("登记付款失败必须填写失败原因");
    try {
      return await prisma.$transaction(async tx => {
      const withdrawal = await tx.withdrawalRequest.findUnique({
        where: { id },
        include: { wallet: { select: { userId: true } }, payoutAccount: { select: { providerCode: true } } },
      });
      if (!withdrawal) throw new NotFoundException("提现申请不存在");
      if (withdrawal.status !== "APPROVED" && withdrawal.status !== "PROCESSING") throw new ConflictException("只有已通过、待付款或付款处理中状态可以登记付款结果");
      const payoutAccount = withdrawal.payoutAccount;
      if (!payoutAccount) throw new BadRequestException("该提现单没有有效的收款账户，无法登记付款结果");
      if (outcome === "PAID") {
        const providerCode = requestedProviderCode;
        const expectedProviderCode = withdrawal.payoutProviderCode ?? payoutAccount.providerCode;
        if (providerCode !== expectedProviderCode) {
          throw new BadRequestException("付款服务商必须与提现申请时绑定的服务商一致");
        }
        const provider = await tx.paymentProviderConfig.findUnique({ where: { providerCode }, select: { providerCode: true, supportedCurrencies: true } });
        if (!provider) throw new BadRequestException("服务商配置不存在");
        const payoutCurrency = (withdrawal.payoutCurrency ?? withdrawal.currency).trim();
        const estimatedPayoutAmountMinor = withdrawal.payoutAmountMinor ?? withdrawal.amountMinor;
        let actualPayoutAmountMinor: bigint;
        if (input.payoutAmountMinor !== undefined) {
          if (typeof input.payoutAmountMinor !== "string" || !/^[0-9]+$/.test(input.payoutAmountMinor)) {
            throw new BadRequestException("实际出款金额格式无效。");
          }
          actualPayoutAmountMinor = BigInt(input.payoutAmountMinor);
        } else if (payoutCurrency.toUpperCase() === withdrawal.currency.trim().toUpperCase()) {
          actualPayoutAmountMinor = withdrawal.amountMinor;
        } else {
          throw new BadRequestException("跨币种提现必须填写实际出款金额，参考汇率不能代替实际支付报价。");
        }
        if (actualPayoutAmountMinor <= 0n || actualPayoutAmountMinor > 9223372036854775807n) {
          throw new BadRequestException("实际出款金额必须大于零且在有效范围内。");
        }
        if (actualPayoutAmountMinor !== estimatedPayoutAmountMinor && !note) {
          throw new BadRequestException("实际出款金额与提现报价不一致，必须填写差异说明后才能确认付款。");
        }
        if (!provider.supportedCurrencies.some(currency => currency.trim().toUpperCase() === payoutCurrency.toUpperCase())) {
          throw new BadRequestException("该服务商未配置此提现出款币种，不能登记付款");
        }
        // Atomically claim the withdrawal before inserting the successful payout and
        // wallet debit. Concurrent confirmation attempts cannot both pass this gate.
        const claimed = await tx.withdrawalRequest.updateMany({
          where: { id, status: withdrawal.status },
          data: { status: "PAID", payoutReference: reference, reviewedById: adminId },
        });
        if (claimed.count !== 1) throw new ConflictException("提现状态已变化，请刷新后重试");
        const existing = await tx.paymentTransaction.findFirst({ where: { withdrawalRequestId: id, status: "SUCCEEDED" }, select: { id: true } });
        if (existing) throw new ConflictException("该提现单已经登记成功付款，不能重复入账");
        const duplicateReference = await tx.paymentTransaction.findFirst({
          where: { providerCode, providerReference: reference, flow: "PAYOUT" },
          select: { id: true, withdrawalRequestId: true },
        });
        if (duplicateReference) {
          throw new ConflictException("该服务商付款凭证已关联其他付款记录，请核对凭证号后再登记");
        }
        const transaction = await tx.paymentTransaction.create({ data: {
          userId: withdrawal.wallet.userId, walletId: withdrawal.walletId, withdrawalRequestId: id,
          providerCode, flow: "PAYOUT", status: "SUCCEEDED", amountMinor: actualPayoutAmountMinor,
          currency: payoutCurrency, idempotencyKey: "manual-payout:" + id,
          providerReference: reference, metadata: {
            mode: "MANUAL_CONFIRMATION", note: note || null, confirmedBy: adminId,
            walletAmountMinor: withdrawal.amountMinor.toString(), walletCurrency: withdrawal.currency.trim(),
            estimatedPayoutAmountMinor: estimatedPayoutAmountMinor.toString(), actualPayoutAmountMinor: actualPayoutAmountMinor.toString(), payoutCurrency,
            exchangeRate: withdrawal.exchangeRate?.toString() ?? null, exchangeRateSource: withdrawal.exchangeRateSource, exchangeRateFetchedAt: withdrawal.exchangeRateFetchedAt?.toISOString() ?? null, exchangeRateProviderUpdatedAt: withdrawal.exchangeRateProviderUpdatedAt?.toISOString() ?? null, exchangeRateEffectiveAt: withdrawal.exchangeRateEffectiveAt?.toISOString() ?? null,
          },
        }});
        await tx.ledgerEntry.create({ data: {
          walletId: withdrawal.walletId, sourceType: "WITHDRAWAL_PAYOUT", sourceId: id,
          direction: "DEBIT", amountMinor: withdrawal.amountMinor, currency: withdrawal.currency,
          idempotencyKey: "withdrawal-payout:" + id,
        }});
        await tx.auditEvent.create({ data: {
          actorType: "ADMIN", actorId: adminId, action: "WITHDRAWAL_MANUALLY_MARKED_PAID",
          targetType: "WITHDRAWAL_REQUEST", targetId: id,
          metadata: { fromStatus: withdrawal.status, toStatus: "PAID", paymentTransactionId: transaction.id, providerCode, reference,
            walletAmountMinor: withdrawal.amountMinor.toString(), walletCurrency: withdrawal.currency.trim(),
            estimatedPayoutAmountMinor: estimatedPayoutAmountMinor.toString(), actualPayoutAmountMinor: actualPayoutAmountMinor.toString(), payoutCurrency,
            exchangeRate: withdrawal.exchangeRate?.toString() ?? null, exchangeRateSource: withdrawal.exchangeRateSource, exchangeRateFetchedAt: withdrawal.exchangeRateFetchedAt?.toISOString() ?? null, exchangeRateProviderUpdatedAt: withdrawal.exchangeRateProviderUpdatedAt?.toISOString() ?? null, exchangeRateEffectiveAt: withdrawal.exchangeRateEffectiveAt?.toISOString() ?? null, note },
        }});
        return { id, status: "PAID", paymentTransactionId: transaction.id, actualPayoutAmountMinor: actualPayoutAmountMinor.toString(), payoutCurrency, manual: true };
      }
      // Claim the state transition before creating any payout record. The conditional
      // update is the concurrency gate: only one administrator can finalize this request.
      const changed = await tx.withdrawalRequest.updateMany({
        where: { id, status: withdrawal.status },
        data: { status: "FAILED", reviewedById: adminId },
      });
      if (changed.count !== 1) throw new ConflictException("提现状态已变化，请刷新后重试");
      const transaction = await tx.paymentTransaction.create({ data: {
        userId: withdrawal.wallet.userId, walletId: withdrawal.walletId, withdrawalRequestId: id,
        providerCode: withdrawal.payoutProviderCode ?? payoutAccount.providerCode, flow: "PAYOUT", status: "FAILED",
        amountMinor: withdrawal.payoutAmountMinor ?? withdrawal.amountMinor,
        currency: (withdrawal.payoutCurrency ?? withdrawal.currency).trim(),
        idempotencyKey: "manual-payout-failed:" + id,
        failureCode: "MANUAL_PAYOUT_FAILED", failureMessage: note,
        metadata: { mode: "MANUAL_CONFIRMATION", confirmedBy: adminId, providerCode: payoutAccount.providerCode },
      }});
      await tx.auditEvent.create({ data: {
        actorType: "ADMIN", actorId: adminId, action: "WITHDRAWAL_MANUALLY_MARKED_FAILED",
        targetType: "WITHDRAWAL_REQUEST", targetId: id,
        metadata: { fromStatus: withdrawal.status, toStatus: "FAILED", paymentTransactionId: transaction.id, failureReason: note, amountMinor: withdrawal.amountMinor.toString(), currency: withdrawal.currency.trim() },
      }});
      return { id, status: "FAILED", paymentTransactionId: transaction.id, balanceReservationReleased: true, manual: true };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const known = error as { code?: string; meta?: { target?: unknown } };
      const target = Array.isArray(known?.meta?.target) ? known.meta.target.join(",") : String(known?.meta?.target ?? "");
      if (known?.code === "P2002" && (target.includes("provider_reference") || target.includes("providerCode_providerReference"))) {
        throw new ConflictException("该服务商付款凭证已被使用，不能重复登记");
      }
      throw error;
    }
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

  async payoutAccountSummary() {
    const groups = await prisma.payoutAccount.groupBy({ by: ["status"], _count: { _all: true } });
    const count = (status: string) => groups.find(x => x.status === status)?._count._all ?? 0;
    return { total: groups.reduce((n, x) => n + x._count._all, 0), active: count("ACTIVE"), disabled: count("DISABLED"), pendingReview: null };
  }

  async payoutAccounts(query: { search?: string; status?: string; country?: string; methodCode?: string; page?: string; pageSize?: string }) {
    const pg = pageArgs(query.page, query.pageSize);
    const where: Prisma.PayoutAccountWhereInput = {
      ...(query.status && query.status !== "ALL" && ["ACTIVE", "DISABLED"].includes(query.status) ? { status: query.status as Prisma.EnumPayoutAccountStatusFilter["equals"] } : {}),
      ...(query.country ? { countryCode: query.country.toUpperCase() } : {}),
      ...(query.methodCode ? { methodCode: query.methodCode.toLowerCase() } : {}),
      ...(query.search ? { OR: [{ user: { phone: { contains: query.search, mode: "insensitive" } } }, { accountHolder: { contains: query.search, mode: "insensitive" } }, { maskedAccount: { contains: query.search, mode: "insensitive" } }] } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.payoutAccount.count({ where }),
      prisma.payoutAccount.findMany({ where, orderBy: { updatedAt: "desc" }, skip: pg.skip, take: pg.take,
        select: { id: true, userId: true, countryCode: true, currency: true, providerCode: true, methodCode: true, accountHolder: true, maskedAccount: true, status: true, isDefault: true, createdAt: true, updatedAt: true, user: { select: { phone: true } } } }),
    ]);
    return { ...pg, total, items: rows.map(x => ({ ...x, accountType: x.methodCode, phone: x.user.phone, countryCode: x.countryCode.trim(), currency: x.currency.trim(), createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString(), riskLevel: null })) };
  }

  private decryptPayoutAccountDetails(input: { accountDetailsCiphertext: string; accountDetailsIv: string; accountDetailsTag: string }) {
    const raw = process.env.PAYOUT_DATA_ENCRYPTION_KEY?.trim() ?? "";
    if (!/^[a-fA-F0-9]{64}$/.test(raw)) return { phoneNumber: null };
    try {
      const decipher = createDecipheriv("aes-256-gcm", Buffer.from(raw, "hex"), Buffer.from(input.accountDetailsIv, "base64"));
      decipher.setAuthTag(Buffer.from(input.accountDetailsTag, "base64"));
      const clear = Buffer.concat([decipher.update(Buffer.from(input.accountDetailsCiphertext, "base64")), decipher.final()]).toString("utf8");
      const parsed = JSON.parse(clear) as { phoneNumber?: unknown };
      return { phoneNumber: typeof parsed.phoneNumber === "string" ? parsed.phoneNumber : null };
    } catch {
      return { phoneNumber: null };
    }
  }

  async payoutAccountDetail(id: string) {
    if (!isUuid(id)) throw new BadRequestException("收款账户 ID 格式不正确");
    const row = await prisma.payoutAccount.findUnique({
      where: { id },
      select: { id: true, userId: true, countryCode: true, currency: true, providerCode: true, methodCode: true, accountHolder: true, maskedAccount: true, status: true, isDefault: true, accountDetailsCiphertext: true, accountDetailsIv: true, accountDetailsTag: true, createdAt: true, updatedAt: true, user: { select: { phone: true } } },
    });
    if (!row) throw new NotFoundException("收款账户不存在");
    const details = this.decryptPayoutAccountDetails(row);
    return { id: row.id, userId: row.userId, phone: row.user.phone, accountType: row.methodCode, countryCode: row.countryCode.trim(), currency: row.currency.trim(), providerCode: row.providerCode, methodCode: row.methodCode, accountHolder: row.accountHolder, maskedAccount: row.maskedAccount, phoneNumber: details.phoneNumber, status: row.status, isDefault: row.isDefault, riskLevel: null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  async payoutAccountHistory(id: string, query: { status?: string; from?: string; to?: string; page?: string; pageSize?: string }) {
    if (!isUuid(id)) throw new BadRequestException("收款账户 ID 格式不正确");
    const account = await prisma.payoutAccount.findUnique({ where: { id }, select: { id: true } });
    if (!account) throw new NotFoundException("收款账户不存在");
    const pg = pageArgs(query.page, query.pageSize);
    const allowed = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PROCESSING", "PAID", "FAILED", "CANCELLED"];
    const where: Prisma.WithdrawalRequestWhereInput = {
      payoutAccountId: id,
      ...(query.status && query.status !== "ALL" && allowed.includes(query.status) ? { status: query.status as Prisma.EnumWithdrawalStatusFilter["equals"] } : {}),
      ...(query.from || query.to ? { createdAt: dateRange(query.from, query.to) } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.withdrawalRequest.count({ where }),
      prisma.withdrawalRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take,
        select: { id: true, amountMinor: true, currency: true, status: true, payoutReference: true, createdAt: true, updatedAt: true } }),
    ]);
    return { ...pg, total, items: rows.map(x => ({ ...x, amountMinor: x.amountMinor.toString(), currency: x.currency.trim(), createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString() })) };
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

  private async validateProviderInput(input: Record<string, unknown>) {
    const providerCode = typeof input.providerCode === "string" ? input.providerCode.trim().toUpperCase() : "";
    const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
    const serviceProviderName = typeof input.serviceProviderName === "string" ? input.serviceProviderName.trim() : "";
    const supportedChannels = Array.isArray(input.supportedChannels) ? [...new Set(input.supportedChannels.map(x => String(x).trim()).filter(Boolean))] : [];
    const minimumRaw = input.minimumPayoutMinor === undefined || input.minimumPayoutMinor === null || input.minimumPayoutMinor === "" ? null : String(input.minimumPayoutMinor);
    const maximumRaw = input.maximumPayoutMinor === undefined || input.maximumPayoutMinor === null || input.maximumPayoutMinor === "" ? null : String(input.maximumPayoutMinor);
    if ((minimumRaw !== null && !/^\d+$/.test(minimumRaw)) || (maximumRaw !== null && !/^\d+$/.test(maximumRaw))) throw new BadRequestException("最低和最高到账金额必须是非负整数最小单位");
    const minimumPayoutMinor = minimumRaw === null ? null : BigInt(minimumRaw);
    const maximumPayoutMinor = maximumRaw === null ? null : BigInt(maximumRaw);
    if (minimumPayoutMinor !== null && maximumPayoutMinor !== null && minimumPayoutMinor > maximumPayoutMinor) throw new BadRequestException("最低到账金额不能高于最高到账金额");
    const enabled = input.enabled === true;
    const countryCode = typeof input.countryCode === "string" ? input.countryCode.trim().toUpperCase() : "";
    const methodCode = typeof input.methodCode === "string" ? input.methodCode.trim().toUpperCase() : "";
    const environment = typeof input.environment === "string" ? input.environment.trim().toUpperCase() : "SANDBOX";
    const apiBaseUrl = typeof input.apiBaseUrl === "string" ? input.apiBaseUrl.trim() : "";
    const merchantId = typeof input.merchantId === "string" ? input.merchantId.trim() : "";
    const supportedCurrencies = Array.isArray(input.supportedCurrencies) ? input.supportedCurrencies.map(x => String(x).trim().toUpperCase()).filter(Boolean) : [];
    const credentials = typeof input.credentials === "string" ? input.credentials.trim() : "";
    const webhookSecret = typeof input.webhookSecret === "string" ? input.webhookSecret.trim() : "";
    if (!/^[A-Z0-9_-]{2,40}$/.test(providerCode)) throw new BadRequestException("服务商代码格式不正确");
    if (!displayName || displayName.length > 80) throw new BadRequestException("请填写展示名称（最多 80 个字符）");
    if (!serviceProviderName || serviceProviderName.length > 80) throw new BadRequestException("请选择或填写服务商名称");
    if (supportedChannels.length < 1 || supportedChannels.length > 30 || supportedChannels.some(x => x.length > 60)) throw new BadRequestException("请至少选择一个有效收款渠道");
    if (!/^(GLOBAL|[A-Z]{2})$/.test(countryCode)) throw new BadRequestException("国家/地区必须是 GLOBAL 或两位 ISO 国家代码");
    if (!/^[A-Z0-9_-]{2,40}$/.test(methodCode)) throw new BadRequestException("收款渠道代码格式不正确");
    if (!["SANDBOX","PRODUCTION"].includes(environment)) throw new BadRequestException("环境必须是 SANDBOX 或 PRODUCTION");
    if (apiBaseUrl) {
      let parsed: URL;
      try { parsed = new URL(apiBaseUrl); } catch { throw new BadRequestException("API 地址格式不正确"); }
      if (parsed.protocol !== "https:" && !(environment === "SANDBOX" && parsed.hostname === "localhost" && parsed.protocol === "http:")) {
        throw new BadRequestException("API 地址必须使用 HTTPS（沙箱 localhost 除外）");
      }
    }
    if (supportedCurrencies.length < 1 || supportedCurrencies.length > 10 || supportedCurrencies.some(x => !/^[A-Z]{3}$/.test(x))) throw new BadRequestException("至少配置一个有效的 3 位 ISO 出款币种，最多 10 个");
    const catalogRow = await prisma.taskConfiguration.findUnique({ where: { key: "system.payoutCatalogs" }, select: { value: true } });
    const catalogs = catalogRow?.value as any;
    const countries = Array.isArray(catalogs?.countries) ? catalogs.countries : [];
    const currencies = Array.isArray(catalogs?.currencies) ? catalogs.currencies : [];
    const methods = Array.isArray(catalogs?.methods) ? catalogs.methods : [];
    if (countries.length && countryCode !== "GLOBAL" && !countries.some((item: any) => String(item.code).toUpperCase() === countryCode && item.enabled !== false)) {
      throw new BadRequestException("服务商引用的国家未配置或已停用。");
    }
    if (currencies.length && supportedCurrencies.some(code => !currencies.some((item: any) => String(item.code).toUpperCase() === code && item.enabled !== false))) {
      throw new BadRequestException("服务商引用了未配置或已停用的出款币种。");
    }
    if (methods.length && supportedChannels.some(channel => !methods.some((item: any) =>
      String(item.channel ?? item.code).trim().toLowerCase() === channel.toLowerCase() &&
      item.enabled !== false &&
      (!Array.isArray(item.countryCodes) || item.countryCodes.length === 0 || countryCode === "GLOBAL" || item.countryCodes.map((code: string) => code.toUpperCase()).includes(countryCode)) &&
      (!Array.isArray(item.currencyCodes) || item.currencyCodes.length === 0 || item.currencyCodes.some((code: string) => supportedCurrencies.includes(String(code).toUpperCase())))
    ))) {
      throw new BadRequestException("服务商包含未启用或不适用于所选国家、币种的收款渠道。");
    }
    if (credentials.length > 12000 || webhookSecret.length > 4000) throw new BadRequestException("密钥内容过长");
    return { providerCode, displayName, serviceProviderName, countryCode, methodCode, supportedChannels, minimumPayoutMinor, maximumPayoutMinor, enabled, environment, apiBaseUrl: apiBaseUrl || null, merchantId: merchantId || null, supportedCurrencies: [...new Set(supportedCurrencies)], credentials, webhookSecret };
  }

  async createProvider(input: Record<string, unknown>) {
    const v = await this.validateProviderInput(input);
    const exists = await prisma.paymentProviderConfig.findUnique({ where: { providerCode: v.providerCode } });
    if (exists) throw new ConflictException("服务商代码已存在");
    const credentials = v.credentials ? this.encryptProviderSecret(v.credentials) : null;
    const webhook = v.webhookSecret ? this.encryptProviderSecret(v.webhookSecret) : null;
    const row = await prisma.paymentProviderConfig.create({ data: {
      providerCode: v.providerCode, displayName: v.displayName, serviceProviderName: v.serviceProviderName, countryCode: v.countryCode, methodCode: v.methodCode,
      supportedChannels: v.supportedChannels, minimumPayoutMinor: v.minimumPayoutMinor, maximumPayoutMinor: v.maximumPayoutMinor,
      environment: v.environment, apiBaseUrl: v.apiBaseUrl, merchantId: v.merchantId, supportedCurrencies: v.supportedCurrencies,
      enabled: v.enabled,
      ...(credentials ? { credentialsCiphertext: credentials.ciphertext, credentialsIv: credentials.iv, credentialsTag: credentials.tag } : {}),
      ...(webhook ? { webhookSecretCiphertext: webhook.ciphertext, webhookSecretIv: webhook.iv, webhookSecretTag: webhook.tag } : {}),
    }});
    return { ...row, minimumPayoutMinor: row.minimumPayoutMinor?.toString() ?? null, maximumPayoutMinor: row.maximumPayoutMinor?.toString() ?? null, credentialsConfigured: Boolean(credentials), webhookSecretConfigured: Boolean(webhook), credentialsCiphertext: undefined, credentialsIv: undefined, credentialsTag: undefined, webhookSecretCiphertext: undefined, webhookSecretIv: undefined, webhookSecretTag: undefined };
  }

  async updateProvider(providerCode: string, input: Record<string, unknown>) {
    const current = await prisma.paymentProviderConfig.findUnique({ where: { providerCode } });
    if (!current) throw new NotFoundException("代付配置不存在");
    const v = await this.validateProviderInput({ ...input, providerCode: current.providerCode });
    const credentials = v.credentials ? this.encryptProviderSecret(v.credentials) : null;
    const webhook = v.webhookSecret ? this.encryptProviderSecret(v.webhookSecret) : null;
    const row = await prisma.paymentProviderConfig.update({ where: { providerCode }, data: {
      displayName: v.displayName, serviceProviderName: v.serviceProviderName, countryCode: v.countryCode, methodCode: v.methodCode,
      supportedChannels: v.supportedChannels, minimumPayoutMinor: v.minimumPayoutMinor, maximumPayoutMinor: v.maximumPayoutMinor, enabled: v.enabled, environment: v.environment,
      apiBaseUrl: v.apiBaseUrl, merchantId: v.merchantId, supportedCurrencies: v.supportedCurrencies,
      ...(credentials ? { credentialsCiphertext: credentials.ciphertext, credentialsIv: credentials.iv, credentialsTag: credentials.tag } : {}),
      ...(webhook ? { webhookSecretCiphertext: webhook.ciphertext, webhookSecretIv: webhook.iv, webhookSecretTag: webhook.tag } : {}),
    }});
    return { ...row, minimumPayoutMinor: row.minimumPayoutMinor?.toString() ?? null, maximumPayoutMinor: row.maximumPayoutMinor?.toString() ?? null, credentialsConfigured: Boolean(credentials || current.credentialsCiphertext), webhookSecretConfigured: Boolean(webhook || current.webhookSecretCiphertext), credentialsCiphertext: undefined, credentialsIv: undefined, credentialsTag: undefined, webhookSecretCiphertext: undefined, webhookSecretIv: undefined, webhookSecretTag: undefined };
  }

  async setProviderEnabled(providerCode: string, enabled: boolean) {
    const current = await prisma.paymentProviderConfig.findUnique({ where: { providerCode } });
    if (!current) throw new NotFoundException("代付配置不存在");
    if (enabled && (!current.supportedChannels.length || !current.supportedCurrencies.length)) {
      throw new BadRequestException("启用前必须至少选择一个收款渠道和出款币种");
    }
    const row = await prisma.paymentProviderConfig.update({ where: { providerCode }, data: { enabled } });
    return { providerCode: row.providerCode, enabled: row.enabled, updatedAt: row.updatedAt.toISOString() };
  }

  async providers() {
    const rows = await prisma.paymentProviderConfig.findMany({ orderBy: { providerCode: "asc" },
      select: { providerCode: true, displayName: true, serviceProviderName: true, countryCode: true, methodCode: true, supportedChannels: true, minimumPayoutMinor: true, maximumPayoutMinor: true, apiBaseUrl: true, merchantId: true, environment: true, enabled: true, supportedCurrencies: true, credentialsCiphertext: true, webhookSecretCiphertext: true, createdAt: true, updatedAt: true } });
    return rows.map(x => ({ providerCode: x.providerCode, displayName: x.displayName, serviceProviderName: x.serviceProviderName, countryCode: x.countryCode, methodCode: x.methodCode, supportedChannels: x.supportedChannels, minimumPayoutMinor: x.minimumPayoutMinor?.toString() ?? null, maximumPayoutMinor: x.maximumPayoutMinor?.toString() ?? null, apiBaseUrl: x.apiBaseUrl, merchantId: x.merchantId, environment: x.environment, enabled: x.enabled, supportedCurrencies: x.supportedCurrencies, credentialsConfigured: Boolean(x.credentialsCiphertext), webhookSecretConfigured: Boolean(x.webhookSecretCiphertext), createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString() }));
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

  async settlementOverview() {
    const [tasks, payouts, adjustments, latestRun] = await Promise.all([
      this.taskSettlements({ page: "1", pageSize: "1" }),
      this.pendingPayouts({ page: "1", pageSize: "1" }),
      this.taskAdjustments({ page: "1", pageSize: "1" }),
      prisma.financeReconciliationRun.findFirst({ orderBy: { createdAt: "desc" }, select: { exceptionCount: true } }),
    ]);
    return { pendingTaskSettlement: tasks.total, pendingPayout: payouts.total, adjustmentRecords: adjustments.total, unresolvedReconciliationIssues: latestRun?.exceptionCount ?? 0 };
  }

  async taskSettlements(query: { search?: string; from?: string; to?: string; page?: string; pageSize?: string }) {
    const pg = pageArgs(query.page, query.pageSize);
    const range = dateRange(query.from, query.to);
    const fromDate = range.gte ?? null;
    const toDate = range.lte ?? null;
    const search = query.search?.trim();
    const searchPattern = search ? `%${search}%` : null;
    const [countRows, rows] = await Promise.all([
      prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*)::bigint AS total
        FROM task_submissions s
        INNER JOIN task_claims c ON c.id = s.claim_id
        INNER JOIN tasks t ON t.id = c.task_id
        INNER JOIN users u ON u.id = c.user_id
        WHERE s.status = 'APPROVED'
          AND (${fromDate}::timestamptz IS NULL OR s.submitted_at >= ${fromDate}::timestamptz)
          AND (${toDate}::timestamptz IS NULL OR s.submitted_at <= ${toDate}::timestamptz)
          AND (${searchPattern}::text IS NULL OR u.phone ILIKE ${searchPattern}::text OR t.title ILIKE ${searchPattern}::text OR s.id::text ILIKE ${searchPattern}::text OR c.id::text ILIKE ${searchPattern}::text)
          AND NOT EXISTS (
            SELECT 1 FROM ledger_entries le
            WHERE le.source_type = 'TASK_REWARD' AND le.source_id = c.id::text
          )
      `,
      prisma.$queryRaw<Array<{ id: string; claimId: string; userId: string; phone: string; taskId: string; taskTitle: string; amountMinor: bigint; currency: string; submittedAt: Date }>>`
        SELECT s.id, c.id AS "claimId", u.id AS "userId", u.phone,
          t.id AS "taskId", t.title AS "taskTitle", t.reward_minor AS "amountMinor",
          t.currency, s.submitted_at AS "submittedAt"
        FROM task_submissions s
        INNER JOIN task_claims c ON c.id = s.claim_id
        INNER JOIN tasks t ON t.id = c.task_id
        INNER JOIN users u ON u.id = c.user_id
        WHERE s.status = 'APPROVED'
          AND (${fromDate}::timestamptz IS NULL OR s.submitted_at >= ${fromDate}::timestamptz)
          AND (${toDate}::timestamptz IS NULL OR s.submitted_at <= ${toDate}::timestamptz)
          AND (${searchPattern}::text IS NULL OR u.phone ILIKE ${searchPattern}::text OR t.title ILIKE ${searchPattern}::text OR s.id::text ILIKE ${searchPattern}::text OR c.id::text ILIKE ${searchPattern}::text)
          AND NOT EXISTS (
            SELECT 1 FROM ledger_entries le
            WHERE le.source_type = 'TASK_REWARD' AND le.source_id = c.id::text
          )
        ORDER BY s.submitted_at DESC, s.id DESC
        LIMIT ${pg.take} OFFSET ${pg.skip}
      `,
    ]);
    return { ...pg, total: Number(countRows[0]?.total ?? 0n), items: rows.map(x => ({
      id: x.id, claimId: x.claimId, userId: x.userId, phone: x.phone,
      taskId: x.taskId, taskTitle: x.taskTitle, amountMinor: x.amountMinor.toString(),
      currency: x.currency.trim(), status: "PENDING_SETTLEMENT",
      submittedAt: x.submittedAt.toISOString(),
    })) };
  }

  async pendingPayouts(query: { search?: string; status?: string; from?: string; to?: string; page?: string; pageSize?: string }) {
    const pg = pageArgs(query.page, query.pageSize);
    const allowed = ["APPROVED", "PROCESSING"];
    const where: Prisma.WithdrawalRequestWhereInput = {
      status: query.status && allowed.includes(query.status) ? query.status as Prisma.EnumWithdrawalStatusFilter["equals"] : { in: allowed as never[] },
      ...(query.from || query.to ? { createdAt: dateRange(query.from, query.to) } : {}),
      ...(query.search ? { OR: [
        ...(isUuid(query.search) ? [{ id: query.search }] : []),
        { wallet: { user: { phone: { contains: query.search, mode: "insensitive" } } } },
        { payoutAccount: { accountHolder: { contains: query.search, mode: "insensitive" } } },
      ] } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.withdrawalRequest.count({ where }),
      prisma.withdrawalRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take,
        include: { wallet: { select: { userId: true, user: { select: { phone: true } } } },
          payoutAccount: { select: { countryCode: true, methodCode: true, providerCode: true, accountHolder: true, maskedAccount: true } } } }),
    ]);
    return { ...pg, total, items: rows.map(x => ({
      id: x.id, userId: x.wallet.userId, phone: x.wallet.user.phone, amountMinor: x.amountMinor.toString(),
      receiveAmountMinor: (x.payoutAmountMinor ?? x.amountMinor).toString(), currency: x.currency.trim(),
      payoutCurrency: x.payoutCurrency?.trim() ?? x.currency.trim(), exchangeRate: x.exchangeRate?.toString() ?? null, exchangeRateFetchedAt: x.exchangeRateFetchedAt?.toISOString() ?? null, exchangeRateProviderUpdatedAt: x.exchangeRateProviderUpdatedAt?.toISOString() ?? null, exchangeRateEffectiveAt: x.exchangeRateEffectiveAt?.toISOString() ?? null,
      status: x.status,
      channel: x.payoutAccount?.methodCode ?? "未绑定收款账户", providerCode: x.payoutProviderCode ?? x.payoutAccount?.providerCode ?? null,
      accountHolder: x.payoutAccount?.accountHolder ?? null, maskedAccount: x.payoutAccount?.maskedAccount ?? null,
      createdAt: x.createdAt.toISOString(), reviewedAt: null,
    })) };
  }

  async taskAdjustments(query: { search?: string; page?: string; pageSize?: string }) {
    const pg = pageArgs(query.page, query.pageSize);
    const where: Prisma.LedgerEntryWhereInput = {
      sourceType: "ADMIN_ADJUSTMENT",
      ...(query.search ? { OR: [
        { wallet: { user: { phone: { contains: query.search, mode: "insensitive" } } } },
        { sourceId: { contains: query.search, mode: "insensitive" } },
      ] } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.ledgerEntry.count({ where }),
      prisma.ledgerEntry.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take,
        include: { wallet: { select: { userId: true, currency: true, user: { select: { phone: true } } } } } }),
    ]);
    const ids = rows.map(x => x.sourceId);
    const events = ids.length ? await prisma.auditEvent.findMany({ where: { targetType: "WALLET_ADJUSTMENT", targetId: { in: ids } }, select: { targetId: true, metadata: true, actorId: true } }) : [];
    const eventMap = new Map(events.map(x => [x.targetId, x]));
    return { ...pg, total, items: rows.map(x => {
      const event = eventMap.get(x.sourceId);
      const metadata = event?.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : {};
      return { id: x.sourceId, ledgerEntryId: x.id, userId: x.wallet.userId, phone: x.wallet.user.phone,
        amountMinor: x.amountMinor.toString(), currency: x.currency.trim(), direction: x.direction,
        reason: typeof metadata.reason === "string" ? metadata.reason : "—", taskTitle: typeof metadata.taskTitle === "string" ? metadata.taskTitle : "—",
        adminId: event?.actorId ?? null, status: "COMPLETED", createdAt: x.createdAt.toISOString() };
    }) };
  }

  async createTaskAdjustment(adminId: string, input: { user?: string; currency?: string; amount?: string; direction?: string; reason?: string; taskTitle?: string }) {
    const identity = typeof input.user === "string" ? input.user.trim() : "";
    const currency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
    const amount = typeof input.amount === "string" ? input.amount.trim() : "";
    const direction = input.direction === "DEBIT" ? "DEBIT" : input.direction === "CREDIT" ? "CREDIT" : "";
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    const taskTitle = typeof input.taskTitle === "string" ? input.taskTitle.trim().slice(0, 160) : "";
    if (!identity) throw new BadRequestException("请输入用户手机号或用户 ID");
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException("请输入有效的三位币种代码");
    const amountMinor = majorToMinor(amount, currency);
    if (!direction) throw new BadRequestException("请选择增加或扣减");
    if (!reason || reason.length > 500) throw new BadRequestException("调账原因必填，最多 500 个字符");
    const adjustmentId = randomUUID();
    return prisma.$transaction(async tx => {
      const user = await tx.user.findFirst({ where: isUuid(identity) ? { id: identity } : { phone: identity }, select: { id: true, phone: true } });
      if (!user) throw new NotFoundException("未找到该用户");
      const wallet = await tx.wallet.upsert({ where: { userId_currency: { userId: user.id, currency } }, create: { userId: user.id, currency }, update: {} });
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM wallets WHERE id = ${wallet.id}::uuid FOR UPDATE`;
      if (direction === "DEBIT") {
        const [credits, debits, holds, reserved] = await Promise.all([
          tx.ledgerEntry.aggregate({ where: { walletId: wallet.id, direction: "CREDIT" }, _sum: { amountMinor: true } }),
          tx.ledgerEntry.aggregate({ where: { walletId: wallet.id, direction: "DEBIT" }, _sum: { amountMinor: true } }),
          tx.walletHold.aggregate({ where: { walletId: wallet.id, status: "ACTIVE" }, _sum: { amountMinor: true } }),
          tx.withdrawalRequest.aggregate({ where: { walletId: wallet.id, status: { in: [...RESERVED] } }, _sum: { amountMinor: true } }),
        ]);
        const available = (credits._sum.amountMinor ?? 0n) - (debits._sum.amountMinor ?? 0n) - (holds._sum.amountMinor ?? 0n) - (reserved._sum.amountMinor ?? 0n);
        if (amountMinor > available) throw new BadRequestException("扣减金额超过用户当前可用余额");
      }
      await tx.ledgerEntry.create({ data: {
        walletId: wallet.id, sourceType: "ADMIN_ADJUSTMENT", sourceId: adjustmentId,
        direction, amountMinor, currency, idempotencyKey: "admin-adjustment:" + adjustmentId,
      } });
      await tx.auditEvent.create({ data: {
        actorType: "ADMIN", actorId: adminId, action: "WALLET_MANUAL_ADJUSTMENT",
        targetType: "WALLET_ADJUSTMENT", targetId: adjustmentId,
        metadata: { userId: user.id, phone: user.phone, currency, amountMinor: amountMinor.toString(), direction, reason, taskTitle: taskTitle || null },
      } });
      return { id: adjustmentId, userId: user.id, phone: user.phone, currency, amountMinor: amountMinor.toString(), direction, status: "COMPLETED" };
    }, { isolationLevel: "Serializable" });
  }

  async runFinanceReconciliation(adminId: string) {
    const startedAt = new Date();
    const items: Array<Record<string, unknown>> = [];
    const batchSize = 1000;
    const fetchAll = async <T>(load: (skip: number, take: number) => Promise<T[]>): Promise<T[]> => {
      const all: T[] = [];
      for (let skip = 0; ; skip += batchSize) {
        const batch = await load(skip, batchSize);
        all.push(...batch);
        if (batch.length < batchSize) return all;
      }
    };
    const [approvedSubmissions, paidWithdrawals, successfulPayouts] = await Promise.all([
      fetchAll((skip, take) => prisma.taskSubmission.findMany({
        where: { status: "APPROVED" }, skip, take, orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        include: { claim: { include: { task: { select: { title: true, rewardMinor: true, currency: true } }, user: { select: { phone: true } } } } },
      })),
      fetchAll((skip, take) => prisma.withdrawalRequest.findMany({
        where: { status: "PAID" }, skip, take, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, walletId: true, amountMinor: true, currency: true, payoutCurrency: true, payoutAmountMinor: true, createdAt: true },
      })),
      fetchAll((skip, take) => prisma.paymentTransaction.findMany({
        where: { flow: "PAYOUT", status: "SUCCEEDED" }, skip, take, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, withdrawalRequestId: true, amountMinor: true, currency: true, providerCode: true, metadata: true },
      })),
    ]);
    const claimIds = [...new Set(approvedSubmissions.map(x => x.claimId))];
    const withdrawalIds = [...new Set(paidWithdrawals.map(x => x.id))];
    const [taskEntries, payoutEntries, payoutTransactions] = await Promise.all([
      claimIds.length ? prisma.ledgerEntry.findMany({ where: { sourceType: "TASK_REWARD", sourceId: { in: claimIds } },
        select: { sourceId: true, direction: true, amountMinor: true, currency: true } }) : [],
      withdrawalIds.length ? prisma.ledgerEntry.findMany({ where: { sourceType: "WITHDRAWAL_PAYOUT", sourceId: { in: withdrawalIds } },
        select: { sourceId: true, direction: true, amountMinor: true, currency: true } }) : [],
      withdrawalIds.length ? prisma.paymentTransaction.findMany({ where: { withdrawalRequestId: { in: withdrawalIds }, flow: "PAYOUT", status: "SUCCEEDED" },
        select: { id: true, withdrawalRequestId: true, amountMinor: true, currency: true, metadata: true } }) : [],
    ]);
    const groupBySource = <T extends { sourceId: string }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const row of rows) map.set(row.sourceId, [...(map.get(row.sourceId) ?? []), row]);
      return map;
    };
    const taskEntriesByClaim = groupBySource(taskEntries);
    const payoutEntriesByWithdrawal = groupBySource(payoutEntries);
    const payoutsByWithdrawal = new Map<string, typeof payoutTransactions>();
    for (const row of payoutTransactions) if (row.withdrawalRequestId) {
      payoutsByWithdrawal.set(row.withdrawalRequestId, [...(payoutsByWithdrawal.get(row.withdrawalRequestId) ?? []), row]);
    }
    const checkedClaims = new Set<string>();
    for (const x of approvedSubmissions) {
      if (checkedClaims.has(x.claimId)) continue;
      checkedClaims.add(x.claimId);
      const rows = taskEntriesByClaim.get(x.claimId) ?? [];
      const expectedAmount = x.claim.task.rewardMinor;
      const expectedCurrency = x.claim.task.currency.trim().toUpperCase();
      if (rows.length !== 1) {
        items.push({ type: rows.length === 0 ? "TASK_REWARD_MISSING" : "TASK_REWARD_DUPLICATE", recordId: x.claimId,
          user: x.claim.user.phone, task: x.claim.task.title, expectedAmountMinor: expectedAmount.toString(), expectedCurrency,
          actualEntryCount: rows.length, message: rows.length === 0 ? "审核已通过，但未找到任务奖励流水" : "同一任务奖励存在多条流水" });
        continue;
      }
      const entry = rows[0];
      if (entry.direction !== "CREDIT" || entry.amountMinor !== expectedAmount || entry.currency.trim().toUpperCase() !== expectedCurrency) {
        items.push({ type: "TASK_REWARD_AMOUNT_MISMATCH", recordId: x.claimId,
          expectedAmountMinor: expectedAmount.toString(), expectedCurrency, actualAmountMinor: entry.amountMinor.toString(),
          actualCurrency: entry.currency.trim(), actualDirection: entry.direction, message: "任务奖励流水的金额、币种或方向与任务配置不一致" });
      }
    }
    for (const x of paidWithdrawals) {
      const ledgerRows = payoutEntriesByWithdrawal.get(x.id) ?? [];
      if (ledgerRows.length !== 1) {
        items.push({ type: ledgerRows.length === 0 ? "WITHDRAWAL_LEDGER_MISSING" : "WITHDRAWAL_LEDGER_DUPLICATE", recordId: x.id,
          expectedAmountMinor: x.amountMinor.toString(), expectedCurrency: x.currency.trim(), actualEntryCount: ledgerRows.length,
          message: ledgerRows.length === 0 ? "提现已标记付款成功，但未找到钱包扣款流水" : "同一提现存在多条钱包扣款流水" });
      } else {
        const entry = ledgerRows[0];
        if (entry.direction !== "DEBIT" || entry.amountMinor !== x.amountMinor || entry.currency.trim().toUpperCase() !== x.currency.trim().toUpperCase()) {
          items.push({ type: "WITHDRAWAL_LEDGER_AMOUNT_MISMATCH", recordId: x.id,
            expectedAmountMinor: x.amountMinor.toString(), expectedCurrency: x.currency.trim(), expectedDirection: "DEBIT",
            actualAmountMinor: entry.amountMinor.toString(), actualCurrency: entry.currency.trim(), actualDirection: entry.direction,
            message: "提现钱包扣款流水的金额、币种或方向与提现申请不一致" });
        }
      }
      const transactions = payoutsByWithdrawal.get(x.id) ?? [];
      if (transactions.length !== 1) {
        items.push({ type: transactions.length === 0 ? "WITHDRAWAL_TRANSACTION_MISSING" : "WITHDRAWAL_TRANSACTION_DUPLICATE", recordId: x.id,
          expectedAmountMinor: (x.payoutAmountMinor ?? x.amountMinor).toString(), expectedCurrency: (x.payoutCurrency ?? x.currency).trim(),
          actualTransactionCount: transactions.length, message: transactions.length === 0 ? "提现已标记付款成功，但未找到成功的代付交易记录" : "同一提现存在多条成功代付交易" });
      } else {
        const transaction = transactions[0];
        const expectedAmount = x.payoutAmountMinor ?? x.amountMinor;
        const expectedCurrency = (x.payoutCurrency ?? x.currency).trim().toUpperCase();
        const paymentMetadata = transaction.metadata && typeof transaction.metadata === "object" ? transaction.metadata as Record<string, unknown> : {};
        const metadataActualAmount = String(paymentMetadata.actualPayoutAmountMinor ?? "");
        if (transaction.amountMinor <= 0n || transaction.amountMinor !== expectedAmount ||
            transaction.currency.trim().toUpperCase() !== expectedCurrency ||
            (metadataActualAmount !== "" && metadataActualAmount !== transaction.amountMinor.toString())) {
          items.push({ type: "WITHDRAWAL_PAYOUT_AMOUNT_MISMATCH", recordId: x.id,
            expectedAmountMinor: expectedAmount.toString(), expectedCurrency,
            actualAmountMinor: transaction.amountMinor.toString(), metadataActualAmountMinor: metadataActualAmount || null,
            actualCurrency: transaction.currency.trim(),
            message: "代付交易金额、币种或付款快照与提现出款记录不一致" });
        }
      }
    }
    const paidWithdrawalSet = new Set(paidWithdrawals.map(x => x.id));
    for (const x of successfulPayouts) {
      if (!x.withdrawalRequestId) {
        items.push({
          type: "PAYOUT_WITHDRAWAL_LINK_MISSING", recordId: x.id, providerCode: x.providerCode,
          amountMinor: x.amountMinor.toString(), currency: x.currency.trim(), message: "存在成功代付交易，但没有关联提现申请",
        });
      } else if (!paidWithdrawalSet.has(x.withdrawalRequestId)) {
        items.push({
          type: "PAYOUT_STATUS_MISMATCH", recordId: x.id, providerCode: x.providerCode,
          amountMinor: x.amountMinor.toString(), currency: x.currency.trim(), message: "代付交易成功，但关联提现单并非已付款状态",
        });
      }
    }
    const checkedCount = approvedSubmissions.length + paidWithdrawals.length + successfulPayouts.length;
    const exceptionCount = items.length;
    const scanLimitReached = false;
    const completedAt = new Date();
    const status = scanLimitReached ? "INCOMPLETE" : exceptionCount === 0 ? "SUCCESS" : "FAILED";
    const summary = { approvedTaskSubmissionsChecked: approvedSubmissions.length, uniqueApprovedClaimsChecked: checkedClaims.size,
      paidWithdrawalsChecked: paidWithdrawals.length, successfulPayoutTransactionsChecked: successfulPayouts.length,
      amountDirectionCurrencyChecks: true, batchSize, scanLimitReached, exceptionCount };
    const run = await prisma.financeReconciliationRun.create({ data: {
      triggerType: "MANUAL", status, checkedCount, exceptionCount, summary, items: items.slice(0, 500) as Prisma.InputJsonValue,
      createdByAdminId: adminId, createdAt: startedAt, completedAt,
    } });
    return { id: run.id, status: run.status, checkedCount: run.checkedCount, exceptionCount, summary, items: items.slice(0, 500),
      createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null };
  }

  async reconciliationRuns(query: { page?: string; pageSize?: string }) {
    const pg = pageArgs(query.page, query.pageSize);
    const [total, rows] = await prisma.$transaction([
      prisma.financeReconciliationRun.count(),
      prisma.financeReconciliationRun.findMany({ orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take,
        select: { id: true, triggerType: true, status: true, checkedCount: true, exceptionCount: true, summary: true, createdByAdminId: true, createdAt: true, completedAt: true } }),
    ]);
    return { ...pg, total, items: rows.map(x => ({ ...x, createdAt: x.createdAt.toISOString(), completedAt: x.completedAt?.toISOString() ?? null })) };
  }

  async reconciliationRunDetail(id: string) {
    if (!isUuid(id)) throw new BadRequestException("对账运行 ID 格式不正确");
    const row = await prisma.financeReconciliationRun.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("对账运行记录不存在");
    return { ...row, createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null };
  }

}
