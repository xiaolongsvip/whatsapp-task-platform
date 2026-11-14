import type { Prisma } from "@wtp/database";

/**
 * Serializes registration and administrator restrictions by the app-scoped
 * Android device identifier. This prevents check-then-write races in the
 * single-device/single-account policy.
 */
export async function lockUserDeviceIdentifier(
  tx: Prisma.TransactionClient,
  deviceIdentifier: string,
): Promise<void> {
  // Hash collisions only add serialization; they cannot weaken the policy.
  // Project PostgreSQL VOID to a boolean so Prisma can deserialize the result.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${deviceIdentifier}, 0)) IS NULL AS locked`;
}
