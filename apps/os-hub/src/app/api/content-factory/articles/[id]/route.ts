/**
 * GET /api/content-factory/articles/[id] — Get article with assets
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

  const article = await prisma.article.findUnique({
    where: { id },
    include: {
      assets: {
        include: {
          publishJobs: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!article) {
    return errorJson(404, "NOT_FOUND", "Article not found");
  }

  return NextResponse.json(article);
}
