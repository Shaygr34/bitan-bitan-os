/**
 * Poll dispatcher — routes source types to the appropriate fetcher.
 *
 * Supported:
 *   - RSS     → rss-parser.ts
 *   - API     → api-fetcher.ts (Globes ASMX, JSON endpoints)
 *   - SCRAPE  → html-scraper.ts (gov.il, generic HTML)
 *   - BROWSER → browser-scraper.ts (puppeteer-core for WAF-blocked sites)
 *   - MANUAL  → no-op
 */

import { fetchRSSFeed, type RSSItem } from "./rss-parser";
import { fetchAPIEndpoint } from "./api-fetcher";
import { fetchGovIlPublications, fetchHtmlPage } from "./html-scraper";
import { fetchBrowserItems } from "./browser-scraper";

/**
 * Parse dates in multiple formats:
 *   - ISO 8601 / RFC 2822 (native Date parsing)
 *   - DD.MM.YYYY (BTL SharePoint)
 *   - DD/MM/YYYY (other gov.il patterns)
 * Returns null for unparseable or invalid dates.
 */
export function parseFlexibleDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Try DD.MM.YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const d = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d;
    return null;
  }

  // Fallback to native Date parsing (ISO, RFC 2822, etc.)
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return d;
}

/** Normalized item returned by any fetcher. */
export interface SourceItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

type SourceType = "RSS" | "API" | "SCRAPE" | "BROWSER" | "MANUAL";

/**
 * Fetch items from a source based on its type.
 */
export async function fetchSourceItems(
  type: SourceType,
  url: string,
): Promise<SourceItem[]> {
  switch (type) {
    case "RSS":
      return fetchRSSItems(url);

    case "API":
      return fetchAPIEndpoint(url);

    case "SCRAPE":
      return fetchScrapeItems(url);

    case "BROWSER":
      return fetchBrowserItems(url);

    case "MANUAL":
      // Manual sources are entered by humans — nothing to poll
      return [];

    default:
      throw new Error(`Unknown source type: ${type}`);
  }
}

/** Supported source types that can be automatically polled. */
export function isPollableType(type: string): boolean {
  return ["RSS", "API", "SCRAPE", "BROWSER"].includes(type);
}

/**
 * Map SourceType to IdeaSourceType for the Idea record.
 * SourceType (Source model): RSS | API | SCRAPE | MANUAL
 * IdeaSourceType (Idea model): RSS | SCRAPE | MANUAL | TREND | OTHER
 */
export function toIdeaSourceType(
  sourceType: string,
): "RSS" | "SCRAPE" | "MANUAL" | "OTHER" {
  switch (sourceType) {
    case "RSS":
      return "RSS";
    case "SCRAPE":
    case "BROWSER":
      return "SCRAPE";
    case "MANUAL":
      return "MANUAL";
    case "API":
      return "OTHER";
    default:
      return "OTHER";
  }
}

/** Wrap RSS items into the unified SourceItem format. */
async function fetchRSSItems(url: string): Promise<SourceItem[]> {
  const items: RSSItem[] = await fetchRSSFeed(url);
  return items.map((item) => ({
    title: item.title,
    link: item.link,
    description: item.description,
    pubDate: item.pubDate,
  }));
}

/** Route SCRAPE sources to the appropriate scraper. */
async function fetchScrapeItems(url: string): Promise<SourceItem[]> {
  // Gov.il pages get the specialized scraper
  if (url.includes("gov.il")) {
    return fetchGovIlPublications(url);
  }
  // Everything else gets the generic HTML scraper
  return fetchHtmlPage(url);
}
