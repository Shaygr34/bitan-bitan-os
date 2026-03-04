/**
 * Browser scraper — headless Chromium via puppeteer-core.
 *
 * Used for sources where server-side fetch() is blocked by WAF/JS rendering:
 *   - gov.il  → WAF 403 blocks all fetch(), Chromium bypasses
 *   - calcalist.co.il → RSS feeds dead (404), section pages are React SPA
 *
 * Design:
 *   - Lazy import of puppeteer-core (no crash in dev without Chromium)
 *   - Singleton browser process shared across all BROWSER sources in a cron cycle
 *   - Site-specific extractors routed by URL pattern
 *   - Reuses parseGovIlHtml() for gov.il pages (same 4 strategies)
 */

import type { SourceItem } from "./poll-dispatcher";
import { parseGovIlHtml } from "./html-scraper";

// ── Chromium singleton ──────────────────────────────────────────────

type PuppeteerBrowser = import("puppeteer-core").Browser;
type PuppeteerPage = import("puppeteer-core").Page;

let browserInstance: PuppeteerBrowser | null = null;

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium-browser", // Alpine / Debian Docker
  "/usr/bin/chromium",         // Alternative path
].filter(Boolean) as string[];

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-setuid-sandbox",
  "--single-process",
];

function findChromium(): string {
  const fs = require("fs") as typeof import("fs");
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Chromium not found. Checked: ${CHROMIUM_CANDIDATES.join(", ")}. ` +
    `Set CHROMIUM_PATH env var or install chromium in Docker.`,
  );
}

async function getBrowser(): Promise<PuppeteerBrowser> {
  if (browserInstance?.connected) return browserInstance;

  const puppeteer = await import("puppeteer-core");
  const executablePath = findChromium();
  console.log(`[BROWSER] Launching Chromium: ${executablePath}`);

  browserInstance = await puppeteer.default.launch({
    executablePath,
    headless: true,
    args: LAUNCH_ARGS,
  });

  return browserInstance;
}

/** Close the singleton browser. Call after cron batch or single poll. */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    console.log("[BROWSER] Closing Chromium");
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

// ── Main entry point ────────────────────────────────────────────────

/**
 * Fetch items from a URL using headless Chromium.
 * Routes to site-specific extractors by URL pattern.
 */
export async function fetchBrowserItems(url: string): Promise<SourceItem[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Block images/fonts/media to speed up loading
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (["image", "font", "media", "stylesheet"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Set realistic viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    );

    console.log(`[BROWSER] Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 });

    // Route to site-specific extractor
    if (url.includes("gov.il")) {
      return await extractGovIlItems(page, url);
    }
    if (url.includes("calcalist.co.il")) {
      return await extractCalcalistItems(page, url);
    }
    // Generic fallback: extract full HTML and run gov.il parser strategies
    return await extractGenericItems(page, url);
  } finally {
    await page.close();
  }
}

// ── Gov.il extractor ────────────────────────────────────────────────

/**
 * Gov.il pages: render with Chromium to bypass WAF, then reuse
 * the existing parseGovIlHtml() strategies (NEXT_DATA, SharePoint, etc.)
 */
async function extractGovIlItems(page: PuppeteerPage, url: string): Promise<SourceItem[]> {
  // Wait for content to render
  await page.waitForSelector(
    '[class*="result"], [class*="publication"], #__NEXT_DATA__, [class*="card"]',
    { timeout: 15_000 },
  ).catch(() => {
    console.warn("[BROWSER] Gov.il: no expected selectors found, proceeding with raw HTML");
  });

  const html = await page.content();
  const origin = new URL(url).origin;
  console.log(`[BROWSER] Gov.il HTML: ${html.length} chars`);

  const items = parseGovIlHtml(html, origin);
  console.log(`[BROWSER] Gov.il extracted ${items.length} items`);
  return items;
}

// ── Calcalist extractor ─────────────────────────────────────────────

/**
 * Calcalist section pages: React SPA with article cards.
 * Uses page.evaluate() for in-browser DOM extraction.
 */
async function extractCalcalistItems(page: PuppeteerPage, url: string): Promise<SourceItem[]> {
  // Wait for article cards to render
  await page.waitForSelector(
    'article, [class*="article"], [class*="card"], [class*="teaser"]',
    { timeout: 15_000 },
  ).catch(() => {
    console.warn("[BROWSER] Calcalist: no article selectors found, trying generic extraction");
  });

  const items = await page.evaluate((pageUrl: string) => {
    const results: Array<{ title: string; link: string; description: string; pubDate: string | null }> = [];
    const origin = new URL(pageUrl).origin;

    // Find article containers using multiple selector strategies
    const selectors = [
      "article",
      '[class*="articleCard"]',
      '[class*="article-card"]',
      '[class*="teaser"]',
      '[class*="story-card"]',
      '[class*="item"]',
    ];

    const seen = new Set<string>();
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        // Extract title from h2/h3 or first meaningful text
        const heading = el.querySelector("h2, h3, h4, [class*='title']");
        const title = heading?.textContent?.trim();
        if (!title || title.length < 5 || seen.has(title)) continue;
        seen.add(title);

        // Extract link
        const anchor = el.querySelector("a[href]") as HTMLAnchorElement | null;
        let link = anchor?.href ?? "";
        if (link && !link.startsWith("http")) {
          link = link.startsWith("/") ? origin + link : "";
        }

        // Extract description from subtitle/paragraph
        const desc = el.querySelector("p, [class*='subtitle'], [class*='description']");
        const description = desc?.textContent?.trim() ?? "";

        // Extract date
        const timeEl = el.querySelector("time");
        const pubDate = timeEl?.getAttribute("datetime") ?? timeEl?.textContent?.trim() ?? null;

        results.push({ title, link, description, pubDate });
      }
      if (results.length > 0) break; // Use the first selector that finds items
    }

    return results;
  }, url);

  console.log(`[BROWSER] Calcalist extracted ${items.length} items`);
  return items;
}

// ── Generic fallback ────────────────────────────────────────────────

async function extractGenericItems(page: PuppeteerPage, url: string): Promise<SourceItem[]> {
  const html = await page.content();
  const origin = new URL(url).origin;
  console.log(`[BROWSER] Generic HTML: ${html.length} chars`);
  return parseGovIlHtml(html, origin);
}
