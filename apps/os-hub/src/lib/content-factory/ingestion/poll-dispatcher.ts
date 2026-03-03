/**
 * Poll dispatcher — routes source types to the appropriate fetcher.
 *
 * Currently only RSS is implemented. Future sprints will add:
 *   - API (Sprint 2: gov.il JSON endpoints)
 *   - SCRAPE (Sprint 3: Playwright-based HTML scrapers)
 */

import { fetchRSSFeed, type RSSItem } from "./rss-parser";

/** Normalized item returned by any fetcher. */
export interface SourceItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

type SourceType = "RSS" | "API" | "SCRAPE" | "MANUAL";

/**
 * Fetch items from a source based on its type.
 *
 * Throws if the source type is not yet supported.
 */
export async function fetchSourceItems(
  type: SourceType,
  url: string,
): Promise<SourceItem[]> {
  switch (type) {
    case "RSS":
      return fetchRSSItems(url);

    case "API":
      throw new Error(
        `Source type API is not yet implemented. Planned for Sprint 2.`,
      );

    case "SCRAPE":
      throw new Error(
        `Source type SCRAPE is not yet implemented. Planned for Sprint 3.`,
      );

    case "MANUAL":
      // Manual sources are entered by humans — nothing to poll
      return [];

    default:
      throw new Error(`Unknown source type: ${type}`);
  }
}

/** Supported source types that can be automatically polled. */
export function isPollableType(type: string): boolean {
  return type === "RSS";
  // Future: return ["RSS", "API", "SCRAPE"].includes(type);
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
