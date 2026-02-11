import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not set — Prisma client will connect lazily at runtime");
  }
  return new PrismaClient();
}

// API routes execute at runtime where DATABASE_URL is required.
// PrismaClient is always instantiated; it connects lazily on first query.
export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

// Cache singleton in dev to survive hot-reload.
// In production Next.js reuses the module, so caching is harmless.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
