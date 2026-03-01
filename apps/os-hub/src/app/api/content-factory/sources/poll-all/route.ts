/**
 * POST /api/content-factory/sources/poll-all  — Poll all active RSS sources
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/content-factory/event-log";
import { fetchRSSFeed } from "@/lib/content-factory/ingestion/rss-parser";
import { generateFingerprint } from "@/lib/content-factory/ingestion/dedup";
import { scoreIdea } from "@/lib/content-factory/ingestion/scoring";

export const runtime = "nodejs";

export async function POST() {
  try {
    const sources = await prisma.source.findMany({
      where: { active: true, type: "RSS" },
    });

    let polled = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    const sourceErrors: { sourceId: string; name: string; error: string }[] = [];

    for (const source of sources) {
      let created = 0;
      let skipped = 0;

      try {
        const items = await fetchRSSFeed(source.url);

        for (const item of items) {
          try {
            const fingerprint = generateFingerprint(item.title);

            const existing = await prisma.idea.findFirst({
              where: {
                OR: [
                  { fingerprint },
                  ...(item.link ? [{ sourceUrl: item.link }] : []),
                ],
              },
            });

            if (existing) {
              skipped++;
              continue;
            }

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
                  sourceType: "RSS",
                  sourceUrl: item.link || null,
                  sourceId: source.id,
                  fingerprint,
                  score: breakdown.total,
                  scoreBreakdown: JSON.parse(JSON.stringify(breakdown)),
                  sourcePublishedAt: publishedAt,
                  tags: source.tags,
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
                },
              });
            });

            created++;
          } catch {
            // Skip individual item errors, continue polling
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

        await logEvent(prisma, {
          actorUserId: "system",
          entityType: "SOURCE",
          entityId: source.id,
          action: "SOURCE_POLLED",
          metadata: {
            itemsFound: items.length,
            newIdeas: created,
            duplicatesSkipped: skipped,
          },
        });

        polled++;
        totalCreated += created;
        totalSkipped += skipped;
      } catch (e) {
        const errMsg = (e as Error).message;
        sourceErrors.push({ sourceId: source.id, name: source.name, error: errMsg });

        await prisma.source.update({
          where: { id: source.id },
          data: { lastPolledAt: new Date(), lastError: errMsg },
        }).catch(() => {});

        // Continue polling other sources
        polled++;
      }
    }

    return NextResponse.json({
      polled,
      totalCreated,
      totalSkipped,
      errors: sourceErrors,
    });
  } catch (e) {
    console.error("POST /api/content-factory/sources/poll-all failed:", e);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to poll sources" } },
      { status: 500 },
    );
  }
}
