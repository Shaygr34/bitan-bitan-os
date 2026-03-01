/**
 * POST /api/content-factory/sources  — Create a new Source
 * GET  /api/content-factory/sources  — List sources (filter by ?active, ?type)
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

type CreateSourceBody = {
  name: string;
  nameHe?: string;
  type?: string;
  url: string;
  active?: boolean;
  weight?: number;
  category?: string;
  tags?: string[];
  pollIntervalMin?: number;
  notes?: string;
};

export async function POST(request: NextRequest) {
  const [body, err] = await parseBody<CreateSourceBody>(request);
  if (err) return err;

  const name = requireString(body as Record<string, unknown>, "name");
  if (!name) return errorJson(400, "MISSING_FIELD", "name is required");

  const url = requireString(body as Record<string, unknown>, "url");
  if (!url) return errorJson(400, "MISSING_FIELD", "url is required");

  const validTypes = ["RSS", "API", "SCRAPE", "MANUAL"];
  const sourceType = body.type && validTypes.includes(body.type) ? body.type : "RSS";

  try {
    const source = await prisma.$transaction(async (tx) => {
      const created = await tx.source.create({
        data: {
          name,
          nameHe: body.nameHe ?? null,
          type: sourceType as "RSS" | "API" | "SCRAPE" | "MANUAL",
          url,
          active: body.active ?? true,
          weight: body.weight ?? 1.0,
          category: body.category ?? null,
          tags: body.tags ?? [],
          pollIntervalMin: body.pollIntervalMin ?? 60,
          notes: body.notes ?? null,
        },
      });

      await logEvent(tx, {
        actorUserId: "system",
        entityType: "SOURCE",
        entityId: created.id,
        action: "SOURCE_CREATED",
        metadata: { type: sourceType, url, weight: body.weight ?? 1.0 },
      });

      return created;
    });

    return NextResponse.json(source, { status: 201 });
  } catch (e) {
    console.error("POST /api/content-factory/sources failed:", e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to create source");
  }
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeFilter = searchParams.get("active");
    const typeFilter = searchParams.get("type");

    const where: Record<string, unknown> = {};
    if (activeFilter !== null) {
      where.active = activeFilter === "true";
    }
    if (typeFilter) {
      where.type = typeFilter;
    }

    const sources = await prisma.source.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(sources);
  } catch (e) {
    if (isTableOrConnectionError(e)) {
      console.warn("GET /api/content-factory/sources: DB not ready, returning []");
      return NextResponse.json([]);
    }
    console.error("GET /api/content-factory/sources failed:", e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to load sources");
  }
}
