/**
 * DELETE /api/content-factory/ideas/cleanup?before=2024-01-01
 *
 * Admin endpoint to delete ideas with sourcePublishedAt before a cutoff date.
 * Also deletes ideas with null sourcePublishedAt from BTL sources.
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

    // Delete ideas with null sourcePublishedAt from BTL sources
    const btlSources = await prisma.source.findMany({
      where: { url: { contains: "btl.gov.il" } },
      select: { id: true },
    });
    const btlSourceIds = btlSources.map((s) => s.id);

    let nullDateBtl = { count: 0 };
    if (btlSourceIds.length > 0) {
      nullDateBtl = await prisma.idea.deleteMany({
        where: {
          sourcePublishedAt: null,
          sourceId: { in: btlSourceIds },
        },
      });
    }

    console.log(
      `[Cleanup] Deleted ${oldItems.count} ideas before ${before}, ` +
      `${nullDateBtl.count} null-date BTL ideas`,
    );

    return NextResponse.json({
      deleted: {
        oldItems: oldItems.count,
        nullDateBtl: nullDateBtl.count,
        total: oldItems.count + nullDateBtl.count,
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
