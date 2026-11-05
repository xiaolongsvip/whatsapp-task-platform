import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@wtp/database";
import type { ImportContactNumbersDto } from "./contact-numbers.dto";
import { allocateAvailableNumbersToOldestPublishedTask } from "../tasks/task-slot-allocation";

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
        const created = await tx.contactNumber.createMany({
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
        duplicateCount += newPhones.length - created.count;
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

      // Newly imported numbers immediately join the oldest published task.
      const allocation = await allocateAvailableNumbersToOldestPublishedTask(tx);

      return {
        batchId: finalBatch.id,
        totalRows: finalBatch.totalRows,
        importedCount: finalBatch.importedCount,
        duplicateCount: finalBatch.duplicateCount,
        invalidCount: finalBatch.invalidCount,
        allocatedCount: allocation.allocatedCount + allocation.reassignedCount,
        allocatedTaskId: allocation.taskId,
        message: "导入完成；已授权号码已自动分配给最早发布且仍有效的任务（如有）。",
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
      // Serialize the block action against claims and other number mutations.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM contact_numbers WHERE id = ${numberId}::uuid FOR UPDATE
      `;
      const number = await tx.contactNumber.findUnique({
        where: { id: numberId },
        include: {
          assignments: {
            where: { status: "ASSIGNED" },
            orderBy: { assignedAt: "desc" },
            take: 1,
            include: {
              claim: {
                include: {
                  submissions: {
                    where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
                    select: { id: true },
                    take: 1,
                  },
                },
              },
            },
          },
          taskSlots: { take: 1, select: { id: true, claimId: true, status: true } },
        },
      });
      if (!number) throw new NotFoundException("号码记录不存在。");

      const assignment = number.assignments[0];
      if (assignment?.claim.submissions.length) {
        throw new ConflictException("该号码关联的任务正在审核中，请先完成审核，再封禁号码。");
      }

      const now = new Date();
      if (assignment) {
        const claim = assignment.claim;
        if (["CLAIMED", "IN_PROGRESS", "REJECTED"].includes(claim.status)) {
          await tx.taskClaim.update({
            where: { id: claim.id },
            data: { status: "CANCELLED" },
          });
          await tx.task.updateMany({
            where: { id: claim.taskId, claimedCount: { gt: 0 } },
            data: { claimedCount: { decrement: 1 } },
          });
        }

        await tx.contactAssignment.update({
          where: { id: assignment.id },
          data: { status: "RELEASED", releasedAt: now },
        });
      }

      // A blocked number must never leave a reusable slot behind. USED is the
      // terminal slot state in the current schema; the number itself remains
      // BLOCKED and cannot be allocated by the inventory allocator.
      await tx.taskSlot.updateMany({
        where: { contactNumberId: numberId, status: { in: ["AVAILABLE", "ASSIGNED"] } },
        data: {
          status: "USED",
          usedAt: now,
          releasedAt: now,
        },
      });

      const updated = await tx.contactNumber.update({
        where: { id: numberId },
        data: {
          status: "BLOCKED",
          consentStatus: "REVOKED",
          revokedAt: now,
        },
      });
      await tx.contactConsentEvent.create({
        data: {
          contactNumberId: numberId,
          status: "REVOKED",
          source: `Admin block action: ${adminId}`,
          recordedAt: now,
        },
      });

      return {
        id: updated.id,
        phoneE164: updated.phoneE164,
        status: updated.status,
        consentStatus: updated.consentStatus,
        cancelledClaimId: assignment && ["CLAIMED", "IN_PROGRESS", "REJECTED"].includes(assignment.claim.status)
          ? assignment.claim.id
          : null,
      };
    });
  }
}
