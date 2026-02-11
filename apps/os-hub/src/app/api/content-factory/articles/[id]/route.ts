/**
 * GET  /api/content-factory/articles/[id] — Get article with assets
 * DELETE /api/content-factory/articles/[id] — Delete article and cascaded assets
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

  try {
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
  } catch (e) {
    console.error(`GET /api/content-factory/articles/${id} failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to load article");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!isValidUuid(id)) {
    return errorJson(400, "INVALID_ID", "id must be a valid UUID");
  }

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) {
    return errorJson(404, "NOT_FOUND", "Article not found");
  }

  // Cascade: delete publish jobs → assets → article
  await prisma.$transaction([
    prisma.publishJob.deleteMany({
      where: { asset: { articleId: id } },
    }),
    prisma.asset.deleteMany({ where: { articleId: id } }),
    prisma.article.delete({ where: { id } }),
  ]);

  return new NextResponse(null, { status: 204 });
}
