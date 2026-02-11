/**
 * ensure-tables.js
 *
 * Checks if the Content Factory tables exist in the database.
 * If they don't (e.g. migration was baselined but DDL never ran),
 * reads the migration SQL and executes it statement-by-statement,
 * skipping any "already exists" errors.
 *
 * Called from entrypoint.sh after prisma migrate deploy.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

async function main() {
  const prisma = new PrismaClient();

  try {
    // Check if a core Content Factory table exists
    const result = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS cnt
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'articles'`
    );

    const exists = result[0].cnt > 0;

    if (exists) {
      console.log("Content Factory tables: OK");
      return;
    }

    console.log("Content Factory tables MISSING — applying migration SQL...");

    const sqlPath = path.join(
      __dirname,
      "..",
      "prisma",
      "migrations",
      "20260211000000_content_factory_v0",
      "migration.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf-8");

    // Split on semicolons followed by a newline (preserves multi-line statements).
    // Strip SQL comments, trim whitespace, filter empty.
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.replace(/--[^\n]*/g, "").trim())
      .filter((s) => s.length > 0);

    let created = 0;
    let skipped = 0;

    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
        created++;
      } catch (e) {
        // Skip "already exists" errors (types, tables, indices, constraints)
        if (
          e.message &&
          (e.message.includes("already exists") ||
            e.message.includes("duplicate key"))
        ) {
          skipped++;
          continue;
        }
        // Re-throw unexpected errors
        console.error("SQL statement failed:", stmt.substring(0, 120));
        throw e;
      }
    }

    console.log(
      `Content Factory tables created (${created} statements applied, ${skipped} skipped as existing).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("ensure-tables FAILED:", e.message);
  process.exit(1);
});
