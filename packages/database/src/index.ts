import { PrismaClient } from "@prisma/client";

const runtimeEnvironment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env ?? {};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: runtimeEnvironment.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (runtimeEnvironment.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { Prisma } from "@prisma/client";
