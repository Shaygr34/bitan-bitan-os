/**
 * Publish Article → Sanity (as draft document).
 *
 * Flow:
 * 1. Validate article is APPROVED
 * 2. Map article to Sanity doc
 * 3. createOrReplace as draft in Sanity
 * 4. Create WEBSITE Asset (auto-APPROVED)
 * 5. Create PublishJob (WEBSITE_DIRECT, SUCCEEDED)
 * 6. Store sanityId + sanityUrl on Article
 * 7. Recalculate distributionStatus
 * 8. EventLog: PUBLISHED_TO_SANITY
 */

import type { PrismaClient } from "@prisma/client";
import { mapArticleToSanityDoc } from "@/lib/sanity/mapper";
import { createOrReplace } from "@/lib/sanity/client";
import { updateDistributionStatus } from "@/lib/content-factory/distribution";
import { logEvent } from "@/lib/content-factory/event-log";
import { sanityConfig, bitanWebsite } from "@/config/integrations";

export interface PublishResult {
  sanityId: string;
  sanityUrl: string;
  assetId: string;
  publishJobId: string;
}

export async function publishToSanity(
  prisma: PrismaClient,
  articleId: string,
): Promise<PublishResult> {
  // 1. Load article
  const article = await prisma.article.findUnique({
    where: { id: articleId },
  });

  if (!article) throw new Error("Article not found");
  if (article.status !== "APPROVED") {
    throw new Error(`Article must be APPROVED to publish, got ${article.status}`);
  }

  // Sanity config check
  if (!sanityConfig.projectId || !sanityConfig.apiToken) {
    throw new Error("Sanity credentials not configured");
  }

  // 2. Map to Sanity doc
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
  const studioBase = bitanWebsite.studio.url.replace(/\/$/, "");
  const sanityUrl = `${studioBase}/structure/article;${sanityId.replace("drafts.", "")}`;

  // 4-8. Create asset, publish job, update article, recalculate distribution, log — in transaction
  const txResult = await prisma.$transaction(async (tx) => {
    // 4. Create WEBSITE asset (auto-approved)
    const asset = await tx.asset.create({
      data: {
        articleId: article.id,
        platform: "WEBSITE",
        contentPayload: { sanityDocId: sanityId },
        status: "APPROVED",
        createdByUserId: "system",
      },
    });

    // 5. Create PublishJob (WEBSITE_DIRECT, SUCCEEDED)
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
          publishedAt: new Date().toISOString(),
        } as object,
        createdByUserId: "system",
      },
    });

    // 6. Store sanityId + sanityUrl on Article
    await tx.article.update({
      where: { id: articleId },
      data: { sanityId, sanityUrl },
    });

    // 7. Recalculate distributionStatus
    await updateDistributionStatus(tx, articleId);

    // 8. EventLog
    await logEvent(tx, {
      actorUserId: "system",
      entityType: "ARTICLE",
      entityId: articleId,
      action: "PUBLISHED_TO_SANITY",
      metadata: {
        sanityId,
        sanityUrl,
        assetId: asset.id,
        publishJobId: publishJob.id,
      },
    });

    return { assetId: asset.id, publishJobId: publishJob.id };
  });

  return {
    sanityId,
    sanityUrl,
    assetId: txResult.assetId,
    publishJobId: txResult.publishJobId,
  };
}
