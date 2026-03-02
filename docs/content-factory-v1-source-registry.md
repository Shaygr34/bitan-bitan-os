# Content Factory — Definitive Source Registry v1

**Synthesized from:** Grok 4-agent + ChatGPT Deep Research (2026-03-01)
**Status:** Reference document for V1 implementation

---

## Executive Summary

Both research outputs confirm: classic RSS is largely dead for Israeli financial news. Globes RSS returns 400, Calcalist returns 403, TheMarker is disputed. The practical path forward uses a tiered retrieval strategy per source: RSS → Structured API/Endpoint → Scrape.

The biggest discovery: gov.il uses parameterized collector endpoints with officeId parameters — structured, stable, no Playwright needed. Globes has a public ASMX web service returning XML with specific operations like Last20Articles. These are better than RSS.

---

## Tier 1: Working Now (RSS or Structured API)

### Globes — ASMX Web Service (RECOMMENDED over RSS)

| Field | Value |
|-------|-------|
| Access Method | HTTP GET → XML (SOAP-style web service) |
| Primary Endpoint | `https://www.globes.co.il/data/webservices/library.asmx` |
| Key Operations | `Last20Articles` (no params, latest headlines), `FeederNode?iID={nodeId}` (by section) |
| Known Node IDs | iID=2 (all articles), iID=585 (business), iID=9917 (domestic), iID=821 (consumer/market) |
| Confidence | Verified (both researchers) |
| Notes | RSS endpoint (`/webservice/rss/rssfeeder.asmx/FeederNode`) returns 400. The `library.asmx` service works. Returns `text/xml; charset=utf-8`. Parse with `xml2js` or `fast-xml-parser`. |
| Priority | Implement immediately — replaces broken RSS feeds |

### TheMarker — RSS (NEEDS VERIFICATION)

| Field | Value |
|-------|-------|
| Access Method | RSS (disputed) |
| URLs to Test | `https://www.themarker.com/srv/tm-markets`, `https://www.themarker.com/srv/tm-real-estate` |
| RSS Directory | `https://www.themarker.com/misc/rss` |
| Confidence | Conflicting — Grok says "verified working", ChatGPT says "403 blocked" |
| Priority | Test first, implement if working |

### Globes — Currently Working RSS Feeds (KEEP)

| Field | Value |
|-------|-------|
| Access Method | RSS |
| Working Feeds | גלובס דין וחשבון, גלובס נדל"ן ותשתיות (confirmed in v0 deployment) |
| Notes | These 2 feeds work. Keep them. Add ASMX web service as additional/replacement source for broader coverage. |

---

## Tier 2: Gov.il Structured Endpoints (No Playwright Needed)

### רשות המסים — פרסומים וחוזרים (Tax Authority Publications)

| Field | Value |
|-------|-------|
| Access Method | Structured HTML page with parameterized URL |
| Primary URL | `https://www.gov.il/he/departments/publications/?officeId=c0d8ba69-e309-4fe5-801f-855971774a90` |
| Confidence | Verified (ChatGPT found officeId) |
| Notes | Server-rendered HTML, no bot blocking at low volume. This is THE highest-value source for a CPA firm. |
| Implementation | `fetch()` → parse HTML list (`cheerio`/`node-html-parser`) → extract title/date/PDF link |
| Priority | Highest value source — implement in v1 sprint |

### המוסד לביטוח לאומי — חוזרים למעסיקים (NII Employer Circulars)

| Field | Value |
|-------|-------|
| Access Method | Scrape (server-rendered HTML) |
| URL | `https://www.btl.gov.il/Insurance/HozrimBituah/HozrimMasikim/Pages/default.aspx` |
| Confidence | Verified (both researchers) |
| Priority | High value for payroll/compliance clients |

### משרד האוצר — תקציב/חוקים (Ministry of Finance)

| Field | Value |
|-------|-------|
| Access Method | Structured page (gov.il collectors) |
| URL | `https://www.gov.il/he/collectors/publications?officeId=f41159c1-7867-41c3-bc0a-cbfe0da1bb1a` |
| Priority | Medium — implement alongside Tax Authority (same code pattern) |

### משרד המשפטים — פרסומים (Ministry of Justice)

| Field | Value |
|-------|-------|
| Access Method | Structured page (gov.il collectors) |
| URL | `https://www.gov.il/he/collectors/publications?officeId=86842de6-987b-42d4-b9c2-cbd7d0619534` |
| Priority | Lower — add after core gov sources working |

---

## Tier 3: Scraping Required (Playwright)

### כלכליסט — All Sections

| Field | Value |
|-------|-------|
| Access Method | Scrape (Playwright recommended) |
| Section URLs | מיסים/כסף: `/investing`, משפט: `/local_news/category/3772`, נדל"ן: `/real-estate`, כלכלה: `/market` |
| Notes | All RSS endpoints dead (400/403). Cloudflare-style bot protection. Playwright with stealth plugin needed. |
| Priority | Medium — good volume source but noisy |

### דלויט ישראל — עדכוני מס (Deloitte Tax Alerts)

| Field | Value |
|-------|-------|
| Access Method | Scrape (simple fetch may work) |
| URL | `https://www.deloitte.com/il/he/services/tax/perspectives/2026-tax-alerts-and-circulars.html` |
| Notes | Clean index page, no anti-bot. Very high signal — professional tax analysis. |
| Priority | High signal, low noise — implement early |

---

## Tier 4: Future / Nice-to-Have

- **הכנסת — חקיקה** — OData API for bills/committee proceedings
- **רשות ניירות ערך (ISA)** — MAGNA Portal for regulatory filings
- **בנק ישראל** — Interest rate decisions, monetary policy
- **לשכת רואי חשבון (ICPA)** — Professional updates, ethics alerts
- **Israel Innovation Authority** — R&D grants, tax credits

---

## Key Architecture Decision: Tiered Retrieval

Each source should have a `retrievalMethod` field:

```typescript
type RetrievalMethod =
  | { type: 'rss'; url: string }
  | { type: 'api'; url: string; method: 'GET' | 'POST'; parseFormat: 'xml' | 'json' }
  | { type: 'govil_collector'; officeId: string; topic?: string }
  | { type: 'html_scrape'; url: string; selector: string; engine: 'fetch' | 'playwright' }
```

The polling cron job dispatches to the appropriate handler based on `retrievalMethod.type`.

---

## Implementation Roadmap

| Phase | Sources | Method | Timeline |
|-------|---------|--------|----------|
| Phase 1 | Globes ASMX, TheMarker RSS, fix existing | API/RSS | This week |
| Phase 2 | Tax Authority, Finance Ministry, BTL/NII, Deloitte | gov.il collectors + HTML | 1-2 weeks |
| Phase 3 | Calcalist (4 sections), TheMarker (fallback) | Playwright | Month 2 |
| Phase 4 | Knesset, Bank of Israel, ISA, ICPA, Innovation Authority | Mixed | Month 3+ |

**Total: ~20 sources covering 90%+ of material Israeli tax/compliance updates with <15 requests/hour.**
