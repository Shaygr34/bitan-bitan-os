/**
 * HTML scraper for gov.il publication pages and similar server-rendered sites.
 *
 * Uses regex-based parsing (no external deps) to extract publication items
 * from gov.il collector pages (Tax Authority, Finance Ministry, etc.).
 *
 * Target URL pattern:
 *   https://www.gov.il/he/departments/publications/?officeId=<uuid>
 *   https://www.gov.il/he/collectors/publications?officeId=<uuid>
 */

import type { SourceItem } from "./poll-dispatcher";

const GOV_IL_BASE = "https://www.gov.il";

/**
 * Fetch and parse gov.il publication list pages.
 *
 * Gov.il renders server-side HTML with a list of publications.
 * Each item typically has: title, date, link to detail page.
 */
export async function fetchGovIlPublications(url: string): Promise<SourceItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  console.log(`[SCRAPE] Fetching gov.il: ${url}`);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://www.gov.il/",
      },
    });

    if (!response.ok) {
      throw new Error(
        `gov.il fetch failed: ${response.status} ${response.statusText} (url: ${url})`,
      );
    }

    const html = await response.text();
    console.log(`[SCRAPE] Body length: ${html.length} chars`);

    const items = parseGovIlHtml(html);
    console.log(`[SCRAPE] Parsed ${items.length} items from ${url}`);

    if (items.length > 0) {
      console.log(`[SCRAPE] First item: "${items[0].title}" — ${items[0].link || "(no link)"}`);
    }

    return items;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`gov.il fetch timed out after 30s (url: ${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse gov.il publication list HTML.
 *
 * Gov.il uses several HTML patterns for listing publications:
 * 1. <h3 class="...title..."><a href="/he/...">Title</a></h3> with date nearby
 * 2. <div class="gov-result-item"> containers
 * 3. JSON-LD or __NEXT_DATA__ embedded in the page
 *
 * We try multiple strategies and return the first that yields results.
 */
function parseGovIlHtml(html: string): SourceItem[] {
  // Strategy 1: Parse __NEXT_DATA__ JSON (Next.js SSR pages)
  const nextDataItems = parseNextData(html);
  if (nextDataItems.length > 0) return nextDataItems;

  // Strategy 2: Parse result item containers
  const resultItems = parseResultItems(html);
  if (resultItems.length > 0) return resultItems;

  // Strategy 3: Parse linked headings with date context
  const headingItems = parseLinkedHeadings(html);
  if (headingItems.length > 0) return headingItems;

  console.warn(`[SCRAPE] No items found in gov.il HTML (${html.length} chars)`);
  return [];
}

/**
 * Strategy 1: Extract from __NEXT_DATA__ JSON blob.
 * Many gov.il pages embed structured data in a script tag.
 */
function parseNextData(html: string): SourceItem[] {
  const match = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/i);
  if (!match) return [];

  try {
    const data = JSON.parse(match[1]);
    // Navigate through common gov.il data paths
    const props = data?.props?.pageProps;
    if (!props) return [];

    // Try common collection patterns
    const collections = props.collectorData?.items
      ?? props.publications
      ?? props.results
      ?? props.items
      ?? [];

    if (!Array.isArray(collections) || collections.length === 0) return [];

    return collections
      .map((item: Record<string, unknown>): SourceItem | null => {
        const title = (item.title || item.Title || item.name) as string | undefined;
        if (!title) return null;

        const link = buildGovIlLink(
          (item.url || item.UrlName || item.path || item.link) as string | undefined,
        );
        const desc = (item.description || item.Description || item.summary || "") as string;
        const date = (item.publishDate || item.PublishDate || item.date || item.created) as string | undefined;

        return {
          title: stripHtml(title),
          link,
          description: stripHtml(desc),
          pubDate: date ?? null,
        };
      })
      .filter(Boolean) as SourceItem[];
  } catch (err) {
    console.warn(`[SCRAPE] Failed to parse __NEXT_DATA__: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Strategy 2: Parse gov.il result-item containers.
 * Pattern: <div class="*result*item*"> containing title link + date.
 */
function parseResultItems(html: string): SourceItem[] {
  const items: SourceItem[] = [];
  // Match various result container patterns
  const containerRegex = /<(?:div|li|article)\s[^>]*class="[^"]*(?:result[-_]?item|publication[-_]?item|list[-_]?item|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li|article)>/gi;

  let match: RegExpExecArray | null;
  while ((match = containerRegex.exec(html)) !== null) {
    const block = match[1];
    const item = extractItemFromBlock(block);
    if (item) items.push(item);
  }

  return items;
}

/**
 * Strategy 3: Parse linked headings as publication entries.
 */
function parseLinkedHeadings(html: string): SourceItem[] {
  const items: SourceItem[] = [];
  const headingRegex = /<h[2-4][^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h[2-4]>/gi;

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(html)) !== null) {
    const href = match[1];
    const title = stripHtml(match[2]).trim();
    if (!title || title.length < 5) continue;

    // Look for a date near this heading (within next 500 chars)
    const afterHeading = html.slice(match.index + match[0].length, match.index + match[0].length + 500);
    const dateMatch = afterHeading.match(/(\d{1,2}[./]\d{1,2}[./]\d{2,4})/);

    items.push({
      title,
      link: buildGovIlLink(href),
      description: "",
      pubDate: dateMatch ? dateMatch[1] : null,
    });
  }

  return items;
}

/** Extract a single item from an HTML block. */
function extractItemFromBlock(block: string): SourceItem | null {
  // Find the first link with text
  const linkMatch = block.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (!linkMatch) return null;

  const href = linkMatch[1];
  const title = stripHtml(linkMatch[2]).trim();
  if (!title || title.length < 5) return null;

  // Extract date
  const dateMatch = block.match(
    /(?:<time[^>]*datetime="([^"]+)")|(\d{1,2}[./]\d{1,2}[./]\d{2,4})/,
  );
  const pubDate = dateMatch?.[1] ?? dateMatch?.[2] ?? null;

  // Extract description (look for <p> or description-class elements)
  const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const description = descMatch ? stripHtml(descMatch[1]).trim() : "";

  return {
    title,
    link: buildGovIlLink(href),
    description,
    pubDate,
  };
}

/** Build full gov.il URL from a relative or absolute path. */
function buildGovIlLink(href: string | undefined): string {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `${GOV_IL_BASE}${href}`;
  return href;
}

/** Strip HTML tags from a string. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Generic HTML scraper for non-gov.il sites.
 * Extracts linked items from any server-rendered page.
 */
export async function fetchHtmlPage(url: string): Promise<SourceItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  console.log(`[SCRAPE] Fetching HTML: ${url}`);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: new URL(url).origin + "/",
      },
    });

    if (!response.ok) {
      throw new Error(
        `HTML fetch failed: ${response.status} ${response.statusText} (url: ${url})`,
      );
    }

    const html = await response.text();
    console.log(`[SCRAPE] Body length: ${html.length} chars`);

    // Use the same strategies as gov.il
    const items = parseResultItems(html);
    if (items.length > 0) {
      console.log(`[SCRAPE] Parsed ${items.length} items via result containers`);
      return items;
    }

    const headings = parseLinkedHeadings(html);
    console.log(`[SCRAPE] Parsed ${headings.length} items via linked headings`);
    return headings;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`HTML fetch timed out after 30s (url: ${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
