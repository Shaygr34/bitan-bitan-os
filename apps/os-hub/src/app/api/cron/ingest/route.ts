/**
 * GET /api/cron/ingest
 *
 * Cron-triggered RSS ingestion endpoint.
 * Polls all active RSS sources and creates new Ideas.
 *
 * Protected by CRON_SECRET header check.
 * Call from Railway cron, Vercel cron, or any scheduler:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" https://host/api/cron/ingest
 */

import { NextResponse } from "next/server";
import { cronSecret } from "@/config/integrations";
import { prisma } from "@/lib/prisma";
import { isTableOrConnectionError } from "@/lib/content-factory/validate";
import { fetchRSSFeed } from "@/lib/content-factory/ingestion/rss-parser";
import { generateFingerprint } from "@/lib/content-factory/ingestion/dedup";

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
    // Get all active RSS sources
    const sources = await prisma.source.findMany({
      where: { active: true, type: "RSS" },
    });

    if (sources.length === 0) {
      return NextResponse.json({ message: "No active RSS sources", results: [] });
    }

    const results: Array<{
      sourceId: string;
      sourceName: string;
      newIdeas: number;
      error?: string;
    }> = [];

    // Poll each source using shared modules
    for (const source of sources) {
      try {
        console.log(`[Cron] Polling source: ${source.name} (${source.id})`);
        const items = await fetchRSSFeed(source.url);

        let newCount = 0;
        for (const item of items) {
          try {
            const fingerprint = generateFingerprint(item.title);

            // Dedup check
            const existing = await prisma.idea.findFirst({
              where: {
                OR: [
                  { fingerprint },
                  ...(item.link ? [{ sourceUrl: item.link }] : []),
                ],
              },
              select: { id: true },
            });

            if (existing) continue;

            await prisma.idea.create({
              data: {
                title: item.title,
                description: item.description || null,
                sourceType: "RSS",
                sourceUrl: item.link || null,
                tags: source.tags,
                status: "NEW",
                sourceId: source.id,
                fingerprint,
                sourcePublishedAt: item.pubDate ? new Date(item.pubDate) : null,
                createdByUserId: "system",
              },
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
          newIdeas: newCount,
        });
        console.log(`[Cron] Source ${source.name}: ${items.length} items, ${newCount} new ideas`);
      } catch (err) {
        const errMsg = (err as Error).message;
        console.error(`[Cron] Source ${source.name} failed:`, errMsg);
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          newIdeas: 0,
          error: errMsg,
        });
        await prisma.source.update({
          where: { id: source.id },
          data: { lastError: errMsg, lastPolledAt: new Date() },
        }).catch(() => {});
      }
    }

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
