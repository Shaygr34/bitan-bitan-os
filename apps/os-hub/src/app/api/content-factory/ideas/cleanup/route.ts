/**
 * DELETE /api/content-factory/ideas/cleanup?before=2024-01-01
 *
 * Admin endpoint to delete ideas with sourcePublishedAt before a cutoff date.
 * Also deletes ideas with null sourcePublishedAt from BROWSER/SCRAPE sources
 * (Calcalist, gov.il, BTL — undated items from these sources are likely old).
 *
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { cronSecret } from "@/config/integrations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  // Auth check
  if (cronSecret) {
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token !== cronSecret) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid or missing CRON_SECRET" } },
        { status: 401 },
      );
    }
  }

  const before = request.nextUrl.searchParams.get("before") ?? "2024-01-01";
  const cutoff = new Date(before);
  if (isNaN(cutoff.getTime())) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid date format for 'before' param" } },
      { status: 400 },
    );
  }

  try {
    // Delete ideas with sourcePublishedAt before cutoff
    const oldItems = await prisma.idea.deleteMany({
      where: {
        sourcePublishedAt: { lt: cutoff },
      },
    });

    // Delete ideas with null sourcePublishedAt from BROWSER/SCRAPE sources
    // These sources scrape rendered pages — undated items are likely old
    const scrapedSources = await prisma.source.findMany({
      where: { type: { in: ["BROWSER", "SCRAPE"] } },
      select: { id: true },
    });
    const scrapedSourceIds = scrapedSources.map((s) => s.id);

    let nullDateScraped = { count: 0 };
    if (scrapedSourceIds.length > 0) {
      nullDateScraped = await prisma.idea.deleteMany({
        where: {
          sourcePublishedAt: null,
          sourceId: { in: scrapedSourceIds },
        },
      });
    }

    console.log(
      `[Cleanup] Deleted ${oldItems.count} ideas before ${before}, ` +
      `${nullDateScraped.count} null-date BROWSER/SCRAPE ideas`,
    );

    return NextResponse.json({
      deleted: {
        oldItems: oldItems.count,
        nullDateScraped: nullDateScraped.count,
        total: oldItems.count + nullDateScraped.count,
      },
      cutoffDate: before,
    });
  } catch (error) {
    console.error("[Cleanup] Error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Cleanup failed" } },
      { status: 500 },
    );
  }
}
