import type { Prisma } from "@wtp/database";

type TransactionClient = Prisma.TransactionClient;

/**
 * Assigns every unbound, consented, available number to the oldest active
 * published task. The advisory transaction lock serializes imports and task
 * publishing so two requests cannot allocate the same inventory concurrently.
 */
export async function lockTaskSlotAllocation(tx: TransactionClient): Promise<void> {
  // The lock function returns PostgreSQL VOID; project it to a boolean so Prisma can deserialize the result.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(1732050807) IS NULL AS locked`;
}

export async function allocateAvailableNumbersToOldestPublishedTask(
  tx: TransactionClient,
): Promise<{ taskId: string | null; allocatedCount: number; reassignedCount: number }> {
  await lockTaskSlotAllocation(tx);

  const now = new Date();

  // Recover legacy voided rows created before unsuccessful numbers were
  // recycled. Only numbers that are still AVAILABLE with GRANTED consent
  // qualify; blocked/revoked/completed numbers remain unavailable.
  await tx.taskSlot.updateMany({
    where: {
      status: "VOIDED",
      contactNumber: {
        is: { status: "AVAILABLE", consentStatus: "GRANTED" },
      },
    },
    data: {
      status: "AVAILABLE",
      claimId: null,
      assignedAt: null,
      usedAt: null,
    },
  });

  const targetTask = await tx.task.findFirst({
    where: {
      status: "PUBLISHED",
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  if (!targetTask) {
    return { taskId: null, allocatedCount: 0, reassignedCount: 0 };
  }

  const inactiveTasks = await tx.task.findMany({
    where: {
      OR: [
        { status: { in: ["PAUSED", "CLOSED"] } },
        {
          status: "PUBLISHED",
          OR: [
            { startsAt: { gt: now } },
            { endsAt: { lt: now } },
          ],
        },
      ],
    },
    select: { id: true },
  });
  const inactiveTaskIds = inactiveTasks.map((task) => task.id);

  let reassignedCount = 0;
  if (inactiveTaskIds.length) {
    const reassigned = await tx.taskSlot.updateMany({
      where: {
        taskId: { in: inactiveTaskIds },
        status: "AVAILABLE",
        claimId: null,
        contactNumber: {
          is: { status: "AVAILABLE", consentStatus: "GRANTED" },
        },
      },
      data: { taskId: targetTask.id },
    });
    reassignedCount = reassigned.count;
  }

  const availableNumbers = await tx.contactNumber.findMany({
    where: {
      status: "AVAILABLE",
      consentStatus: "GRANTED",
      taskSlots: { none: {} },
    },
    select: { id: true },
    orderBy: [{ importOrder: "asc" }, { id: "asc" }],
  });

  let allocatedCount = 0;
  if (availableNumbers.length) {
    const created = await tx.taskSlot.createMany({
      data: availableNumbers.map((number) => ({
        taskId: targetTask.id,
        contactNumberId: number.id,
      })),
      skipDuplicates: true,
    });
    allocatedCount = created.count;
  }

  return { taskId: targetTask.id, allocatedCount, reassignedCount };
}
