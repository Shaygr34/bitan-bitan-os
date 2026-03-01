/**
 * GET  /api/content-factory/articles/[id] — Get article with assets
 * DELETE /api/content-factory/articles/[id] — Delete article and cascaded assets
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, isTableOrConnectionError, isValidUuid } from "@/lib/content-factory/validate";

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
    if (isTableOrConnectionError(e)) {
      console.warn(`GET /api/content-factory/articles/${id}: DB not ready`, (e as { code: string }).code);
      return errorJson(503, "DB_NOT_READY", "מסד הנתונים אינו זמין כרגע. נסו שוב מאוחר יותר.");
    }
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

  try {
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return errorJson(404, "NOT_FOUND", "Article not found");
    }

    // Cascade: delete artifacts → publish jobs → assets → article
    // Artifacts have optional FKs to article, asset, and publishJob — must go first.
    await prisma.$transaction([
      prisma.artifact.deleteMany({
        where: {
          OR: [
            { articleId: id },
            { asset: { articleId: id } },
            { publishJob: { asset: { articleId: id } } },
          ],
        },
      }),
      prisma.publishJob.deleteMany({
        where: { asset: { articleId: id } },
      }),
      prisma.asset.deleteMany({ where: { articleId: id } }),
      prisma.article.delete({ where: { id } }),
    ]);

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (isTableOrConnectionError(e)) {
      console.warn(`DELETE /api/content-factory/articles/${id}: DB not ready`, (e as { code: string }).code);
      return errorJson(503, "DB_NOT_READY", "מסד הנתונים אינו זמין כרגע.");
    }
    console.error(`DELETE /api/content-factory/articles/${id} failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to delete article");
  }
}
