/**
 * POST /api/content-factory/articles  — Create a new Article
 * GET  /api/content-factory/articles  — List articles (basic, no pagination yet)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/content-factory/event-log";
import { errorJson, parseBody, requireString } from "@/lib/content-factory/validate";

export const runtime = "nodejs";

// ── POST ────────────────────────────────────────────────────────────────────

type CreateArticleBody = {
  title: string;
  bodyBlocks: unknown;
  bodyText?: string;
  ideaId?: string;
  seoMeta?: Record<string, unknown>;
  createdByUserId: string;
};

export async function POST(request: NextRequest) {
  const [body, err] = await parseBody<CreateArticleBody>(request);
  if (err) return err;

  const title = requireString(body as Record<string, unknown>, "title");
  if (!title) {
    return errorJson(400, "MISSING_FIELD", "title is required");
  }

  const createdByUserId = requireString(body as Record<string, unknown>, "createdByUserId");
  if (!createdByUserId) {
    return errorJson(400, "MISSING_FIELD", "createdByUserId is required");
  }

  if (body.bodyBlocks === undefined || body.bodyBlocks === null) {
    return errorJson(400, "MISSING_FIELD", "bodyBlocks is required");
  }

  const article = await prisma.$transaction(async (tx) => {
    const created = await tx.article.create({
      data: {
        title,
        bodyBlocks: body.bodyBlocks as object,
        bodyText: body.bodyText ?? null,
        ideaId: body.ideaId ?? null,
        seoMeta: body.seoMeta ?? {},
        createdByUserId,
      },
    });

    await logEvent(tx, {
      actorUserId: createdByUserId,
      entityType: "ARTICLE",
      entityId: created.id,
      action: "ARTICLE_CREATED",
      metadata: { title },
    });

    return created;
  });

  return NextResponse.json(article, { status: 201 });
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      assets: { select: { id: true, platform: true, status: true, version: true } },
    },
  });

  return NextResponse.json(articles);
}
