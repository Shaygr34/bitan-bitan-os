/**
 * GET /api/content-factory/hub-stats — Aggregate counts for the Content Factory hub.
 *
 * Returns `{ _status: "ok", ... }` on success.
 * Returns `{ _status: "unavailable" }` with 200 (not 500) when DB is cold-starting,
 * so the frontend can distinguish "loading" from "all-zeros".
 */

import { NextResponse } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const [
      articleCount,
      articlesInReview,
      articlesApproved,
      articlesDraft,
      ideaCount,
      ideasNewToday,
      sourceCount,
      sourceErrors,
      lastPollSource,
    ] = await withRetry(() =>
      Promise.all([
        prisma.article.count(),
        prisma.article.count({ where: { status: "IN_REVIEW" } }),
        prisma.article.count({ where: { status: "APPROVED" } }),
        prisma.article.count({ where: { status: "DRAFT" } }),
        prisma.idea.count(),
        prisma.idea.count({
          where: {
            status: "NEW",
            createdAt: { gte: todayStart },
          },
        }),
        prisma.source.count({ where: { active: true } }),
        prisma.source.count({ where: { lastError: { not: null } } }),
        prisma.source.findFirst({
          where: { lastPolledAt: { not: null }, lastError: null },
          orderBy: { lastPolledAt: "desc" },
          select: { lastPolledAt: true },
        }),
      ]),
    );

    return NextResponse.json({
      _status: "ok",
      articles: articleCount,
      articlesInReview,
      articlesApproved,
      articlesDraft,
      ideas: ideaCount,
      ideasNewToday,
      activeSources: sourceCount,
      sourceErrors,
      lastSuccessfulPoll: lastPollSource?.lastPolledAt?.toISOString() ?? null,
    });
  } catch (e) {
    console.error("GET /api/content-factory/hub-stats failed:", e);
    // Return 200 with _status: "unavailable" so frontend keeps showing "—" instead of 0s
    return NextResponse.json({ _status: "unavailable" });
  }
}
