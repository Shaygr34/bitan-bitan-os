/**
 * API fetcher for structured endpoints (XML/JSON).
 *
 * Primary target: Globes ASMX web service
 *   https://www.globes.co.il/data/webservices/library.asmx/Last20Articles
 *   https://www.globes.co.il/data/webservices/library.asmx/FeederNode?iID=2
 *
 * Also handles generic JSON API endpoints.
 */

import type { SourceItem } from "./poll-dispatcher";

/**
 * Fetch items from a structured API endpoint.
 * Auto-detects XML vs JSON response and parses accordingly.
 */
export async function fetchAPIEndpoint(url: string): Promise<SourceItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  console.log(`[API] Fetching: ${url}`);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/xml, text/xml, application/json, */*",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    console.log(
      `[API] Response: ${response.status} ${response.statusText}, ` +
      `content-type: ${response.headers.get("content-type")}`,
    );

    if (!response.ok) {
      throw new Error(
        `API fetch failed: ${response.status} ${response.statusText} (url: ${url})`,
      );
    }

    const body = await response.text();
    console.log(`[API] Body length: ${body.length} chars`);

    if (body.length === 0) {
      throw new Error(`API returned empty response (url: ${url})`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const trimmed = body.trimStart();

    // Detect format: XML or JSON
    if (contentType.includes("xml") || trimmed.startsWith("<?xml") || trimmed.startsWith("<")) {
      return parseXmlItems(body, url);
    }

    if (contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return parseJsonItems(body);
    }

    console.warn(`[API] Unknown content type: ${contentType}, trying XML`);
    return parseXmlItems(body, url);
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`API fetch timed out after 30s (url: ${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse Globes ASMX XML response.
 *
 * Globes returns XML like:
 *   <ArrayOfNewsItem>
 *     <NewsItem>
 *       <headline>...</headline>
 *       <link>...</link>
 *       <subhead>...</subhead>
 *       <createDate>...</createDate>
 *     </NewsItem>
 *   </ArrayOfNewsItem>
 *
 * Or for FeederNode:
 *   <ArrayOfFeederNodeItem>
 *     <FeederNodeItem>
 *       <title>...</title>
 *       <link>...</link>
 *     </FeederNodeItem>
 *   </ArrayOfFeederNodeItem>
 */
function parseXmlItems(xml: string, sourceUrl: string): SourceItem[] {
  const items: SourceItem[] = [];

  // Try Globes NewsItem format
  const newsItemRegex = /<NewsItem>([\s\S]*?)<\/NewsItem>/gi;
  let match: RegExpExecArray | null;

  while ((match = newsItemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractXmlTag(block, "headline") || extractXmlTag(block, "title");
    const link = extractXmlTag(block, "link") || extractXmlTag(block, "url");
    const desc = extractXmlTag(block, "subhead") || extractXmlTag(block, "description") || "";
    const date = extractXmlTag(block, "createDate") || extractXmlTag(block, "pubDate");

    if (title) {
      items.push({
        title: decodeXmlEntities(title),
        link: link || "",
        description: decodeXmlEntities(desc),
        pubDate: date || null,
      });
    }
  }

  if (items.length > 0) {
    console.log(`[API] Parsed ${items.length} NewsItem elements`);
    return items;
  }

  // Try Globes FeederNodeItem format
  const feederRegex = /<FeederNodeItem>([\s\S]*?)<\/FeederNodeItem>/gi;

  while ((match = feederRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractXmlTag(block, "title") || extractXmlTag(block, "headline");
    const link = extractXmlTag(block, "link") || extractXmlTag(block, "url");
    const desc = extractXmlTag(block, "description") || extractXmlTag(block, "subhead") || "";
    const date = extractXmlTag(block, "createDate") || extractXmlTag(block, "pubDate");

    if (title) {
      items.push({
        title: decodeXmlEntities(title),
        link: link || "",
        description: decodeXmlEntities(desc),
        pubDate: date || null,
      });
    }
  }

  if (items.length > 0) {
    console.log(`[API] Parsed ${items.length} FeederNodeItem elements`);
    return items;
  }

  // Generic XML: look for <item> elements (common pattern)
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractXmlTag(block, "title") || extractXmlTag(block, "headline");
    const link = extractXmlTag(block, "link") || extractXmlTag(block, "url");
    const desc = extractXmlTag(block, "description") || "";
    const date = extractXmlTag(block, "pubDate") || extractXmlTag(block, "date");

    if (title) {
      items.push({
        title: decodeXmlEntities(title),
        link: link || "",
        description: decodeXmlEntities(desc),
        pubDate: date || null,
      });
    }
  }

  console.log(`[API] Parsed ${items.length} generic XML items from ${sourceUrl}`);
  return items;
}

/**
 * Parse JSON API response. Handles both array and object-with-array patterns.
 */
function parseJsonItems(json: string): SourceItem[] {
  try {
    const data = JSON.parse(json);
    const arr = Array.isArray(data)
      ? data
      : data.items ?? data.results ?? data.data ?? data.articles ?? [];

    if (!Array.isArray(arr)) {
      console.warn(`[API] JSON response is not an array and has no items/results key`);
      return [];
    }

    const items: SourceItem[] = [];
    for (const item of arr) {
      if (typeof item !== "object" || !item) continue;
      const title = item.title || item.headline || item.name;
      if (!title) continue;

      items.push({
        title: String(title),
        link: String(item.link || item.url || item.href || ""),
        description: String(item.description || item.summary || item.subhead || ""),
        pubDate: (item.pubDate || item.date || item.publishDate || item.created || null) as string | null,
      });
    }

    console.log(`[API] Parsed ${items.length} JSON items`);
    return items;
  } catch (err) {
    console.error(`[API] Failed to parse JSON: ${(err as Error).message}`);
    return [];
  }
}

/** Extract text content from an XML tag. */
function extractXmlTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i",
  );
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  // Plain text
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
}

/** Decode common XML entities. */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}
