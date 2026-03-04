/**
 * POST /api/content-factory/sources/detect — Auto-detect source type from URL.
 *
 * Fetches the URL, analyzes content-type + body to detect RSS/API/SCRAPE,
 * returns detected type + first 3 sample items for preview.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseRSSXml } from "@/lib/content-factory/ingestion/rss-parser";
import { fetchAPIEndpoint } from "@/lib/content-factory/ingestion/api-fetcher";
import { fetchGovIlPublications, fetchHtmlPage } from "@/lib/content-factory/ingestion/html-scraper";
import { errorJson, parseBody, requireString } from "@/lib/content-factory/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const [body, err] = await parseBody<{ url: string }>(request);
  if (err) return err;

  const url = requireString(body as Record<string, unknown>, "url");
  if (!url) return errorJson(400, "MISSING_FIELD", "url is required");

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return errorJson(400, "INVALID_URL", "Invalid URL format");
  }

  // Known browser-required domains — return BROWSER immediately
  const browserDomains = ["gov.il", "calcalist.co.il"];
  if (browserDomains.some((d) => parsedUrl.hostname.endsWith(d))) {
    return NextResponse.json({
      detectedType: "BROWSER",
      sampleItems: [],
      error: "This domain requires browser rendering. Items will be extracted via Chromium.",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "application/rss+xml, application/xml, text/xml, application/atom+xml, text/html, application/json, */*",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        detectedType: "SCRAPE" as const,
        sampleItems: [],
        error: `URL returned ${response.status} ${response.statusText}`,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const trimmed = text.trimStart().toLowerCase();

    // Try RSS/Atom first
    if (
      contentType.includes("rss") ||
      contentType.includes("atom") ||
      contentType.includes("xml") ||
      trimmed.startsWith("<?xml") ||
      trimmed.startsWith("<rss") ||
      trimmed.startsWith("<feed")
    ) {
      // Check if it's actually RSS vs structured API XML
      const rssItems = parseRSSXml(text);
      if (rssItems.length > 0) {
        return NextResponse.json({
          detectedType: "RSS",
          sampleItems: rssItems.slice(0, 3).map((i) => ({ title: i.title, link: i.link })),
        });
      }

      // XML but not RSS — try as API
      try {
        const apiItems = await fetchAPIEndpoint(url);
        if (apiItems.length > 0) {
          return NextResponse.json({
            detectedType: "API",
            sampleItems: apiItems.slice(0, 3).map((i) => ({ title: i.title, link: i.link })),
          });
        }
      } catch {
        // Fall through
      }
    }

    // Try JSON API
    if (
      contentType.includes("json") ||
      trimmed.startsWith("{") ||
      trimmed.startsWith("[")
    ) {
      try {
        const apiItems = await fetchAPIEndpoint(url);
        if (apiItems.length > 0) {
          return NextResponse.json({
            detectedType: "API",
            sampleItems: apiItems.slice(0, 3).map((i) => ({ title: i.title, link: i.link })),
          });
        }
      } catch {
        // Fall through
      }
    }

    // HTML — try SCRAPE
    if (
      contentType.includes("html") ||
      trimmed.startsWith("<!doctype") ||
      trimmed.startsWith("<html")
    ) {
      try {
        const scrapeItems = url.includes("gov.il")
          ? await fetchGovIlPublications(url)
          : await fetchHtmlPage(url);
        return NextResponse.json({
          detectedType: "SCRAPE",
          sampleItems: scrapeItems.slice(0, 3).map((i) => ({ title: i.title, link: i.link })),
        });
      } catch {
        return NextResponse.json({
          detectedType: "SCRAPE",
          sampleItems: [],
          error: "HTML detected but failed to extract items",
        });
      }
    }

    // Unknown
    return NextResponse.json({
      detectedType: "MANUAL",
      sampleItems: [],
      error: `Could not auto-detect type. Content-Type: ${contentType}`,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return NextResponse.json({
        detectedType: "SCRAPE",
        sampleItems: [],
        error: "Request timed out after 15 seconds",
      });
    }
    return NextResponse.json({
      detectedType: "MANUAL",
      sampleItems: [],
      error: (e as Error).message,
    });
  } finally {
    clearTimeout(timeout);
  }
}
