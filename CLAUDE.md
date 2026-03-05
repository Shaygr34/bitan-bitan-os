# CLAUDE.md — Bitan OS Project Rules

## Core principles

1. **Web-first**: all tools, deployments, and workflows must work in the browser. No local-only toolchains.
2. **No secrets in code**: credentials go in environment variables or a secrets manager. Never commit `.env` files, API keys, or tokens.
3. **Small PRs**: one concern per pull request. If a PR description needs more than 3 bullet points, split it.
4. **Auditability**: every non-trivial decision gets an entry in `docs/01_decision_log.md` with date, context, and rationale.
5. **Role separation**: each app (`os-hub`, `sumit-sync`, `content-engine`) has a clear owner. Cross-cutting changes require review from both sides.

## Workflow

- Branch from `main`, open a PR, get review, merge.
- CI must pass before merge.
- Use conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`).
- After pushing a branch, always suggest creating a PR and merging it.
- Railway auto-deploys on main merge.

## Code style

- Follow the linter configuration in each app.
- ESLint config: `next/core-web-vitals` only — **no** `@typescript-eslint` plugin. Do NOT use `@typescript-eslint/*` disable comments (they cause build errors because the rules are undefined). Use generic `eslint-disable-line` instead.
- Prefer explicit over clever.
- Write tests for new functionality.

## Design & Style Enforcement

- All UI must comply with `docs/DESIGN_LANGUAGE_SYSTEM.md` — use only defined tokens and components.
- All implementation must comply with `docs/STYLE_CONTRACT.md` — no hard-coded values, follow naming conventions.
- If unsure about a design or style decision, create an explicit `<!-- TODO: ... -->` with your assumption and flag it in the PR.
- No new UI without referencing tokens/components defined in the Design Language System.

---

## os-hub: Content Factory — Architecture & Current State

### Stack
- Next.js 14.2, Prisma 6.19, PostgreSQL (Railway), TypeScript 5.9
- Claude Sonnet 4.6 for draft generation (`src/lib/ai/claude-client.ts`)
- Puppeteer-core + Chromium (Docker only) for BROWSER sources
- Railway auto-deploy, Docker build

### Content Factory Pipeline
```
Sources → Poll/Ingest → Ideas (scored) → Draft (Claude AI) → Articles → Publish
```

### Source Types & Fetcher Chain
| Type | Fetcher | Used For |
|------|---------|----------|
| RSS | `rss-parser.ts` | Globes, TheMarker |
| API | `api-fetcher.ts` | Globes ASMX XML endpoint |
| SCRAPE | `html-scraper.ts` | Deloitte, generic HTML |
| BROWSER | `browser-scraper.ts` (puppeteer-core) | Calcalist, gov.il, BTL |
| MANUAL | no-op | User-entered ideas |

### Key Files
```
src/lib/content-factory/
├── ingestion/
│   ├── poll-dispatcher.ts    — Routes source type → fetcher, parseFlexibleDate()
│   ├── rss-parser.ts         — RSS/Atom feed parsing
│   ├── api-fetcher.ts        — Globes ASMX XML
│   ├── html-scraper.ts       — HTML parsing strategies (NEXT_DATA, SharePoint, regex)
│   ├── browser-scraper.ts    — Puppeteer headless Chromium
│   ├── scoring.ts            — Score rubric (0-100): source weight + recency + keywords + category
│   ├── dedup.ts              — Fingerprint + URL normalization
│   └── keywords.ts           — Keyword buckets for scoring
├── drafting.ts               — Claude AI draft generation
├── distribution.ts           — Multi-platform publishing
├── transitions.ts            — Article status state machine
├── event-log.ts              — Audit trail
├── sources/seed-data.ts      — 16 seed sources (Globes, TheMarker, Calcalist, gov.il, BTL, Deloitte)
└── validate.ts               — Request validation helpers

src/app/api/content-factory/
├── sources/                  — CRUD + poll + detect + seed
├── ideas/                    — CRUD + draft + cleanup
├── articles/                 — CRUD + transition + publish
├── hub-stats/                — Aggregate counts
└── approvals/                — Approval workflow

src/app/api/cron/ingest/      — Cron-triggered polling of all sources

src/app/content-factory/
├── page.tsx + page.module.css — Hub dashboard
├── ideas/page.tsx + .module.css — Ideas list with scoring
├── sources/page.tsx + .module.css — Sources management
└── articles/                 — Article editor
```

### Prisma Schema (key models)
- **Source**: name, nameHe, type (RSS|API|SCRAPE|BROWSER|MANUAL), url, weight, category, tags, pollIntervalMin, lastPolledAt, lastItemCount, lastError
- **Idea**: title, description, sourceType, sourceUrl, tags, status (NEW|SELECTED|ENRICHED|REJECTED|ARCHIVED), score, scoreBreakdown, fingerprint, sourcePublishedAt, sourceId
- **Article**: title, body, status (DRAFT|IN_REVIEW|APPROVED|PUBLISHED|REJECTED), ideaId

### Scoring Rubric
```
score = sourceWeight(0-25) + recency(0-25) + keywords(0-30) + category(0-20) - negativePenalty
```
- No date → recency=0, >30 days → recency=0
- Items with score < 45 hidden by default in UI

### Known Issues (as of 2026-03-05)

#### CRITICAL
1. **Hub page fails to load stats** — `fetchStatsWithRetry` (3 attempts, exponential backoff) exhausts all retries. DB appears to time out consistently. May be Railway PG connection pooling or cold-start issue. Shimmer + retry button show but stats never load.
2. **Gov.il sources return 0 items** — `deepSearchArrays()` fallback added but untested in production. The real issue may be that gov.il's WAF blocks even Chromium, or the __NEXT_DATA__ structure doesn't contain publication arrays at the paths searched. Needs live debugging with actual gov.il page HTML.
3. **Some sources return hundreds of ideas** — No date-based windowing per source. RSS feeds may return entire archive. The pre-2024 date gate helps but doesn't limit to "recent" items (e.g., last 7 days).

#### IMPORTANT
4. **Source settings lack user controls** — No per-source scan timeframe, no poll frequency override from UI, no "only get items from last N days" setting. `pollIntervalMin` exists in DB but is not enforced in cron (polls ALL sources every run).
5. **Scan progress is opaque** — Per-source progress bar added to Ideas page but sources page "scan" button just shows "scanning" with no feedback.
6. **No source-level filtering on Ideas page** — Can't filter ideas by source, making it hard to see what each source is producing.
7. **Calcalist returns articles from 2023** — No date filtering in the Chromium extractor; depends on what the page renders.
8. **Add Source flow is raw** — Just a URL input. No auto-detection preview, no test-poll, no type inference. Founders can't self-serve.

### Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `ANTHROPIC_API_KEY` — Claude API
- `CRON_SECRET` — Auth for /api/cron/ingest
- `CHROMIUM_PATH` — Optional, auto-detected in Docker
- `SANITY_*` — Sanity CMS publishing

### Build Notes
- Docker multi-stage build (deps → build → runner)
- Puppeteer-core types not available at build time (dynamic import)
- ESLint: `next/core-web-vitals` only, no `@typescript-eslint`
- `maxDuration=100` on Railway routes — keep all timeouts under 90s
