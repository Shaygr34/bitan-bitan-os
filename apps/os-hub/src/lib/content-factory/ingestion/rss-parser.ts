/**
 * RSS feed parser. Fetches and parses RSS XML from source URLs.
 *
 * Uses built-in fetch + simple XML parsing (no rss-parser npm dependency)
 * since we can't install npm packages in this environment.
 */

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

/**
 * Extract text content from an XML element.
 */
function extractTag(xml: string, tag: string): string {
  // Handle CDATA sections
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  // Regular text content
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  if (!match) return "";

  // Strip any remaining HTML tags
  return match[1].replace(/<[^>]+>/g, "").trim();
}

/**
 * Parse RSS XML string into items.
 */
export function parseRSSXml(xml: string): RSSItem[] {
  const items: RSSItem[] = [];

  // Split by <item> tags
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const description = extractTag(itemXml, "description");
    const pubDate = extractTag(itemXml, "pubDate") || null;

    if (title) {
      items.push({ title, link, description, pubDate });
    }
  }

  return items;
}

/**
 * Fetch and parse an RSS feed from a URL.
 */
export async function fetchRSSFeed(url: string): Promise<RSSItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "BitanBitan-ContentFactory/1.0",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    return parseRSSXml(xml);
  } finally {
    clearTimeout(timeout);
  }
}
