/**
 * POST /api/content-factory/sources/dedup  — Remove duplicate sources.
 *
 * Deduplicates by:
 * 1. Exact URL match — keeps oldest
 * 2. Exact nameHe match — keeps the one with most recent successful poll
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const allSources = await prisma.source.findMany({
      select: {
        id: true,
        url: true,
        name: true,
        nameHe: true,
        createdAt: true,
        lastPolledAt: true,
        lastItemCount: true,
        lastError: true,
        active: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const idsToDelete: string[] = [];

    // Phase 1: Dedup by exact URL
    const byUrl = new Map<string, typeof allSources>();
    for (const s of allSources) {
      const list = byUrl.get(s.url) ?? [];
      list.push(s);
      byUrl.set(s.url, list);
    }

    for (const [, entries] of byUrl) {
      if (entries.length <= 1) continue;
      // Keep oldest, delete rest
      for (let i = 1; i < entries.length; i++) {
        idsToDelete.push(entries[i].id);
      }
    }

    // Phase 2: Dedup by nameHe (catches same source with different URLs)
    const deletedSet = new Set(idsToDelete);
    const remaining = allSources.filter((s) => !deletedSet.has(s.id));

    const byNameHe = new Map<string, typeof remaining>();
    for (const s of remaining) {
      if (!s.nameHe) continue;
      const list = byNameHe.get(s.nameHe) ?? [];
      list.push(s);
      byNameHe.set(s.nameHe, list);
    }

    for (const [, entries] of byNameHe) {
      if (entries.length <= 1) continue;
      // Keep the best one: prefer active, then has items, then newest
      const sorted = [...entries].sort((a, b) => {
        // Active over inactive
        if (a.active !== b.active) return a.active ? -1 : 1;
        // Has items over no items
        const aHasItems = (a.lastItemCount ?? 0) > 0 && !a.lastError;
        const bHasItems = (b.lastItemCount ?? 0) > 0 && !b.lastError;
        if (aHasItems !== bHasItems) return aHasItems ? -1 : 1;
        // Newer over older
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      // Keep first (best), delete rest
      for (let i = 1; i < sorted.length; i++) {
        idsToDelete.push(sorted[i].id);
      }
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({ deleted: 0, message: "No duplicates found" });
    }

    await prisma.source.deleteMany({
      where: { id: { in: idsToDelete } },
    });

    return NextResponse.json({
      deleted: idsToDelete.length,
      message: `Removed ${idsToDelete.length} duplicate sources`,
    });
  } catch (e) {
    console.error("POST /api/content-factory/sources/dedup failed:", e);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to clean duplicates" } },
      { status: 500 },
    );
  }
}
