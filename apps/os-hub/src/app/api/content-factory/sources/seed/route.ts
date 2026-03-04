/**
 * POST /api/content-factory/sources/seed  — Seed default sources.
 *
 * Creates new sources for URLs that don't exist yet.
 * UPDATES existing sources: syncs type, active, and notes from seed data
 * (so blocked sources get marked inactive + correct type on re-seed).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/content-factory/event-log";
import { SEED_SOURCES } from "@/lib/content-factory/sources/seed-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Bulk-fetch existing sources by URL for fast lookup
    const existingByUrl = new Map(
      (await prisma.source.findMany({
        select: { id: true, url: true, type: true, active: true, notes: true },
      })).map((s) => [s.url, s]),
    );

    for (const seed of SEED_SOURCES) {
      const existing = existingByUrl.get(seed.url);

      if (existing) {
        // Check if type, active, or notes need syncing
        const needsUpdate =
          existing.type !== seed.type ||
          existing.active !== seed.active ||
          existing.notes !== seed.notes;

        if (needsUpdate) {
          await prisma.$transaction(async (tx) => {
            await tx.source.update({
              where: { id: existing.id },
              data: {
                type: seed.type,
                active: seed.active,
                notes: seed.notes,
              },
            });
            await logEvent(tx, {
              actorUserId: "system",
              entityType: "SOURCE",
              entityId: existing.id,
              action: "SOURCE_UPDATED",
              metadata: {
                viaSeed: true,
                changes: {
                  ...(existing.type !== seed.type ? { type: { from: existing.type, to: seed.type } } : {}),
                  ...(existing.active !== seed.active ? { active: { from: existing.active, to: seed.active } } : {}),
                },
              },
            });
          });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      // New source — create
      await prisma.$transaction(async (tx) => {
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
      });
      created++;
    }

    // Phase 2: Stale entry cleanup
    // If a DB source (by nameHe) matches a seed entry that says active:false,
    // but the DB entry has a different URL (stale), deactivate it.
    let deactivatedStale = 0;

    const inactiveSeedByName = new Map(
      SEED_SOURCES.filter((s) => !s.active).map((s) => [s.nameHe, s]),
    );

    if (inactiveSeedByName.size > 0) {
      const allDbSources = await prisma.source.findMany({
        select: { id: true, url: true, nameHe: true, active: true },
      });

      for (const dbSource of allDbSources) {
        if (!dbSource.active || !dbSource.nameHe) continue;
        const seedMatch = inactiveSeedByName.get(dbSource.nameHe);
        if (!seedMatch) continue;
        // Already matched by URL in Phase 1 — skip
        if (dbSource.url === seedMatch.url) continue;

        await prisma.$transaction(async (tx) => {
          await tx.source.update({
            where: { id: dbSource.id },
            data: { active: false, notes: seedMatch.notes },
          });
          await logEvent(tx, {
            actorUserId: "system",
            entityType: "SOURCE",
            entityId: dbSource.id,
            action: "SOURCE_UPDATED",
            metadata: {
              viaSeed: true,
              staleCleanup: true,
              reason: `nameHe "${dbSource.nameHe}" matches inactive seed entry`,
              oldUrl: dbSource.url,
              seedUrl: seedMatch.url,
            },
          });
        });
        deactivatedStale++;
      }
    }

    return NextResponse.json({ created, updated, skipped, deactivatedStale }, { status: 201 });
  } catch (e) {
    console.error("POST /api/content-factory/sources/seed failed:", e);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to seed sources" } },
      { status: 500 },
    );
  }
}
