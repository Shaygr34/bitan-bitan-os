/**
 * RSS/Atom feed parser. Fetches and parses feed XML from source URLs.
 *
 * Supports:
 * - RSS 2.0 (<item> elements)
 * - Atom (<entry> elements)
 * - CDATA sections in titles/descriptions
 * - Ynet/Calcalist self-closing <link/> quirk
 * - <guid> fallback for links
 */

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

/**
 * Decode HTML/XML entities in RSS text content.
 * Handles named entities (&amp;, &lt;, etc.), decimal (&#8226;),
 * hex (&#x2022;), and double-encoded entities (&amp;#8226;).
 * Runs up to 3 passes to handle multi-layer encoding.
 */
function decodeEntities(text: string): string {
  const NAMED: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
    nbsp: "\u00A0", laquo: "\u00AB", raquo: "\u00BB",
    ndash: "\u2013", mdash: "\u2014", bull: "\u2022",
    hellip: "\u2026", copy: "\u00A9", reg: "\u00AE",
    trade: "\u2122", rsquo: "\u2019", lsquo: "\u2018",
    rdquo: "\u201D", ldquo: "\u201C",
  };

  function decodeOnce(s: string): string {
    return s
      // Named entities first (so &amp;#8226; → &#8226; on this pass)
      .replace(/&([a-zA-Z]+);/g, (_m, name) => NAMED[name.toLowerCase()] ?? _m)
      // Numeric decimal: &#8226; or &#34;
      .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
      // Numeric hex: &#x2022;
      .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)));
  }

  // Run up to 3 passes to handle double/triple-encoded entities
  let result = text;
  for (let i = 0; i < 3; i++) {
    const decoded = decodeOnce(result);
    if (decoded === result) break;
    result = decoded;
  }
  return result;
}

/**
 * Extract text content from an XML element.
 */
function extractTag(xml: string, tag: string): string {
  // Handle CDATA sections
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i",
  );
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return decodeEntities(cdataMatch[1].trim());

  // Regular text content
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  if (!match) return "";

  // Strip any remaining HTML tags, then decode entities
  return decodeEntities(match[1].replace(/<[^>]+>/g, "").trim());
}

/**
 * Extract a link from an RSS/Atom item, handling common edge cases:
 * - Standard <link>url</link>
 * - Ynet/Calcalist: self-closing <link/> with URL as bare text
 * - Atom: <link href="url"/>
 * - <guid> fallback
 */
function extractLink(xml: string): string {
  // 1. Standard <link>url</link>
  const standard = extractTag(xml, "link");
  if (standard && standard.startsWith("http")) return standard;

  // 2. Atom <link href="..."/>
  const atomMatch = xml.match(
    /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i,
  );
  if (atomMatch) return atomMatch[1].trim();

  // 3. Ynet-style: <link/> or <link /> followed by a bare URL
  const ynetMatch = xml.match(/<link\s*\/>\s*(https?:\/\/[^\s<]+)/i);
  if (ynetMatch) return ynetMatch[1].trim();

  // 4. <guid> fallback (often contains the article URL)
  const guid = extractTag(xml, "guid");
  if (guid && guid.startsWith("http")) return guid;

  return standard || "";
}

/**
 * Parse RSS 2.0 XML string into items.
 */
function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, "title");
    const link = extractLink(itemXml);
    const description = extractTag(itemXml, "description");
    const pubDate = extractTag(itemXml, "pubDate") || null;

    if (title) {
      items.push({ title, link, description, pubDate });
    }
  }

  return items;
}

/**
 * Parse Atom XML string into items.
 */
function parseAtomEntries(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    const title = extractTag(entryXml, "title");
    const link = extractLink(entryXml);
    const description =
      extractTag(entryXml, "summary") || extractTag(entryXml, "content");
    const pubDate =
      extractTag(entryXml, "published") ||
      extractTag(entryXml, "updated") ||
      null;

    if (title) {
      items.push({ title, link, description, pubDate });
    }
  }

  return items;
}

/**
 * Parse feed XML (RSS 2.0 or Atom) into items.
 */
export function parseRSSXml(xml: string): RSSItem[] {
  // Try RSS 2.0 first
  const rssItems = parseRSSItems(xml);
  if (rssItems.length > 0) return rssItems;

  // Fallback to Atom
  const atomItems = parseAtomEntries(xml);
  if (atomItems.length > 0) return atomItems;

  return [];
}

/**
 * Fetch and parse a feed (RSS or Atom) from a URL.
 */
export async function fetchRSSFeed(url: string): Promise<RSSItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  console.log(`[RSS] Fetching: ${url}`);

  try {
    // Build origin-aware headers to avoid 403 blocks from Israeli news sites
    let referer = "https://www.google.com/";
    try {
      const u = new URL(url);
      referer = u.origin + "/";
    } catch { /* keep default */ }

    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: referer,
        Connection: "keep-alive",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        DNT: "1",
      },
    });

    console.log(
      `[RSS] Response: ${response.status} ${response.statusText}, ` +
        `content-type: ${response.headers.get("content-type")}, ` +
        `url: ${response.url}`,
    );

    if (!response.ok) {
      throw new Error(
        `RSS fetch failed: ${response.status} ${response.statusText} (url: ${url})`,
      );
    }

    const xml = await response.text();
    console.log(`[RSS] Body length: ${xml.length} chars`);

    if (xml.length === 0) {
      throw new Error(`RSS feed returned empty response (url: ${url})`);
    }

    // Detect HTML error pages (captcha, 403 page, redirect to homepage)
    const trimmed = xml.trimStart().toLowerCase();
    if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) {
      console.error(
        `[RSS] Feed returned HTML instead of XML. First 500 chars:\n${xml.slice(0, 500)}`,
      );
      throw new Error(
        `RSS feed returned HTML page instead of XML (url: ${url})`,
      );
    }

    const items = parseRSSXml(xml);
    console.log(`[RSS] Parsed ${items.length} items from ${url}`);

    if (items.length === 0) {
      console.warn(
        `[RSS] Zero items parsed from ${url}. First 1000 chars:\n${xml.slice(0, 1000)}`,
      );
    } else {
      console.log(
        `[RSS] First item: "${items[0].title}" — ${items[0].link || "(no link)"}`,
      );
    }

    return items;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`RSS fetch timed out after 30s (url: ${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
