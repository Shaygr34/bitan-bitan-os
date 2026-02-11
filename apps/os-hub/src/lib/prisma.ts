import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient | undefined {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not set — Prisma client unavailable");
    return undefined;
  }
  return new PrismaClient();
}

// API routes execute at runtime where DATABASE_URL is required.
// The assertion avoids redundant undefined-checks in every route handler.
export const prisma = (globalForPrisma.prisma ?? createPrismaClient()) as PrismaClient;

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.prisma = prisma;
}
