import type { Prisma } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

/**
 * Assigns every unbound, consented, available number to the oldest active
 * published task. The advisory transaction lock serializes imports and task
 * publishing so two requests cannot allocate the same inventory concurrently.
 */
export async function allocateAvailableNumbersToOldestPublishedTask(
  tx: TransactionClient,
): Promise<{ taskId: string | null; allocatedCount: number; reassignedCount: number }> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(1732050807)`;

  const now = new Date();
  const targetTask = await tx.task.findFirst({
    where: {
      status: "PUBLISHED",
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  if (!targetTask) {
    return { taskId: null, allocatedCount: 0, reassignedCount: 0 };
  }

  const inactiveTasks = await tx.task.findMany({
    where: { status: { in: ["PAUSED", "CLOSED"] } },
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
