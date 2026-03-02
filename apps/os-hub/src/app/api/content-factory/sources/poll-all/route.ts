/**
 * POST /api/content-factory/sources/poll-all  — Poll all active pollable sources
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/content-factory/event-log";
import { fetchSourceItems, isPollableType, toIdeaSourceType } from "@/lib/content-factory/ingestion/poll-dispatcher";
import { generateFingerprint, normalizeUrl } from "@/lib/content-factory/ingestion/dedup";
import { scoreIdea } from "@/lib/content-factory/ingestion/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Fetch all active sources (not just RSS) and filter by pollable type
    const allActiveSources = await prisma.source.findMany({
      where: { active: true },
    });
    const sources = allActiveSources.filter((s: { type: string }) => isPollableType(s.type));

    let polled = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    const sourceErrors: { sourceId: string; name: string; error: string }[] = [];

    for (const source of sources) {
      let created = 0;
      let skipped = 0;

      try {
        console.log(`[PollAll] Polling source: ${source.name} (${source.id}), type=${source.type}, url: ${source.url}`);
        const items = await fetchSourceItems(source.type as "RSS" | "API" | "SCRAPE" | "MANUAL", source.url);
        console.log(`[PollAll] Got ${items.length} items from ${source.name}`);

        for (const item of items) {
          try {
            const fingerprint = generateFingerprint(item.title);
            const normalizedLink = item.link ? normalizeUrl(item.link) : null;

            const existing = await prisma.idea.findFirst({
              where: {
                OR: [
                  { fingerprint },
                  ...(normalizedLink ? [{ sourceUrl: normalizedLink }] : []),
                  ...(item.link && item.link !== normalizedLink ? [{ sourceUrl: item.link }] : []),
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
                  sourceType: toIdeaSourceType(source.type),
                  sourceUrl: normalizedLink || null,
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
          } catch (itemErr) {
            console.error(`[PollAll] Item error in ${source.name} for "${item.title}":`, (itemErr as Error).message);
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
        console.log(`[PollAll] Source ${source.name}: created=${created}, skipped=${skipped}`);
      } catch (e) {
        const errMsg = (e as Error).message;
        console.error(`[PollAll] Source ${source.name} failed:`, errMsg);
        sourceErrors.push({ sourceId: source.id, name: source.name, error: errMsg });

        await prisma.source.update({
          where: { id: source.id },
          data: { lastPolledAt: new Date(), lastError: errMsg },
        }).catch(() => {});

        // Continue polling other sources
        polled++;
      }
    }

    console.log(`[PollAll] Done: polled=${polled}, created=${totalCreated}, skipped=${totalSkipped}, errors=${sourceErrors.length}`);
    if (sourceErrors.length > 0) {
      console.warn(`[PollAll] Source errors:`, sourceErrors);
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
