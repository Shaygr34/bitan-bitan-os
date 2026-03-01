-- Add missing SourceType enum, sources table, and schema drift from v0 merge
-- Migration: 20260301000000_add_sources_and_schema_drift

-- ---------------------------------------------------------------------------
-- 1) SourceType enum (missing from initial migration)
-- ---------------------------------------------------------------------------
CREATE TYPE "SourceType" AS ENUM ('RSS', 'API', 'SCRAPE', 'MANUAL');

-- ---------------------------------------------------------------------------
-- 2) Add missing IdeaStatus enum values (SELECTED, REJECTED)
-- ---------------------------------------------------------------------------
ALTER TYPE "IdeaStatus" ADD VALUE IF NOT EXISTS 'SELECTED';
ALTER TYPE "IdeaStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- ---------------------------------------------------------------------------
-- 3) Create sources table
-- ---------------------------------------------------------------------------
CREATE TABLE "sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "nameHe" TEXT,
    "type" "SourceType" NOT NULL DEFAULT 'RSS',
    "url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pollIntervalMin" INTEGER NOT NULL DEFAULT 60,
    "lastPolledAt" TIMESTAMP(3),
    "lastItemCount" INTEGER,
    "lastError" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sources_active_idx" ON "sources"("active");
CREATE INDEX "sources_type_idx" ON "sources"("type");

-- ---------------------------------------------------------------------------
-- 4) Add missing columns to ideas table
-- ---------------------------------------------------------------------------
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "priority" INTEGER;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "sourceId" UUID;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "fingerprint" TEXT;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "scoreBreakdown" JSONB;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "sourcePublishedAt" TIMESTAMP(3);

-- FK from ideas to sources
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Additional indexes on ideas
CREATE INDEX IF NOT EXISTS "ideas_fingerprint_idx" ON "ideas"("fingerprint");
CREATE INDEX IF NOT EXISTS "ideas_score_idx" ON "ideas"("score");
CREATE INDEX IF NOT EXISTS "ideas_sourceId_idx" ON "ideas"("sourceId");

-- ---------------------------------------------------------------------------
-- 5) Add missing columns to articles table
-- ---------------------------------------------------------------------------
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "subtitle" TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "seoTitle" TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "sanityId" TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "sanityUrl" TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "aiGenerated" BOOLEAN NOT NULL DEFAULT false;

-- Unique constraint on slug
ALTER TABLE "articles" ADD CONSTRAINT "articles_slug_key" UNIQUE ("slug");
