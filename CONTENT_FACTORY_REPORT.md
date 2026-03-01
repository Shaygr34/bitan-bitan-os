# Content Factory — Status & Integration Report

> Generated: 2026-03-01 | Repo: `bitan-bitan-os` (main branch)
> Scope: everything in this repo related to Content Factory / content pipeline

---

## 1. Executive Summary

### What exists (implemented & deployed)

The Content Factory has a **solid data layer and workflow API** — but **no automated content pipeline** (no ingestion, no AI drafting, no Sanity push).

| Layer | Status | Maturity |
|-------|--------|----------|
| **Data model** (Prisma) | 8 models, 14 enums, deployed migration | Production |
| **Workflow API** (Next.js routes) | 9 endpoints, state machines, audit trail | Production |
| **Admin UI** (OS Hub pages) | Article list, detail, assets, transitions, manual publish | Production |
| **DOCX → PDF engine** (Python) | 6-stage pipeline, Chromium rendering, brand styling | Production |
| **Content Engine UI** | Upload DOCX, get branded PDF, download history | Production |
| **Tests** | State machine (31 cases), distribution logic (11 cases) | Passing |
| **Deployment** | Dockerfile, entrypoint, Railway, CI/CD | Production |

### What's missing (not found in repo)

| Component | Status |
|-----------|--------|
| Source registry (RSS feeds, scrape targets) | **Not found** |
| Ingestion service (RSS/scrape/API polling) | **Not found** |
| De-duplication / clustering of ideas | **Not found** |
| Scoring / prioritization of ideas | **Not found** |
| AI-powered drafting (article generation) | **Not found** |
| Sanity CMS integration (read/write) | **Link-out only** (no schema, no API client) |
| Automated publish to Sanity / platforms | **Not found** |
| Cron / queue / job scheduler | **Not found** |
| Cost controls / LLM budget tracking | **Not found** |
| Observability beyond EventLog | **Not found** |
| AI prompts (content) | **Stubs only** (TODOs in `prompts/*.md`) |

### What's risky

1. **Ideas model is orphaned** — `Idea` table exists in schema (with `RSS`, `SCRAPE`, `TREND` source types) but **zero API routes or UI** create or list Ideas. Articles have an optional `ideaId` FK but nothing populates it.
2. **AIProposal model is orphaned** — schema supports `SUGGEST`, `REWRITE_SELECTION`, `GENERATE_VARIANTS` primitives but **zero code** uses this table.
3. **PublishMethod enums anticipate integrations that don't exist** — `ZAPIER_BUFFER`, `RESEND`, `WEBSITE_DIRECT` are defined but only `MANUAL` is used anywhere.
4. **No Sanity client** — The website uses Sanity Studio, but os-hub has zero Sanity SDK code. Publishing to the website is completely manual (copy-paste URL).
5. **`apps/content-engine/`** is a dead scaffold — contains only a README stub. All real engine code lives under `engines/content-engine/`.

---

## 2. Repo Inventory

### 2.1 Data Models / Database

| File | Contents |
|------|----------|
| `apps/os-hub/prisma/schema.prisma` | **8 models**: Idea, Article, Asset, Approval, PublishJob, Artifact, EventLog, AIProposal. **14 enums** including IdeaSourceType (MANUAL/RSS/SCRAPE/TREND), Platform (EMAIL/WEBSITE/FACEBOOK/INSTAGRAM/LINKEDIN), PublishMethod (MANUAL/ZAPIER_BUFFER/RESEND/WEBSITE_DIRECT) |
| `apps/os-hub/prisma/migrations/20260211000000_content_factory_v0/migration.sql` | Full DDL: 8 tables, 14 enum types, all indices and FKs. Deployed. |

### 2.2 Workflow Logic (Content Factory)

| File | Key exports | Status |
|------|-------------|--------|
| `src/lib/content-factory/transitions.ts` | `ARTICLE_TRANSITIONS`, `ASSET_TRANSITIONS`, `PUBLISH_JOB_TRANSITIONS`, `validateArticleTransition()`, `validateAssetTransition()`, `validatePublishJobTransition()` | Implemented |
| `src/lib/content-factory/distribution.ts` | `updateDistributionStatus(prisma, articleId)` — recalculates NOT_PUBLISHED / PARTIALLY / FULLY | Implemented |
| `src/lib/content-factory/event-log.ts` | `logEvent(prisma, params)` — audit trail, used within transactions | Implemented |
| `src/lib/content-factory/validate.ts` | `isValidUuid()`, `parseBody()`, `requireString()`, `requirePositiveInt()`, `isValidUrl()`, `errorJson()` | Implemented |

### 2.3 API Routes (Content Factory)

| Route | Method | Function | Status |
|-------|--------|----------|--------|
| `/api/content-factory/articles` | POST | Create article | Implemented |
| `/api/content-factory/articles` | GET | List articles (50 limit) | Implemented |
| `/api/content-factory/articles/[id]` | GET | Get article with assets | Implemented |
| `/api/content-factory/articles/[id]` | DELETE | Cascade delete (artifacts → jobs → assets → article) | Implemented |
| `/api/content-factory/articles/[id]/transition` | PATCH | State machine transition | Implemented |
| `/api/content-factory/articles/[id]/assets` | POST/GET | Create/list platform assets | Implemented |
| `/api/content-factory/assets/[id]` | GET | Get asset with publish jobs | Implemented |
| `/api/content-factory/assets/[id]/transition` | PATCH | Asset state machine transition | Implemented |
| `/api/content-factory/assets/[id]/publish` | POST | Manual publish (creates SUCCEEDED job) | Implemented |
| `/api/content-factory/approvals` | POST | Approve/reject Article or Asset | Implemented |
| `/api/content-factory/publish-jobs/[id]/status` | PATCH | Update job status | Implemented |

### 2.4 Admin UI (Content Factory)

| File | Function | Status |
|------|----------|--------|
| `src/app/content-factory/page.tsx` | Article list with filtering/search, create article, delete | Implemented |
| `src/app/content-factory/articles/[id]/page.tsx` | Article detail, status transitions, create assets, approve, manual publish | Implemented |

### 2.5 Content Engine (DOCX → PDF)

| File | Function | Status |
|------|----------|--------|
| `engines/content-engine/engine.py` | 6-stage pipeline: Ingest → Parse → Normalize → Template → Render → Validate | Implemented |
| `engines/content-engine/parser/docx_parser.py` | OOXML parsing → ContentBlock list (TITLE, HEADING, PARAGRAPH, BULLET, TABLE, CALLOUT) | Implemented |
| `engines/content-engine/parser/normalizer.py` | 8 normalization operations (strip empty, merge bullets, dedup headings, etc.) | Implemented |
| `engines/content-engine/renderer/html_builder.py` | Jinja2 template → self-contained HTML (base64 images, inline fonts) | Implemented |
| `engines/content-engine/renderer/pdf_renderer.py` | Chromium headless print-to-pdf, WeasyPrint fallback | Implemented |
| `engines/content-engine/brand_config.py` | Centralized brand tokens (colors, fonts, spacing, asset paths) | Implemented |
| `engines/content-engine/templates/document.html.j2` | RTL Hebrew template with brand styling | Implemented |
| `src/lib/content-engine/runner.ts` | JS→Python bridge via `execFile`, timeout 30s, structured logging | Implemented |
| `src/lib/content-engine/history.ts` | File-based conversion history (save/list/get/download/delete) | Implemented |
| `src/app/api/content-engine/upload/route.ts` | Multipart upload → PDF response | Implemented |
| `src/app/api/content-engine/history/route.ts` | List conversion history | Implemented |
| `src/app/api/content-engine/history/[id]/download/route.ts` | Download generated PDF | Implemented |

### 2.6 Headline / News Ingestion / RSS

**Not found.** The `IdeaSourceType` enum has `RSS`, `SCRAPE`, `TREND` values, but no code anywhere creates Ideas from external sources. No RSS parser, no scraper, no trending-topic detector.

### 2.7 AI Agent Orchestration / Cron / Queue / Jobs

**Not found.** No cron, no queue (Bull, BullMQ, etc.), no job scheduler, no background workers. The `PublishJob` model has `schedulerJobId` field (anticipating a future queue) but nothing populates it. No `cron.ts`, no `worker.ts`, no scheduled task configuration.

### 2.8 Content Generation Prompts / Templates

| File | Status |
|------|--------|
| `prompts/claude_opus_master.md` | **Stub** — TODO placeholders for role, context, rules, output format |
| `prompts/content_engine.md` | **Stub** — TODO placeholders for role, content types, tone, examples |
| `prompts/sumit_sync.md` | **Stub** — TODO placeholders |
| `prompts/content-engine/.gitkeep` | Empty directory placeholder |

**No usable AI prompts exist.** All files are scaffolds with `<!-- TODO -->` markers.

### 2.9 Sanity Integration

**Link-out only.** The Founder Console (`/bitan-website`) links to Sanity Studio at `https://bitan-bitan-website-production.up.railway.app/studio`, but:
- No `@sanity/client` dependency
- No Sanity project ID / dataset configuration
- No Sanity schema definitions in this repo
- No GROQ queries
- No write operations to Sanity

The Sanity Studio and schemas live in the **separate** `bitan-bitan-website` repo.

### 2.10 Tests

| File | Scope | Cases |
|------|-------|-------|
| `apps/os-hub/tests/transitions.test.ts` | State machine validation (Article, Asset, PublishJob) | 31+ |
| `apps/os-hub/tests/distribution.test.ts` | Distribution status calculation | 11 |
| `engines/content-engine/tests/fixtures/` | DOCX inputs and expected PDF outputs | Fixtures only (no automated runner) |

---

## 3. Current Pipeline Diagram

What happens end-to-end **today** (manual, human-driven):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        CONTENT FACTORY — CURRENT STATE                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐  │
│  │ HUMAN   │────▶│ Create       │────▶│ Content      │────▶│ Branded PDF │  │
│  │ uploads │     │ Article      │     │ Engine       │     │ (download)  │  │
│  │ DOCX    │     │ (API/UI)     │     │ DOCX → PDF   │     │             │  │
│  └─────────┘     └──────────────┘     └──────────────┘     └─────────────┘  │
│                         │                                                    │
│                         ▼                                                    │
│                  ┌──────────────┐     ┌──────────────┐     ┌─────────────┐  │
│                  │ Create Asset │────▶│ Submit for   │────▶│ Approve /   │  │
│                  │ (platform-   │     │ Review       │     │ Reject      │  │
│                  │  specific)   │     │ (IN_REVIEW)  │     │ (Approval)  │  │
│                  └──────────────┘     └──────────────┘     └──────────────┘ │
│                                                                   │         │
│                                                                   ▼         │
│                                                            ┌─────────────┐  │
│                                                            │ Manual      │  │
│                                                            │ Publish     │  │
│                                                            │ (paste URL) │  │
│                                                            └─────────────┘  │
│                                                                              │
│  ╔══════════════════════════════════════════════════════════════════════════╗ │
│  ║  NOT connected: Source registry, Ingestion, AI drafting, Sanity push   ║ │
│  ╚══════════════════════════════════════════════════════════════════════════╝ │
└──────────────────────────────────────────────────────────────────────────────┘
```

**What actually flows today:**

1. Human uploads a DOCX via Content Engine UI → gets branded PDF
2. Human creates an Article via Content Factory UI (title + bodyBlocks JSON)
3. Human creates platform-specific Assets
4. Human submits for review → human approves/rejects
5. Human manually publishes (pastes the external URL where they copied content)
6. Distribution status auto-recalculates

**What does NOT flow today:**

- No content enters the system automatically (no RSS, no scraping)
- No AI generates or rewrites anything
- No content is pushed to Sanity, email platforms, or social media
- No scheduling, no queues, no background jobs

---

## 4. Intended Pipeline Hooks

Where the automated content pipeline **should** plug into existing infra:

```
  SOURCES                    OS HUB (Next.js)                    TARGETS
  ─────────                  ────────────────                    ───────
  RSS feeds ─┐               ┌──────────────┐
  Scrapers  ─┼──▶ Ingestion ─▶│ Idea (DB)    │
  Manual    ─┘    Service     │ status: NEW  │
                              └──────┬───────┘
                                     │
                              ┌──────▼───────┐
                              │ Scoring /    │ (rank by relevance,
                              │ De-dup       │  drop duplicates)
                              └──────┬───────┘
                                     │
                              ┌──────▼───────┐
                              │ AI Drafting  │◀── prompts/*.md
                              │ (Claude API) │    brand_config.py
                              └──────┬───────┘
                                     │
                              ┌──────▼───────┐
                              │ Article (DB) │
                              │ status: DRAFT│
                              └──────┬───────┘
                                     │
                              ┌──────▼───────┐
                              │ Human Review │◀── OS Hub UI
                              │ (APPROVED)   │    (existing)
                              └──────┬───────┘
                                     │
                              ┌──────▼───────┐
                      ┌───────│ Asset gen    │──────────┐
                      │       │ (per platform)│         │
                      ▼       └──────────────┘         ▼
               ┌────────────┐                  ┌────────────┐
               │ Sanity CMS │                  │ Email /    │
               │ (website)  │                  │ Social     │
               └────────────┘                  └────────────┘
                      │
               ┌──────▼───────┐
               │ PublishJob   │ (DB — already modeled)
               │ status track │
               └──────────────┘
```

**Hook points in existing code:**

| Hook | Existing code | What's needed |
|------|---------------|---------------|
| **Idea creation** | `Idea` model in Prisma, `ideaId` FK on Article | API route `POST /api/content-factory/ideas`, ingestion service |
| **AI drafting** | `AIProposal` model in Prisma | Claude API client, prompt templates, `POST /api/content-factory/ideas/[id]/draft` |
| **Asset generation** | `Asset` model + `POST /articles/[id]/assets` route | AI-powered platform adaptation (rewrite for email/social) |
| **Sanity publish** | `PublishMethod.WEBSITE_DIRECT` enum | `@sanity/client`, GROQ queries, article → Sanity document mapper |
| **Email publish** | `PublishMethod.RESEND` enum | Resend SDK, email template renderer |
| **Social publish** | `PublishMethod.ZAPIER_BUFFER` enum | Buffer/Zapier webhook integration |
| **Queue** | `PublishJob.schedulerJobId` field | BullMQ or similar, worker process |

---

## 5. Gaps List (Ranked by Priority for v0 End-to-End)

| # | Gap | Severity | Complexity | Notes |
|---|-----|----------|------------|-------|
| **1** | **Source registry** | Critical | Low | No model for RSS feed URLs / scrape targets. `Idea` table exists but nothing populates it. Need: `Source` table + CRUD API + admin UI. |
| **2** | **Ingestion (RSS/scrape)** | Critical | Medium | No ingestion code. Need: RSS parser (e.g. `rss-parser`), optional scraper, polling cron. Must create `Idea` records with `sourceType=RSS`. |
| **3** | **De-dup / clustering** | High | Medium | No de-duplication. Need: title/URL similarity check before creating Ideas. Simple approach: exact URL match + fuzzy title (Levenshtein or embedding). |
| **4** | **Scoring / prioritization** | High | Low | No scoring. Need: relevance scoring on Ideas (keyword match, recency, source priority). Simple ranking field on `Idea` + sort. |
| **5** | **AI drafting** | Critical | High | No AI integration. Need: Claude API client, prompt engineering, Idea → Article draft generation. `AIProposal` model exists but is unused. |
| **6** | **Human approval** | Done | — | Fully implemented. Article + Asset approval flow with state machines and audit trail. |
| **7** | **Publish / push to Sanity** | Critical | Medium | No Sanity client. Need: `@sanity/client`, project config, document schema mapping, `WEBSITE_DIRECT` publish method implementation. |
| **8** | **Observability + cost controls** | Medium | Low | Only `EventLog` exists (good start). Need: LLM token usage tracking, cost per article, pipeline run metrics, error alerting. |
| **9** | **Cron / job scheduler** | High | Medium | No background jobs. Need: cron for RSS polling, queue for publish jobs. Options: Node cron in Next.js (simple), BullMQ + Redis (robust). |
| **10** | **Ideas API + UI** | High | Low | `Idea` model exists but has zero routes and zero UI. Need: CRUD API, list/detail pages in OS Hub. |
| **11** | **AI prompts (real content)** | High | Medium | All prompt files are stubs. Need: actual system prompts for article drafting, rewriting, platform adaptation. |
| **12** | **Email / social publish** | Low (v1) | Medium | `RESEND` and `ZAPIER_BUFFER` methods defined but not implemented. Out of scope for v0 but schema-ready. |

---

## 6. Concrete Implementation Plan (PR-Sized Tasks)

### PR-1: Source Registry — Model + API + UI

**Goal:** Allow founders to register RSS feeds and scrape targets that the system should monitor.

**Files to create/modify:**
- `prisma/schema.prisma` — add `Source` model (url, type, name, active, lastPolledAt, pollIntervalMinutes)
- `prisma/migrations/` — new migration
- `src/app/api/content-factory/sources/route.ts` — CRUD (POST/GET)
- `src/app/api/content-factory/sources/[id]/route.ts` — GET/PATCH/DELETE
- `src/app/content-factory/sources/page.tsx` — admin UI (list + add form)
- `src/lib/strings/he.ts` — Hebrew strings for sources

**API contract:**
- `POST /api/content-factory/sources` → `{ url, type, name, pollIntervalMinutes }`
- `GET /api/content-factory/sources` → `Source[]`

**Acceptance criteria:**
- [ ] Can add/edit/delete RSS feed sources via UI
- [ ] Sources stored in DB with poll interval
- [ ] Migration runs cleanly on existing DB

---

### PR-2: Ideas CRUD — API + UI

**Goal:** Make the existing `Idea` model usable with API routes and an admin page.

**Files to create/modify:**
- `src/app/api/content-factory/ideas/route.ts` — POST/GET
- `src/app/api/content-factory/ideas/[id]/route.ts` — GET/PATCH/DELETE
- `src/app/content-factory/ideas/page.tsx` — list UI with status filter
- `src/lib/strings/he.ts` — Hebrew strings for ideas
- `src/components/SideNav.tsx` — add sub-nav or update Content Factory page

**API contract:**
- `POST /api/content-factory/ideas` → `{ title, sourceType, sourceUrl?, tags? }`
- `GET /api/content-factory/ideas?status=NEW` → `Idea[]`
- `PATCH /api/content-factory/ideas/[id]` → `{ status, tags }`

**Acceptance criteria:**
- [ ] Can create, list, filter, and archive Ideas via UI
- [ ] Ideas page accessible from Content Factory section
- [ ] EventLog written on Idea creation and status change

---

### PR-3: RSS Ingestion Service

**Goal:** Polling service that fetches RSS feeds from registered Sources and creates Ideas.

**Files to create/modify:**
- `src/lib/content-factory/ingestion/rss.ts` — RSS parser + Idea creator
- `src/app/api/content-factory/sources/[id]/poll/route.ts` — manual trigger
- `package.json` — add `rss-parser` dependency

**API contract:**
- `POST /api/content-factory/sources/[id]/poll` → `{ created: number, skipped: number, errors: string[] }`
- Internally: fetch RSS XML → parse entries → de-dup by URL → create Ideas

**Acceptance criteria:**
- [ ] Manual poll creates Ideas from RSS feed entries
- [ ] Duplicate URLs are skipped (exact match on `sourceUrl`)
- [ ] Each created Idea has `sourceType=RSS` and `sourceUrl` set
- [ ] EventLog entry per created Idea

---

### PR-4: De-dup + Scoring Logic

**Goal:** Prevent duplicate Ideas and rank them by relevance.

**Files to create/modify:**
- `prisma/schema.prisma` — add `score` (Float) and `fingerprint` (String) fields to Idea
- `src/lib/content-factory/ingestion/dedup.ts` — fingerprint generation (normalized title hash) + duplicate detection
- `src/lib/content-factory/ingestion/scoring.ts` — relevance scoring (keyword match, recency, source priority)

**Acceptance criteria:**
- [ ] Ingestion skips Ideas with matching fingerprint
- [ ] Each Idea gets a relevance score on creation
- [ ] Ideas list can be sorted by score
- [ ] Scoring logic is unit-tested

---

### PR-5: AI Prompts + Claude Client

**Goal:** Production-ready AI prompt templates and Claude API client wrapper.

**Files to create/modify:**
- `prompts/content_engine.md` — real system prompt (role, tone, format, Hebrew, tax/accounting domain)
- `prompts/article_draft.md` — new: Idea → Article draft prompt
- `prompts/platform_adapt.md` — new: Article → platform-specific Asset prompt
- `src/lib/ai/claude-client.ts` — Claude API wrapper (Anthropic SDK, token counting, cost tracking)
- `src/lib/ai/prompt-loader.ts` — load + interpolate prompt templates
- `package.json` — add `@anthropic-ai/sdk`
- `.env` docs — `ANTHROPIC_API_KEY`

**API contract:**
- `claudeClient.complete({ systemPrompt, userPrompt, maxTokens })` → `{ text, inputTokens, outputTokens, costUsd }`

**Acceptance criteria:**
- [ ] Claude client works with API key from env
- [ ] Prompt templates have real content (not TODOs)
- [ ] Token usage and cost are tracked per call
- [ ] Unit tests for prompt loading and interpolation

---

### PR-6: AI Drafting — Idea → Article

**Goal:** Generate article drafts from Ideas using Claude.

**Files to create/modify:**
- `src/app/api/content-factory/ideas/[id]/draft/route.ts` — POST: generate draft
- `src/lib/content-factory/drafting.ts` — orchestrator: load Idea → build prompt → call Claude → create Article
- `src/app/content-factory/ideas/page.tsx` — add "Generate Draft" button per Idea

**API contract:**
- `POST /api/content-factory/ideas/[id]/draft` → `{ articleId, tokensUsed, costUsd }`
- Creates Article with `status=DRAFT`, links to Idea via `ideaId`
- Creates AIProposal record with input/output

**Acceptance criteria:**
- [ ] "Generate Draft" button on Ideas page creates an Article
- [ ] Article body is Claude-generated, Hebrew, on-brand
- [ ] AIProposal record created for audit
- [ ] Idea status transitions to `QUEUED_FOR_DRAFT` then `ENRICHED`
- [ ] Cost tracked in AIProposal metadata

---

### PR-7: Sanity Client + Schema Mapping

**Goal:** Integrate with Sanity CMS to push approved articles to the Bitan website.

**Files to create/modify:**
- `package.json` — add `@sanity/client`
- `src/config/integrations.ts` — add `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_TOKEN` env vars
- `src/lib/sanity/client.ts` — Sanity client singleton
- `src/lib/sanity/mappers.ts` — Article → Sanity document mapper
- `src/lib/sanity/schemas.ts` — TypeScript types matching Sanity schema (from website repo)

**API contract:**
- `sanityClient.createDraft(doc)` → `{ _id, _rev }`
- `sanityClient.publish(docId)` → `{ _id }`
- `mapArticleToSanityDoc(article)` → Sanity document object

**Acceptance criteria:**
- [ ] Can create Sanity draft from Article
- [ ] Document structure matches website Sanity schema
- [ ] Credentials from env vars (never committed)
- [ ] Mapper is unit-tested

---

### PR-8: Automated Publish to Sanity

**Goal:** Wire the "publish" flow to push content to Sanity instead of manual URL paste.

**Files to create/modify:**
- `src/app/api/content-factory/assets/[id]/publish/route.ts` — extend to support `method=WEBSITE_DIRECT`
- `src/lib/content-factory/publishers/sanity-publisher.ts` — publisher implementation
- `src/app/content-factory/articles/[id]/page.tsx` — add "Publish to Website" button (distinct from manual)

**API contract:**
- `POST /api/content-factory/assets/[id]/publish` with `{ method: "WEBSITE_DIRECT", createdByUserId }` → creates PublishJob, pushes to Sanity, stores `externalUrl` from Sanity response

**Acceptance criteria:**
- [ ] "Publish to Website" creates Sanity document and sets PublishJob to SUCCEEDED
- [ ] On failure: PublishJob set to FAILED with error details
- [ ] Distribution status auto-recalculates
- [ ] EventLog captures Sanity document ID

---

### PR-9: Cron / Polling Scheduler

**Goal:** Automated RSS polling on a schedule.

**Files to create/modify:**
- `src/lib/content-factory/scheduler.ts` — lightweight cron using `node-cron` or Next.js API route with vercel-cron
- `src/app/api/cron/ingest/route.ts` — endpoint that polls all active Sources
- `package.json` — add `node-cron` (if not using external cron)
- Dockerfile / Railway config — cron trigger (Railway cron or external)

**API contract:**
- `GET /api/cron/ingest` (with secret header) → polls all active sources, returns summary
- Alternatively: Railway cron hits this endpoint every N minutes

**Acceptance criteria:**
- [ ] All active Sources polled on schedule
- [ ] New Ideas created from new RSS entries
- [ ] De-dup prevents duplicates across polls
- [ ] Endpoint protected by secret (not public)
- [ ] Logs and EventLog entries for each poll run

---

### PR-10: Observability + Cost Dashboard

**Goal:** Visibility into pipeline health, AI costs, and content throughput.

**Files to create/modify:**
- `prisma/schema.prisma` — add `AIUsageLog` model (or extend EventLog metadata)
- `src/app/api/content-factory/stats/route.ts` — aggregate statistics
- `src/app/content-factory/stats/page.tsx` — dashboard page
- `src/lib/strings/he.ts` — Hebrew strings

**Metrics to surface:**
- Ideas created (by source, by day)
- Articles drafted (AI vs manual)
- Approval cycle time (submitted → approved)
- Publish success rate
- AI token usage + cost (daily/weekly/monthly)

**Acceptance criteria:**
- [ ] Stats page shows key metrics
- [ ] AI cost tracking visible to founders
- [ ] No raw API keys or sensitive data exposed

---

### PR-11: Platform Asset Generation (AI)

**Goal:** AI-powered adaptation of articles for different platforms (email, social).

**Files to create/modify:**
- `src/app/api/content-factory/articles/[id]/generate-assets/route.ts` — POST: generate platform assets
- `src/lib/content-factory/asset-generator.ts` — Claude-powered platform adaptation
- `prompts/platform_adapt.md` — platform-specific prompt variants

**Acceptance criteria:**
- [ ] Can generate EMAIL, FACEBOOK, LINKEDIN assets from an approved Article
- [ ] Each asset has platform-appropriate format and length
- [ ] AIProposal records created for each generation

---

### PR-12: Email Publish (Resend Integration)

**Goal:** Automated email sending via Resend for EMAIL platform assets.

**Files to create/modify:**
- `package.json` — add `resend`
- `src/config/integrations.ts` — `RESEND_API_KEY` env var
- `src/lib/content-factory/publishers/email-publisher.ts` — Resend integration
- `src/app/api/content-factory/assets/[id]/publish/route.ts` — extend for `method=RESEND`

**Acceptance criteria:**
- [ ] Approved EMAIL assets can be sent via Resend
- [ ] PublishJob tracks delivery status
- [ ] Recipient list configurable

---

## 7. Run Instructions

### Local Development (OS Hub)

```bash
# 1. Clone and install
git clone https://github.com/Shaygr34/bitan-bitan-os.git
cd bitan-bitan-os/apps/os-hub
pnpm install   # or npm install

# 2. Set up environment
cp .env.example .env   # (does not exist yet — create manually)
# Required env vars:
#   DATABASE_URL=postgresql://user:pass@localhost:5432/bitan_os
#   SUMIT_SYNC_API_URL=http://localhost:8000   (if running sumit-sync locally)

# 3. Run database migrations
npx prisma migrate dev

# 4. Start dev server
npm run dev
# → http://localhost:3000

# 5. Access Content Factory
# → http://localhost:3000/content-factory
```

### Running Tests

```bash
cd apps/os-hub

# State machine + distribution tests (no DB required)
npm test
# → runs: node --experimental-strip-types --test tests/**/*.test.ts
```

### Content Engine (DOCX → PDF)

```bash
cd engines/content-engine

# Install fonts (first time)
bash download_fonts.sh

# Run pipeline
python3 engine.py tests/fixtures/Input_DOC_Leasing_Car.docx output.pdf --debug

# Requires: Python 3, Jinja2, Chromium (for PDF rendering)
```

### Mocking for Development

- **No database:** Content Factory API routes will return 500s. Use `npx prisma studio` for a DB GUI.
- **No Sumit Sync:** The Settings page health check will show "error" — harmless.
- **No Chromium:** Content Engine will fall back to WeasyPrint for PDF rendering.
- **No external services:** All Quick Action links on Bitan Website page still work (they just open external URLs).

### Environment Variables Reference

| Variable | Used by | Required? |
|----------|---------|-----------|
| `DATABASE_URL` | Prisma (os-hub) | Yes |
| `PORT` | Next.js server | No (default 3000) |
| `SUMIT_SYNC_API_URL` | Sumit Sync proxy | Yes (if using sumit-sync) |
| `CONTENT_ENGINE_DIR` | DOCX→PDF runner | No (auto-detected) |
| `CE_HISTORY_DIR` | Conversion history | No (default /tmp) |
| `NEXT_PUBLIC_BITAN_WEBSITE_URL` | Founder console | No (has default) |
| `NEXT_PUBLIC_BITAN_STUDIO_URL` | Founder console | No (has default) |
| `NEXT_PUBLIC_BITAN_GA4_URL` | Founder console | No (has default) |
| `BITAN_WEBSITE_HEALTH_URL` | Health check proxy | No (has default) |
| `ANTHROPIC_API_KEY` | AI drafting (future) | Not yet |
| `SANITY_PROJECT_ID` | Sanity publish (future) | Not yet |
| `SANITY_DATASET` | Sanity publish (future) | Not yet |
| `SANITY_API_TOKEN` | Sanity publish (future) | Not yet |
| `RESEND_API_KEY` | Email publish (future) | Not yet |

---

## Appendix: Key File Paths (Quick Reference)

```
apps/os-hub/
├── prisma/
│   └── schema.prisma                              # 8 models, 14 enums
├── src/
│   ├── app/
│   │   ├── api/content-factory/
│   │   │   ├── articles/route.ts                   # POST/GET articles
│   │   │   ├── articles/[id]/route.ts              # GET/DELETE article
│   │   │   ├── articles/[id]/transition/route.ts   # PATCH state machine
│   │   │   ├── articles/[id]/assets/route.ts       # POST/GET assets
│   │   │   ├── assets/[id]/route.ts                # GET asset
│   │   │   ├── assets/[id]/transition/route.ts     # PATCH state machine
│   │   │   ├── assets/[id]/publish/route.ts        # POST manual publish
│   │   │   ├── approvals/route.ts                  # POST approve/reject
│   │   │   └── publish-jobs/[id]/status/route.ts   # PATCH job status
│   │   ├── content-factory/
│   │   │   ├── page.tsx                            # Article list UI
│   │   │   └── articles/[id]/page.tsx              # Article detail UI
│   │   └── api/content-engine/
│   │       ├── upload/route.ts                     # DOCX → PDF
│   │       └── history/route.ts                    # Conversion history
│   ├── lib/content-factory/
│   │   ├── transitions.ts                          # State machines
│   │   ├── distribution.ts                         # Distribution status
│   │   ├── event-log.ts                            # Audit trail
│   │   └── validate.ts                             # Input validation
│   ├── lib/content-engine/
│   │   ├── runner.ts                               # JS→Python bridge
│   │   └── history.ts                              # File-based history
│   └── config/integrations.ts                      # External URLs
├── tests/
│   ├── transitions.test.ts                         # 31+ test cases
│   └── distribution.test.ts                        # 11 test cases
└── Dockerfile                                      # Multi-stage build

engines/content-engine/
├── engine.py                                       # 6-stage pipeline
├── brand_config.py                                 # Brand tokens
├── parser/
│   ├── docx_parser.py                              # OOXML → ContentBlock
│   └── normalizer.py                               # 8 normalization ops
├── renderer/
│   ├── html_builder.py                             # Jinja2 → HTML
│   └── pdf_renderer.py                             # Chromium → PDF
└── templates/document.html.j2                      # RTL Hebrew template

prompts/
├── claude_opus_master.md                           # STUB
├── content_engine.md                               # STUB
└── sumit_sync.md                                   # STUB
```
