/**
 * GET    /api/content-factory/ideas/[id]  — Get single idea with source + linked article
 * PATCH  /api/content-factory/ideas/[id]  — Update idea (status, tags, priority)
 * DELETE /api/content-factory/ideas/[id]  — Delete idea
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
  if (!isValidUuid(id)) return errorJson(400, "INVALID_ID", "Invalid idea ID");

  try {
    const idea = await prisma.idea.findUnique({
      where: { id },
      include: {
        source: true,
        articles: { select: { id: true, title: true, status: true }, take: 1 },
      },
    });
    if (!idea) return errorJson(404, "NOT_FOUND", "Idea not found");
    return NextResponse.json(idea);
  } catch (e) {
    console.error(`GET /api/content-factory/ideas/${id} failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to load idea");
  }
}

// ── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUuid(id)) return errorJson(400, "INVALID_ID", "Invalid idea ID");

  const [body, err] = await parseBody<Record<string, unknown>>(request);
  if (err) return err;

  try {
    const existing = await prisma.idea.findUnique({ where: { id } });
    if (!existing) return errorJson(404, "NOT_FOUND", "Idea not found");

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.idea.update({ where: { id }, data });

      const action = body.status === "REJECTED" ? "IDEA_REJECTED" : "IDEA_UPDATED";
      await logEvent(tx, {
        actorUserId: "system",
        entityType: "IDEA",
        entityId: id,
        action,
        metadata: {
          changes: Object.keys(data),
          ...(body.status ? { fromStatus: existing.status, toStatus: body.status } : {}),
        },
      });

      return result;
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(`PATCH /api/content-factory/ideas/${id} failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to update idea");
  }
}

// ── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUuid(id)) return errorJson(400, "INVALID_ID", "Invalid idea ID");

  try {
    const existing = await prisma.idea.findUnique({ where: { id } });
    if (!existing) return errorJson(404, "NOT_FOUND", "Idea not found");

    await prisma.idea.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error(`DELETE /api/content-factory/ideas/${id} failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to delete idea");
  }
}
