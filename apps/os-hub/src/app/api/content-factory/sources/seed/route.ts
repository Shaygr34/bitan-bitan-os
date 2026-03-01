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

    for (const seed of SEED_SOURCES) {
      const existing = await prisma.source.findFirst({
        where: { url: seed.url },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const source = await prisma.$transaction(async (tx) => {
        const newSource = await tx.source.create({
          data: {
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

        await logEvent(tx, {
          actorUserId: "system",
          entityType: "SOURCE",
          entityId: newSource.id,
          action: "SOURCE_CREATED",
          metadata: { type: seed.type, url: seed.url, weight: seed.weight, viaSeed: true },
        });

        return newSource;
      });

      if (source) created++;
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
