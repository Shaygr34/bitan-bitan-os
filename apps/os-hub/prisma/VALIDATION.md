# Content Factory v0 Data Layer — How to Validate

## Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL 14+ (local or Docker)

## Quick Start

```bash
# 1. Install dependencies (from repo root)
pnpm install

# 2. Set DATABASE_URL (adjust for your local Postgres)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bitan_os_dev"

# 3. Generate Prisma Client
cd apps/os-hub
npx prisma generate

# 4. Run migrations against your Postgres
npx prisma migrate deploy

# 5. Verify — open Prisma Studio to inspect tables
npx prisma studio
```

## Using Docker for Postgres (if no local install)

```bash
docker run --name bitan-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=bitan_os_dev -p 5432:5432 -d postgres:16-alpine
```

Then follow steps 2–5 above.

## Development Workflow

```bash
# Create a new migration after schema changes
pnpm --filter os-hub db:migrate:dev -- --name describe_your_change

# Apply migrations (production / staging)
pnpm --filter os-hub db:migrate:deploy

# Regenerate client after schema changes
pnpm --filter os-hub db:generate

# Open Prisma Studio (visual DB browser)
pnpm --filter os-hub db:studio
```

## What to Verify

1. **All 8 tables created**: `ideas`, `articles`, `assets`, `approvals`, `publish_jobs`, `artifacts`, `event_logs`, `ai_proposals`
2. **14 enum types created**: Check with `\dT+` in psql
3. **Indices exist**: Check with `\di` in psql
4. **Unique constraint on assets**: `(articleId, platform, version)`
5. **Foreign keys**: articles→ideas, assets→articles, publish_jobs→assets, artifacts→(assets, publish_jobs, articles)
6. **JSON columns use JSONB**: `bodyBlocks`, `seoMeta`, `contentPayload`, `platformMeta`, `providerReceipt`, `metadata`, `input`, `output`
7. **UUID primary keys**: All tables use `gen_random_uuid()`

## Verification Queries

```sql
-- List all Content Factory tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- List all enum types
SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname;

-- List all indices
SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;

-- Verify unique constraint on assets
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'assets'::regclass AND contype = 'u';

-- Verify foreign keys
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint WHERE contype = 'f' ORDER BY conrelid::regclass;
```

## Railway Deployment

- Railway injects `DATABASE_URL` automatically via the Postgres plugin.
- The Dockerfile runs `prisma migrate deploy` at container startup.
- No destructive operations — this migration only creates new tables and types.
- Existing sumit-sync tables (managed by Alembic) are untouched.

## Schema Notes

- **PDF is NOT a platform** — PDF is `ArtifactType.PDF` only.
- **Artifact ownership**: At least one of `assetId`, `publishJobId`, or `articleId` must be set (enforced at application level, not DB constraint).
- **User references**: All `*UserId` fields are `String` (not FK) for compatibility with existing auth. Will be formalized when user management is built.
- **bodyBlocks**: Canonical Blocks JSON from the DOCX pipeline. This is the source of truth for article content.
- **distributionStatus on Article**: Stored denormalized for query convenience; update logic comes in PR-02.
