/**
 * GET    /api/content-factory/articles/[id] — Get article with assets + idea
 * PATCH  /api/content-factory/articles/[id] — Update article fields (title, body, SEO)
 * DELETE /api/content-factory/articles/[id] — Delete article and cascaded assets
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, isTableOrConnectionError, isValidUuid } from "@/lib/content-factory/validate";
import type { ContentBlock } from "@/lib/ai/content-blocks";

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
        idea: { include: { source: true } },
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!isValidUuid(id)) {
    return errorJson(400, "INVALID_ID", "id must be a valid UUID");
  }

  try {
    const body = await request.json();
    const allowedFields = ["title", "subtitle", "bodyBlocks", "seoTitle", "seoDescription", "category", "tags"];
    const data: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in body) {
        data[field] = body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      return errorJson(400, "NO_FIELDS", "No valid fields to update");
    }

    // Rebuild bodyText when bodyBlocks changes
    if (data.bodyBlocks && Array.isArray(data.bodyBlocks)) {
      data.bodyText = (data.bodyBlocks as ContentBlock[])
        .filter((b) => b.type === "paragraph" || b.type === "heading")
        .map((b) => b.text ?? "")
        .join("\n\n");
    }

    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return errorJson(404, "NOT_FOUND", "Article not found");
    }

    if (article.status !== "DRAFT") {
      return errorJson(400, "NOT_EDITABLE", "רק טיוטות ניתנות לעריכה. החזר לטיוטה כדי לערוך.");
    }

    const updated = await prisma.article.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (isTableOrConnectionError(e)) {
      return errorJson(503, "DB_NOT_READY", "מסד הנתונים אינו זמין כרגע.");
    }
    console.error(`PATCH /api/content-factory/articles/${id} failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to update article");
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
