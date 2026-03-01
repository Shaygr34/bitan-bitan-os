/**
 * GET /api/content-factory/hub-stats — Aggregate counts for the Content Factory hub.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [
      articleCount,
      articlesInReview,
      articlesApproved,
      ideaCount,
      ideasNewToday,
      sourceCount,
    ] = await Promise.all([
      prisma.article.count(),
      prisma.article.count({ where: { status: "IN_REVIEW" } }),
      prisma.article.count({ where: { status: "APPROVED" } }),
      prisma.idea.count(),
      prisma.idea.count({
        where: {
          status: "NEW",
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      prisma.source.count({ where: { active: true } }),
    ]);

    return NextResponse.json({
      articles: articleCount,
      articlesInReview,
      articlesApproved,
      ideas: ideaCount,
      ideasNewToday,
      activeSources: sourceCount,
    });
  } catch (e) {
    console.error("GET /api/content-factory/hub-stats failed:", e);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load hub stats" } },
      { status: 500 },
    );
  }
}
