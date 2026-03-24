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
- puppeteer-extra + stealth plugin + Chromium (Docker only) for BROWSER sources
- Railway auto-deploy, Docker multi-stage build (node:20-alpine)

### Content Factory Pipeline
```
Sources → Poll/Ingest → Ideas (scored) → Draft (Claude AI streaming) → Articles → Publish
```

### Source Types & Fetcher Chain
| Type | Fetcher | Used For |
|------|---------|----------|
| RSS | `rss-parser.ts` | Globes, TheMarker |
| API | `api-fetcher.ts` | Globes ASMX XML endpoint (**deactivated** — returns HTTP 500) |
| SCRAPE | `html-scraper.ts` | Deloitte, generic HTML |
| BROWSER | `browser-scraper.ts` (puppeteer-extra + stealth) | Calcalist, gov.il, BTL |
| MANUAL | no-op | User-entered ideas |

### Key Files
```
src/lib/ai/
└── claude-client.ts            — Claude API: complete() + streamComplete() (SSE streaming)

src/lib/content-factory/
├── ingestion/
│   ├── poll-dispatcher.ts      — Routes source type → fetcher, parseFlexibleDate()
│   ├── rss-parser.ts           — RSS/Atom feed parsing
│   ├── api-fetcher.ts          — Globes ASMX XML (deactivated)
│   ├── html-scraper.ts         — HTML parsing: NEXT_DATA, SharePoint, regex, deepSearchArrays()
│   ├── browser-scraper.ts      — puppeteer-extra + stealth, CF bypass, site extractors
│   ├── scoring.ts              — Score rubric (0-100): source weight + recency + keywords + category
│   ├── dedup.ts                — Fingerprint + URL normalization
│   └── keywords.ts             — Keyword buckets for scoring
├── drafting.ts                 — Claude AI draft generation (uses streamComplete)
├── distribution.ts             — Multi-platform publishing
├── transitions.ts              — Article status state machine
├── event-log.ts                — Audit trail
├── sources/seed-data.ts        — 16 seed sources (Globes, TheMarker, Calcalist, gov.il, BTL, Deloitte)
└── validate.ts                 — Request validation helpers

src/app/api/content-factory/
├── sources/                    — CRUD + poll + detect + seed + poll-all + dedup
├── sources/[id]/               — Single source CRUD + poll + history
├── ideas/                      — CRUD + cleanup (purge old ideas)
├── ideas/[id]/                 — Single idea CRUD + draft generation
├── articles/                   — CRUD
├── articles/[id]/              — Single article CRUD + transition + publish-website + assets
├── assets/[id]/                — Asset CRUD + publish + transition
├── hub-stats/                  — Aggregate counts
├── approvals/                  — Approval workflow
├── debug/latest-draft/         — Debug: view latest draft
├── publish-jobs/[id]/status/   — Publish job tracking
└── test-ai/                    — Test Claude API connectivity

src/app/api/cron/ingest/        — Cron-triggered polling of all sources

src/app/content-factory/
├── page.tsx + page.module.css  — Hub dashboard
├── ideas/page.tsx + .module.css — Ideas list with scoring + purge button
├── sources/page.tsx + .module.css — Sources management
└── articles/                   — Article editor
```

### Claude AI Integration
- **`claude-client.ts`** exports `complete()` (non-streaming, 75s timeout) and `streamComplete()` (SSE streaming, 240s abort timeout)
- **Default model**: `claude-sonnet-4-6` — pricing: $3/1M input, $15/1M output
- **Draft generation** (`drafting.ts`) uses `streamComplete()` for 4K-token Hebrew articles
- **Draft route** has `maxDuration=300` (5 min, Railway max) to accommodate streaming

### Browser Scraping (puppeteer-extra + stealth)
- **Stealth plugin** patches headless detection vectors (WebGL, Chrome runtime, etc.)
- **Cloudflare bypass**: `navigateWithCfBypass()` detects CF challenge pages, waits up to 15s for auto-resolution
- **Site-specific extractors**: BTL (SharePoint), gov.il (__NEXT_DATA__), Calcalist (React SPA with URL date extraction)
- **Singleton browser**: shared across all BROWSER sources in a cron cycle, closed after batch
- **next.config.js**: uses `experimental.serverComponentsExternalPackages` (Next.js 14.x key, NOT `serverExternalPackages` which is 15+)

### Prisma Schema (key models)
- **Source**: name, nameHe, type (RSS|API|SCRAPE|BROWSER|MANUAL), url, weight, category, tags, pollIntervalMin, lastPolledAt, lastItemCount, lastError, active
- **Idea**: title, description, sourceType, sourceUrl, tags, status (NEW|SELECTED|ENRICHED|REJECTED|ARCHIVED), score, scoreBreakdown, fingerprint, sourcePublishedAt, sourceId
- **Article**: title, body, status (DRAFT|IN_REVIEW|APPROVED|PUBLISHED|REJECTED), ideaId

### Scoring Rubric
```
score = sourceWeight(0-25) + recency(0-25) + keywords(0-30) + category(0-20) - negativePenalty
```
- No date → recency=0, >30 days → recency=0
- Items with score < 45 hidden by default in UI

### Data Quality Gates
- **Pre-2024 date gate**: ideas with `sourcePublishedAt` before 2024-01-01 are rejected during ingestion
- **Dateless item rejection**: BROWSER/SCRAPE items without `sourcePublishedAt` are rejected
- **Cleanup endpoint**: `DELETE /api/content-factory/ideas/cleanup?before=2024-01-01` — no auth required (admin app)
- **Purge button**: Ideas page has "נקה ישנים" button to trigger cleanup from UI

### Known Issues (as of 2026-03-05)

#### NEEDS PRODUCTION VERIFICATION (deployed but untested)
1. **Gov.il sources may still return 0 items** — Stealth plugin + CF bypass deployed (PR #96-#100) but never ran on a successful build. The build was broken from PR #96 through PR #100. First successful deploy pending. Check Railway logs for `[BROWSER]` diagnostics.
2. **Streaming draft generation untested in prod** — `streamComplete()` deployed but same build-broken window. Check Railway logs for `[Claude] Stream` messages.
3. **Calcalist date extraction untested** — URL pattern matching added but not verified in prod.

#### IMPORTANT
4. **Hub page may fail to load stats** — DB appears to time out on cold starts. May need retry logic or connection pool tuning.
5. **Source settings lack user controls** — No per-source scan timeframe, no poll frequency override from UI. `pollIntervalMin` exists in DB but is not enforced in cron (polls ALL sources every run).
6. **Scan progress is opaque** — Sources page "scan" button just shows "scanning" with no per-source feedback.
7. **No source-level filtering on Ideas page** — Can't filter ideas by source.
8. **Add Source flow is raw** — Just a URL input. No auto-detection preview, no test-poll, no type inference.

### Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `ANTHROPIC_API_KEY` — Claude API
- `CRON_SECRET` — Auth for /api/cron/ingest
- `CHROMIUM_PATH` — Optional, auto-detected in Docker (usually `/usr/bin/chromium-browser`)
- `SANITY_*` — Sanity CMS publishing

### Build Notes
- Docker multi-stage build: deps → build → runner (node:20-alpine + chromium)
- puppeteer-extra + stealth + puppeteer-core all in `experimental.serverComponentsExternalPackages` (Next.js 14.x)
- **Do NOT use `serverExternalPackages`** — that's Next.js 15+ only. Next.js 14.x uses `experimental.serverComponentsExternalPackages`.
- Puppeteer types not available at build time — all puppeteer objects typed as `any` with `eslint-disable-line`
- ESLint: `next/core-web-vitals` only, no `@typescript-eslint`
- `maxDuration=300` on draft route (streaming), default on other routes
- **Zsh glob escaping**: file paths with `[brackets]` must be quoted in git/shell commands (e.g., `git add "apps/os-hub/src/app/api/content-factory/ideas/[id]/draft/route.ts"`)

### Session History (PRs merged)
- **PR #93**: Initial stabilization — source filter, scoring fixes
- **PR #94**: Session 1B — data quality gates, draft timeout, scan feedback
- **PR #95**: Purge old ideas button on Ideas page
- **PR #96**: Session 2 — streaming drafts, stealth Chromium, Calcalist dates
- **PR #97**: Streaming reliability + gov.il diagnostics
- **PR #98**: serverExternalPackages for puppeteer build fix (wrong key)
- **PR #99**: Fix to experimental.serverComponentsExternalPackages (correct key for Next.js 14.x)
- **PR #100**: Fix startTime scoping in draft route catch block
- **PR #101**: V2 premium design overhaul — 20 files, align with website design language (colors, shadows, animations, typography)

### Design System (V2 — March 2026)
- **Styling**: CSS Modules + globals.css tokens (NOT Tailwind). No UI libraries.
- **Colors**: Navy `#1B2A4A`, Gold `#C5A572`, Deep Navy `#0F1D35`, Surface `#F8F7F4`, Border `#E2E0DB`
- **Typography**: Heebo font, h1=2rem, h2=1.5rem, body=0.9375rem
- **Shadows**: Brand-tinted 4-level hierarchy (sm/md/lg/xl) using rgba(27,42,74,*)
- **Animations**: fadeUp, fadeIn, underlineGrow, statPop, stagger (CSS-only, no Framer Motion)
- **Utility classes**: `.animate-page` (page entrance), `.animate-stagger` (child stagger), `.gold-underline-animated`
- **Card pattern**: hover lift (-3px), shadow-lg, gold border glow `rgba(197,165,114,0.3)`
- **Button pattern**: scale 1.03 hover, 0.97 active
- **PageHeader**: animated gold underline `<span className={styles.underline} />`
- **StatusBadge**: pill shape (border-radius: 9999px)
- **Transitions**: 200ms fast, 300ms normal, 400ms slow
- **Design reference**: matches `/Users/shay/bitan-bitan-website` visual language
