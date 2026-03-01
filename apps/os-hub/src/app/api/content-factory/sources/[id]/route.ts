/**
 * GET    /api/content-factory/sources/[id]  — Get single source
 * PATCH  /api/content-factory/sources/[id]  — Update source
 * DELETE /api/content-factory/sources/[id]  — Delete source
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/content-factory/event-log";
import { errorJson, isValidUuid, parseBody } from "@/lib/content-factory/validate";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUuid(id)) return errorJson(400, "INVALID_ID", "Invalid source ID");

  try {
    const source = await prisma.source.findUnique({ where: { id } });
    if (!source) return errorJson(404, "NOT_FOUND", "Source not found");
    return NextResponse.json(source);
  } catch (e) {
    console.error(`GET /api/content-factory/sources/${id} failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to load source");
  }
}

// ── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUuid(id)) return errorJson(400, "INVALID_ID", "Invalid source ID");

  const [body, err] = await parseBody<Record<string, unknown>>(request);
  if (err) return err;

  try {
    const existing = await prisma.source.findUnique({ where: { id } });
    if (!existing) return errorJson(404, "NOT_FOUND", "Source not found");

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.nameHe !== undefined) data.nameHe = body.nameHe;
    if (body.url !== undefined) data.url = body.url;
    if (body.active !== undefined) data.active = body.active;
    if (body.weight !== undefined) data.weight = body.weight;
    if (body.category !== undefined) data.category = body.category;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.pollIntervalMin !== undefined) data.pollIntervalMin = body.pollIntervalMin;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.type !== undefined) {
      const validTypes = ["RSS", "API", "SCRAPE", "MANUAL"];
      if (validTypes.includes(body.type as string)) data.type = body.type;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.source.update({ where: { id }, data });

      await logEvent(tx, {
        actorUserId: "system",
        entityType: "SOURCE",
        entityId: id,
        action: "SOURCE_UPDATED",
        metadata: { changes: Object.keys(data) },
      });

      return result;
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(`PATCH /api/content-factory/sources/${id} failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to update source");
  }
}

// ── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUuid(id)) return errorJson(400, "INVALID_ID", "Invalid source ID");

  try {
    const existing = await prisma.source.findUnique({ where: { id } });
    if (!existing) return errorJson(404, "NOT_FOUND", "Source not found");

    await prisma.$transaction(async (tx) => {
      await tx.source.delete({ where: { id } });

      await logEvent(tx, {
        actorUserId: "system",
        entityType: "SOURCE",
        entityId: id,
        action: "SOURCE_DELETED",
        metadata: { name: existing.name, url: existing.url },
      });
    });

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error(`DELETE /api/content-factory/sources/${id} failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to delete source");
  }
}
