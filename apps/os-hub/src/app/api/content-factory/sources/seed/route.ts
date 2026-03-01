/**
 * POST /api/content-factory/sources/seed  — Seed default sources (skip if URL exists)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/content-factory/event-log";
import { SEED_SOURCES } from "@/lib/content-factory/sources/seed-data";

export const runtime = "nodejs";

export async function POST() {
  try {
    let created = 0;
    let skipped = 0;

    // Bulk-fetch existing URLs for fast lookup
    const existingUrls = new Set(
      (await prisma.source.findMany({ select: { url: true } })).map((s) => s.url),
    );

    for (const seed of SEED_SOURCES) {
      if (existingUrls.has(seed.url)) {
        skipped++;
        continue;
      }

      const source = await prisma.$transaction(async (tx) => {
        // Use upsert to handle race conditions (concurrent seed requests)
        const newSource = await tx.source.upsert({
          where: { url: seed.url },
          update: {}, // no-op if already exists
          create: {
            name: seed.name,
            nameHe: seed.nameHe,
            type: seed.type,
            url: seed.url,
            weight: seed.weight,
            category: seed.category,
            tags: seed.tags,
            pollIntervalMin: seed.pollIntervalMin,
            active: seed.active,
            notes: seed.notes,
          },
        });

        // Only log if this was actually a new creation (createdAt ~ now)
        const isNew = Date.now() - newSource.createdAt.getTime() < 5000;
        if (isNew) {
          await logEvent(tx, {
            actorUserId: "system",
            entityType: "SOURCE",
            entityId: newSource.id,
            action: "SOURCE_CREATED",
            metadata: { type: seed.type, url: seed.url, weight: seed.weight, viaSeed: true },
          });
        }

        return { source: newSource, isNew };
      });

      if (source.isNew) created++;
      else skipped++;
    }

    return NextResponse.json({ created, skipped }, { status: 201 });
  } catch (e) {
    console.error("POST /api/content-factory/sources/seed failed:", e);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to seed sources" } },
      { status: 500 },
    );
  }
}
