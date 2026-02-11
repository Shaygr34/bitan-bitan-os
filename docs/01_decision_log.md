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

### 2026-02-11 — PR-02: Content Factory v0 Workflow API

- **Context**: Data layer (Prisma schema + migrations) is deployed. Need API routes to enforce the factory loop: Article → Asset → Approval → Manual Publish, with deterministic state machines and audit trail.
- **Options**: (1) Single large API with business logic inline, (2) Separate state machine module + thin API routes, (3) Full CQRS/event-sourcing.
- **Outcome**: Option 2 — explicit transition maps in `src/lib/content-factory/transitions.ts`, thin Next.js API routes that delegate to transition validators. Distribution status recalculated transactionally on publish. EventLog written inside the same transaction as every state change. Tests use Node.js built-in `node:test` runner (no extra deps). Manual publish creates a SUCCEEDED PublishJob directly (no queue step for human-provided URLs).

<!-- TODO: Add future decisions below -->
