/**
 * HTML scraper for gov.il publication pages, BTL circulars, and similar
 * server-rendered government sites.
 *
 * Uses regex-based parsing (no external deps) to extract publication items.
 *
 * Supported patterns:
 *   - gov.il publications (Next.js SSR) — currently blocked by WAF (403)
 *   - btl.gov.il employer circulars (SharePoint ASP.NET)
 *   - Generic HTML pages (Deloitte, etc.)
 */

import type { SourceItem } from "./poll-dispatcher";

/**
 * Fetch and parse gov.il publication list pages.
 *
 * Gov.il renders server-side HTML with a list of publications.
 * Each item typically has: title, date, link to detail page.
 *
 * NOTE: www.gov.il currently blocks server-side requests (WAF 403).
 * This function still works for other .gov.il subdomains like btl.gov.il.
 */
export async function fetchGovIlPublications(url: string): Promise<SourceItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const origin = new URL(url).origin;

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
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        DNT: "1",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        Referer: origin + "/",
      },
    });

    if (!response.ok) {
      throw new Error(
        `gov.il fetch failed: ${response.status} ${response.statusText} (url: ${url})`,
      );
    }

    const html = await response.text();
    console.log(`[SCRAPE] Body length: ${html.length} chars`);

    const items = parseGovIlHtml(html, origin);
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
 * Parse gov.il / .gov.il publication list HTML.
 *
 * Strategies tried in order:
 * 1. __NEXT_DATA__ JSON (Next.js SSR — www.gov.il)
 * 2. SharePoint table rows (btl.gov.il — `il-ItemTitleTd_gray` class)
 * 3. Result item containers (generic gov.il patterns)
 * 4. Linked headings with date context (fallback)
 *
 * @param origin - Source URL origin for building absolute links (e.g. "https://www.btl.gov.il")
 */
function parseGovIlHtml(html: string, origin: string): SourceItem[] {
  // Strategy 1: Parse __NEXT_DATA__ JSON (Next.js SSR pages)
  const nextDataItems = parseNextData(html, origin);
  if (nextDataItems.length > 0) return nextDataItems;

  // Strategy 2: Parse SharePoint table rows (btl.gov.il pattern)
  const spItems = parseSharePointTable(html, origin);
  if (spItems.length > 0) return spItems;

  // Strategy 3: Parse result item containers
  const resultItems = parseResultItems(html, origin);
  if (resultItems.length > 0) return resultItems;

  // Strategy 4: Parse linked headings with date context
  const headingItems = parseLinkedHeadings(html, origin);
  if (headingItems.length > 0) return headingItems;

  console.warn(`[SCRAPE] No items found in gov.il HTML (${html.length} chars)`);
  return [];
}

/**
 * Strategy 1: Extract from __NEXT_DATA__ JSON blob.
 * Many gov.il pages embed structured data in a script tag.
 */
function parseNextData(html: string, origin: string): SourceItem[] {
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

        const link = buildAbsoluteLink(
          (item.url || item.UrlName || item.path || item.link) as string | undefined,
          origin,
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
 * Strategy 2: Parse SharePoint table rows (btl.gov.il pattern).
 * BTL uses <td class="il-ItemTitleTd_gray"><a> with date prefix in link text.
 * Link text format: "DD.MM.YYYY : Title"
 */
function parseSharePointTable(html: string, origin: string): SourceItem[] {
  const items: SourceItem[] = [];
  const rowRegex = /<td\s+class="il-ItemTitleTd[^"]*"[^>]*>\s*<a\s+class="[^"]*"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/td>/gi;

  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(html)) !== null) {
    const href = match[1];
    const rawText = stripHtml(match[2]).trim();
    if (!rawText || rawText.length < 5) continue;

    // Extract date prefix: "DD.MM.YYYY : Title"
    const dateTitle = rawText.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s*:\s*(.+)$/);
    const rawTitle = dateTitle ? dateTitle[2].trim() : rawText;
    // BTL titles from PDF filenames use underscores as spaces
    const title = rawTitle.replace(/^_+/, "").replace(/_/g, " ").trim();
    const pubDate = dateTitle ? dateTitle[1] : null;

    items.push({
      title,
      link: buildAbsoluteLink(href, origin),
      description: "",
      pubDate,
    });
  }

  return items;
}

/**
 * Strategy 3: Parse gov.il result-item containers.
 * Pattern: <div class="*result*item*"> containing title link + date.
 */
function parseResultItems(html: string, origin: string): SourceItem[] {
  const items: SourceItem[] = [];
  // Match various result container patterns
  const containerRegex = /<(?:div|li|article)\s[^>]*class="[^"]*(?:result[-_]?item|publication[-_]?item|list[-_]?item|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li|article)>/gi;

  let match: RegExpExecArray | null;
  while ((match = containerRegex.exec(html)) !== null) {
    const block = match[1];
    const item = extractItemFromBlock(block, origin);
    if (item) items.push(item);
  }

  return items;
}

/**
 * Strategy 4: Parse linked headings as publication entries.
 */
function parseLinkedHeadings(html: string, origin: string): SourceItem[] {
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
      link: buildAbsoluteLink(href, origin),
      description: "",
      pubDate: dateMatch ? dateMatch[1] : null,
    });
  }

  return items;
}

/** Extract a single item from an HTML block. */
function extractItemFromBlock(block: string, origin: string): SourceItem | null {
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
    link: buildAbsoluteLink(href, origin),
    description,
    pubDate,
  };
}

/** Build full URL from a relative or absolute path using the source origin. */
function buildAbsoluteLink(href: string | undefined, origin: string): string {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `${origin}${href}`;
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
    const origin = new URL(url).origin;
    console.log(`[SCRAPE] Body length: ${html.length} chars`);

    // Use the same strategies as gov.il
    const items = parseResultItems(html, origin);
    if (items.length > 0) {
      console.log(`[SCRAPE] Parsed ${items.length} items via result containers`);
      return items;
    }

    const headings = parseLinkedHeadings(html, origin);
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
