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

<!-- TODO: Add future decisions below -->
