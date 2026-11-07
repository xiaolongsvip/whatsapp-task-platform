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

    const countryCode = input.countryCode?.trim().toUpperCase() || null;
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
      throw new BadRequestException("国家/地区代码必须使用 ISO 两位字母代码，例如 KE、NG、PK。");
    }
    const countryName = input.countryName?.trim() || null;
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
            countryCode,
            countryName,
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
        countryCode: true,
        countryName: true,
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


  async addSingle(adminId: string, input: { phone: string; countryCode: string; countryName: string; consentConfirmed: boolean }) {
    if (!input.consentConfirmed) throw new BadRequestException("请确认已获得号码持有人的有效授权。");
    const digits = normalizePhone(input.phone || "");
    if (!digits) throw new BadRequestException("手机号格式无效，请输入包含国家区号的完整号码。");
    const countryCode = input.countryCode?.trim().toUpperCase();
    if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) throw new BadRequestException("请选择所属国家/地区。");
    const countryName = input.countryName?.trim();
    if (!countryName) throw new BadRequestException("请选择所属国家/地区。");
    const phoneE164 = `+${digits}`;
    const exists = await prisma.contactNumber.findUnique({ where: { phoneE164 }, select: { id: true } });
    if (exists) throw new ConflictException("该抽检号码已存在，请勿重复添加。");
    const now = new Date();
    const created = await prisma.$transaction(async tx => {
      const number = await tx.contactNumber.create({ data: { phoneE164, countryCode, countryName, status: "AVAILABLE", consentStatus: "GRANTED", consentSource: `Admin manual entry: ${adminId}`, consentedAt: now } });
      await tx.contactConsentEvent.create({ data: { contactNumberId: number.id, status: "GRANTED", source: `Admin manual entry: ${adminId}`, recordedAt: now } });
      await tx.auditEvent.create({ data: { actorType: "ADMIN", actorId: adminId, action: "CONTACT_SAMPLING_NUMBER_ADDED", targetType: "CONTACT_NUMBER", targetId: number.id, metadata: { countryCode, countryName } } });
      const allocation = await allocateAvailableNumbersToOldestPublishedTask(tx);
      return { number, allocation };
    });
    return { id: created.number.id, phoneE164: created.number.phoneE164, countryCode, countryName, allocatedCount: created.allocation.allocatedCount + created.allocation.reassignedCount };
  }

  async samplingResults(pageInput?: string, pageSizeInput?: string, statusInput?: string) {
    const page = Math.max(1, Number(pageInput) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeInput) || 20));
    const where: any = {};
    if (statusInput === "PENDING" || statusInput === "REVIEW") where.status = "ASSIGNED";
    if (statusInput === "COMPLETED") where.status = "COMPLETED";
    const [total, rows, notes] = await Promise.all([
      prisma.contactAssignment.count({ where }),
      prisma.contactAssignment.findMany({ where, include: { contactNumber: true, user: true, claim: { include: { task: true, submissions: { orderBy: { submittedAt: "desc" }, take: 1 } } } }, orderBy: { assignedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.auditEvent.findMany({ where: { targetType: "CONTACT_SAMPLING_RESULT" }, orderBy: { createdAt: "desc" }, take: 500 }),
    ]);
    const noteMap = new Map<string, any>();
    for (const note of notes) { const meta = note.metadata as any; if (meta?.claimId && !noteMap.has(meta.claimId)) noteMap.set(meta.claimId, { actualResult: meta.actualResult, handlingStatus: meta.handlingStatus, updatedAt: note.createdAt.toISOString() }); }
    return { total, page, pageSize, records: rows.map(row => ({ id: row.id, claimId: row.claimId, taskId: row.claim.taskId, taskTitle: row.claim.task.title, phone: row.contactNumber.phoneE164, userPhone: row.user.phone, assignedAt: row.assignedAt.toISOString(), taskStatus: row.claim.status, actualResult: noteMap.get(row.claimId)?.actualResult ?? row.claim.submissions[0]?.status ?? "", handlingStatus: noteMap.get(row.claimId)?.handlingStatus ?? (row.claim.status === "APPROVED" ? "COMPLETED" : row.claim.status === "REJECTED" ? "FAILED" : "PENDING"), updatedAt: noteMap.get(row.claimId)?.updatedAt ?? row.assignedAt.toISOString() })) };
  }

  async saveSamplingResult(adminId: string, input: { claimId: string; actualResult: string; handlingStatus: string }) {
    if (!input.claimId || !input.actualResult?.trim()) throw new BadRequestException("请填写实际收件结果。");
    const assignment = await prisma.contactAssignment.findUnique({ where: { claimId: input.claimId }, select: { id: true, claimId: true } });
    if (!assignment) throw new NotFoundException("没有找到对应的抽检任务分配记录。");
    const allowed = ["PENDING", "COMPLETED", "FAILED", "REVIEW"];
    if (!allowed.includes(input.handlingStatus)) throw new BadRequestException("处理状态无效。");
    return prisma.auditEvent.create({ data: { actorType: "ADMIN", actorId: adminId, action: "CONTACT_SAMPLING_RESULT_UPDATED", targetType: "CONTACT_SAMPLING_RESULT", targetId: assignment.id, metadata: { claimId: input.claimId, actualResult: input.actualResult.trim(), handlingStatus: input.handlingStatus } } });
  }

  async importHistory(pageInput?: string, pageSizeInput?: string, statusInput?: string) {
    const page = Math.max(1, Number(pageInput) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeInput) || 20));
    const where: any = {};
    if (statusInput === "SUCCESS") where.importedCount = { gt: 0 };
    if (statusInput === "FAILED") where.importedCount = 0;
    const [total, batches] = await prisma.$transaction([
      prisma.contactImportBatch.count({ where }),
      prisma.contactImportBatch.findMany({ where, include: { createdBy: { select: { email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page, pageSize, records: batches.map(batch => ({ id: batch.id, fileName: batch.fileName || "手动导入", status: batch.importedCount > 0 ? "SUCCESS" : "FAILED", importedCount: batch.importedCount, duplicateCount: batch.duplicateCount, invalidCount: batch.invalidCount, totalRows: batch.totalRows, updatedAt: batch.createdAt.toISOString(), operator: batch.createdBy?.email || "—" })) };
  }

  async block(numberId: string, adminId: string) {
    return prisma.$transaction(async (tx) => {
      // Match claim cancellation/expiry lock order: claim first, then number,
      // then slot. This avoids a number/claim lock inversion during cleanup.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM task_claims
        WHERE id IN (
          SELECT claim_id
          FROM contact_assignments
          WHERE contact_number_id = ${numberId}::uuid
            AND status = 'ASSIGNED'
        )
        ORDER BY id
        FOR UPDATE
      `;
      // Serialize against new claims after locking any existing active claims.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM contact_numbers WHERE id = ${numberId}::uuid FOR UPDATE
      `;
      const number = await tx.contactNumber.findUnique({
        where: { id: numberId },
        include: {
          assignments: {
            where: { status: "ASSIGNED" },
            orderBy: { assignedAt: "desc" },
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

      // Blocking is idempotent: a repeated admin request must not append
      // duplicate consent-revocation events or rewrite the original timestamp.
      if (number.status === "BLOCKED" && number.consentStatus === "REVOKED") {
        return {
          id: number.id,
          phoneE164: number.phoneE164,
          status: number.status,
          consentStatus: number.consentStatus,
          cancelledClaimIds: [],
          alreadyBlocked: true,
        };
      }

      const assignments = number.assignments;
      if (assignments.some((assignment) => assignment.claim.submissions.length > 0)) {
        throw new ConflictException("该号码关联的任务正在审核中，请先完成审核，再封禁号码。");
      }

      const now = new Date();
      const cancelledClaimIds: string[] = [];
      for (const assignment of assignments) {
        const claim = assignment.claim;
        if (["CLAIMED", "IN_PROGRESS", "REJECTED", "SUBMITTED", "UNDER_REVIEW"].includes(claim.status)) {
          await tx.taskClaim.update({
            where: { id: claim.id },
            data: { status: "CANCELLED" },
          });
          await tx.task.updateMany({
            where: { id: claim.taskId, claimedCount: { gt: 0 } },
            data: { claimedCount: { decrement: 1 } },
          });
          cancelledClaimIds.push(claim.id);
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
        cancelledClaimIds,
      };
    });
  }
}
