/**
 * GET /api/content-factory/assets/[id] — Get asset with publish jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, isValidUuid } from "@/lib/content-factory/validate";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!isValidUuid(id)) {
    return errorJson(400, "INVALID_ID", "id must be a valid UUID");
  }

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
}
