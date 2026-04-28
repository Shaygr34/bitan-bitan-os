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
src/app/api/content-factory/articles/[id]/generate-image/ — POST: Gemini Imagen 4 → Sanity CDN
src/app/api/content-factory/newsletter/       — POST: branded HTML newsletter from article
src/lib/content-factory/ref-extractor.ts      — PDF/DOCX text extraction (pdf-parse, mammoth)
src/lib/content-factory/draft-from-refs.ts    — Orchestrator: refs → Claude → Article
src/lib/content-factory/image-generator.ts    — Gemini image gen + Sanity upload
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
- **Known gaps**: tags still empty, image gen needs `GOOGLE_AI_API_KEY` on Railway, newsletter is copy-paste to Summit (no API send yet)
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

## Session: April 23-28, 2026 — Onboarding Workflow Elevation

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
src/app/onboarding/[entityId]/components/         — StageStepper, ClientInfoCard, DocumentsCard, ChecklistCard
src/lib/onboarding/types.ts                       — STAGE_LABELS, STAGE_COLORS, SUMMIT_STATUS_IDS
src/lib/onboarding/checklist-templates.ts         — Template-A per client type
src/lib/onboarding/summit-client.ts               — getSummitEntity, extractDocUrls
src/app/api/onboarding/advance/route.ts           — Advance Summit status
```

**New Sanity schema (bitan-website repo):** `onboardingRecord` — checklist state per client. Cross-repo deploy dependency.

### Known Issues (as of April 28, 2026)
These are real problems that need fixing in the NEXT session:

1. **% mismatch**: Dashboard shows checklist-only %, detail page shows checklist+docs %. Different formulas = different numbers for same client. Needs single source of truth.
2. **Hover expansion unreliable**: CSS `tbody:hover` works inconsistently. May need JS-based hover instead.
3. **Delete mechanism brittle**: Optimistic delete implemented but Sanity credentials may fail on Railway (env var fallback chain). Test after deploy.
4. **Duplicate records**: Auto-create on detail page visit can create duplicates if the dedup-by-summitEntityId check races. Dedup guard added to POST endpoint but untested under load.
5. **Legacy tokens at 0%**: Old intake tokens without onboardingRecords show 0% and "לא מאומת". Auto-create on detail page visit creates the record, but dashboard still shows the legacy token until page reload.
6. **Pipeline funnel counts**: Computed from client array (not Summit API). Stage 0 counted as stage 1. Works but doesn't reflect real Summit status for legacy tokens.
7. **Doc URLs from Summit הערות**: Parsed via regex from notes text. Fragile — depends on specific label format in Hebrew.
8. **CompletionDashboard (old tab)**: Still exists but unmaintained. Scan has perf issues (~2940 entities). On hold.

### Key Gotchas Discovered
- **Sanity credentials on Railway**: `sanityConfig.apiToken` may be empty on Railway. Use env var fallback: `process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN || sanityConfig.apiToken`
- **Summit `Customers_Status: -1`** clears the status field (null/0 silently ignored)
- **Summit API paths**: `/crm/data/listentities/` NOT `/api/CRM/V1.0/ListEntities`. All lowercase under `/crm/data/`.
- **Cross-repo schema deploy**: `onboardingRecord` lives in bitan-website schemas. Must push bitan-website FIRST before OS can create these docs.
- **Multiple `<tbody>` per table**: Valid HTML, used for CSS hover targeting per row group.

### 2Sign API Access (RECEIVED April 26, 2026)
- 2Sign added 50 extra test tasks to account `digital@bitan-finance.co.il`
- No extra charge for API usage (uses existing task package)
- Documentation: Postman collection + SDK at https://app.2sign.co.il/en/Support/ApiTicketSubmit/
- **Next**: Research API docs, plan signing workflow integration (Phase 5 of onboarding spec)

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
