/**
 * Browser scraper — headless Chromium via puppeteer-extra + stealth plugin.
 *
 * Used for sources where server-side fetch() is blocked by WAF/JS rendering:
 *   - gov.il       → WAF 403 + Cloudflare JS challenge, stealth bypasses
 *   - btl.gov.il   → SharePoint page behind JS wall
 *   - calcalist    → RSS feeds dead (404), section pages are React SPA
 *
 * Design:
 *   - puppeteer-extra with stealth plugin (patches headless detection vectors)
 *   - Lazy dynamic import (no crash if not installed)
 *   - Singleton browser process shared across all BROWSER sources in a cron cycle
 *   - Site-specific extractors routed by URL pattern
 *   - Cloudflare challenge detection + wait for gov.il pages
 *   - Reuses parseGovIlHtml() for gov.il pages (same 4 strategies)
 *
 * NOTE: No type imports from puppeteer — module may not be installed
 * at build time. All puppeteer objects typed as `any` to avoid TS2307.
 */

import type { SourceItem } from "./poll-dispatcher";
import { parseGovIlHtml } from "./html-scraper";

// ── Chromium singleton ──────────────────────────────────────────────

let browserInstance: any = null; // eslint-disable-line

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
  "--disable-software-rasterizer",
  "--lang=he-IL",
  "--window-size=1920,1080",
];

function findChromium(): string {
  const fs = require("fs") as typeof import("fs"); // eslint-disable-line
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Chromium not found. Checked: ${CHROMIUM_CANDIDATES.join(", ")}. ` +
    `Set CHROMIUM_PATH env var or install chromium in Docker.`,
  );
}

async function getBrowser(): Promise<any> { // eslint-disable-line
  if (browserInstance?.connected) return browserInstance;

  let puppeteerExtra;
  let StealthPlugin;
  try {
    puppeteerExtra = (await import("puppeteer-extra")).default;
    StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
  } catch {
    // Fallback to puppeteer-core if extra not available
    try {
      const puppeteerCore = await import("puppeteer-core");
      const executablePath = findChromium();
      console.log(`[BROWSER] Launching Chromium (no stealth): ${executablePath}`);
      browserInstance = await puppeteerCore.default.launch({
        executablePath,
        headless: true,
        args: LAUNCH_ARGS,
      });
      return browserInstance;
    } catch {
      throw new Error(
        "Neither puppeteer-extra nor puppeteer-core is installed. " +
        "BROWSER sources require puppeteer + system Chromium.",
      );
    }
  }

  puppeteerExtra.use(StealthPlugin());

  const executablePath = findChromium();
  console.log(`[BROWSER] Launching Chromium with stealth: ${executablePath}`);

  browserInstance = await puppeteerExtra.launch({
    executablePath,
    headless: "new",
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

// ── Cloudflare challenge handling ────────────────────────────────────

/**
 * Navigate to a URL with Cloudflare JS challenge detection.
 * If a CF challenge page is detected, waits for it to resolve (3-8s typically).
 */
async function navigateWithCfBypass(page: any, url: string): Promise<void> { // eslint-disable-line
  console.log(`[BROWSER] Navigating to: ${url}`);

  await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 });

  // Check if we hit a Cloudflare challenge
  const content = await page.content();
  if (
    content.includes("cf-challenge") ||
    content.includes("Checking your browser") ||
    content.includes("cf-browser-verification") ||
    content.includes("Just a moment")
  ) {
    console.log("[BROWSER] Cloudflare challenge detected, waiting for resolution...");

    // Wait for the challenge to auto-resolve (JS challenge typically 3-8s)
    await page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: 15_000,
    }).catch(() => {
      console.log("[BROWSER] Navigation timeout during CF challenge — checking page anyway");
    });

    // Extra wait for dynamic content after challenge resolution
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const finalUrl = page.url();
    console.log(`[BROWSER] Post-CF URL: ${finalUrl}`);
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
    // Block images/fonts/media to speed up loading (but keep stylesheets for gov.il)
    await page.setRequestInterception(true);
    page.on("request", (req: any) => { // eslint-disable-line
      const type = req.resourceType();
      if (["image", "font", "media"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Set realistic viewport and headers
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    // Use CF-aware navigation for gov.il, standard for others
    const isGovIl = url.includes("gov.il");
    if (isGovIl) {
      await navigateWithCfBypass(page, url);
    } else {
      console.log(`[BROWSER] Navigating to: ${url}`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 });
    }

    // Route to site-specific extractor (BTL before generic gov.il)
    if (url.includes("btl.gov.il")) {
      return await extractBtlItems(page, url);
    }
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

// ── BTL (Bituach Leumi) extractor ──────────────────────────────────

/**
 * BTL SharePoint pages: uses `td[class*="il-ItemTitleTd"]` for item lists.
 * Skips the generic gov.il waitForSelector (which wastes 15s on wrong selectors)
 * and goes straight to the correct SharePoint selector, then reuses parseGovIlHtml().
 */
async function extractBtlItems(page: any, url: string): Promise<SourceItem[]> { // eslint-disable-line
  // Wait for SharePoint item table cells
  await page.waitForSelector(
    'td[class*="il-ItemTitleTd"], [class*="ms-vb2"], table[class*="ms-listviewtable"]',
    { timeout: 15_000 },
  ).catch(() => {
    console.warn("[BROWSER] BTL: no SharePoint selectors found, proceeding with raw HTML");
  });

  const html = await page.content();
  const origin = new URL(url).origin;
  console.log(`[BROWSER] BTL HTML: ${html.length} chars`);

  const items = parseGovIlHtml(html, origin);
  console.log(`[BROWSER] BTL extracted ${items.length} items`);
  return items;
}

// ── Gov.il extractor ────────────────────────────────────────────────

/**
 * Gov.il pages: render with Chromium to bypass WAF, then reuse
 * the existing parseGovIlHtml() strategies (NEXT_DATA, SharePoint, etc.)
 */
async function extractGovIlItems(page: any, url: string): Promise<SourceItem[]> { // eslint-disable-line
  // Wait for content — prioritize __NEXT_DATA__ (instant on Next.js pages)
  await page.waitForSelector(
    'script#__NEXT_DATA__, [class*="result"], [class*="publication"], [class*="card"]',
    { timeout: 15_000 },
  ).catch(() => {
    console.warn("[BROWSER] Gov.il: no expected selectors found, proceeding with raw HTML");
  });

  const html = await page.content();
  const origin = new URL(url).origin;
  console.log(`[BROWSER] Gov.il HTML: ${html.length} chars`);

  // Diagnostic: check if CF is still showing or if we got the actual page
  if (html.includes("cf-challenge") || html.includes("Just a moment")) {
    console.error("[BROWSER] Gov.il: Cloudflare challenge NOT resolved — page is still blocked");
    console.log("[BROWSER] Gov.il: page title:", await page.title());
  }

  // Diagnostic: log __NEXT_DATA__ structure if present
  const hasNextData = html.includes('id="__NEXT_DATA__"');
  console.log(`[BROWSER] Gov.il: __NEXT_DATA__ present: ${hasNextData}`);
  if (hasNextData) {
    try {
      const nextDataStr = await page.$eval('script#__NEXT_DATA__', (el: any) => el.textContent); // eslint-disable-line
      const nextData = JSON.parse(nextDataStr);
      const ppKeys = Object.keys(nextData?.props?.pageProps || {});
      console.log(`[BROWSER] Gov.il: pageProps keys: [${ppKeys.join(", ")}]`);
    } catch (err) {
      console.warn(`[BROWSER] Gov.il: could not parse __NEXT_DATA__: ${(err as Error).message}`);
    }
  }

  const items = parseGovIlHtml(html, origin);
  console.log(`[BROWSER] Gov.il extracted ${items.length} items`);
  return items;
}

// ── Calcalist extractor ─────────────────────────────────────────────

/**
 * Calcalist section pages: React SPA with article cards.
 * Uses page.evaluate() for in-browser DOM extraction.
 */
async function extractCalcalistItems(page: any, url: string): Promise<SourceItem[]> { // eslint-disable-line
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

        // Extract date: try <time> element first, then URL pattern, then meta
        const timeEl = el.querySelector("time");
        let pubDate = timeEl?.getAttribute("datetime") ?? timeEl?.textContent?.trim() ?? null;

        // Fallback: extract date from Calcalist article URL pattern
        // e.g. /article/2026/03/05/... or /article/20260305...
        if (!pubDate && link) {
          const urlDateMatch = link.match(/\/article\/(\d{4})\/(\d{2})\/(\d{2})/);
          if (urlDateMatch) {
            pubDate = `${urlDateMatch[1]}-${urlDateMatch[2]}-${urlDateMatch[3]}`;
          } else {
            // Try compact date in URL: /article/20260305
            const compactMatch = link.match(/\/article\/(\d{4})(\d{2})(\d{2})/);
            if (compactMatch) {
              pubDate = `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
            }
          }
        }

        // Fallback: look for date-like text near the card
        if (!pubDate) {
          const dateSpan = el.querySelector('[class*="date"], [class*="time"], [class*="Date"]');
          if (dateSpan?.textContent) {
            pubDate = dateSpan.textContent.trim();
          }
        }

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

async function extractGenericItems(page: any, url: string): Promise<SourceItem[]> { // eslint-disable-line
  const html = await page.content();
  const origin = new URL(url).origin;
  console.log(`[BROWSER] Generic HTML: ${html.length} chars`);
  return parseGovIlHtml(html, origin);
}
