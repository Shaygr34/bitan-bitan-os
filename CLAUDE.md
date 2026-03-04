# CLAUDE.md — Project Rules

## Core principles

1. **Web-first**: all tools, deployments, and workflows must work in the browser. No local-only toolchains.
2. **No secrets in code**: credentials go in environment variables or a secrets manager. Never commit `.env` files, API keys, or tokens.
3. **Small PRs**: one concern per pull request. If a PR description needs more than 3 bullet points, split it.
4. **Auditability**: every non-trivial decision gets an entry in `docs/01_decision_log.md` with date, context, and rationale.
5. **Role separation**: each app (`os-hub`, `sumit-sync`, `content-engine`) has a clear owner. Cross-cutting changes require review from both sides.
6. **Staging required**: all changes must pass a staging environment before merging to production. No YOLO deploys.

## Workflow

- Branch from `main`, open a PR, get review, merge.
- CI must pass before merge.
- Use conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`).

## Code style

- Follow the linter configuration in each app.
- Prefer explicit over clever.
- Write tests for new functionality.

## Design & Style Enforcement

- All UI must comply with `docs/DESIGN_LANGUAGE_SYSTEM.md` — use only defined tokens and components.
- All implementation must comply with `docs/STYLE_CONTRACT.md` — no hard-coded values, follow naming conventions.
- If unsure about a design or style decision, create an explicit `<!-- TODO: ... -->` with your assumption and flag it in the PR.
- No new UI without referencing tokens/components defined in the Design Language System.

---

## Content Factory — Current State (as of 2026-03-04)

### What is it

A content pipeline for ביתן את ביתן (CPA firm). Sources → Ideas → Articles → Platform Assets → Publish. All Hebrew-first UI in `apps/os-hub`.

### Architecture

- **Framework**: Next.js (App Router) in `apps/os-hub`
- **ORM**: Prisma + PostgreSQL (Railway)
- **AI**: Claude Sonnet for draft generation (`src/lib/content-factory/drafting.ts`)
- **CMS**: Sanity integration for website publishing (`src/lib/content-factory/publishers/sanity-publisher.ts`)
- **Language**: Hebrew-first UI (RTL), all strings via `src/lib/strings.ts`

### Data model (Prisma)

10 models: `Source`, `Idea`, `Article`, `Asset`, `PublishJob`, `Approval`, `Artifact`, `EventLog`, `AIProposal`, plus unnamed config model.

Key enums: `SourceType` (RSS/API/SCRAPE/MANUAL), `Platform` (EMAIL/WEBSITE/FACEBOOK/INSTAGRAM/LINKEDIN), `ArticleStatus` (DRAFT/IN_REVIEW/APPROVED/ARCHIVED), `DistributionStatus` (NOT_PUBLISHED/PARTIALLY_PUBLISHED/FULLY_PUBLISHED).

### Key files

| Area | Path |
|------|------|
| Prisma schema | `apps/os-hub/prisma/schema.prisma` |
| Poll dispatcher | `src/lib/content-factory/ingestion/poll-dispatcher.ts` |
| RSS parser | `src/lib/content-factory/ingestion/rss-parser.ts` |
| API fetcher (Globes ASMX, JSON) | `src/lib/content-factory/ingestion/api-fetcher.ts` |
| HTML scraper (gov.il, generic) | `src/lib/content-factory/ingestion/html-scraper.ts` |
| Dedup | `src/lib/content-factory/ingestion/dedup.ts` |
| Scoring (keyword-based) | `src/lib/content-factory/ingestion/scoring.ts` |
| Keywords | `src/lib/content-factory/ingestion/keywords.ts` |
| AI drafting | `src/lib/content-factory/drafting.ts` |
| State machine | `src/lib/content-factory/transitions.ts` |
| Distribution calc | `src/lib/content-factory/distribution.ts` |
| Sanity publisher | `src/lib/content-factory/publishers/sanity-publisher.ts` |
| Seed sources | `src/lib/content-factory/sources/seed-data.ts` |
| Validation helpers | `src/lib/content-factory/validate.ts` |
| Event logging | `src/lib/content-factory/event-log.ts` |
| Hub dashboard | `src/app/content-factory/page.tsx` |
| Sources page | `src/app/content-factory/sources/page.tsx` |
| Ideas page | `src/app/content-factory/ideas/page.tsx` |
| Articles list | `src/app/content-factory/articles/page.tsx` |
| Article detail + editor | `src/app/content-factory/articles/[id]/page.tsx` |
| CSS module | `src/app/content-factory/articles/[id]/page.module.css` |
| Article API | `src/app/api/content-factory/articles/[id]/route.ts` |
| Asset API (GET/PATCH) | `src/app/api/content-factory/assets/[id]/route.ts` |
| Asset transition | `src/app/api/content-factory/assets/[id]/transition/route.ts` |
| Asset publish | `src/app/api/content-factory/assets/[id]/publish/route.ts` |
| Sanity publish | `src/app/api/content-factory/articles/[id]/publish-website/route.ts` |
| Source registry doc | `docs/content-factory-v1-source-registry.md` |

### Completed batches

**Batch 1 — Core pipeline** (PRs #83-84)
- Source registry with seed data (5 Globes RSS feeds)
- RSS polling, dedup (URL normalization + Hebrew stopword stripping), scoring
- AI draft generation (Claude Sonnet, Hebrew prompts, structured content blocks)
- Block editor (heading/paragraph/list/quote/callout/divider), inline title editing
- Ideas page with score threshold filter
- Content Factory hub dashboard with pipeline stats
- Hebrew translations throughout

**Batch 2 — Source management + reliability** (PR #85)
- Source inline editing (name, weight, category), custom creation form
- Hub dashboard enriched stats (drafts, errors, last poll)
- TheMarker/Calcalist marked as SCRAPE (not RSS — they block server requests)
- Cron endpoint fix for scoring + event logging
- 502/timeout fixes

**Batch 3 — Source expansion + publishing flow** (PR #86)
- HTML scraper: regex-based parser for gov.il (Tax Authority, Finance Ministry), BTL, Deloitte. Three strategies: `__NEXT_DATA__` JSON, result-item containers, linked headings.
- API fetcher: Globes ASMX XML (NewsItem/FeederNodeItem) + generic JSON.
- Poll dispatcher now routes API and SCRAPE (was RSS-only).
- Asset content editor: platform-specific structured fields (email subject/preheader/CTA, social post/hashtags, website SEO meta). PATCH endpoint for contentPayload.
- WEBSITE included in platform asset selector (was incorrectly hidden).
- Publish job retry button for failed jobs.
- Distribution status edge case fix.
- Activated gov.il, BTL, Deloitte, Finance Ministry seed sources. Added Globes ASMX API source.

### What still needs doing (Batch 4+)

**High priority:**
- **Test the new scrapers** against live gov.il/BTL/Deloitte pages — verify parsing works, tune regex if needed
- **Globes ASMX API** — verify Last20Articles endpoint returns data, adjust XML parsing
- **Cron job** — wire API + SCRAPE polling into the cron endpoint (`/api/content-factory/sources/poll-all`)
- **End-to-end flow test** — Source→Idea→Draft→Edit→Approve→Publish to Sanity
- **AI asset adaptation** — use Claude to auto-generate platform-specific copy from article body (email subject, social post text)

**Medium priority:**
- **Resend integration** for EMAIL publishing (requires Resend API key)
- **Buffer/Meta integration** for FACEBOOK/INSTAGRAM publishing
- **Approval workflow** — role-based (owner→IN_REVIEW, reviewer→APPROVED), currently anyone can transition
- **AIProposal audit UI** — view AI generation metadata (model, tokens, cost)
- **Playwright scrapers** for Calcalist, TheMarker (currently blocked — marked inactive)

**Low priority:**
- Artifact model (PDF/DOCX export) — defined in schema, not used
- Knesset OData, Bank of Israel, ISA, ICPA sources
- Multi-user auth + role management

### Environment notes

- npm install is often blocked in web sessions (registry 403). Work without installing new packages — use regex/native solutions.
- `node_modules` may not exist — TypeScript type checking will show missing module errors for react/next/prisma, which is expected. The app builds fine in the Railway deployment.
- All paths in this file are relative to `apps/os-hub/` unless they start with `docs/`.
