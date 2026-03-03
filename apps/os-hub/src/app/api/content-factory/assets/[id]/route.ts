/**
 * GET  /api/content-factory/assets/[id] — Get asset with publish jobs
 * PATCH /api/content-factory/assets/[id] — Update contentPayload / platformMeta
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, isValidUuid, parseBody } from "@/lib/content-factory/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!isValidUuid(id)) {
    return errorJson(400, "INVALID_ID", "id must be a valid UUID");
  }

  try {
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        publishJobs: { orderBy: { createdAt: "desc" } },
        article: { select: { id: true, title: true, status: true, distributionStatus: true } },
      },
    });

    if (!asset) {
      return errorJson(404, "NOT_FOUND", "Asset not found");
    }

    return NextResponse.json(asset);
  } catch (e) {
    console.error(`GET /api/content-factory/assets/${id} failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to load asset");
  }
}

type PatchBody = {
  contentPayload?: Record<string, unknown>;
  platformMeta?: Record<string, unknown>;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!isValidUuid(id)) {
    return errorJson(400, "INVALID_ID", "id must be a valid UUID");
  }

  const [body, err] = await parseBody<PatchBody>(request);
  if (err) return err;

  const data: Record<string, unknown> = {};
  if (body && typeof body === "object") {
    if ("contentPayload" in body && body.contentPayload !== undefined) {
      data.contentPayload = body.contentPayload;
    }
    if ("platformMeta" in body && body.platformMeta !== undefined) {
      data.platformMeta = body.platformMeta;
    }
  }

  if (Object.keys(data).length === 0) {
    return errorJson(400, "NO_FIELDS", "Provide contentPayload or platformMeta to update");
  }

  try {
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) {
      return errorJson(404, "NOT_FOUND", "Asset not found");
    }

    const updated = await prisma.asset.update({
      where: { id },
      data,
      include: {
        publishJobs: { orderBy: { createdAt: "desc" } },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(`PATCH /api/content-factory/assets/${id} failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to update asset");
  }
}
