# Decision Log

Record of non-trivial decisions with context and rationale.

## Format

Each entry should include:
- **Date**
- **Decision**
- **Context**: why this came up
- **Options considered**
- **Outcome**: what we chose and why

---

## Decisions

### 2026-02-10 — Initialize repo structure

- **Context**: Need a shared operational repo for apps, docs, and prompts.
- **Options**: Monorepo vs. multi-repo.
- **Outcome**: Monorepo. Keeps everything discoverable and cross-app changes atomic.

### 2026-02-11 — Content Factory v0 data layer: Prisma + Postgres

- **Context**: Content Factory needs a relational data model for ideas, articles, platform-specific assets, approvals, publish jobs, artifacts, audit logs, and AI proposals. The existing sumit-sync service uses SQLAlchemy/Alembic (Python). The os-hub is Next.js/TypeScript.
- **Options**: (1) Extend SQLAlchemy models in sumit-sync, (2) Add Prisma to os-hub, (3) Standalone DB service.
- **Outcome**: Prisma in os-hub. Content Factory is a TypeScript/Next.js concern — Prisma is the natural ORM choice, provides type-safe client, migration tooling, and integrates with Next.js API routes and Server Components. Shares the same Railway Postgres instance. sumit-sync tables are untouched (separate Alembic migration history). User IDs stored as strings for now (no FK to a shared user table yet).

### 2026-03-03 — Batch 3: Regex-based HTML scraper instead of Cheerio

- **Context**: Content Factory needs to scrape gov.il publications and other server-rendered HTML pages. Cheerio is the standard Node.js HTML parser, but npm was unavailable in the deployment environment.
- **Options**: (1) Use Cheerio (requires npm install), (2) Use regex-based parsing like the existing RSS parser, (3) Use node-html-parser.
- **Outcome**: Regex-based parsing. Consistent with the RSS parser approach already in the codebase. Uses 3 strategies: __NEXT_DATA__ JSON extraction, result-item container parsing, and linked heading extraction. Works for gov.il, BTL, and generic HTML pages. Can be swapped for Cheerio later if parsing accuracy issues arise.

### 2026-03-03 — Batch 3: Platform-specific asset content editor

- **Context**: Asset contentPayload was always empty `{}`. Founders couldn't adapt article content per platform (email subject, social copy, hashtags). The pipeline was unusable for multi-platform distribution.
- **Options**: (1) Freeform JSON editor, (2) Structured fields per platform, (3) AI-generated platform adaptations.
- **Outcome**: Structured fields per platform with hints. Each platform (EMAIL, FACEBOOK, INSTAGRAM, LINKEDIN, WEBSITE) has specific fields with Hebrew labels and guidance text. PATCH endpoint added for saving. AI adaptation can be layered on top later.

### 2026-02-11 — PR-02: Content Factory v0 Workflow API

- **Context**: Data layer (Prisma schema + migrations) is deployed. Need API routes to enforce the factory loop: Article → Asset → Approval → Manual Publish, with deterministic state machines and audit trail.
- **Options**: (1) Single large API with business logic inline, (2) Separate state machine module + thin API routes, (3) Full CQRS/event-sourcing.
- **Outcome**: Option 2 — explicit transition maps in `src/lib/content-factory/transitions.ts`, thin Next.js API routes that delegate to transition validators. Distribution status recalculated transactionally on publish. EventLog written inside the same transaction as every state change. Tests use Node.js built-in `node:test` runner (no extra deps). Manual publish creates a SUCCEEDED PublishJob directly (no queue step for human-provided URLs).

### 2026-03-04 — Batch 4: Sources observability, data integrity, and onboarding

- **Context**: 15 sources seeded but only ~6 work. TheMarker/Calcalist entries were stale (created as RSS, seed changed to SCRAPE+inactive, but upsert matched by URL → old entries never updated). SCRAPE sources couldn't be polled from UI (button gated to RSS/API). Error display showed generic "שגיאה" with no detail. No poll history or health overview.
- **Options**: (1) Manual DB cleanup + incremental UI patches, (2) Full sources page rewrite with observability, (3) Separate monitoring dashboard.
- **Outcome**: Option 2 — full sources page rewrite with 5 changes:
  1. **Stale entry cleanup**: Seed endpoint Phase 2 matches by nameHe to deactivate DB entries that match inactive seed data but have different URLs (orphaned from URL-change).
  2. **SCRAPE poll button**: Enabled for all pollable types (RSS/API/SCRAPE), matching poll-dispatcher capabilities.
  3. **Card layout + health**: Replaced flat table with CSS Grid cards. Health status logic (inactive → never-polled → error → stale → healthy) with colored dots. Summary bar at top. Expandable error sections show full error text in monospace.
  4. **Add-source wizard**: 3-step inline wizard — paste URL → auto-detect type via new `/api/content-factory/sources/detect` endpoint → preview 3 sample items → fill name/category/weight → save. Reuses existing parsers.
  5. **Detail panel + poll history**: Expandable per-card detail shows full config + poll history from EventLog (SOURCE_POLLED events) + idea count. Zero new tables.

<!-- TODO: Add future decisions below -->
