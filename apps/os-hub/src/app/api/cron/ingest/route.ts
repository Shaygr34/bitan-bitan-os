/**
 * GET /api/cron/ingest
 *
 * Cron-triggered ingestion endpoint.
 * Polls all active pollable sources and creates new Ideas.
 *
 * Protected by CRON_SECRET header check.
 * Call from Railway cron, Vercel cron, or any scheduler:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" https://host/api/cron/ingest
 */

import { NextResponse } from "next/server";
import { cronSecret } from "@/config/integrations";
import { prisma } from "@/lib/prisma";
import { isTableOrConnectionError } from "@/lib/content-factory/validate";
import { fetchSourceItems, isPollableType, toIdeaSourceType } from "@/lib/content-factory/ingestion/poll-dispatcher";
import { closeBrowser } from "@/lib/content-factory/ingestion/browser-scraper";
import { generateFingerprint, normalizeUrl } from "@/lib/content-factory/ingestion/dedup";
import { scoreIdea } from "@/lib/content-factory/ingestion/scoring";
import { logEvent } from "@/lib/content-factory/event-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Auth check
  if (cronSecret) {
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token !== cronSecret) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid or missing CRON_SECRET" } },
        { status: 401 },
      );
    }
  }

  try {
    // Get all active sources and filter by pollable type
    const allActiveSources = await prisma.source.findMany({
      where: { active: true },
    });
    const sources = allActiveSources.filter((s: { type: string }) => isPollableType(s.type));

    if (sources.length === 0) {
      return NextResponse.json({ message: "No active pollable sources", results: [] });
    }

    const results: Array<{
      sourceId: string;
      sourceName: string;
      sourceType: string;
      newIdeas: number;
      error?: string;
    }> = [];

    // Poll each source using the dispatcher
    for (const source of sources) {
      try {
        console.log(`[Cron] Polling source: ${source.name} (${source.id}), type=${source.type}`);
        const items = await fetchSourceItems(source.type as "RSS" | "API" | "SCRAPE" | "BROWSER" | "MANUAL", source.url);

        let newCount = 0;
        for (const item of items) {
          try {
            const fingerprint = generateFingerprint(item.title);
            const normalizedLink = item.link ? normalizeUrl(item.link) : null;

            // Dedup check by fingerprint OR normalized URL
            const existing = await prisma.idea.findFirst({
              where: {
                OR: [
                  { fingerprint },
                  ...(normalizedLink ? [{ sourceUrl: normalizedLink }] : []),
                  ...(item.link && item.link !== normalizedLink ? [{ sourceUrl: item.link }] : []),
                ],
              },
              select: { id: true },
            });

            if (existing) continue;

            const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
            const breakdown = scoreIdea({
              title: item.title,
              description: item.description,
              sourceWeight: source.weight,
              sourceCategory: source.category,
              publishedAt,
            });

            await prisma.$transaction(async (tx) => {
              const idea = await tx.idea.create({
                data: {
                  title: item.title,
                  description: item.description || null,
                  sourceType: toIdeaSourceType(source.type),
                  sourceUrl: normalizedLink || null,
                  tags: source.tags,
                  status: "NEW",
                  sourceId: source.id,
                  fingerprint,
                  score: breakdown.total,
                  scoreBreakdown: JSON.parse(JSON.stringify(breakdown)),
                  sourcePublishedAt: publishedAt,
                  createdByUserId: "system",
                },
              });

              await logEvent(tx, {
                actorUserId: "system",
                entityType: "IDEA",
                entityId: idea.id,
                action: "IDEA_CREATED",
                metadata: {
                  sourceId: source.id,
                  sourceName: source.name,
                  fingerprint,
                  score: breakdown.total,
                  via: "cron",
                },
              });
            });
            newCount++;
          } catch (itemErr) {
            console.error(`[Cron] Item error in ${source.name} for "${item.title}":`, (itemErr as Error).message);
          }
        }

        await prisma.source.update({
          where: { id: source.id },
          data: {
            lastPolledAt: new Date(),
            lastItemCount: items.length,
            lastError: null,
          },
        });

        results.push({
          sourceId: source.id,
          sourceName: source.name,
          sourceType: source.type,
          newIdeas: newCount,
        });
        console.log(`[Cron] Source ${source.name}: ${items.length} items, ${newCount} new ideas`);
      } catch (err) {
        const errMsg = (err as Error).message;
        console.error(`[Cron] Source ${source.name} failed:`, errMsg);
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          sourceType: source.type,
          newIdeas: 0,
          error: errMsg,
        });
        await prisma.source.update({
          where: { id: source.id },
          data: { lastError: errMsg, lastPolledAt: new Date() },
        }).catch(() => {});
      }
    }

    // Close Chromium if any BROWSER sources were polled
    await closeBrowser();

    const totalNew = results.reduce((sum, r) => sum + r.newIdeas, 0);
    console.log(`[Cron] Done: ${sources.length} sources, ${totalNew} new ideas`);

    return NextResponse.json({
      message: `Polled ${sources.length} sources, created ${totalNew} new ideas`,
      results,
    });
  } catch (error) {
    if (isTableOrConnectionError(error)) {
      return NextResponse.json(
        { error: { code: "DB_UNAVAILABLE", message: "Database is not available" } },
        { status: 503 },
      );
    }
    console.error("cron/ingest error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Ingestion failed" } },
      { status: 500 },
    );
  }
}
