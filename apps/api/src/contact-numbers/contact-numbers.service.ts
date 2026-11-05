import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@wtp/database";
import type { ImportContactNumbersDto } from "./contact-numbers.dto";

function normalizePhone(input: string): string | null {
  const value = input.trim();
  if (!value || !/^[+\d\s().-]+$/.test(value)) return null;
  let digits = value.replace(/[\s()+.-]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^\d{8,15}$/.test(digits)) return null;
  return digits;
}

@Injectable()
export class ContactNumbersService {
  async importNumbers(adminId: string, input: ImportContactNumbersDto) {
    const consentedAt = new Date(input.consentedAt);
    if (Number.isNaN(consentedAt.getTime()) || consentedAt > new Date()) {
      throw new BadRequestException("号码授权时间无效，且不能晚于当前时间。");
    }

    const seen = new Set<string>();
    const normalized: string[] = [];
    let invalidCount = 0;
    let duplicateCount = 0;

    for (const item of input.numbers) {
      const phone = normalizePhone(item.phone);
      if (!phone) {
        invalidCount += 1;
        continue;
      }
      if (seen.has(phone)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(phone);
      normalized.push(phone);
    }

    return prisma.$transaction(async (tx) => {
      const batch = await tx.contactImportBatch.create({
        data: {
          fileName: input.fileName?.trim() || null,
          totalRows: input.numbers.length,
          invalidCount,
          duplicateCount,
          createdByAdminId: adminId,
        },
      });

      const existing = normalized.length
        ? await tx.contactNumber.findMany({
            where: { phoneE164: { in: normalized } },
            select: { phoneE164: true },
          })
        : [];
      const existingSet = new Set(existing.map((entry) => entry.phoneE164));
      const newPhones = normalized.filter((phone) => !existingSet.has(phone));
      duplicateCount += normalized.length - newPhones.length;

      if (newPhones.length) {
        await tx.contactNumber.createMany({
          data: newPhones.map((phoneE164) => ({
            phoneE164,
            status: "AVAILABLE",
            consentStatus: "GRANTED",
            consentSource: input.consentSource.trim(),
            consentedAt,
            importBatchId: batch.id,
          })),
          skipDuplicates: true,
        });
      }

      const inserted = newPhones.length
        ? await tx.contactNumber.findMany({
            where: { importBatchId: batch.id },
            select: { id: true },
          })
        : [];

      if (inserted.length) {
        await tx.contactConsentEvent.createMany({
          data: inserted.map((number) => ({
            contactNumberId: number.id,
            status: "GRANTED",
            source: input.consentSource.trim(),
            recordedAt: consentedAt,
          })),
        });
      }

      const finalBatch = await tx.contactImportBatch.update({
        where: { id: batch.id },
        data: {
          importedCount: inserted.length,
          duplicateCount,
        },
      });

      return {
        batchId: finalBatch.id,
        totalRows: finalBatch.totalRows,
        importedCount: finalBatch.importedCount,
        duplicateCount: finalBatch.duplicateCount,
        invalidCount: finalBatch.invalidCount,
        message: "导入完成；只有记录为已获得接收同意的号码会进入可分配号码池。",
      };
    });
  }

  async summary() {
    const [total, available, assigned, used, blocked, batches] = await Promise.all([
      prisma.contactNumber.count(),
      prisma.contactNumber.count({ where: { status: "AVAILABLE", consentStatus: "GRANTED" } }),
      prisma.contactNumber.count({ where: { status: "ASSIGNED" } }),
      prisma.contactNumber.count({ where: { status: "USED" } }),
      prisma.contactNumber.count({ where: { status: "BLOCKED" } }),
      prisma.contactImportBatch.count(),
    ]);

    return { total, available, assigned, used, blocked, batches };
  }

  async list(limitInput?: string, searchInput?: string) {
    const parsedLimit = Number.parseInt(limitInput ?? "50", 10);
    const take = Number.isFinite(parsedLimit) ? Math.min(200, Math.max(1, parsedLimit)) : 50;
    const search = searchInput?.trim();

    const numbers = await prisma.contactNumber.findMany({
      where: search ? { phoneE164: { contains: search.replace(/\D/g, "") } } : undefined,
      orderBy: { importOrder: "asc" },
      take,
      select: {
        id: true,
        phoneE164: true,
        status: true,
        consentStatus: true,
        consentSource: true,
        consentedAt: true,
        importOrder: true,
        importedAt: true,
        assignments: {
          orderBy: { assignedAt: "desc" },
          take: 1,
          select: { claimId: true, userId: true, status: true, assignedAt: true },
        },
      },
    });

    return {
      numbers: numbers.map((number) => ({
        ...number,
        importOrder: number.importOrder.toString(),
        consentedAt: number.consentedAt?.toISOString() ?? null,
        importedAt: number.importedAt.toISOString(),
      })),
    };
  }

  async block(numberId: string, adminId: string) {
    return prisma.$transaction(async (tx) => {
      const number = await tx.contactNumber.findUnique({ where: { id: numberId } });
      if (!number) throw new NotFoundException("号码记录不存在。");

      const updated = await tx.contactNumber.update({
        where: { id: numberId },
        data: {
          status: "BLOCKED",
          consentStatus: "REVOKED",
          revokedAt: new Date(),
        },
      });
      await tx.contactConsentEvent.create({
        data: {
          contactNumberId: numberId,
          status: "REVOKED",
          source: `Admin block action: ${adminId}`,
        },
      });

      return {
        id: updated.id,
        phoneE164: updated.phoneE164,
        status: updated.status,
        consentStatus: updated.consentStatus,
      };
    });
  }
}
