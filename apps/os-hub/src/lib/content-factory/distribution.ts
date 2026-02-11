/**
 * Recalculate and persist Article.distributionStatus based on its assets'
 * publish jobs.
 *
 * Rules:
 *   NOT_PUBLISHED        — no SUCCEEDED PublishJob for any asset
 *   PARTIALLY_PUBLISHED  — at least one SUCCEEDED PublishJob exists
 *   FULLY_PUBLISHED      — every APPROVED asset has ≥ 1 SUCCEEDED PublishJob
 */

import type { PrismaClient, DistributionStatus } from "@prisma/client";

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export async function updateDistributionStatus(
  prisma: PrismaClient | TxClient,
  articleId: string,
): Promise<DistributionStatus> {
  const tx = prisma as unknown as {
    asset: {
      findMany: (args: unknown) => Promise<Array<{
        id: string;
        status: string;
        publishJobs: Array<{ status: string }>;
      }>>;
    };
    article: {
      update: (args: unknown) => Promise<unknown>;
    };
  };

  // Fetch all assets for this article with their publish jobs
  const assets = await tx.asset.findMany({
    where: { articleId },
    select: {
      id: true,
      status: true,
      publishJobs: {
        where: { status: "SUCCEEDED" },
        select: { status: true },
      },
    },
  });

  const approvedAssets = assets.filter((a) => a.status === "APPROVED");
  const anySucceeded = assets.some((a) => a.publishJobs.length > 0);

  let newStatus: DistributionStatus;

  if (!anySucceeded) {
    newStatus = "NOT_PUBLISHED";
  } else if (
    approvedAssets.length > 0 &&
    approvedAssets.every((a) => a.publishJobs.length > 0)
  ) {
    newStatus = "FULLY_PUBLISHED";
  } else {
    newStatus = "PARTIALLY_PUBLISHED";
  }

  await tx.article.update({
    where: { id: articleId },
    data: { distributionStatus: newStatus },
  });

  return newStatus;
}
