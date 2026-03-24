/**
 * POST /api/content-factory/articles/:id/push-to-sanity
 *
 * V2 enhanced push: works for any article status (not just APPROVED).
 * Pushes to Sanity as a draft with all fields populated.
 */

import { NextResponse } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";
import { isValidUuid, errorJson, isTableOrConnectionError } from "@/lib/content-factory/validate";
import { mapArticleToSanityDoc } from "@/lib/sanity/mapper";
import { createOrReplace } from "@/lib/sanity/client";
import { sanityConfig, bitanWebsite } from "@/config/integrations";
import { getSetting } from "@/lib/settings";
import { updateDistributionStatus } from "@/lib/content-factory/distribution";
import { logEvent } from "@/lib/content-factory/event-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    return errorJson(400, "INVALID_ID", "Article ID must be a valid UUID");
  }

  try {
    // 1. Load article
    const article = await withRetry(() =>
      prisma.article.findUnique({ where: { id } }),
    );

    if (!article) {
      return errorJson(404, "NOT_FOUND", "Article not found");
    }

    // Sanity config check
    if (!sanityConfig.projectId || !sanityConfig.apiToken) {
      return errorJson(503, "CONFIG_ERROR", "Sanity credentials not configured");
    }

    // 2. Map to Sanity doc (enhanced V2 — all fields)
    const sanityDoc = await mapArticleToSanityDoc(
      {
        id: article.id,
        title: article.title,
        subtitle: article.subtitle,
        bodyBlocks: article.bodyBlocks,
        tags: article.tags,
        category: article.category,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        slug: article.slug,
        aiGenerated: article.aiGenerated,
      },
      { authorName: "ביטן את ביטן", asDraft: true },
    );

    // 3. Push to Sanity
    const result = await createOrReplace(sanityDoc as unknown as Record<string, unknown>);
    const sanityId = result._id;

    // Build Sanity Studio URL
    const studioUrlSetting = await getSetting("integration.studio.url");
    const studioBase = (studioUrlSetting || bitanWebsite.studio.url).replace(/\/$/, "");
    const sanityUrl = `${studioBase}/structure/knowledgeCentre;article;${sanityId.replace("drafts.", "")}`;

    // 4. Update article + create asset/job in transaction
    const txResult = await prisma.$transaction(async (tx) => {
      // Check if WEBSITE asset already exists for this article
      const existingAsset = await tx.asset.findFirst({
        where: { articleId: article.id, platform: "WEBSITE" },
      });

      let assetId: string;
      let publishJobId: string;

      if (existingAsset) {
        // Update existing asset
        assetId = existingAsset.id;

        // Create new publish job for the re-push
        const publishJob = await tx.publishJob.create({
          data: {
            assetId: existingAsset.id,
            assetVersion: existingAsset.version,
            platform: "WEBSITE",
            method: "WEBSITE_DIRECT",
            status: "SUCCEEDED",
            externalId: sanityId,
            externalUrl: sanityUrl,
            providerReceipt: {
              sanityProjectId: sanityConfig.projectId,
              sanityDataset: sanityConfig.dataset,
              sanityDocId: sanityId,
              pushedAt: new Date().toISOString(),
            } as object,
            createdByUserId: "system",
          },
        });
        publishJobId = publishJob.id;
      } else {
        // Create WEBSITE asset (auto-approved)
        const asset = await tx.asset.create({
          data: {
            articleId: article.id,
            platform: "WEBSITE",
            contentPayload: { sanityDocId: sanityId },
            status: "APPROVED",
            createdByUserId: "system",
          },
        });
        assetId = asset.id;

        const publishJob = await tx.publishJob.create({
          data: {
            assetId: asset.id,
            assetVersion: asset.version,
            platform: "WEBSITE",
            method: "WEBSITE_DIRECT",
            status: "SUCCEEDED",
            externalId: sanityId,
            externalUrl: sanityUrl,
            providerReceipt: {
              sanityProjectId: sanityConfig.projectId,
              sanityDataset: sanityConfig.dataset,
              sanityDocId: sanityId,
              pushedAt: new Date().toISOString(),
            } as object,
            createdByUserId: "system",
          },
        });
        publishJobId = publishJob.id;
      }

      // Update article with Sanity reference
      await tx.article.update({
        where: { id: article.id },
        data: { sanityId, sanityUrl },
      });

      // Recalculate distribution status
      await updateDistributionStatus(tx, article.id);

      // Event log
      await logEvent(tx, {
        actorUserId: "system",
        entityType: "ARTICLE",
        entityId: article.id,
        action: "PUSHED_TO_SANITY",
        metadata: { sanityId, sanityUrl, assetId, publishJobId },
      });

      return { assetId, publishJobId };
    });

    return NextResponse.json({
      sanityId,
      sanityUrl,
      assetId: txResult.assetId,
      publishJobId: txResult.publishJobId,
    });
  } catch (error) {
    if (isTableOrConnectionError(error)) {
      return errorJson(503, "DB_UNAVAILABLE", "Database is not available");
    }

    const msg = (error as Error).message;
    if (msg.includes("Sanity mutation failed")) {
      return errorJson(502, "SANITY_ERROR", msg);
    }

    console.error("[push-to-sanity] Error:", error);
    return errorJson(500, "INTERNAL_ERROR", "Failed to push to Sanity");
  }
}
