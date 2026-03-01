/**
 * POST /api/content-factory/ideas  — Create an Idea (manual)
 * GET  /api/content-factory/ideas  — List ideas (sort, filter by status)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/content-factory/event-log";
import {
  errorJson,
  isTableOrConnectionError,
  parseBody,
  requireString,
} from "@/lib/content-factory/validate";

export const runtime = "nodejs";

// ── POST ────────────────────────────────────────────────────────────────────

type CreateIdeaBody = {
  title: string;
  description?: string;
  sourceType?: string;
  sourceUrl?: string;
  tags?: string[];
};

export async function POST(request: NextRequest) {
  const [body, err] = await parseBody<CreateIdeaBody>(request);
  if (err) return err;

  const title = requireString(body as Record<string, unknown>, "title");
  if (!title) return errorJson(400, "MISSING_FIELD", "title is required");

  try {
    const idea = await prisma.$transaction(async (tx) => {
      const created = await tx.idea.create({
        data: {
          title,
          description: body.description ?? null,
          sourceType: "MANUAL",
          sourceUrl: body.sourceUrl ?? null,
          tags: body.tags ?? [],
          createdByUserId: "system",
        },
      });

      await logEvent(tx, {
        actorUserId: "system",
        entityType: "IDEA",
        entityId: created.id,
        action: "IDEA_CREATED",
        metadata: { title, sourceType: "MANUAL" },
      });

      return created;
    });

    return NextResponse.json(idea, { status: 201 });
  } catch (e) {
    console.error("POST /api/content-factory/ideas failed:", e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to create idea");
  }
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const sortParam = searchParams.get("sort"); // e.g. "score:desc"

    const where: Record<string, unknown> = {};
    if (statusFilter) {
      where.status = statusFilter;
    }

    let orderBy: Record<string, string> = { createdAt: "desc" };
    if (sortParam) {
      const [field, dir] = sortParam.split(":");
      if (field === "score") orderBy = { score: dir === "asc" ? "asc" : "desc" };
      if (field === "createdAt") orderBy = { createdAt: dir === "asc" ? "asc" : "desc" };
    }

    const ideas = await prisma.idea.findMany({
      where,
      orderBy: [orderBy, { createdAt: "desc" }],
      take: 100,
      include: {
        source: { select: { id: true, name: true, nameHe: true, type: true } },
        articles: { select: { id: true, title: true, status: true }, take: 1 },
      },
    });

    return NextResponse.json(ideas);
  } catch (e) {
    if (isTableOrConnectionError(e)) {
      console.warn("GET /api/content-factory/ideas: DB not ready, returning []");
      return NextResponse.json([]);
    }
    console.error("GET /api/content-factory/ideas failed:", e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to load ideas");
  }
}
