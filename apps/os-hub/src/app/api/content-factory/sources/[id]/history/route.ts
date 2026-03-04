/**
 * GET /api/content-factory/sources/[id]/history
 *
 * Returns last 10 SOURCE_POLLED events + total idea count for this source.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, isValidUuid } from "@/lib/content-factory/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUuid(id)) return errorJson(400, "INVALID_ID", "Invalid source ID");

  try {
    const source = await prisma.source.findUnique({ where: { id }, select: { id: true } });
    if (!source) return errorJson(404, "NOT_FOUND", "Source not found");

    const [entries, ideaCount] = await Promise.all([
      prisma.eventLog.findMany({
        where: {
          entityType: "SOURCE",
          entityId: id,
          action: "SOURCE_POLLED",
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          metadata: true,
        },
      }),
      prisma.idea.count({
        where: { sourceId: id },
      }),
    ]);

    return NextResponse.json({
      entries: entries.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        metadata: (e.metadata as Record<string, unknown>) ?? {},
      })),
      ideaCount,
    });
  } catch (err: unknown) {
    console.error(`GET /api/content-factory/sources/${id}/history failed:`, err);
    return errorJson(500, "INTERNAL_ERROR", "Failed to load history");
  }
}
