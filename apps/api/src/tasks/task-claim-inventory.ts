import type { Prisma } from "@wtp/database";

type TransactionClient = Prisma.TransactionClient;

/**
 * Releases the number reserved by an unsuccessful claim while retaining the
 * claim, submission, and review rows as history. Only currently consented
 * numbers return to AVAILABLE inventory.
 */
export async function recycleUnsuccessfulTaskClaimInventory(
  tx: TransactionClient,
  claimId: string,
  taskId: string,
  now = new Date(),
): Promise<{ recycled: boolean }> {
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

  let reservationWasActive = false;
  if (assignment?.status === "ASSIGNED") {
    reservationWasActive = true;
    await tx.contactAssignment.update({
      where: { id: assignment.id },
      data: { status: "RELEASED", releasedAt: now },
    });
    await tx.contactNumber.updateMany({
      where: {
        id: assignment.contactNumberId,
        status: "ASSIGNED",
        consentStatus: "GRANTED",
      },
      data: { status: "AVAILABLE" },
    });
  }

  const contactNumberId = assignment?.contactNumberId ?? slot?.contactNumberId;
  const number = contactNumberId
    ? await tx.contactNumber.findUnique({
        where: { id: contactNumberId },
        select: { status: true, consentStatus: true },
      })
    : null;
  const canRecycle = number?.status === "AVAILABLE" && number.consentStatus === "GRANTED";

  if (slot?.status === "ASSIGNED") {
    reservationWasActive = true;
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
