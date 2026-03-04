/**
 * Default source seed data.
 *
 * Active RSS sources: Globes (proven working), TheMarker (RSS feeds verified).
 * TheMarker: switched from SCRAPE to RSS (/srv/tm-*) — working feeds discovered.
 * Calcalist: BROWSER type — section page scraping via Chromium (RSS feeds dead).
 * Gov.il: BROWSER type — Chromium bypasses WAF 403. Reuses parseGovIlHtml strategies.
 * BTL: BROWSER type — SharePoint page is behind JS wall, needs Chromium.
 * Deloitte: active — static HTML, server-side fetch works.
 */

export interface SeedSource {
  name: string;
  nameHe: string;
  type: "RSS" | "API" | "SCRAPE" | "BROWSER" | "MANUAL";
  url: string;
  weight: number;
  category: string;
  tags: string[];
  pollIntervalMin: number;
  active: boolean;
  notes: string;
}

export const SEED_SOURCES: SeedSource[] = [
  // ── Globes (working) ──────────────────────────────────────────────
  {
    name: "גלובס — דין וחשבון",
    nameHe: "גלובס — דין וחשבון",
    type: "RSS",
    url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=829",
    weight: 1.3,
    category: "Legal",
    tags: ["court-ruling", "compliance", "corp-tax"],
    pollIntervalMin: 60,
    active: true,
    notes: "Globes Law section. Hebrew. Headlines-only. PROVEN WORKING.",
  },
  {
    name: "גלובס — נדל\"ן ותשתיות",
    nameHe: "גלובס — נדל\"ן ותשתיות",
    type: "RSS",
    url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=607",
    weight: 1.0,
    category: "Business-News",
    tags: ["real-estate-tax", "compliance"],
    pollIntervalMin: 120,
    active: true,
    notes: "Real estate and infrastructure. PROVEN WORKING.",
  },
  {
    name: "גלובס — שוק ההון",
    nameHe: "גלובס — שוק ההון",
    type: "RSS",
    url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=585",
    weight: 0.7,
    category: "Markets",
    tags: ["corp-tax", "interest-rates", "compliance"],
    pollIntervalMin: 120,
    active: true,
    notes: "Capital markets. Lower weight — only relevant when regulatory changes affect markets.",
  },
  {
    name: "גלובס — עסקים ותעשייה",
    nameHe: "גלובס — עסקים ותעשייה",
    type: "RSS",
    url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=588",
    weight: 0.9,
    category: "Business-News",
    tags: ["corp-tax", "grants", "compliance"],
    pollIntervalMin: 120,
    active: true,
    notes: "Business and industry. Moderate relevance for tax/regulatory angles.",
  },
  {
    name: "גלובס — ראשי",
    nameHe: "גלובס — ראשי",
    type: "RSS",
    url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2",
    weight: 0.6,
    category: "Business-News",
    tags: ["compliance", "interest-rates"],
    pollIntervalMin: 120,
    active: true,
    notes: "Globes main/headlines feed. Lower weight — broad financial news with some tax-adjacent content.",
  },

  // ── TheMarker (RSS — verified working) ─────────────────────────────
  {
    name: "TheMarker — נדל\"ן",
    nameHe: "דה מרקר — נדל\"ן",
    type: "RSS",
    url: "https://www.themarker.com/srv/tm-real-estate",
    weight: 1.2,
    category: "Tax",
    tags: ["real-estate-tax", "compliance", "court-ruling"],
    pollIntervalMin: 120,
    active: true,
    notes: "RSS 2.0 feed. Verified working.",
  },
  {
    name: "TheMarker — שוק ההון",
    nameHe: "דה מרקר — שוק ההון",
    type: "RSS",
    url: "https://www.themarker.com/srv/tm-markets",
    weight: 0.9,
    category: "Business-News",
    tags: ["corp-tax", "compliance", "interest-rates"],
    pollIntervalMin: 120,
    active: true,
    notes: "RSS 2.0 feed. Verified working.",
  },

  // ── Calcalist (BROWSER — verified working URLs, Mar 2026) ──────────
  {
    name: "כלכליסט — מיסים",
    nameHe: "כלכליסט — מיסים",
    type: "BROWSER",
    url: "https://www.calcalist.co.il/tags/%D7%9E%D7%99%D7%A1%D7%99%D7%9D",
    weight: 1.5,
    category: "Tax",
    tags: ["income-tax", "VAT", "real-estate-tax", "corp-tax", "court-ruling"],
    pollIntervalMin: 60,
    active: true,
    notes: "Browser scrape — Calcalist tags/מיסים page. Verified working Mar 2026.",
  },
  {
    name: "כלכליסט — משפט",
    nameHe: "כלכליסט — משפט",
    type: "BROWSER",
    url: "https://www.calcalist.co.il/local_news/category/3772",
    weight: 1.3,
    category: "Legal",
    tags: ["court-ruling", "compliance", "enforcement"],
    pollIntervalMin: 60,
    active: true,
    notes: "Browser scrape — Calcalist law section (category 3772). Verified working Mar 2026.",
  },
  {
    name: "כלכליסט — נדל\"ן",
    nameHe: "כלכליסט — נדל\"ן",
    type: "BROWSER",
    url: "https://www.calcalist.co.il/real-estate",
    weight: 1.2,
    category: "Tax",
    tags: ["real-estate-tax", "compliance"],
    pollIntervalMin: 120,
    active: true,
    notes: "Browser scrape — Calcalist real estate. Verified working Mar 2026.",
  },
  {
    name: "כלכליסט — כלכלה",
    nameHe: "כלכליסט — כלכלה",
    type: "BROWSER",
    url: "https://www.calcalist.co.il/tags/%D7%9B%D7%9C%D7%9B%D7%9C%D7%94",
    weight: 0.8,
    category: "Business-News",
    tags: ["grants", "compliance", "interest-rates"],
    pollIntervalMin: 120,
    active: true,
    notes: "Browser scrape — Calcalist tags/כלכלה page. Verified working Mar 2026.",
  },

  // ── Globes ASMX API (structured XML endpoint) ──────────────────────
  {
    name: "גלובס — ASMX כתבות אחרונות",
    nameHe: "גלובס — כתבות אחרונות (API)",
    type: "API",
    url: "https://www.globes.co.il/data/webservices/library.asmx/Last20Articles",
    weight: 1.0,
    category: "Business-News",
    tags: ["compliance", "corp-tax", "interest-rates"],
    pollIntervalMin: 120,
    active: true,
    notes: "Globes ASMX web service — Last20Articles. XML format. Broader coverage than individual RSS feeds.",
  },

  // ── Gov.il (BROWSER — Chromium bypasses WAF) ──────────────────────
  {
    name: "רשות המסים — פרסומים",
    nameHe: "רשות המסים — פרסומים וחוזרים",
    type: "BROWSER",
    url: "https://www.gov.il/he/departments/publications/?officeId=c0d8ba69-e309-4fe5-801f-855971774a90",
    weight: 2.0,
    category: "Tax",
    tags: ["income-tax", "VAT", "corp-tax", "real-estate-tax", "compliance", "enforcement"],
    pollIntervalMin: 720,
    active: true,
    notes: "Browser scrape — gov.il WAF bypassed via Chromium. Uses parseGovIlHtml strategies.",
  },
  {
    name: "משרד האוצר — פרסומים",
    nameHe: "משרד האוצר — פרסומים",
    type: "BROWSER",
    url: "https://www.gov.il/he/departments/publications/?officeId=f41159c1-7867-41c3-bc0a-cbfe0da1bb1a",
    weight: 1.5,
    category: "Tax",
    tags: ["corp-tax", "compliance", "grants", "interest-rates"],
    pollIntervalMin: 720,
    active: true,
    notes: "Browser scrape — gov.il WAF bypassed via Chromium. Uses parseGovIlHtml strategies.",
  },
  {
    name: "המוסד לביטוח לאומי — חוזרים למעסיקים",
    nameHe: "המוסד לביטוח לאומי — חוזרים למעסיקים",
    type: "BROWSER",
    url: "https://www.btl.gov.il/Insurance/HozrimBituah/HozrimMasikim/Pages/default.aspx",
    weight: 1.8,
    category: "Payroll",
    tags: ["payroll", "employment-law", "compliance"],
    pollIntervalMin: 1440,
    active: true,
    notes: "Browser scrape — SharePoint page is behind JS wall. Uses parseGovIlHtml strategies after rendering.",
  },
  {
    name: "Deloitte Israel — Tax Alerts",
    nameHe: "דלויט ישראל — עדכוני מס",
    type: "SCRAPE",
    url: "https://www.deloitte.com/il/en/services/tax/perspectives/2025-tax-alerts-and-circulars.html",
    weight: 1.5,
    category: "Tax",
    tags: ["income-tax", "VAT", "corp-tax", "real-estate-tax", "court-ruling", "enforcement"],
    pollIntervalMin: 1440,
    active: true,
    notes: "35+ numbered alerts/year. HTML scraper. High signal, low noise.",
  },
];
