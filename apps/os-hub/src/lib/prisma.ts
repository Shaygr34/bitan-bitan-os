import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDatabaseUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}connection_limit=5&pool_timeout=20&connect_timeout=15`;
}

function createPrismaClient(): PrismaClient {
  const url = getDatabaseUrl();
  if (!url) {
    console.warn("DATABASE_URL not set — Prisma client will connect lazily at runtime");
  }
  return new PrismaClient({
    datasourceUrl: url,
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });
}

// API routes execute at runtime where DATABASE_URL is required.
// PrismaClient is always instantiated; it connects lazily on first query.
export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

// Cache singleton in dev to survive hot-reload.
// In production Next.js reuses the module, so caching is harmless.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Execute a Prisma operation with retry on connection errors.
 * Handles Railway cold starts where DB may not be ready on first request.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const code = (err as { code?: string })?.code;
      const isRetryable =
        code === "P1001" || // can't reach DB
        code === "P1002" || // connection timed out
        code === "P1003" || // DB doesn't exist
        code === "P2024" || // timed out fetching connection from pool
        (err instanceof Error && err.message?.includes("connect"));

      if (!isRetryable || attempt === maxRetries) throw err;

      console.warn(
        `[Prisma] Retry ${attempt + 1}/${maxRetries} after ${code ?? "connection"} error`,
      );
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}
