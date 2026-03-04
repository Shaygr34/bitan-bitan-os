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

    // Normalize URL for comparison: strip protocol, trailing slash
    const normalizeUrl = (u: string) =>
      u.replace(/^https?:\/\//, "").replace(/\/+$/, "");

    // Bulk-fetch existing sources by URL for fast lookup
    const existingByUrl = new Map(
      (await prisma.source.findMany({
        select: { id: true, url: true, type: true, active: true, notes: true },
      })).map((s) => [normalizeUrl(s.url), s]),
    );

    for (const seed of SEED_SOURCES) {
      const existing = existingByUrl.get(normalizeUrl(seed.url));

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
    // Deactivate any DB source whose URL is NOT in the current seed set
    // but whose brand name matches a seed entry. This handles URL changes
    // between seed versions (e.g. TheMarker SCRAPE → RSS, Calcalist RSS → BROWSER).
    let deactivatedStale = 0;

    const seedUrls = new Set(SEED_SOURCES.map((s) => normalizeUrl(s.url)));
    // Extract brand names from ALL seed entries for fuzzy matching
    const seedBrands = [...new Set(
      SEED_SOURCES.map((s) => s.nameHe.split("—")[0].split("–")[0].trim()),
    )];

    const allDbSources = await prisma.source.findMany({
      select: { id: true, url: true, name: true, nameHe: true, active: true },
    });

    for (const dbSource of allDbSources) {
      // Skip if URL matches a current seed entry (handled in Phase 1)
      if (seedUrls.has(normalizeUrl(dbSource.url))) continue;
      // Skip already inactive
      if (!dbSource.active) continue;

      const displayName = dbSource.nameHe || dbSource.name || "";
      const matchedBrand = seedBrands.find((brand) => displayName.includes(brand));
      if (!matchedBrand) continue;

      // This DB entry has a brand name from the seed data but an old URL — deactivate it
      await prisma.$transaction(async (tx) => {
        await tx.source.update({
          where: { id: dbSource.id },
          data: {
            active: false,
            notes: `Deactivated by seed cleanup — URL replaced in current seed (brand: ${matchedBrand})`,
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
            reason: `Brand "${matchedBrand}" URL changed in seed data`,
            displayName,
            oldUrl: dbSource.url,
          },
        });
      });
      deactivatedStale++;
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
