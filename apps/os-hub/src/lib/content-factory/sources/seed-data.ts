/**
 * Default source seed data — 10 sources (6 RSS active, 4 SCRAPE inactive).
 * Copy from content-factory-v0-master-plan.md Section 4.
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
  {
    name: "כלכליסט — מיסים",
    nameHe: "כלכליסט — מיסים",
    type: "RSS",
    url: "http://www.calcalist.co.il/GeneralRSS/0,16335,L-13,00.xml",
    weight: 1.5,
    category: "Tax",
    tags: ["income-tax", "VAT", "real-estate-tax", "corp-tax", "court-ruling"],
    pollIntervalMin: 60,
    active: true,
    notes: "Dedicated tax RSS feed from Calcalist. Hebrew. Headlines + summary.",
  },
  {
    name: "כלכליסט — משפט",
    nameHe: "כלכליסט — משפט",
    type: "RSS",
    url: "http://www.calcalist.co.il/GeneralRSS/0,16335,L-7,00.xml",
    weight: 1.3,
    category: "Legal",
    tags: ["court-ruling", "compliance", "enforcement"],
    pollIntervalMin: 60,
    active: true,
    notes: "Law/Legal feed from Calcalist. Court rulings, regulatory enforcement.",
  },
  {
    name: "כלכליסט — נדל\"ן",
    nameHe: "כלכליסט — נדל\"ן",
    type: "RSS",
    url: "http://www.calcalist.co.il/GeneralRSS/0,16335,L-9,00.xml",
    weight: 1.2,
    category: "Tax",
    tags: ["real-estate-tax", "compliance"],
    pollIntervalMin: 120,
    active: true,
    notes: "Real estate feed. Relevant for מס שבח, מס רכישה content.",
  },
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
    notes: "Globes Law section. Hebrew. Headlines-only.",
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
    notes: "Real estate and infrastructure. Mix of market news and regulatory.",
  },
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
    notes: "HIGHEST VALUE. Gov.il React SPA — requires Playwright. Active=false until scraper is built (v1). Weight 2.0 reflects importance.",
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
    notes: "35+ numbered alerts/year. JS-rendered. Professional interpretation layer. Active=false until scraper built.",
  },
  {
    name: "כלכליסט — כלכלה",
    nameHe: "כלכליסט — כלכלה",
    type: "RSS",
    url: "http://www.calcalist.co.il/GeneralRSS/0,16335,L-3928,00.xml",
    weight: 0.8,
    category: "Business-News",
    tags: ["grants", "compliance", "interest-rates"],
    pollIntervalMin: 120,
    active: true,
    notes: "General economy feed. Lower weight — higher noise. Useful for macro context.",
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
    active: false,
    notes: "Capital markets. Low weight — only relevant when regulatory changes affect markets.",
  },
];
