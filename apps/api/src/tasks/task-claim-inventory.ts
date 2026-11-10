import type { Prisma } from "@wtp/database";
import { lockTaskSlotAllocation } from "./task-slot-allocation";

type TransactionClient = Prisma.TransactionClient;

/**
 * Releases the number reserved by an unsuccessful claim while retaining the
 * claim, submission, and review rows as history. Only currently consented
 * numbers return to AVAILABLE inventory.
 *
 * Lock order is contact number -> task slot -> assignment. This matches the
 * admin recycle and user cancellation paths to avoid inventory deadlocks.
 */
export async function recycleUnsuccessfulTaskClaimInventory(
  tx: TransactionClient,
  claimId: string,
  taskId: string,
  now = new Date(),
): Promise<{ recycled: boolean }> {
  await lockTaskSlotAllocation(tx);
  const [initialAssignment, initialSlot] = await Promise.all([
    tx.contactAssignment.findUnique({
      where: { claimId },
      select: { id: true, contactNumberId: true },
    }),
    tx.taskSlot.findUnique({
      where: { claimId },
      select: { id: true, contactNumberId: true },
    }),
  ]);

  if (
    initialAssignment &&
    initialSlot &&
    initialAssignment.contactNumberId !== initialSlot.contactNumberId
  ) {
    throw new Error("领取记录与任务号码关联不一致，已停止自动回收。");
  }

  const initialNumberId = initialAssignment?.contactNumberId ?? initialSlot?.contactNumberId;
  if (initialNumberId) {
    await tx.$queryRaw<Array<{ id: string }>>\`
      SELECT id FROM contact_numbers WHERE id = \${initialNumberId}::uuid FOR UPDATE
    \`;
  }
  if (initialSlot) {
    await tx.$queryRaw<Array<{ id: string }>>\`
      SELECT id FROM task_slots WHERE id = \${initialSlot.id}::uuid FOR UPDATE
    \`;
  }
  if (initialAssignment) {
    await tx.$queryRaw<Array<{ id: string }>>\`
      SELECT id FROM contact_assignments WHERE id = \${initialAssignment.id}::uuid FOR UPDATE
    \`;
  }

  const [assignment, slot] = await Promise.all([
    tx.contactAssignment.findUnique({
      where: { claimId },
      select: { id: true, contactNumberId: true, status: true },
    }),
    tx.taskSlot.findUnique({
      where: { claimId },
      select: { id: true, contactNumberId: true, status: true },
    }),
  ]);

  const contactNumberId = assignment?.contactNumberId ?? slot?.contactNumberId;
  if (assignment && slot && assignment.contactNumberId !== slot.contactNumberId) {
    throw new Error("领取记录与任务号码关联在锁定期间发生变化，已停止自动回收。");
  }

  let reservationWasActive = false;
  if (assignment?.status === "ASSIGNED") {
    reservationWasActive = true;
    await tx.contactAssignment.update({
      where: { id: assignment.id },
      data: { status: "RELEASED", releasedAt: now },
    });
  }

  if (contactNumberId) {
    await tx.contactNumber.updateMany({
      where: { id: contactNumberId, status: "ASSIGNED", consentStatus: "GRANTED" },
      data: { status: "AVAILABLE" },
    });
  }
  const number = contactNumberId
    ? await tx.contactNumber.findUnique({
        where: { id: contactNumberId },
        select: { status: true, consentStatus: true },
      })
    : null;
  const canRecycle = number?.status === "AVAILABLE" && number.consentStatus === "GRANTED";

  if (slot && ["ASSIGNED", "AVAILABLE"].includes(slot.status)) {
    if (slot.status === "ASSIGNED") reservationWasActive = true;
    await tx.taskSlot.update({
      where: { id: slot.id },
      data: canRecycle
        ? {
            status: "AVAILABLE",
            claimId: null,
            assignedAt: null,
            releasedAt: now,
            usedAt: null,
          }
        : {
            status: "VOIDED",
            claimId: null,
            assignedAt: null,
            releasedAt: now,
          },
    });
  }

  if (reservationWasActive) {
    await tx.task.updateMany({
      where: { id: taskId, claimedCount: { gt: 0 } },
      data: { claimedCount: { decrement: 1 } },
    });
  }

  return { recycled: canRecycle && reservationWasActive };
}
