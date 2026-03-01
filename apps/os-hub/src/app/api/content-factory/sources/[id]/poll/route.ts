/**
 * POST /api/content-factory/sources/[id]/poll  — Poll a single source
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/content-factory/event-log";
import { errorJson, isValidUuid } from "@/lib/content-factory/validate";
import { fetchRSSFeed } from "@/lib/content-factory/ingestion/rss-parser";
import { generateFingerprint } from "@/lib/content-factory/ingestion/dedup";
import { scoreIdea } from "@/lib/content-factory/ingestion/scoring";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUuid(id)) return errorJson(400, "INVALID_ID", "Invalid source ID");

  try {
    const source = await prisma.source.findUnique({ where: { id } });
    if (!source) return errorJson(404, "NOT_FOUND", "Source not found");
    if (source.type !== "RSS") {
      return errorJson(400, "NOT_RSS", "Only RSS sources can be polled");
    }

    const startTime = Date.now();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    try {
      console.log(`[Poll] Polling source: ${source.name} (${source.id}), url: ${source.url}`);
      const items = await fetchRSSFeed(source.url);
      console.log(`[Poll] Got ${items.length} items from ${source.name}`);

      for (const item of items) {
        try {
          const fingerprint = generateFingerprint(item.title);

          // Check for duplicates
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

          // Score the idea
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
                scoreBreakdown: breakdown,
              },
            });
          });

          created++;
        } catch (itemErr) {
          console.error(`[Poll] Item error for "${item.title}":`, (itemErr as Error).message);
          errors.push(`Item "${item.title}": ${(itemErr as Error).message}`);
        }
      }

      // Update source metadata
      await prisma.$transaction(async (tx) => {
        await tx.source.update({
          where: { id },
          data: {
            lastPolledAt: new Date(),
            lastItemCount: items.length,
            lastError: errors.length > 0 ? errors[0] : null,
          },
        });

        await logEvent(tx, {
          actorUserId: "system",
          entityType: "SOURCE",
          entityId: id,
          action: "SOURCE_POLLED",
          metadata: {
            itemsFound: items.length,
            newIdeas: created,
            duplicatesSkipped: skipped,
            errors: errors.length,
            durationMs: Date.now() - startTime,
          },
        });
      });
    } catch (fetchErr) {
      console.error(`[Poll] Fetch/parse error for source ${id}:`, (fetchErr as Error).message);
      // Update source with error
      await prisma.source.update({
        where: { id },
        data: {
          lastPolledAt: new Date(),
          lastError: (fetchErr as Error).message,
        },
      });
      errors.push((fetchErr as Error).message);
    }

    console.log(`[Poll] Done: source=${id}, created=${created}, skipped=${skipped}, errors=${errors.length}`);
    if (errors.length > 0) {
      console.warn(`[Poll] Errors for source ${id}:`, errors);
    }

    return NextResponse.json({
      polled: 1,
      created,
      skipped,
      errors,
    });
  } catch (e) {
    console.error(`POST /api/content-factory/sources/${id}/poll failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to poll source");
  }
}
