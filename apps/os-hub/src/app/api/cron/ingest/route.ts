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
import prisma from "@/lib/prisma";
import { isTableOrConnectionError } from "@/lib/content-factory/validate";

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

    // Poll each source
    for (const source of sources) {
      try {
        // Use internal poll-all logic inline to avoid circular deps
        const response = await fetch(source.url, {
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          results.push({
            sourceId: source.id,
            sourceName: source.name,
            newIdeas: 0,
            error: `HTTP ${response.status}`,
          });
          await prisma.source.update({
            where: { id: source.id },
            data: { lastError: `HTTP ${response.status}`, lastPolledAt: new Date() },
          });
          continue;
        }

        const xml = await response.text();
        const items = parseRssItems(xml);

        let newCount = 0;
        for (const item of items) {
          const fingerprint = await hashFingerprint(normalizeTitle(item.title));

          // Dedup check
          const existing = await prisma.idea.findFirst({
            where: { fingerprint },
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
      } catch (err) {
        const errMsg = (err as Error).message;
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

// ── Inline helpers (same logic as ingestion modules) ──────────────────────

function parseRssItems(xml: string): Array<{ title: string; link?: string; description?: string; pubDate?: string }> {
  const items: Array<{ title: string; link?: string; description?: string; pubDate?: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    if (!title) continue;
    items.push({
      title,
      link: extractTag(block, "link") || undefined,
      description: extractTag(block, "description") || undefined,
      pubDate: extractTag(block, "pubDate") || undefined,
    });
  }
  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[\s\-_]+/g, " ")
    .replace(/[^\u0590-\u05FFa-zA-Z0-9\s]/g, "")
    .trim();
}

async function hashFingerprint(normalized: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
