/**
 * POST /api/content-factory/newsletter
 *
 * Generate newsletter HTML from an article.
 * Phase 1: returns rendered HTML for manual paste into Summit CRM.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";
import { renderArticleNewsletter } from "@/lib/content-factory/newsletter-sender";

export async function POST(req: NextRequest) {
  try {
    const { articleId } = await req.json();

    if (!articleId) {
      return NextResponse.json({ error: "articleId required" }, { status: 400 });
    }

    const article = await withRetry(() =>
      prisma.article.findUnique({ where: { id: articleId } }),
    );

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    if (!article.slug) {
      return NextResponse.json({ error: "Article has no slug" }, { status: 400 });
    }

    const result = renderArticleNewsletter({
      title: article.title,
      excerpt: article.subtitle || article.seoDescription || article.title,
      slug: article.slug,
      imageUrl: null, // TODO: resolve Sanity image URL if mainImage exists
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[newsletter] Error:", err);
    return NextResponse.json({ error: "Failed to generate newsletter" }, { status: 500 });
  }
}
