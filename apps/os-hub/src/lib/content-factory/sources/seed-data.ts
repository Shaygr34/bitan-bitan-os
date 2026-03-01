/**
 * Default source seed data.
 *
 * Active RSS sources: Globes (proven working) + TheMarker.
 * Calcalist: marked inactive — their GeneralRSS URLs consistently return 403
 * for server-side requests (blocked for non-browser access since ~2025).
 * Scrape sources: inactive until Playwright scraper is built (v1).
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

  // ── TheMarker ─────────────────────────────────────────────────────
  {
    name: "TheMarker — נדל\"ן",
    nameHe: "דה מרקר — נדל\"ן",
    type: "RSS",
    url: "https://www.themarker.com/srv/haaretz-realestate",
    weight: 1.2,
    category: "Tax",
    tags: ["real-estate-tax", "compliance", "court-ruling"],
    pollIntervalMin: 120,
    active: true,
    notes: "TheMarker real estate RSS. Good coverage of מס שבח, תמ\"א 38.",
  },
  {
    name: "TheMarker — שוק ההון",
    nameHe: "דה מרקר — שוק ההון",
    type: "RSS",
    url: "https://www.themarker.com/srv/haaretz-capital-market",
    weight: 0.9,
    category: "Business-News",
    tags: ["corp-tax", "compliance", "interest-rates"],
    pollIntervalMin: 120,
    active: true,
    notes: "TheMarker capital markets. Regulatory and tax-adjacent financial news.",
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

  // ── Scrape (inactive until v1 Playwright) ─────────────────────────
  {
    name: "רשות המסים — פרסומים",
    nameHe: "רשות המסים — פרסומים וחוזרים",
    type: "SCRAPE",
    url: "https://www.gov.il/he/collectors/publications?officeId=c0d8ba69-e309-4fe5-801f-855971774a90&limit=10&Type=0ec5a7ef-977c-459f-8c0a-dcfbe35c8164&drushimStatusType=1",
    weight: 2.0,
    category: "Tax",
    tags: ["income-tax", "VAT", "corp-tax", "real-estate-tax", "compliance", "enforcement"],
    pollIntervalMin: 720,
    active: false,
    notes: "HIGHEST VALUE. Gov.il React SPA — requires Playwright. Active=false until scraper is built (v1).",
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
    active: false,
    notes: "ASP.NET — standard HTTP scraping works. Active=false until scraper built (v1).",
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
    active: false,
    notes: "35+ numbered alerts/year. JS-rendered. Active=false until scraper built.",
  },
];
