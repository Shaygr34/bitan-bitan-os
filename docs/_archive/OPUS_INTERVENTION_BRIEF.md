# Content Factory — Opus Intervention Brief

**Date**: 2026-03-05
**Repo**: `/Users/shay/bitan-bitan-os/apps/os-hub`
**Deploy**: Railway auto-deploy on main merge (Docker)
**Stack**: Next.js 14.2 + Prisma + PostgreSQL + Claude Sonnet 4.6 + Puppeteer-core

---

## What is this system?

A **content sourcing and drafting pipeline** for an Israeli accounting/tax firm (Bitan). It:
1. Polls 16 sources (news RSS feeds, gov.il publications, BTL circulars) on a schedule
2. Scores each item for relevance (keyword match + recency + source weight)
3. Lets founders pick high-scoring ideas and generate AI article drafts with Claude
4. Publishes to Sanity CMS

The founders care most about **gov.il regulatory publications** (Tax Authority, Ministry of Finance, National Insurance) — these are the highest-value sources. News sources (Globes, TheMarker, Calcalist) provide supporting context.

---

## Current State: What Works

| Component | Status | Notes |
|-----------|--------|-------|
| RSS polling (Globes, TheMarker) | ✅ Working | 7 RSS feeds, reliable |
| Globes ASMX API | ✅ Working | XML endpoint, structured |
| Calcalist BROWSER scraping | ⚠️ Partial | Works but returns old articles (2023), no date filtering |
| Scoring engine | ✅ Working | 0-100 rubric, keyword + recency + source weight |
| Dedup (fingerprint + URL) | ✅ Working | Prevents duplicates |
| Draft generation (Claude) | ⚠️ Fragile | Timeout reduced to 55s (was 120s > maxDuration), but still fails sometimes |
| Ideas page UI | ✅ Recently improved | CSS modules, score bars, delete, per-source poll progress |
| Article editor | ✅ Working | Status transitions, publishing pipeline |

## Current State: What's Broken

### 1. Hub page fails to load (CRITICAL)
The Content Factory landing page shows "מסד הנתונים לא זמין כרגע" (DB unavailable) after 3 retry attempts. The `hub-stats` API races DB queries against an 8s timeout, and all queries time out. This suggests a **PostgreSQL cold-start or connection pooling issue on Railway**, not a code bug. Need to investigate:
- Is Railway PG sleeping/cold-starting?
- Is the Prisma connection pool configured correctly?
- Should we add `?connection_limit=5&pool_timeout=10` to DATABASE_URL?

### 2. Gov.il sources return 0 items (CRITICAL — core value proposition)
The most important sources (Tax Authority, Ministry of Finance) produce nothing. The pipeline:
```
Chromium loads page → waitForSelector → get HTML → parseGovIlHtml() → 0 items
```
Root causes to investigate:
- **WAF blocking**: Even Chromium may be blocked by gov.il's WAF (Akamai/CloudFlare). Need to test with real page loads.
- **__NEXT_DATA__ structure mismatch**: `deepSearchArrays()` was added as fallback but is untested against actual gov.il page HTML. The data may be in React Query dehydrated state format.
- **Wrong URLs**: The publication list URLs may have changed or require different query params.
- **BROWSER type on Railway**: Puppeteer runs in Docker with Chromium — does it actually work on Railway's infra? Need to check Railway logs for Chromium launch errors.

**Required research**: Load the actual gov.il URLs in a browser, inspect __NEXT_DATA__, document the real JSON structure. Then verify Chromium works on Railway.

### 3. Some sources flood hundreds of ideas (IMPORTANT)
RSS feeds like Globes return their full archive (not just recent items). The `pre-2024 date gate` helps but:
- Many items have no date at all (→ not filtered)
- No per-source "only last N days" setting
- No `pollIntervalMin` enforcement in cron (it polls ALL sources every run regardless of interval)

### 4. No source-level controls or intelligence (IMPORTANT)
The "Add Source" flow is a blank URL input. No:
- Auto-detection of source type (RSS vs HTML vs JS-rendered)
- Test-poll before saving ("found 12 items, here's a preview")
- Per-source date window ("only items from last 7 days")
- Poll frequency enforcement (pollIntervalMin exists in DB but is ignored)
- Source health monitoring (success/failure trends)

### 5. Ideas page lacks source filtering (UX)
With 16 sources producing ideas, there's no way to filter by source. Founders can't answer "what did the Tax Authority publish this week?"

### 6. Scan progress is opaque on Sources page
The sources management page has a "scan" button that shows "scanning" until done. No per-source feedback, no item count preview.

---

## Architecture Issues to Resolve

### A. The Scraping Brittleness Problem
Every new site needs custom extraction code:
- Gov.il → `parseNextData()` + `deepSearchArrays()`
- BTL → `parseSharePointTable()`
- Calcalist → `extractCalcalistItems()` (page.evaluate)
- Deloitte → `parseResultItems()` / `parseLinkedHeadings()`

**This doesn't scale.** When a founder wants to add a new gov.il ministry or any new site, it either works by accident (if the HTML happens to match existing patterns) or it returns 0 items and requires developer intervention.

**Proposed solution: LLM-based universal extractor**
```
URL → fetch HTML → send to Claude Haiku → "extract publication items as JSON" → structured items
```
- Cost: ~$0.003/page (Haiku), ~$1.80/month for 20 sources daily
- Self-healing: adapts to site redesigns automatically
- Strategy chain: RSS auto-discover → HTML regex (free) → LLM extraction (reliable fallback)

### B. The "Add Source" Flow
Should be:
1. Founder pastes URL
2. System tries RSS discovery → HTML extraction → LLM extraction
3. Shows preview: "Found 14 items, newest: [title] (2 hours ago)"
4. Founder confirms → source saved with auto-detected type
5. First poll already completed

### C. Source Health & Observability
Need:
- Poll history per source (last 5 polls: items found, errors)
- Health status in sources table (green/yellow/red)
- Auto-disable after 3 consecutive 0-item polls
- Alert in Ideas page when critical sources are failing

### D. Date Windowing & Poll Frequency
- Per-source `maxAgeDays` setting (default: 30, overridable)
- Actually enforce `pollIntervalMin` in cron (skip sources polled recently)
- Calcalist BROWSER extractor needs date filtering (currently returns 2023 articles)

---

## File Map for the Intervention

| File | What it does | What needs changing |
|------|-------------|-------------------|
| `src/lib/content-factory/ingestion/poll-dispatcher.ts` | Routes type→fetcher | Add LLM extraction as fallback in chain |
| `src/lib/content-factory/ingestion/html-scraper.ts` | 4 HTML parsing strategies + deepSearch | May need LLM fallback when all strategies return 0 |
| `src/lib/content-factory/ingestion/browser-scraper.ts` | Puppeteer site extractors | Verify gov.il actually works, add generic LLM extraction |
| `src/lib/content-factory/ingestion/scoring.ts` | Score rubric | May need tuning |
| `src/lib/content-factory/sources/seed-data.ts` | 16 hardcoded sources | Reference only |
| `src/app/api/content-factory/sources/route.ts` | POST/GET sources | Add auto-detect + test-poll on create |
| `src/app/api/content-factory/sources/detect/route.ts` | Source type detection | Exists but needs enhancement |
| `src/app/api/cron/ingest/route.ts` | Cron ingestion loop | Add pollIntervalMin enforcement, date windowing |
| `src/app/api/content-factory/hub-stats/route.ts` | Aggregate counts | Fix DB timeout issue |
| `src/app/content-factory/ideas/page.tsx` | Ideas list UI | Add source filter dropdown |
| `src/app/content-factory/sources/page.tsx` | Sources management UI | Add health indicators, per-source settings, scan progress |
| `src/app/content-factory/page.tsx` | Hub dashboard | Fix DB loading issue |
| `src/lib/ai/claude-client.ts` | Claude API wrapper | May be reused for LLM extraction (or use Haiku separately) |
| `prisma/schema.prisma` | Data models | May need Source.maxAgeDays, Source.lastSuccessCount fields |

---

## Proposed Implementation Phases

### Phase 1: Fix What's Broken (1 session)
1. Diagnose and fix Railway PG cold-start / hub-stats timeout
2. Live-debug gov.il sources: fetch actual page HTML, inspect __NEXT_DATA__, fix extraction
3. Enforce `pollIntervalMin` in cron
4. Add `maxAgeDays` per source, filter in cron + poll routes
5. Add source filter dropdown to Ideas page

### Phase 2: LLM Universal Extractor (1 session)
1. Build `llm-extractor.ts` — sends page HTML to Haiku, returns SourceItem[]
2. Add as fallback in poll-dispatcher: RSS → HTML regex → LLM → BROWSER+LLM
3. Smart "Add Source" flow: auto-detect + preview + confirm

### Phase 3: Source Health & Observability (1 session)
1. Poll history tracking (last 5 results per source)
2. Health status indicators in sources table
3. Auto-disable on consecutive failures
4. Source-level scan progress with item counts

---

## Questions for the Intervention

1. **Railway PG**: What's the connection pooling config? Is PgBouncer in use? What does `DATABASE_URL` look like (connection params)?
2. **Gov.il live test**: Can we fetch `https://www.gov.il/he/departments/publications/?officeId=c0d8ba69-e309-4fe5-801f-855971774a90` with Chromium on Railway and inspect the actual HTML/JSON?
3. **LLM extraction budget**: Is $2/month for Haiku extraction acceptable? (vs. developer time for custom parsers)
4. **Source priority**: Which gov.il offices are highest priority? Just Tax Authority + Ministry of Finance, or others?
5. **Poll frequency**: How often should each source type be polled? (RSS: hourly? Gov.il: every 12h? BTL: daily?)

---

## How to Use This Brief

Paste this document as context in a new Claude Opus session with the instruction:

> "You are a senior architect intervening on a content sourcing system that's partially broken. Read the brief, then: (1) research the gov.il scraping issue by examining the actual code and page structures, (2) design the LLM universal extractor architecture, (3) produce a detailed implementation plan with exact code changes per file. The repo is at `/Users/shay/bitan-bitan-os/apps/os-hub`. Read the CLAUDE.md for full context."
