-- Full Content Factory schema — idempotent recreation
-- The v0 migration was recorded as applied with 0 steps executed,
-- so this migration creates everything from scratch.
-- Migration: 20260301000000_add_sources_and_schema_drift

-- ===========================================================================
-- 1) Enums (safe: catch duplicate_object if they already exist)
-- ===========================================================================

DO $$ BEGIN CREATE TYPE "IdeaSourceType" AS ENUM ('MANUAL', 'RSS', 'SCRAPE', 'TREND', 'OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "IdeaStatus"     AS ENUM ('NEW', 'ENRICHED', 'QUEUED_FOR_DRAFT', 'SELECTED', 'REJECTED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ArticleStatus"  AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "DistributionStatus" AS ENUM ('NOT_PUBLISHED', 'PARTIALLY_PUBLISHED', 'FULLY_PUBLISHED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "Platform"       AS ENUM ('EMAIL', 'WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'LINKEDIN'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AssetStatus"    AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ApprovalEntityType" AS ENUM ('ARTICLE', 'ASSET'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ApprovalDecision"   AS ENUM ('APPROVE', 'REJECT', 'REQUEST_CHANGES'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PublishMethod"  AS ENUM ('MANUAL', 'ZAPIER_BUFFER', 'RESEND', 'WEBSITE_DIRECT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PublishJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ArtifactType"   AS ENUM ('PDF', 'HTML', 'IMAGE', 'DOCX', 'JSON'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AIProposalEntityType" AS ENUM ('IDEA', 'ARTICLE', 'ASSET'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AIProposalPrimitive" AS ENUM ('SUGGEST', 'REWRITE_SELECTION', 'GENERATE_VARIANTS'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AIProposalStatus"    AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SourceType"     AS ENUM ('RSS', 'API', 'SCRAPE', 'MANUAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Safety: add enum values that might be missing if enum was created with v0 values only
ALTER TYPE "IdeaStatus" ADD VALUE IF NOT EXISTS 'SELECTED';
ALTER TYPE "IdeaStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- ===========================================================================
-- 2) Tables (IF NOT EXISTS — safe for partial previous runs)
-- ===========================================================================

-- sources (new in this migration)
CREATE TABLE IF NOT EXISTS "sources" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "name"            TEXT NOT NULL,
    "nameHe"          TEXT,
    "type"            "SourceType" NOT NULL DEFAULT 'RSS',
    "url"             TEXT NOT NULL,
    "active"          BOOLEAN NOT NULL DEFAULT true,
    "weight"          DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "category"        TEXT,
    "tags"            TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pollIntervalMin" INTEGER NOT NULL DEFAULT 60,
    "lastPolledAt"    TIMESTAMP(3),
    "lastItemCount"   INTEGER,
    "lastError"       TEXT,
    "notes"           TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- ideas (v0 columns + drift columns)
CREATE TABLE IF NOT EXISTS "ideas" (
    "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
    "title"             TEXT NOT NULL,
    "sourceType"        "IdeaSourceType" NOT NULL,
    "sourceUrl"         TEXT,
    "tags"              TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status"            "IdeaStatus" NOT NULL DEFAULT 'NEW',
    "createdByUserId"   TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    "description"       TEXT,
    "priority"          INTEGER,
    "sourceId"          UUID,
    "fingerprint"       TEXT,
    "score"             DOUBLE PRECISION,
    "scoreBreakdown"    JSONB,
    "sourcePublishedAt" TIMESTAMP(3),
    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- articles (v0 columns + drift columns)
CREATE TABLE IF NOT EXISTS "articles" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "ideaId"             UUID,
    "title"              TEXT NOT NULL,
    "bodyBlocks"         JSONB NOT NULL,
    "bodyText"           TEXT,
    "version"            INTEGER NOT NULL DEFAULT 1,
    "status"             "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "distributionStatus" "DistributionStatus" NOT NULL DEFAULT 'NOT_PUBLISHED',
    "seoMeta"            JSONB NOT NULL DEFAULT '{}',
    "createdByUserId"    TEXT NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    "subtitle"           TEXT,
    "tags"               TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category"           TEXT,
    "seoTitle"           TEXT,
    "seoDescription"     TEXT,
    "slug"               TEXT,
    "sanityId"           TEXT,
    "sanityUrl"          TEXT,
    "aiGenerated"        BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- assets
CREATE TABLE IF NOT EXISTS "assets" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "articleId"       UUID NOT NULL,
    "platform"        "Platform" NOT NULL,
    "version"         INTEGER NOT NULL DEFAULT 1,
    "contentPayload"  JSONB NOT NULL,
    "platformMeta"    JSONB NOT NULL DEFAULT '{}',
    "status"          "AssetStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- approvals
CREATE TABLE IF NOT EXISTS "approvals" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "entityType"       "ApprovalEntityType" NOT NULL,
    "entityId"         UUID NOT NULL,
    "entityVersion"    INTEGER NOT NULL,
    "decision"         "ApprovalDecision" NOT NULL,
    "comment"          TEXT,
    "approvedByUserId" TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- publish_jobs
CREATE TABLE IF NOT EXISTS "publish_jobs" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId"          UUID NOT NULL,
    "assetVersion"     INTEGER NOT NULL,
    "platform"         "Platform" NOT NULL,
    "method"           "PublishMethod" NOT NULL,
    "status"           "PublishJobStatus" NOT NULL DEFAULT 'QUEUED',
    "externalId"       TEXT,
    "externalUrl"      TEXT,
    "schedulerJobId"   TEXT,
    "providerReceipt"  JSONB NOT NULL DEFAULT '{}',
    "errorCode"        TEXT,
    "errorMessage"     TEXT,
    "createdByUserId"  TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "publish_jobs_pkey" PRIMARY KEY ("id")
);

-- artifacts
CREATE TABLE IF NOT EXISTS "artifacts" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "type"            "ArtifactType" NOT NULL,
    "storageKey"      TEXT NOT NULL,
    "mimeType"        TEXT NOT NULL,
    "sizeBytes"       BIGINT NOT NULL,
    "sha256"          TEXT,
    "assetId"         UUID,
    "assetVersion"    INTEGER,
    "publishJobId"    UUID,
    "articleId"       UUID,
    "createdByUserId" TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- event_logs
CREATE TABLE IF NOT EXISTS "event_logs" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" TEXT NOT NULL,
    "entityType"  TEXT NOT NULL,
    "entityId"    UUID NOT NULL,
    "action"      TEXT NOT NULL,
    "metadata"    JSONB NOT NULL DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- ai_proposals
CREATE TABLE IF NOT EXISTS "ai_proposals" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "entityType"       "AIProposalEntityType" NOT NULL,
    "entityId"         UUID NOT NULL,
    "entityVersion"    INTEGER,
    "primitive"        "AIProposalPrimitive" NOT NULL,
    "input"            JSONB NOT NULL,
    "output"           JSONB NOT NULL,
    "status"           "AIProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "reviewedByUserId" TEXT,
    "createdByUserId"  TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_proposals_pkey" PRIMARY KEY ("id")
);

-- ===========================================================================
-- 3) Columns that might be missing (if table was created by v0 without them)
-- ===========================================================================

ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "description"       TEXT;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "priority"          INTEGER;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "sourceId"          UUID;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "fingerprint"       TEXT;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "score"             DOUBLE PRECISION;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "scoreBreakdown"    JSONB;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "sourcePublishedAt" TIMESTAMP(3);

ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "subtitle"       TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "tags"           TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "category"       TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "seoTitle"       TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "slug"           TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "sanityId"       TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "sanityUrl"      TEXT;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "aiGenerated"    BOOLEAN NOT NULL DEFAULT false;

-- ===========================================================================
-- 4) Foreign Keys (safe: catch duplicate_object)
-- ===========================================================================

DO $$ BEGIN ALTER TABLE "articles" ADD CONSTRAINT "articles_ideaId_fkey"
    FOREIGN KEY ("ideaId") REFERENCES "ideas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "assets" ADD CONSTRAINT "assets_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_publishJobId_fkey"
    FOREIGN KEY ("publishJobId") REFERENCES "publish_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "ideas" ADD CONSTRAINT "ideas_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 5) Unique Constraints (safe: catch duplicate_object)
-- ===========================================================================

DO $$ BEGIN ALTER TABLE "assets" ADD CONSTRAINT "assets_articleId_platform_version_key"
    UNIQUE ("articleId", "platform", "version");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "articles" ADD CONSTRAINT "articles_slug_key" UNIQUE ("slug");
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 6) Indexes (IF NOT EXISTS)
-- ===========================================================================

-- sources
CREATE INDEX IF NOT EXISTS "sources_active_idx" ON "sources"("active");
CREATE INDEX IF NOT EXISTS "sources_type_idx"   ON "sources"("type");

-- ideas
CREATE INDEX IF NOT EXISTS "ideas_status_idx"          ON "ideas"("status");
CREATE INDEX IF NOT EXISTS "ideas_createdByUserId_idx"  ON "ideas"("createdByUserId");
CREATE INDEX IF NOT EXISTS "ideas_fingerprint_idx"      ON "ideas"("fingerprint");
CREATE INDEX IF NOT EXISTS "ideas_score_idx"            ON "ideas"("score");
CREATE INDEX IF NOT EXISTS "ideas_sourceId_idx"         ON "ideas"("sourceId");

-- articles
CREATE INDEX IF NOT EXISTS "articles_ideaId_idx"             ON "articles"("ideaId");
CREATE INDEX IF NOT EXISTS "articles_status_idx"             ON "articles"("status");
CREATE INDEX IF NOT EXISTS "articles_distributionStatus_idx" ON "articles"("distributionStatus");
CREATE INDEX IF NOT EXISTS "articles_createdByUserId_idx"    ON "articles"("createdByUserId");

-- assets
CREATE INDEX IF NOT EXISTS "assets_articleId_platform_idx" ON "assets"("articleId", "platform");
CREATE INDEX IF NOT EXISTS "assets_articleId_version_idx"  ON "assets"("articleId", "version" DESC);

-- approvals
CREATE INDEX IF NOT EXISTS "approvals_entityType_entityId_idx"               ON "approvals"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "approvals_entityType_entityId_entityVersion_idx" ON "approvals"("entityType", "entityId", "entityVersion");

-- publish_jobs
CREATE INDEX IF NOT EXISTS "publish_jobs_assetId_assetVersion_idx" ON "publish_jobs"("assetId", "assetVersion");
CREATE INDEX IF NOT EXISTS "publish_jobs_platform_status_idx"      ON "publish_jobs"("platform", "status");
CREATE INDEX IF NOT EXISTS "publish_jobs_schedulerJobId_idx"       ON "publish_jobs"("schedulerJobId");

-- artifacts
CREATE INDEX IF NOT EXISTS "artifacts_assetId_idx"     ON "artifacts"("assetId");
CREATE INDEX IF NOT EXISTS "artifacts_publishJobId_idx" ON "artifacts"("publishJobId");
CREATE INDEX IF NOT EXISTS "artifacts_articleId_idx"    ON "artifacts"("articleId");
CREATE INDEX IF NOT EXISTS "artifacts_type_idx"         ON "artifacts"("type");

-- event_logs
CREATE INDEX IF NOT EXISTS "event_logs_entityType_entityId_idx" ON "event_logs"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "event_logs_actorUserId_idx"         ON "event_logs"("actorUserId");
CREATE INDEX IF NOT EXISTS "event_logs_action_idx"              ON "event_logs"("action");
CREATE INDEX IF NOT EXISTS "event_logs_createdAt_idx"           ON "event_logs"("createdAt");

-- ai_proposals
CREATE INDEX IF NOT EXISTS "ai_proposals_entityType_entityId_idx" ON "ai_proposals"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "ai_proposals_status_idx"              ON "ai_proposals"("status");
