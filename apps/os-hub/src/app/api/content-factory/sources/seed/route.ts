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
    // For each active DB source with errors, check if it matches a BLOCKED seed entry
    // by name substring (handles cases where old RSS entries have slightly different names).
    // Also catches entries where URL changed between seed versions.
    let deactivatedStale = 0;

    const inactiveSeeds = SEED_SOURCES.filter((s) => !s.active);
    // Extract short brand names for fuzzy matching: "דה מרקר", "כלכליסט"
    const blockedBrands = [...new Set(
      inactiveSeeds.map((s) => s.nameHe.split("—")[0].split("–")[0].trim()),
    )];

    if (inactiveSeeds.length > 0) {
      const allDbSources = await prisma.source.findMany({
        select: { id: true, url: true, name: true, nameHe: true, active: true, lastError: true },
      });

      // Build a set of seed URLs for Phase 1 match check
      const seedUrls = new Set(SEED_SOURCES.map((s) => s.url));

      for (const dbSource of allDbSources) {
        if (!dbSource.active) continue;
        // Skip if already matched by URL in Phase 1
        if (seedUrls.has(dbSource.url)) continue;

        const displayName = dbSource.nameHe || dbSource.name || "";
        const matchedBrand = blockedBrands.find((brand) => displayName.includes(brand));
        if (!matchedBrand) continue;

        // Find the best matching seed entry for notes
        const seedMatch = inactiveSeeds.find((s) => displayName.includes(matchedBrand));

        await prisma.$transaction(async (tx) => {
          await tx.source.update({
            where: { id: dbSource.id },
            data: {
              active: false,
              type: "SCRAPE",
              notes: seedMatch?.notes ?? `BLOCKED — deactivated by seed cleanup (matched brand: ${matchedBrand})`,
            },
          });
          await logEvent(tx, {
            actorUserId: "system",
            entityType: "SOURCE",
            entityId: dbSource.id,
            action: "SOURCE_UPDATED",
            metadata: {
              viaSeed: true,
              staleCleanup: true,
              reason: `Brand "${matchedBrand}" matches blocked seed entries`,
              displayName,
              oldUrl: dbSource.url,
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
