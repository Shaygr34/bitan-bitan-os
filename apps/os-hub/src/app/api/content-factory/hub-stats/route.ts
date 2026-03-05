/**
 * GET /api/content-factory/hub-stats — Aggregate counts for the Content Factory hub.
 *
 * Returns `{ _status: "ok", ... }` on success.
 * Returns `{ _status: "unavailable" }` with 200 (not 500) when DB is cold-starting,
 * so the frontend can distinguish "loading" from "all-zeros".
 *
 * Uses a 5s AbortController timeout to avoid blocking on cold Railway PG starts.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNAVAILABLE = NextResponse.json({ _status: "unavailable" as const });

export async function GET() {
  try {
    // Race the DB queries against an 8s timeout to avoid 502s on cold starts
    const result = await Promise.race([
      fetchStats(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ]);

    if (!result) {
      console.warn("[hub-stats] DB query timed out after 8s (cold start?)");
      return UNAVAILABLE;
    }

    return NextResponse.json({ _status: "ok", ...result });
  } catch (e) {
    console.error("GET /api/content-factory/hub-stats failed:", e);
    return UNAVAILABLE;
  }
}

async function fetchStats() {
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

  return {
    articles: articleCount,
    articlesInReview,
    articlesApproved,
    articlesDraft,
    ideas: ideaCount,
    ideasNewToday,
    activeSources: sourceCount,
    sourceErrors,
    lastSuccessfulPoll: lastPollSource?.lastPolledAt?.toISOString() ?? null,
  };
}
