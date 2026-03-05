/**
 * GET /api/content-factory/hub-stats — Aggregate counts for the Content Factory hub.
 *
 * Returns `{ _status: "ok", ... }` on success.
 * Returns `{ _status: "unavailable" }` with 200 (not 500) when DB is unreachable,
 * so the frontend can distinguish "loading" from "all-zeros".
 *
 * Strategy: warmup query wakes the PG connection pool first, then run stats queries.
 * This avoids the cold-start race where parallel queries all timeout simultaneously.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNAVAILABLE = NextResponse.json({ _status: "unavailable" as const });

export async function GET() {
  try {
    // Warmup — wake PG connection before running parallel stats
    await prisma.$queryRaw`SELECT 1`;

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
    ] = await Promise.all([
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
    ]);

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
    return UNAVAILABLE;
  }
}
