/**
 * Default source seed data.
 *
 * Active RSS sources: Globes (proven working).
 * TheMarker: marked inactive — Haaretz group blocks server-side requests (confirmed).
 * Calcalist: marked inactive — GeneralRSS URLs return 403 for non-browser access.
 * Gov.il: marked inactive — WAF returns 403 for all server-side requests. Needs Playwright.
 * BTL: active — SharePoint ASP.NET, server-side fetch works.
 * Deloitte: active — static HTML, server-side fetch works.
 */

export interface SeedSource {
  name: string;
  nameHe: string;
  type: "RSS" | "API" | "SCRAPE" | "MANUAL";
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

  // ── TheMarker (INACTIVE — Haaretz blocks server-side requests) ───
  {
    name: "TheMarker — נדל\"ן",
    nameHe: "דה מרקר — נדל\"ן",
    type: "SCRAPE",
    url: "https://www.themarker.com/srv/haaretz-realestate",
    weight: 1.2,
    category: "Tax",
    tags: ["real-estate-tax", "compliance", "court-ruling"],
    pollIntervalMin: 120,
    active: false,
    notes: "BLOCKED — Haaretz group blocks server-side requests (confirmed). Needs Playwright scraper (v2+).",
  },
  {
    name: "TheMarker — שוק ההון",
    nameHe: "דה מרקר — שוק ההון",
    type: "SCRAPE",
    url: "https://www.themarker.com/srv/haaretz-capital-market",
    weight: 0.9,
    category: "Business-News",
    tags: ["corp-tax", "compliance", "interest-rates"],
    pollIntervalMin: 120,
    active: false,
    notes: "BLOCKED — Haaretz group blocks server-side requests (confirmed). Needs Playwright scraper (v2+).",
  },

  // ── Calcalist (INACTIVE — 403 blocked) ────────────────────────────
  {
    name: "כלכליסט — מיסים",
    nameHe: "כלכליסט — מיסים",
    type: "SCRAPE",
    url: "https://www.calcalist.co.il/GeneralRSS/0,16335,L-13,00.xml",
    weight: 1.5,
    category: "Tax",
    tags: ["income-tax", "VAT", "real-estate-tax", "corp-tax", "court-ruling"],
    pollIntervalMin: 60,
    active: false,
    notes: "BLOCKED — Calcalist returns 403 for server-side RSS requests. Needs Playwright scraper (v1).",
  },
  {
    name: "כלכליסט — משפט",
    nameHe: "כלכליסט — משפט",
    type: "SCRAPE",
    url: "https://www.calcalist.co.il/GeneralRSS/0,16335,L-7,00.xml",
    weight: 1.3,
    category: "Legal",
    tags: ["court-ruling", "compliance", "enforcement"],
    pollIntervalMin: 60,
    active: false,
    notes: "BLOCKED — Calcalist returns 403. Needs Playwright scraper (v1).",
  },
  {
    name: "כלכליסט — נדל\"ן",
    nameHe: "כלכליסט — נדל\"ן",
    type: "SCRAPE",
    url: "https://www.calcalist.co.il/GeneralRSS/0,16335,L-9,00.xml",
    weight: 1.2,
    category: "Tax",
    tags: ["real-estate-tax", "compliance"],
    pollIntervalMin: 120,
    active: false,
    notes: "BLOCKED — Calcalist returns 403. Needs Playwright scraper (v1).",
  },
  {
    name: "כלכליסט — כלכלה",
    nameHe: "כלכליסט — כלכלה",
    type: "SCRAPE",
    url: "https://www.calcalist.co.il/GeneralRSS/0,16335,L-3928,00.xml",
    weight: 0.8,
    category: "Business-News",
    tags: ["grants", "compliance", "interest-rates"],
    pollIntervalMin: 120,
    active: false,
    notes: "BLOCKED — Calcalist returns 403. Needs Playwright scraper (v1).",
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

  // ── Gov.il Scrape (INACTIVE — WAF blocks server-side requests) ────
  {
    name: "רשות המסים — פרסומים",
    nameHe: "רשות המסים — פרסומים וחוזרים",
    type: "SCRAPE",
    url: "https://www.gov.il/he/departments/publications/?officeId=c0d8ba69-e309-4fe5-801f-855971774a90",
    weight: 2.0,
    category: "Tax",
    tags: ["income-tax", "VAT", "corp-tax", "real-estate-tax", "compliance", "enforcement"],
    pollIntervalMin: 720,
    active: false,
    notes: "BLOCKED — gov.il WAF returns 403 for all server-side requests. Needs Playwright scraper.",
  },
  {
    name: "משרד האוצר — פרסומים",
    nameHe: "משרד האוצר — פרסומים",
    type: "SCRAPE",
    url: "https://www.gov.il/he/departments/publications/?officeId=f41159c1-7867-41c3-bc0a-cbfe0da1bb1a",
    weight: 1.5,
    category: "Tax",
    tags: ["corp-tax", "compliance", "grants", "interest-rates"],
    pollIntervalMin: 720,
    active: false,
    notes: "BLOCKED — gov.il WAF returns 403 for all server-side requests. Needs Playwright scraper.",
  },
  {
    name: "המוסד לביטוח לאומי — חוזרים למעסיקים",
    nameHe: "המוסד לביטוח לאומי — חוזרים למעסיקים",
    type: "SCRAPE",
    url: "https://www.btl.gov.il/Insurance/HozrimBituah/HozrimMasikim/Pages/default.aspx",
    weight: 1.8,
    category: "Payroll",
    tags: ["payroll", "employment-law", "compliance"],
    pollIntervalMin: 1440,
    active: true,
    notes: "ASP.NET — HTML scraper extracts linked headings.",
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
