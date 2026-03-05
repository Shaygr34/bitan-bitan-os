# Diagnostic Report — Content Factory Stabilization
**Date**: 2026-03-05
**Repo**: `/Users/shay/bitan-bitan-os/apps/os-hub`
**Branch**: `diagnostic/2026-03-05`

---

## Executive Summary

The Content Factory has **4 systemic issues** that need fixing in priority order:

1. **Gov.il is fully WAF-blocked** — ALL www.gov.il URLs return Cloudflare 403 even via fetch with realistic User-Agent headers. Chromium on Railway is the only hope, but unverified. This is the core value proposition blocker.
2. **PostgreSQL has zero connection pool tuning** — bare `new PrismaClient()` with no `connection_limit`, `pool_timeout`, or `connect_timeout`. Hub-stats fires 9 parallel queries raced against 8s — cold-start PG on Railway has no chance.
3. **Cron ignores `pollIntervalMin`** — every run polls ALL active sources regardless of when they were last polled. No per-source date windowing exists.
4. **Claude client works but is fragile** — direct fetch (no SDK), 55s timeout fits within 100s maxDuration, but no streaming means the full response must arrive within the timeout window.

**BTL (btl.gov.il) is the bright spot** — returns HTTP 200 with 215 SharePoint items. The existing `parseGovIlHtml()` SharePoint strategy should handle these correctly.

---

## Investigation 1: PostgreSQL Connection & Hub-Stats Timeout

### Prisma Client Configuration (`src/lib/prisma.ts`)

```typescript
// Current: NO connection pool settings at all
const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});
```

**Missing entirely:**
- `connection_limit` — Prisma default is 9 connections per `PrismaClient` instance (num_cpus × 2 + 1). On Railway's shared infra this may be too many.
- `pool_timeout` — default 10s. With cold-start PG, the pool itself times out trying to acquire a connection.
- `connect_timeout` — default 5s. Cold-start Railway PG may need 10-15s to wake.

### Hub-Stats Route (`src/app/api/content-factory/hub-stats/route.ts`)

Runs **9 parallel Prisma queries** via `Promise.all`, then races them against an 8s timeout:

```
Promise.race([
  Promise.all([
    prisma.source.count(),
    prisma.source.count({ where: { lastError: { not: null } } }),
    prisma.idea.count(),
    prisma.idea.count({ where: { status: "NEW" } }),
    prisma.idea.count({ where: { status: "SELECTED" } }),
    prisma.article.count(),
    prisma.article.count({ where: { status: "DRAFT" } }),
    prisma.article.count({ where: { status: "PUBLISHED" } }),
    prisma.source.findFirst({ orderBy: { lastPolledAt: "desc" } }),
  ]),
  timeout(8000),
])
```

**Problem chain:**
1. Railway PG is cold (free/hobby tier sleeps after inactivity)
2. First connection takes 5-15s to establish
3. 9 parallel queries all try to connect simultaneously
4. 8s timeout fires before PG wakes → "DB unavailable"
5. The `withRetry()` helper in `prisma.ts` exists but hub-stats doesn't use it

### Recommendations

1. **Add connection params to DATABASE_URL**: `?connection_limit=5&pool_timeout=20&connect_timeout=15`
2. **Use `withRetry()` in hub-stats** instead of custom Promise.race
3. **Add a warmup query** at app start: `SELECT 1` to wake PG before real queries hit
4. **Sequential fallback**: If `Promise.all` fails, try queries one-by-one (first query wakes PG, rest succeed)

---

## Investigation 2: Gov.il Source Extraction

### URL Probing Results

| URL | Status | Response |
|-----|--------|----------|
| `www.gov.il/he/departments/publications/?officeId=c0d8ba69...` (Tax Authority) | **403** | Cloudflare WAF challenge page |
| `www.gov.il/he/departments/publications/?officeId=f41159c1...` (Ministry of Finance) | **403** | Cloudflare WAF challenge page |
| `www.gov.il/he/api/PublicationApi/Index?...` | **403** | WAF block |
| `www.gov.il/he/api/CatalogApi/Index?...` | **403** | WAF block |
| `www.gov.il/he/api/BureauApi/Index?...` | **403** | WAF block |
| `www.gov.il/rss` | **403** | WAF block |
| `www.gov.il/feed` | **403** | WAF block |
| `btl.gov.il/...` | **200** | 253KB HTML, 215 SharePoint items |
| `data.gov.il/api/3/action/package_search?q=tax` | **200** | Statistical datasets (not publications) |

### Key Finding

**Gov.il has blanket Cloudflare WAF protection that blocks ALL non-browser HTTP requests.** This includes:
- Standard `fetch()` with realistic User-Agent headers
- curl with Chrome User-Agent
- API endpoints (PublicationApi, CatalogApi, BureauApi)
- RSS/feed paths (return 403, not 404 — they may not even exist)

**BTL (btl.gov.il) is on a different infrastructure** — no WAF, returns full SharePoint HTML.

### data.gov.il API

`data.gov.il` returns HTTP 200 and has a CKAN-based API, but it contains **statistical datasets** (CSV downloads, budget data, geographic data), NOT regulatory publications or Tax Authority circulars. This is not a viable alternative for the content the founders need.

### Chromium Path (Unverified)

The BROWSER scraper with Puppeteer/Chromium is the **only viable path** for gov.il. Chromium can:
1. Execute JavaScript (pass Cloudflare's JS challenge)
2. Render the Next.js page
3. Access `__NEXT_DATA__` script tag

**But this is unverified on Railway.** Need to check:
- Does Chromium actually launch in the Railway Docker container?
- Does it solve the Cloudflare challenge? (Some WAFs block headless Chromium too)
- Railway logs for any Chromium launch errors during past poll attempts

### Alternative Approaches

1. **Verify Chromium on Railway** — check Railway deployment logs for `[BROWSER] Launching Chromium` or errors
2. **Cloudflare bypass headers** — try adding `cf-connecting-ip`, `cf-ipcountry` headers (unlikely to help)
3. **Residential proxy** — route Chromium through a residential proxy service (cost: ~$5-15/month)
4. **Manual monitoring** — gov.il publications page is the source of truth; if Chromium can't bypass WAF, founders may need to manually add ideas from gov.il (the MANUAL source type exists for this)
5. **Gov.il RSS discovery** — we cannot even reach the pages to check if RSS links exist in the HTML. This needs Chromium.

---

## Investigation 3: Claude Client Configuration

### Client Architecture (`src/lib/ai/claude-client.ts`)

- **No Anthropic SDK** — uses direct `fetch()` to `https://api.anthropic.com/v1/messages`
- **Model**: `claude-sonnet-4-6` (hardcoded default, overridable via `model` param)
- **Timeout**: 55s (changed from 120s in Batch 5B+)
- **Max tokens**: passed per-call (4096 for drafts)
- **No streaming** — waits for full response
- **No retry on timeout** — throws immediately on AbortError (simplified in Batch 5B+)

### Pricing

- Sonnet 4.6: $3/1M input, $15/1M output tokens
- Draft generation (~4K output tokens): ~$0.06 per draft
- Can switch to Haiku via `model` param for cheaper extraction (~$0.003/page)

### Draft Flow (`src/lib/content-factory/drafting.ts`)

1. Loads `article-draft-system.md` and `article-draft-user.md` prompt templates
2. Calls `complete()` with maxTokens=4096, temperature=0.3
3. Expects JSON response with `title`, `body`, `summary`, `tags`
4. Has `buildFallbackDraft()` for when JSON parsing fails (uses raw text)

### Risk Assessment

- **55s timeout is correct** — fits within Railway's 100s maxDuration with margin
- **No streaming is acceptable** — Sonnet typically returns 4K tokens in 15-30s
- **Direct fetch is fine** — SDK would add dependency weight with no functional benefit for simple completions
- **Model param enables Haiku** — can use for LLM extraction without code changes

---

## Investigation 4: Cron & Date Filtering

### Cron Route (`src/app/api/cron/ingest/route.ts`)

```typescript
// Current: polls ALL active sources every run
const sources = await prisma.source.findMany({
  where: { /* no lastPolledAt or pollIntervalMin filter */ },
});
```

**`pollIntervalMin` is completely ignored.** The field exists in the Prisma schema (Int, default 60) and is stored per source, but the cron route:
1. Fetches ALL sources
2. Loops through ALL of them
3. Polls each one regardless of `lastPolledAt`

### Date Filtering

**Pre-2024 gate exists:**
```typescript
if (publishedAt && publishedAt < new Date("2024-01-01")) {
  skipped++;
  continue;
}
```

**But items with no date pass through:**
- Many RSS items and scraped items have `null` publishedAt
- These get `recency = 0` in scoring (correct), but still create Ideas in the DB
- No per-source `maxAgeDays` setting exists in the schema

### Seed Sources (`sources/seed-data.ts`)

16 sources configured:
- 5 × Globes RSS (different sections)
- 2 × TheMarker RSS
- 4 × Calcalist BROWSER
- 1 × Globes API
- 2 × Gov.il BROWSER (Tax Authority weight=2.0, Ministry of Finance weight=1.5)
- 1 × BTL BROWSER
- 1 × Deloitte SCRAPE

Gov.il sources have the highest weights (2.0 and 1.5) reflecting their importance, but produce 0 items due to WAF blocking.

### Recommendations

1. **Enforce `pollIntervalMin`** in cron:
   ```typescript
   const sources = await prisma.source.findMany({
     where: {
       OR: [
         { lastPolledAt: null },
         { lastPolledAt: { lt: new Date(Date.now() - source.pollIntervalMin * 60000) } }
       ]
     }
   });
   ```
2. **Add `maxAgeDays` to Source model** (Prisma schema migration)
3. **Filter dateless items more aggressively** — either skip them entirely or assign a default date (e.g., "today minus 30 days" so they get recency=0 and eventually age out)
4. **Per-source controls in UI** — expose `pollIntervalMin` and `maxAgeDays` in the sources management page

---

## Priority-Ordered Fix List

| # | Fix | Impact | Effort | Blocking? |
|---|-----|--------|--------|-----------|
| 1 | **Add PG connection pool params** to DATABASE_URL | Hub page loads | Config change | Yes — hub is unusable |
| 2 | **Verify Chromium on Railway** — check logs, test gov.il with Chromium | Gov.il sources work (or confirmed impossible) | Investigation | Yes — core value prop |
| 3 | **Enforce `pollIntervalMin` in cron** | Stop redundant polling, reduce DB load | Small code change | No but wastes resources |
| 4 | **Add `maxAgeDays` to Source + enforce in cron** | Filter stale items per source | Schema migration + code | No but floods ideas |
| 5 | **Hub-stats: use `withRetry()` or sequential fallback** | More resilient stats loading | Small code change | Partially — helps with #1 |
| 6 | **Source filter dropdown on Ideas page** | Founders can see per-source output | UI change | No but major UX gap |
| 7 | **LLM universal extractor** | Self-healing source parsing | New module | No but needed for scale |
| 8 | **Smart "Add Source" flow** | Founders self-serve | UI + backend | No but needed for growth |

### Recommended Session Order

**Session 1 (Stabilization)**:
- Fix #1 (PG connection params) — likely a Railway env var change
- Fix #2 (Chromium verification) — check Railway logs, potentially test with a manual trigger
- Fix #5 (hub-stats resilience)

**Session 2 (Data Quality)**:
- Fix #3 (pollIntervalMin enforcement)
- Fix #4 (maxAgeDays per source)
- Fix #6 (source filter on Ideas page)

**Session 3 (Architecture)**:
- Fix #7 (LLM universal extractor)
- Fix #8 (smart Add Source flow)

---

## Appendix: Raw Probe Data

### Gov.il Tax Authority Response (truncated)
```
HTTP/2 403
server: cloudflare
cf-ray: [redacted]
content-type: text/html; charset=UTF-8
```
Response body: Cloudflare "Checking your browser" challenge page (JavaScript challenge, not CAPTCHA).

### BTL Response (truncated)
```
HTTP/1.1 200 OK
content-type: text/html; charset=utf-8
content-length: ~253KB
```
Contains `<td class="il-ItemTitleTd_gray">` elements with publication dates (DD.MM.YYYY format) and PDF download links. 215 items found via SharePoint table structure.

### data.gov.il API Response
```json
{
  "success": true,
  "result": {
    "count": 156,
    "results": [/* statistical datasets, not publications */]
  }
}
```
Contains CSV/Excel dataset downloads (budget data, geographic boundaries, statistical reports). Not suitable for regulatory publication tracking.
