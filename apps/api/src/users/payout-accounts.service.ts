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
    const details = JSON.stringify({ accountNumber, phoneNumber: input.phoneNumber?.trim() || null });
    const encrypted = encrypt(details);
    const existing = await prisma.payoutAccount.count({ where: { userId, status: "ACTIVE" } });
    const row = await prisma.payoutAccount.create({
      data: {
        userId, countryCode, currency, providerCode, methodCode, accountHolder,
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
    return { ...row, countryCode: row.countryCode.trim(), currency: row.currency.trim(), createdAt: row.createdAt.toISOString() };
  }

  async remove(userId: string, accountId: string) {
    const account = await prisma.payoutAccount.findFirst({ where: { id: accountId, userId, status: "ACTIVE" } });
    if (!account) throw new BadRequestException("Payout account not found.");
    const linked = await prisma.withdrawalRequest.count({ where: { payoutAccountId: accountId, status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] } } });
    if (linked > 0) throw new BadRequestException("This payout account is linked to a pending withdrawal.");
    await prisma.payoutAccount.update({ where: { id: accountId }, data: { status: "DISABLED", isDefault: false } });
    const replacement = await prisma.payoutAccount.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    if (replacement) await prisma.payoutAccount.update({ where: { id: replacement.id }, data: { isDefault: true } });
    return { success: true };
  }
}
