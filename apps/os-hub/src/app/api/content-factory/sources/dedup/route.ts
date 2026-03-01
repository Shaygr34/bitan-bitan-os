/**
 * POST /api/content-factory/sources/dedup  — Remove duplicate sources.
 * Keeps the oldest source (by createdAt) for each URL, deletes the rest.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  try {
    // Find all URLs that appear more than once
    const allSources = await prisma.source.findMany({
      select: { id: true, url: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Group by URL
    const byUrl = new Map<string, { id: string; createdAt: Date }[]>();
    for (const s of allSources) {
      const list = byUrl.get(s.url) ?? [];
      list.push({ id: s.id, createdAt: s.createdAt });
      byUrl.set(s.url, list);
    }

    // Collect IDs to delete (all except the oldest per URL)
    const idsToDelete: string[] = [];
    for (const [, entries] of byUrl) {
      if (entries.length <= 1) continue;
      // entries already sorted by createdAt asc — keep first, delete rest
      for (let i = 1; i < entries.length; i++) {
        idsToDelete.push(entries[i].id);
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
