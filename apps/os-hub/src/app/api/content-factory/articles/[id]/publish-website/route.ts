/**
 * POST /api/content-factory/articles/:id/publish-website
 *
 * Publishes an APPROVED article to Sanity as a draft document.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidUuid, errorJson, isTableOrConnectionError } from "@/lib/content-factory/validate";
import { publishToSanity } from "@/lib/content-factory/publishers/sanity-publisher";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    return errorJson(400, "INVALID_ID", "Article ID must be a valid UUID");
  }

  try {
    const result = await publishToSanity(prisma, id);
    return NextResponse.json(result);
  } catch (error) {
    const msg = (error as Error).message;

    if (msg.includes("not found")) {
      return errorJson(404, "NOT_FOUND", msg);
    }
    if (msg.includes("must be APPROVED")) {
      return errorJson(409, "INVALID_STATUS", msg);
    }
    if (msg.includes("not configured")) {
      return errorJson(503, "CONFIG_ERROR", msg);
    }
    if (msg.includes("Sanity mutation failed")) {
      return errorJson(502, "SANITY_ERROR", msg);
    }
    if (isTableOrConnectionError(error)) {
      return errorJson(503, "DB_UNAVAILABLE", "Database is not available");
    }

    console.error("publish-website error:", error);
    return errorJson(500, "INTERNAL_ERROR", "Failed to publish to Sanity");
  }
}
