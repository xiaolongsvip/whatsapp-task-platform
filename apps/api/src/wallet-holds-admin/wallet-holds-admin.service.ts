import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma, type Prisma } from "@wtp/database";

const RESERVED = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] as const;

@Injectable()
export class WalletHoldsAdminService {
  async list(walletId?: string, status?: string, page = 1, pageSize = 20) {
    const take = Math.min(100, Math.max(1, pageSize));
    const where: Prisma.WalletHoldWhereInput = {
      ...(walletId ? { walletId } : {}),
      ...(status === "ACTIVE" || status === "RELEASED" || status === "CAPTURED"
        ? { status: status as NonNullable<Prisma.WalletHoldWhereInput["status"]> }
        : {}),
    };
    const [total, items] = await prisma.$transaction([
      prisma.walletHold.count({ where }),
      prisma.walletHold.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (Math.max(1, page) - 1) * take, take,
        include: { wallet: { select: { userId: true, currency: true, user: { select: { phone: true } } } }, events: { orderBy: { createdAt: "asc" } } },
      }),
    ]);
    return { total, page: Math.max(1, page), pageSize: take, items: items.map((h) => ({
      id: h.id, walletId: h.walletId, userId: h.wallet.userId, phone: h.wallet.user.phone,
      amountMinor: h.amountMinor.toString(), currency: h.currency.trim(), status: h.status,
      reason: h.reason, referenceType: h.referenceType, referenceId: h.referenceId,
      createdAt: h.createdAt.toISOString(), resolvedAt: h.resolvedAt?.toISOString() ?? null,
      events: h.events.map((e) => ({ id: e.id, type: e.eventType, amountMinor: e.amountMinor.toString(), reason: e.reason, adminId: e.adminId, createdAt: e.createdAt.toISOString() })),
    })) };
  }

  async freeze(input: { walletId: string; amountMinor: string; reason: string; idempotencyKey: string; referenceType?: string; referenceId?: string }, adminId: string) {
    const amount = this.amount(input.amountMinor);
    const reason = this.reason(input.reason);
    const key = this.key(input.idempotencyKey);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const existing = await tx.walletHold.findUnique({ where: { idempotencyKey: key } });
          if (existing) return { success: true, holdId: existing.id, status: existing.status, idempotent: true };
          const wallet = await tx.wallet.findUnique({ where: { id: input.walletId }, select: { id: true, currency: true } });
          if (!wallet) throw new NotFoundException("钱包不存在。");
          const [entries, withdrawals, holds] = await Promise.all([
            tx.ledgerEntry.findMany({ where: { walletId: wallet.id }, select: { direction: true, amountMinor: true } }),
            tx.withdrawalRequest.findMany({ where: { walletId: wallet.id, status: { in: [...RESERVED] } }, select: { amountMinor: true } }),
            tx.walletHold.aggregate({ where: { walletId: wallet.id, status: "ACTIVE" }, _sum: { amountMinor: true } }),
          ]);
          const credits = entries.filter((e) => e.direction === "CREDIT").reduce((v,e) => v+e.amountMinor,0n);
          const debits = entries.filter((e) => e.direction === "DEBIT").reduce((v,e) => v+e.amountMinor,0n);
          const reserved = withdrawals.reduce((v,e) => v+e.amountMinor,0n);
          const frozen = holds._sum.amountMinor ?? 0n;
          if (amount > credits - debits - reserved - frozen) throw new BadRequestException("冻结金额超过当前可用余额。");
          const hold = await tx.walletHold.create({ data: {
            walletId: wallet.id, amountMinor: amount, currency: wallet.currency, reason,
            idempotencyKey: key, createdByAdminId: adminId,
            referenceType: input.referenceType?.trim().slice(0,80) || null,
            referenceId: input.referenceId?.trim().slice(0,160) || null,
          } });
          await tx.walletHoldEvent.create({ data: { holdId: hold.id, eventType: "FROZEN", amountMinor: amount, reason, adminId, idempotencyKey: key + ":event" } });
          return { success: true, holdId: hold.id, status: hold.status, amountMinor: amount.toString(), currency: wallet.currency.trim() };
        }, { isolationLevel: "Serializable" });
      } catch (e) {
        if (this.code(e) === "P2034" && attempt < 2) continue;
        if (this.code(e) === "P2002") throw new ConflictException("幂等键已被使用，请勿重复提交。");
        throw e;
      }
    }
    throw new ConflictException("钱包余额正在变化，请重试。");
  }

  async resolve(holdId: string, action: "RELEASE" | "CAPTURE", reasonInput: string, idempotencyKey: string, adminId: string) {
    const reason = this.reason(reasonInput);
    const key = this.key(idempotencyKey);
    return prisma.$transaction(async (tx) => {
      const hold = await tx.walletHold.findUnique({ where: { id: holdId } });
      if (!hold) throw new NotFoundException("冻结记录不存在。");
      const eventType = action === "RELEASE" ? "RELEASED" : "CAPTURED";
      const prior = await tx.walletHoldEvent.findUnique({ where: { idempotencyKey: key } });
      if (prior) return { success: true, holdId, status: action === "RELEASE" ? "RELEASED" : "CAPTURED", idempotent: true };
      if (hold.status !== "ACTIVE") throw new ConflictException("该冻结记录已处理，不能重复操作。");
      const changed = await tx.walletHold.updateMany({ where: { id: holdId, status: "ACTIVE" }, data: { status: action === "RELEASE" ? "RELEASED" : "CAPTURED", resolvedByAdminId: adminId, resolvedAt: new Date() } });
      if (changed.count !== 1) throw new ConflictException("冻结记录状态已变化，请刷新后重试。");
      if (action === "CAPTURE") {
        await tx.ledgerEntry.create({ data: {
          walletId: hold.walletId, sourceType: "WALLET_HOLD_CAPTURE", sourceId: hold.id,
          direction: "DEBIT", amountMinor: hold.amountMinor, currency: hold.currency,
          idempotencyKey: "wallet-hold-capture:" + hold.id,
        } });
      }
      await tx.walletHoldEvent.create({ data: { holdId, eventType, amountMinor: hold.amountMinor, reason, adminId, idempotencyKey: key } });
      return { success: true, holdId, status: action === "RELEASE" ? "RELEASED" : "CAPTURED", amountMinor: hold.amountMinor.toString(), currency: hold.currency.trim() };
    }, { isolationLevel: "Serializable" });
  }

  private amount(value: string) {
    if (!/^[1-9]\d{0,17}$/.test(value)) throw new BadRequestException("amountMinor 必须是正整数金额（最小货币单位）。");
    return BigInt(value);
  }
  private reason(value: string) { const v = value?.trim(); if (!v || v.length > 500) throw new BadRequestException("操作原因不能为空且不能超过 500 个字符。"); return v; }
  private key(value: string) { const v = value?.trim(); if (!v || v.length > 180) throw new BadRequestException("必须提供 1–180 个字符的幂等键。"); return v; }
  private code(error: unknown) { return typeof error === "object" && error !== null && "code" in error ? String((error as {code?:unknown}).code) : ""; }
}
