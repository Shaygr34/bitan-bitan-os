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

<!-- TODO: Add future decisions below -->
