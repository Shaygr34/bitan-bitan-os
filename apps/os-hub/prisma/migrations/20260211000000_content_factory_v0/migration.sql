-- Content Factory v0 Data Layer
-- Migration: 20260211000000_content_factory_v0

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "IdeaSourceType" AS ENUM ('MANUAL', 'RSS', 'SCRAPE', 'TREND', 'OTHER');
CREATE TYPE "IdeaStatus" AS ENUM ('NEW', 'ENRICHED', 'QUEUED_FOR_DRAFT', 'ARCHIVED');
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');
CREATE TYPE "DistributionStatus" AS ENUM ('NOT_PUBLISHED', 'PARTIALLY_PUBLISHED', 'FULLY_PUBLISHED');
CREATE TYPE "Platform" AS ENUM ('EMAIL', 'WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'LINKEDIN');
CREATE TYPE "AssetStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED');
CREATE TYPE "ApprovalEntityType" AS ENUM ('ARTICLE', 'ASSET');
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_CHANGES');
CREATE TYPE "PublishMethod" AS ENUM ('MANUAL', 'ZAPIER_BUFFER', 'RESEND', 'WEBSITE_DIRECT');
CREATE TYPE "PublishJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');
CREATE TYPE "ArtifactType" AS ENUM ('PDF', 'HTML', 'IMAGE', 'DOCX', 'JSON');
CREATE TYPE "AIProposalEntityType" AS ENUM ('IDEA', 'ARTICLE', 'ASSET');
CREATE TYPE "AIProposalPrimitive" AS ENUM ('SUGGEST', 'REWRITE_SELECTION', 'GENERATE_VARIANTS');
CREATE TYPE "AIProposalStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- 1) Idea
CREATE TABLE "ideas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "sourceType" "IdeaSourceType" NOT NULL,
    "sourceUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "IdeaStatus" NOT NULL DEFAULT 'NEW',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- 2) Article
CREATE TABLE "articles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ideaId" UUID,
    "title" TEXT NOT NULL,
    "bodyBlocks" JSONB NOT NULL,
    "bodyText" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "distributionStatus" "DistributionStatus" NOT NULL DEFAULT 'NOT_PUBLISHED',
    "seoMeta" JSONB NOT NULL DEFAULT '{}',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- 3) Asset
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "articleId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "contentPayload" JSONB NOT NULL,
    "platformMeta" JSONB NOT NULL DEFAULT '{}',
    "status" "AssetStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- 4) Approval
CREATE TABLE "approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entityType" "ApprovalEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "entityVersion" INTEGER NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "approvedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- 5) PublishJob
CREATE TABLE "publish_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "assetVersion" INTEGER NOT NULL,
    "platform" "Platform" NOT NULL,
    "method" "PublishMethod" NOT NULL,
    "status" "PublishJobStatus" NOT NULL DEFAULT 'QUEUED',
    "externalId" TEXT,
    "externalUrl" TEXT,
    "schedulerJobId" TEXT,
    "providerReceipt" JSONB NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publish_jobs_pkey" PRIMARY KEY ("id")
);

-- 6) Artifact
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "ArtifactType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT,
    "assetId" UUID,
    "assetVersion" INTEGER,
    "publishJobId" UUID,
    "articleId" UUID,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- 7) EventLog
CREATE TABLE "event_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- 8) AIProposal
CREATE TABLE "ai_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entityType" "AIProposalEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "entityVersion" INTEGER,
    "primitive" "AIProposalPrimitive" NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "status" "AIProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "reviewedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_proposals_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Foreign Keys
-- ---------------------------------------------------------------------------

ALTER TABLE "articles" ADD CONSTRAINT "articles_ideaId_fkey"
    FOREIGN KEY ("ideaId") REFERENCES "ideas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assets" ADD CONSTRAINT "assets_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_publishJobId_fkey"
    FOREIGN KEY ("publishJobId") REFERENCES "publish_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Unique Constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "assets" ADD CONSTRAINT "assets_articleId_platform_version_key"
    UNIQUE ("articleId", "platform", "version");

-- ---------------------------------------------------------------------------
-- Indices
-- ---------------------------------------------------------------------------

-- ideas
CREATE INDEX "ideas_status_idx" ON "ideas"("status");
CREATE INDEX "ideas_createdByUserId_idx" ON "ideas"("createdByUserId");

-- articles
CREATE INDEX "articles_ideaId_idx" ON "articles"("ideaId");
CREATE INDEX "articles_status_idx" ON "articles"("status");
CREATE INDEX "articles_distributionStatus_idx" ON "articles"("distributionStatus");
CREATE INDEX "articles_createdByUserId_idx" ON "articles"("createdByUserId");

-- assets
CREATE INDEX "assets_articleId_platform_idx" ON "assets"("articleId", "platform");
CREATE INDEX "assets_articleId_version_idx" ON "assets"("articleId", "version" DESC);

-- approvals
CREATE INDEX "approvals_entityType_entityId_idx" ON "approvals"("entityType", "entityId");
CREATE INDEX "approvals_entityType_entityId_entityVersion_idx" ON "approvals"("entityType", "entityId", "entityVersion");

-- publish_jobs
CREATE INDEX "publish_jobs_assetId_assetVersion_idx" ON "publish_jobs"("assetId", "assetVersion");
CREATE INDEX "publish_jobs_platform_status_idx" ON "publish_jobs"("platform", "status");
CREATE INDEX "publish_jobs_schedulerJobId_idx" ON "publish_jobs"("schedulerJobId");

-- artifacts
CREATE INDEX "artifacts_assetId_idx" ON "artifacts"("assetId");
CREATE INDEX "artifacts_publishJobId_idx" ON "artifacts"("publishJobId");
CREATE INDEX "artifacts_articleId_idx" ON "artifacts"("articleId");
CREATE INDEX "artifacts_type_idx" ON "artifacts"("type");

-- event_logs
CREATE INDEX "event_logs_entityType_entityId_idx" ON "event_logs"("entityType", "entityId");
CREATE INDEX "event_logs_actorUserId_idx" ON "event_logs"("actorUserId");
CREATE INDEX "event_logs_action_idx" ON "event_logs"("action");
CREATE INDEX "event_logs_createdAt_idx" ON "event_logs"("createdAt");

-- ai_proposals
CREATE INDEX "ai_proposals_entityType_entityId_idx" ON "ai_proposals"("entityType", "entityId");
CREATE INDEX "ai_proposals_status_idx" ON "ai_proposals"("status");
