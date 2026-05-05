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

### Content Factory Pipeline (V2)
```
PRIMARY FLOW (new):
Upload Refs (PDF/DOCX) → AI Draft (Claude streaming) → Edit in OS → Push to Sanity → Generate Image → Newsletter

SECONDARY FLOW (idea sourcing, moved to sub-tab):
Sources → Poll/Ingest → Ideas (scored) → Draft (Claude AI streaming) → Articles → Publish
```

### Content Factory V2 — Key Files
```
src/app/content-factory/new/page.tsx          — Upload & draft generation page (main flow)
src/app/api/content-factory/upload-refs/      — POST: file upload with PDF/DOCX text extraction
src/app/api/content-factory/generate-draft/   — POST: Claude streaming draft from refs (5min max)
src/app/api/content-factory/articles/[id]/push-to-sanity/ — POST: enhanced Sanity push (all fields)
src/app/api/content-factory/articles/[id]/generate-image/ — POST: Gemini NB2 → Sanity CDN, patches mainImage if pushed
src/app/api/content-factory/articles/[id]/upload-image/   — POST: multipart upload custom hero → Sanity CDN
src/app/api/content-factory/newsletter/       — POST: branded HTML newsletter from article
src/lib/content-factory/ref-extractor.ts      — PDF/DOCX text extraction (pdf-parse, mammoth)
src/lib/content-factory/draft-from-refs.ts    — Orchestrator: refs → Claude → Article
src/lib/content-factory/image-generator.ts    — Gemini image gen (direct REST + AbortController) + Sanity upload
src/lib/content-factory/newsletter-sender.ts  — Branded HTML email renderer
src/lib/sanity/mapper.ts                      — V2: authors[], categories[], checklist PT, excerpt
```

### Nav Structure (V2)
```
לוח בקרה
Content Factory
  ├── מאמר חדש        /content-factory/new
  ├── מאמרים          /content-factory/articles
  ├── מקורות רעיונות   /content-factory/ideas
  └── מקורות          /content-factory/sources
Sumit Sync
Bitan Website
מסמכים
הגדרות
```

### Content Engine — REMOVED
Content Engine (DOCX→PDF converter) was removed from UI in V2. Files deleted:
- `src/app/content-engine/` page
- `src/components/ContentEngineClient.tsx`
- API routes under `/api/content-engine/` kept but unused

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
- `GOOGLE_AI_API_KEY` — Google Gemini for image generation (V2)
- `SUMMIT_API_KEY` — Summit CRM API key (shared with sumit-sync service, set on Railway April 2026)
- `SUMMIT_COMPANY_ID` — Summit company ID (`557813963`, set on Railway April 2026)
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

### Onboarding System (April 2026)

Client intake + data completion system.

**Key Files:**
```
src/app/onboarding/page.tsx                    — Main page with 2 tabs (קליטה חדשה / השלמת נתונים)
src/app/onboarding/CompletionDashboard.tsx     — Data completion dashboard (stat cards, filters, client table)
src/app/onboarding/page.module.css             — Styles (tabs, stats, completion table, progress bars)
src/app/api/intake/generate/route.ts           — POST: generate intake token
src/app/api/intake/tokens/route.ts             — GET/DELETE: list/clear tokens
src/app/api/completion/summary/route.ts        — GET: client completion data from Summit API (background scan)
src/app/api/completion/generate-link/route.ts  — POST: create update-mode link with Summit data pre-fill
src/components/StatusBadge.tsx                 — Status badges (includes summit_failed state)
```

**Onboarding page tabs:**
- **קליטה חדשה**: Generate intake links for new clients. Shows submissions table with status, data, Sumit link.
- **השלמת נתונים**: Data completion dashboard for existing clients. Scans Summit for field completion %, filters by client type/manager/missing doc, generates update-mode links.

**Completion scan flow:**
1. Click "סרוק מסאמיט" → triggers `GET /api/completion/summary?scan=start`
2. Background fetch: all clients from Summit with rate limiting (500ms/call, 50-batch, 65s backoff)
3. Dashboard polls every 15s until cache populated
4. Results cached 1h in-memory, `?refresh=true` to force

**Summit CRM integration:**
- Sumit link opens actual client card: `https://app.sumit.co.il/f557688522/c{entityId}/`
- Internal fields (מנהל תיק, etc.) managed directly in Sumit UI — removed from OS
- Summit errors surfaced: token shows `summit_failed` with error details
- File uploads go to Sanity CDN (Summit API cannot accept files)

**Client type entity IDs** (folder 1099290064):
`עצמאי=1099570216, חברה=1099570010, פטור=1099570246, שותפות=1099570170, עמותה=1099570107, עסק זעיר=1099570213, החזר מס=1179325026`

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
- **PR #102**: DB-backed settings page for editable integration links + Content Factory V2 overhaul
- **Post-merge fixes** (direct to main): pdf-parse v1 downgrade, audit fixes (19 issues), progress bar, Sanity env var fallbacks, Editor token, default authors/category, no AI disclaimer, publishing section uplift, Studio deep link fix

### Content Factory V2 — Tested & Working (March 24, 2026)
- **End-to-end flow verified**: Upload PDF → AI draft (Claude streaming) → Edit → Push to Sanity → Opens Studio
- **Test article**: "ניכוי מס במקור וניהול ספרים" from `opening-tax-files-guide.pdf`
- **Sanity defaults**: authors = רון ביטן + אבי ביטן (`author-ron`, `author-avi`), category = מס הכנסה (`10f65318-...`)
- **No AI disclaimer** — never mention AI to customers. Standard disclaimer only.
- **Sanity token**: `os-write` (Editor role) on Railway `SANITY_API_WRITE_TOKEN` — the old `website-write` token was Viewer-only
- **Studio deep link**: `/structure/knowledgeCentre;article;{id}` (not `/structure/article;{id}`)
- **pdf-parse**: Must use v1.1.1 (v2 has incompatible class-based API)
- **Known gaps**: tags still empty, newsletter is copy-paste to Summit (no API send yet)

### Image Generation (Nano Banana 2) — May 5, 2026
- **Model**: `gemini-3.1-flash-image-preview` (NB2). Higher quality than NB1, mandatory thinking mode, slower (~40-90s).
- **Override via env**: `GEMINI_IMAGE_MODEL` and `GEMINI_IMAGE_TIMEOUT_MS` (default 170_000).
- **CRITICAL — Tier 1 billing required**: NB2 free-tier limit is **0**. Free-tier API keys created BEFORE billing was enabled stay locked to free tier even after billing is added. Solution: create a NEW key in AI Studio after billing is active. Old keys cannot be promoted.
- **Project**: `bitan-ga4-reader` (same GCP project as GA4/Search Console). Billing on `bitancpa.com` Google account.
- **Why direct REST instead of `@google/genai` SDK**: Node native fetch (undici) has a 5-min `headersTimeout` that kills NB2 requests before the model finishes its thinking pass. Manifests as `TypeError: fetch failed` / `UND_ERR_HEADERS_TIMEOUT`. Image-generator uses direct fetch + AbortController so we own the timeout window.
- **Required request shape**: `responseModalities: ["TEXT", "IMAGE"]` (NB2 thinking emits intermediate TEXT — IMAGE-only causes hangs that surface as 5-min undici timeouts). Plus `imageConfig: { aspectRatio: "16:9", imageSize: "2K" }`.
- **Quota error decoding**: `free_tier_requests, limit: 0` = key not promoted to paid tier. `free_tier_input_token_count, limit: 0` = same root cause, different metric. Both mean: rotate the key.
- **Image flow UX**: Article editor Step 1 has Generate / Upload-file buttons + animated progress bar (asymptotic, capped at 95% until response). Generated/uploaded asset stashed on `Article.imageAssetId` (Prisma field). Push-to-sanity reads it as `sanityImageRef` and attaches `mainImage` at doc creation. If article already pushed, both endpoints patch `mainImage` directly. Background-resilient via localStorage flag + DB poll: navigating away does NOT cancel gen.
- **Assets section**: hidden for new articles (only shows for legacy articles with platform assets)

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

---

## sumit-sync: IDOM→SUMIT Reconciliation Service

### Stack
- FastAPI 0.109+, Python 3.9+, SQLAlchemy 2, PostgreSQL (shared Railway DB), pandas
- Railway auto-deploy, Docker (Dockerfile in `apps/sumit-sync/`)
- Railway Volume at `/data` for file storage and client mapping

### What It Does
Reconciles SHAAM/IDOM filing status data with Summit CRM report records:
1. Parse IDOM paste (filing deadlines from tax authority)
2. Get SUMIT data (report statuses from Summit CRM)
3. Match by ח.פ/ת"ז → produce import XLSX + diff report + exceptions

### Two Execution Modes
- **`POST /runs/{id}/execute`** — XLSX-based (original). Requires both IDOM + SUMIT file uploads.
- **`POST /runs/{id}/execute-api`** — API-based (P0, March 2026). Only requires IDOM upload. SUMIT data fetched directly from Summit API. Eliminates manual XLSX export step.

### Frontend Sync Modes (April 2026)
- **API mode (recommended, default)**: User uploads IDOM file only. Summit data fetched automatically via API.
  - Mapping cache warm (~400 clients): ~3-4 min
  - Mapping cache cold (first run): ~10-15 min
  - Frontend polls `GET /runs/{id}` every 10s during execution (handles HTTP timeouts gracefully)
- **Manual mode**: User uploads both IDOM + SUMIT XLSX files. Faster but requires manual export from Summit.
- Mode preference saved to localStorage (`bb-sync-prefs`). API mode is default.
- Proxy routes: `/api/sumit-sync/runs/{id}/execute-api`, `/api/sumit-sync/runs/mapping/summary`

### Write-Back System (April 2026)
Direct API writes to Summit CRM — replaces manual XLSX import.

**Architecture: Two-level writes**
- **Report cards** (דוחות שנתיים/כספיים): UPDATE existing + CREATE new for missing reports
- **Client cards** (לקוחות): UPDATE פקיד שומה, סוג תיק from IDOM data

**Key files:**
- `taxonomy.py` — maps IDOM values → Summit entity reference IDs (status, year, פקיד שומה, סוג תיק). Disk cache at `/data/taxonomy_cache.json`.
- `write_plan.py` — WritePlan model: list of WriteOperations (update_report/create_report/update_client/skip/flag)
- `write_executor.py` — executes plan in dry-run (validate only) or live (write to API) mode
- `sync_engine.py:build_write_plan()` — classifies records: matched→update, unmatched+client exists→create, unmatched+no client→flag

**Safety model:**
1. Dry-run first (validates without writing)
2. Operator approval before live execution (confirmation dialog)
3. Every write logged to `write_logs` table with before/after values
4. Never writes: שם, מספר_תיק (identifying fields)
5. Skips: קוד_שידור, מח (no Summit counterpart)

**API routes:** `GET /runs/{id}/write-plan`, `POST /runs/{id}/write-back/dry-run`, `POST /runs/{id}/write-back`
**Frontend proxy:** `/api/sumit-sync/runs/{id}/write-plan`, `/api/sumit-sync/runs/{id}/write-back?mode=dry-run|live`

**Taxonomy folders (entity references):**
- שנת מס: folder 1125523044 (2022-2026)
- סטטוס דוח: folder 1125161773 (9 statuses, 1→9)
- פקיד שומה: folder 1081741878 (33 tax assessor offices)
- סוג תיק: folder 1081741713 (25 file types)

### Summit API Integration (P0)
- **Direct HTTP client** (`sumit_api_client.py`) calls `api.sumit.co.il` — bypasses MCP proxy to access `Customers_CompanyNumber` (redacted by MCP security zones)
- **Rate limiting**: 50 calls/batch, 65s cooldown, exponential backoff on 403 (70s→140s→280s→560s). Summit blocks after ~100-150 rapid calls.
- **Client mapping** (`mapping_store.py`): JSON on Railway Volume at `/data/client_mapping.json`. Maps client entity ID → ח.פ/ת"ז. Persists across runs — first run resolves all clients (~15min), subsequent runs skip client lookups (~3-4min).
- **Data flow**: `listentities` (report folder) → `getentity` per report → extract `לקוח` reference → `getentity` on client → `Customers_CompanyNumber`
- **Entity counts**: ~243 financial reports, ~572 annual reports. ~400 unique clients.

### Summit CRM Folder IDs
- `1124761700` = דוחות כספיים (financial reports)
- `1144157121` = דוחות שנתיים (annual reports)
- `557688522` = לקוחות (clients)

### Key Files
```
src/core/
├── config.py              — Report schemas, column mappings (SINGLE SOURCE OF TRUTH)
├── idom_parser.py         — SHAAM/IDOM paste parser (DO NOT MODIFY)
├── sumit_parser.py        — SUMIT XLSX parser (original, DO NOT MODIFY)
├── sync_engine.py         — Core matching engine (DO NOT MODIFY)
├── output_writer.py       — XLSX output generation (DO NOT MODIFY)
├── validation.py          — Input validation (DO NOT MODIFY)
├── sumit_api_client.py    — Direct Summit API HTTP client with rate limiting
├── mapping_store.py       — Persistent client ID ↔ ח.פ JSON mapping
└── sumit_api_source.py    — API data source (drop-in for sumit_parser)

src/api/
├── routes.py              — All REST endpoints (runs CRUD, execute, execute-api, mapping)
└── schemas.py             — Pydantic request/response models

src/storage/file_store.py  — Railway Volume file abstraction
src/db/                    — SQLAlchemy models + connection
src/main.py                — FastAPI app entry point
```

### API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/runs` | Create a new reconciliation run |
| POST | `/runs/{id}/upload` | Upload IDOM or SUMIT file |
| POST | `/runs/{id}/execute` | Run sync (XLSX mode, needs both files) |
| POST | `/runs/{id}/execute-api` | Run sync (API mode, IDOM only) |
| GET | `/runs/{id}` | Run detail with metrics + exceptions |
| GET | `/runs` | List runs |
| DELETE | `/runs/{id}` | Delete run + files |
| GET | `/runs/{id}/files/{fid}/download` | Download output file |
| GET | `/runs/{id}/drill-down/{metric}` | Row-level metric data |
| PATCH | `/runs/{id}/exceptions/{eid}` | Resolve exception |
| PATCH | `/runs/{id}/exceptions/bulk` | Bulk resolve exceptions |
| POST | `/runs/{id}/complete` | Lock run as completed |
| GET | `/runs/mapping/summary` | Mapping store stats |
| POST | `/runs/mapping/refresh` | Rebuild client mapping from API |

### Environment Variables (Railway service: `sumit - sync`)
- `DATABASE_URL` — shared PostgreSQL
- `SUMMIT_COMPANY_ID` — `557813963`
- `SUMMIT_API_KEY` — Summit API key (same as summit-mcp service)
- `DATA_DIR` — Railway Volume mount (default `/data`)

### Critical Rules
- API source must produce byte-compatible output with `parse_sumit_file()` — same column names, same "ID: Label" entity reference format, same date types
- Python 3.9 on macOS — avoid `str | None` syntax, use `Optional[str]`
- Summit API key may have trailing newline — always `.strip()` env vars

### Testing
```bash
cd apps/sumit-sync
source .venv/bin/activate  # Create with: python3 -m venv .venv && pip install -r requirements.txt
python -m pytest tests/ -v  # 52 tests (29 original + 14 taxonomy + 9 write plan)
```

---

## Session: April 28, 2026 — Engine Stabilization + 2Sign Integration

### PR #106: Engine Stabilization (9 commits)
Fixed the split-brain architecture where dashboard and detail page showed different data.

**Cache-and-sync layer:**
- `OnboardingRecord` extended with `cachedStage`, `cachedUploadedDocs`, `cachedRequiredDocs`, `lastSyncedAt`, `signingTasks[]`
- New `/api/onboarding/sync` endpoint — detail page fire-and-forget syncs Summit data to Sanity
- Advance endpoint also syncs `cachedStage` to Sanity
- Dashboard reads cached values instead of hardcoding stage=1

**Bugs fixed:**
- % mismatch (unified `calculateCompletion()` formula everywhere)
- Funnel counts (real cached stages, not all-stage-1)
- Hover expansion (JS-based replaces CSS :hover)
- פרטים button silent failure (disabled when no summitEntityId)
- Legacy token labels (clear Hebrew status: "מולא — ממתין לאימות")
- Delete without confirmation (now confirms with client name)
- Not-synced indicator for stale records

**Architecture pattern:** Detail page = sync point. Each visit refreshes the Sanity cache. Dashboard shows cached truth. Eventual consistency by design.

### PR #107: 2Sign API Client
Complete integration client at `src/lib/onboarding/twosign-client.ts`.

**2Sign API (Green Signature) — CONFIRMED WORKING:**
- **Auth**: OAuth2 form-encoded to `/api/Account/Login` with `grant_type=password&username=digital@bitan-finance.co.il&password=BITAN2021`. Token valid 24h.
- **Endpoints are PLURAL**: `/api/Tasks/`, `/api/Clients/` (Apiary docs show singular — WRONG).
- **Task creation**: `POST /api/Tasks/CreateTaskWithFileOption` (not `WithFile`). Accepts `PdfGuid` + `ClientId` + `ClientEmails` + `SearchWordForMarkingSignature`.
- **File upload**: `POST /api/Tasks/UploadFileForTask` (multipart). Returns `ResponseObject.PdfGuid`.
- **Client creation**: `POST /api/Clients/Create` with `{Name, Emails, Phones}` (not FirstName/LastName).
- **All endpoints require POST** (GET returns 405).
- **Env vars on Railway**: `TWOSIGN_EMAIL=digital@bitan-finance.co.il`, `TWOSIGN_PASSWORD=BITAN2021`, `TWOSIGN_CLIENT_ID`, `TWOSIGN_API_KEY`

**Signature placement (BREAKTHROUGH — invisible PDF markers):**
- `SignaturesConstValues` (3x3 grid) creates drawable signatures but can't hit exact positions.
- `SignaturePositions` with x/y creates form fields (blue), NOT drawable signatures (red).
- **SOLUTION**: Pre-process PDF with pdf-lib — add invisible white marker chars ("§" for client, "†" for office) at exact coordinates. Use `SearchWordForMarkingSignature: "§"` to place signature there. Font size 22 with 10x chars = proper field size. See `pdf-marker.ts`.
- **Confirmed coordinates**: רשות המיסים client sig: x=220, yFromTop=430. ב"ל ניכויים: x=150, yFromTop=539.

**Signature Routine** (counter-sign): Signer 1 with `SignatureRoutine:true, SignatureRoutineSignerNumber:1`, Signer 2 with `RoutinePrimaryTaskGuid` pointing to signer 1. Sequential: client signs first → office gets notified.

### PR #108: Stage 2 Signing UI + API Routes
Wired 2Sign into the onboarding workflow.

**New files:**
```
src/app/api/onboarding/signing/route.ts           — POST (initiate), GET (poll+refresh), PATCH (resend)
src/app/onboarding/[entityId]/components/SigningCard.tsx — Signing progress UI
src/app/onboarding/[entityId]/components/SigningCard.module.css
```

**Flow:**
1. Office staff clicks "שלח לחתימה" on SigningCard
2. POST `/api/onboarding/signing` → `initiateSigning()` → 2Sign task created
3. Task GUID stored in `onboardingRecord.signingTasks[]` in Sanity
4. GET `/api/onboarding/signing` polls 2Sign for status updates
5. When signed: retrieves signed doc URL, updates status
6. PATCH `/api/onboarding/signing` resends notification

**Status:** Working end-to-end. SigningCard has PDF upload button → markers → 2Sign → email/SMS to client.

### Also Fixed: Intake Form File Deletion Bug (bitan-website PR #51)
Avi reported: "when we enter the link after the client and save, the files get deleted."
Root cause: re-submission without new files overwrote `submittedData.fileCount` with 0.
Fix: preserve previous file metadata on re-save when no new files uploaded.
Files themselves were never deleted (Sanity CDN + Summit הערות intact).

### Additional Fixes (late session, April 28-29)
- **PR #114**: SigningCard PDF upload — end-to-end from UI (file picker → markers → 2Sign → email+SMS)
- **PR #115**: Auto-link records to Summit entity from matching intake token
- **Advance stage fix**: Summit format was `EntityID+Fields` (wrong) → `Entity{ID,Folder,Properties}` (correct)
- **Resend task fix**: Endpoint path + JSON body format corrected
- **Summit native file upload** (BREAKTHROUGH): File-type fields accept `"Filename;Base64Value"` format. Previous assumption "can't upload files" was FALSE. Now uploads docs natively to Summit File fields — clickable, downloadable in Summit UI.
- **סוג לקוח fix**: Added aliases (עוסק מורשה→עצמאי, חברה בע"מ→חברה, עוסק פטור→פטור) + isCompanyType includes חברה בע"מ
- **Stage revert**: "החזר שלב" button added — can go backwards, not just forward
- **Intake link always visible**: "קישור קליטה" on detail page header, click to copy
- **Auto-advance on signing**: client signs → stage 3, Avi counter-signs → stage 4 (automatic)
- **Date auto-fill**: `fieldType: 4` (Date) in SignaturePositions — auto-fills signing date
- **Counter-sign position**: adjusted down 22pts per Avi feedback

### Known Issues (Updated — as of May 3)
1. **Form re-open doesn't show uploaded docs**: Browser security prevents pre-filling file inputs. Need to show "✓ הועלה" badges from Sanity clientDocument records.
2. **CompletionDashboard (old tab)**: Unmaintained, scan has perf issues. On hold.
3. **Dashboard empty flash**: No retry/error state when API temporarily unavailable during deploy.
4. **Spouse fields**: Avi wants בן/בת זוג info on intake form (not mandatory). Not yet added.
5. **ב"ל מיוצגים link**: Need to add BTL representative link field to intake/onboarding flow.
6. **מחזור שנתי משוער**: Field exists on Summit (Int64) but not yet mapped from intake form.

### Full Onboarding Map — Stage Status
| Stage | Name | Status | Blocker |
|-------|------|--------|---------|
| 1 | איסוף נתונים | **Operational** | Form re-open doc display |
| 2 | ייפוי כוח | **Working E2E** | Counter-sign position fine-tuning |
| 3 | אישור מנהל | **Auto-advances** | = Avi's counter-signature on ייפוי כוח |
| 4 | רשויות | Not built | Need specs from Avi: manual or API? |
| 5 | לקוח חדש | Checklist items exist | Need specs: what triggers completion? |
| 6 | פעיל | Stage pill exists | Need specs: what marks "active"? |

### 10 Open Questions (sent to Avi/Ron via WhatsApp)
1. Fee agreement: separate doc or part of opening?
2. Spouse authorization: separate ייפוי כוח?
3. National insurance: separate signing cycle?
4. CPAA number: blocks Summit transfer?
5. Case worker assignment: varies by type?
6. Non-completing client: follow-up protocol?
7. Company docs: list complete?
8. 2Sign satisfaction: any issues?
9. Current vs desired timeline?
10. Hidden steps outside this map?

## Session: April 23-28, 2026 — Onboarding Workflow Elevation (Original Build)

### What Was Built (21 commits)
Complete dashboard-first workflow management system for client onboarding.

**Architecture:**
- Dashboard page rewritten: PipelineFunnel (6 stages) + ClientTable (hover expansion) + NewClientModal
- Client detail view: StageStepper + ClientInfoCard + DocumentsCard + ChecklistCard
- API layer: `/api/onboarding/records` (CRUD), `/api/onboarding/checklist` (PATCH), `/api/onboarding/entity` (Summit proxy), `/api/onboarding/advance` (Summit status update)
- Foundation: `lib/onboarding/` — types, checklist-templates, completion calculator, summit-client

**Key Components:**
```
src/app/onboarding/page.tsx                      — Dashboard (rewritten)
src/app/onboarding/components/PipelineFunnel.tsx  — 6-stage funnel strip
src/app/onboarding/components/ClientTable.tsx     — Table with hover expand + delete
src/app/onboarding/components/NewClientModal.tsx  — Link creation modal
src/app/onboarding/[entityId]/page.tsx            — Client detail view
src/app/onboarding/[entityId]/components/         — StageStepper, ClientInfoCard, DocumentsCard, ChecklistCard, SigningCard
src/lib/onboarding/types.ts                       — STAGE_LABELS, STAGE_COLORS, SUMMIT_STATUS_IDS, SigningTask
src/lib/onboarding/checklist-templates.ts         — Template-A per client type
src/lib/onboarding/summit-client.ts               — getSummitEntity, extractDocUrls
src/lib/onboarding/twosign-client.ts              — 2Sign API client (full coverage)
src/app/api/onboarding/advance/route.ts           — Advance Summit status + sync cache
src/app/api/onboarding/sync/route.ts              — Cache writeback endpoint
src/app/api/onboarding/signing/route.ts           — 2Sign signing task CRUD
```

**New Sanity schema (bitan-website repo):** `onboardingRecord` — checklist state per client. Cross-repo deploy dependency.

### Key Gotchas Discovered
- **Sanity credentials on Railway**: `sanityConfig.apiToken` may be empty on Railway. Use env var fallback: `process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN || sanityConfig.apiToken`
- **Summit `Customers_Status: -1`** clears the status field (null/0 silently ignored)
- **Summit API paths**: `/crm/data/listentities/` NOT `/api/CRM/V1.0/ListEntities`. All lowercase under `/crm/data/`.
- **Cross-repo schema deploy**: `onboardingRecord` lives in bitan-website schemas. Must push bitan-website FIRST before OS can create these docs.
- **2Sign token TTL**: ~24 hours (not 1h as initially assumed). Cached for 23h.
- **2Sign file upload**: Uses multipart FormData, not JSON. Buffer→Uint8Array→Blob conversion needed for TypeScript.
- **2Sign Apiary docs are UNRELIABLE**: Real endpoint names, field names, auth format differ significantly. Always test via curl first.
- **2Sign signature placement**: `SignaturesConstValues` = drawable signature (red marker) but 3x3 grid only. `SignaturePositions` with x/y = form field (blue) not signature. Use invisible PDF markers (pdf-lib) + `SearchWordForMarkingSignature` for exact placement with drawable signature.
- **Summit `updateentity` format**: Must use `Entity: { ID: parseInt(id), Folder, Properties }`. NOT `EntityID + Fields`. Wrong format returns "יש להזין ערך בשדה Entity".
- **Record-Summit linking gap**: Modal creates onboardingRecord WITHOUT summitEntityId. Intake form writes summitEntityId to token only. Dashboard auto-links on load via PATCH `/api/onboarding/records`.
- **pdf-lib on Railway**: Must be in `experimental.serverComponentsExternalPackages` in next.config.js.
- **Hebrew quotes in JSX**: Wrap in `{'text with "quotes"'}` — ESLint `react/no-unescaped-entities` breaks Railway build.
- **Intake form re-save bug**: Re-submission without new files overwrites `submittedData.fileCount` with 0. Fixed in bitan-website PR #51.
- **Summit file update**: `entityId` must be `parseInt()`'d — string IDs silently fail the update. Error logging added.

## Session: April 14, 2026 — Shaam↔Summit Full Sync System

### 1. API-Mode Frontend (Phase 1)
- Dual-mode sync UI: API (auto, default) vs Manual (XLSX)
- Mode toggle with "מומלץ" badge, mapping cache indicator
- Progress stages with polling for long-running execution
- New proxy routes: execute-api, mapping/summary

### 2. Smarter Results (Phase 3)
- Insights banner with actionable Hebrew summary
- Inline changes table with old→new diff

### 3. Write-Back System (Phase 5) — BUILT, AWAITING REAL DATA TEST
- taxonomy.py, write_plan.py, write_executor.py, sync_engine extended
- 3 new API routes: write-plan, write-back/dry-run, write-back
- WriteLog DB model for audit trail
- Frontend: write plan viewer + dry-run/live approval UI
- 52 Python tests (23 new)
- Two-level writes: reports (update+create) + clients (פקיד שומה, סוג תיק)
- Awaits IDOM file from office PC for first real test

## Session: April 28-29, 2026 — Sumit Sync Multi-Sheet + Background Execution

### 1. Multi-Sheet IDOM Workbook Parser (NEW)
- `idom_workbook.py` — reads XLSX with multiple sheets (עצמאים, חברות, מנהלים, הצהרות הון)
- Auto-detects format: structured template (headers in row 3) vs freeform paste (positional mapping)
- Sheet→report type routing: עצמאים→annual, חברות→financial, מנהלים→unmapped (no Summit folder yet)
- Tested against Guy's actual IDOM file: 715 records parsed (361+223+131)
- IDOM template XLSX generated for Guy at `public/idom-template.xlsx` — structured headers, hints, instructions tab

### 2. Background Thread Execution (CRITICAL FIX)
- `execute-api` endpoint was synchronous — Railway killed it after ~60s HTTP timeout, leaving runs stuck at "processing" forever
- **Fix**: endpoint now spawns `threading.Thread(daemon=True)` with its own DB session, returns immediately
- Thread handles all Summit API calls, writes results to DB, sets status to completed/failed
- Error messages stored in `operator_notes` field for frontend display
- `PYTHONUNBUFFERED=1` in Dockerfile for Railway log visibility
- `[BG-SYNC]` stderr logging for thread lifecycle debugging

### 3. Frontend Rewrite — Sync New Run Page
- Removed manual mode toggle (API-only now)
- Removed report type selector (workbook handles routing by sheet)
- Drag-and-drop upload zone with file preview
- Template download link always visible (`/idom-template.xlsx`)
- Year dropdown (2022-2026, defaults to previous year)
- Mapping cache status chips
- Background mode: "הסנכרון פועל ברקע" + "עבור לדף ההרצה →" link
- 5s polling (was 10s) for faster failure detection
- Honest progress stages — no premature checkmarks
- Run detail title: "סנכרון IDOM — שנת מס {year}" (not report-type specific)

### 4. DB Auto-Migration on Startup
- `Base.metadata.create_all()` in FastAPI startup event
- Fixes missing `write_logs` table that crashed cascade deletes

### 5. Summit API Rate Limit Tuning
- Original: 50 calls/batch, 600ms delay, 65s cooldown → ~50 min cold run
- Attempted: 90/350ms/20s → 403 after 6 min (too aggressive)
- **Current**: 60 calls/batch, 500ms delay, 35s cooldown, 45s backoff → ~25 min estimated
- First successful cold run completed: IDOM parsed 361 records, Summit year filter issue caused 0 matches (see below)

### 6. Year Mismatch Discovery
- IDOM file titled "2025" (שנת שומה) but Summit reports tagged שנת מס "2024"
- First successful run: 361 IDOM ✓, 0 Summit (year 2025 filter found nothing)
- **Fix**: run with year 2024 to match Summit's data. Year dropdown must reflect שנת מס, not שנת שומה.
- Run with year 2024 + tuned rate limits in progress — pending first real match results

### Key Gotchas (New)
- **Summit rate limit**: Real threshold ~80-100 rapid calls. 90 calls/batch hits 403. 60 is safe.
- **Exponential backoff**: 45s → 90s → 180s → 360s. One backoff cycle adds ~11 min to a run.
- **Railway log buffer**: Limited — old logs rotate out. `[BG-SYNC]` stderr messages may disappear from `railway logs` after ~30 min.
- **Daemon threads on Railway**: Work fine. Thread survives HTTP response. Persists until Railway restarts the container.
- **Year semantics**: IDOM uses שנת שומה (2025 = reports FOR 2024). Summit uses שנת מס (2024). Off by one.
- **Guy's IDOM file**: No headers, no תאריך הגשה, no שנת שומה. Positional parsing works but sync can't determine filing status without הגשה.

### 7. Template V2 (SHAAM column order)
- Removed שנת שומה column (set in OS UI, not in file)
- Column order matches exact SHAAM שאילתא output: קוד שידור → תאריך ארכה → תאריך הגשה → מח → סוג תיק → פקיד שומה → שם → מספר תיק
- Guy can copy-paste directly from שאילתא output without rearranging
- Saved to `apps/os-hub/public/idom-template.xlsx` + Google Drive

### 8. Progress Logging in fetch_sumit_data
- `[SYNC]` stderr logs at every stage: fetching reports (50/572), year filter result, resolving clients (50/400), cache saved
- Deployed but not yet tested (no completed run since deploy)

### Status: No Successful Year-2024 Run Yet
- Multiple runs attempted. All either hit Railway timeout (pre-background-thread), Summit 403 (aggressive rate limits), or zombie'd from mid-run deploys.
- Background thread architecture PROVEN working (thread starts, DB session works, error handling works).
- Rate limits TUNED to 60 calls/batch, 500ms delay, 35s cooldown — should be safe from 403.
- Cold cache run estimated at ~25 min. No run has completed the full cycle yet.
- **Zombie cause**: Railway redeploying (from our code pushes) kills the running container mid-sync. Background thread dies with it. Run stays "processing" forever.
- **Fix for next session**: stop pushing code during a run. Or: implement run recovery (detect stale "processing" runs on startup and mark as failed).

### Open / Next
1. **First priority**: Complete a year-2024 sync run WITHOUT deploying during it. Let it cook uninterrupted.
2. **Guy needs**: proper IDOM export using template V2 — with תאריך הגשה column. Message drafted, template on Google Drive.
3. **מנהלים**: needs Summit folder ID + config to sync
4. **Run recovery**: on startup, detect runs stuck at "processing" for >1 hour and mark as failed
5. **Cache warm-up**: consider pre-warming via `/mapping/refresh` before sync to decouple cold start
6. **Ops dashboard vision**: once sync works, build the internal dashboard for Avi/Ron (see memory: `bitan-operations-dashboard-vision.md`)
