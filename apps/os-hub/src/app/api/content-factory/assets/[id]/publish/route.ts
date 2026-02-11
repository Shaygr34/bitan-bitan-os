/**
 * POST /api/content-factory/assets/[id]/publish
 *
 * Manual publish: creates a PublishJob with method=MANUAL and status=SUCCEEDED.
 * Requires externalUrl (the URL where the user manually published the content).
 * After creating the job, recalculates the article's distributionStatus.
 * Writes EventLog.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/content-factory/event-log";
import { updateDistributionStatus } from "@/lib/content-factory/distribution";
import { errorJson, isValidUuid, isValidUrl, parseBody, requireString } from "@/lib/content-factory/validate";

export const runtime = "nodejs";

type PublishBody = {
  externalUrl: string;
  createdByUserId: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const assetId = params.id;
  if (!isValidUuid(assetId)) {
    return errorJson(400, "INVALID_ID", "Asset id must be a valid UUID");
  }

  const [body, err] = await parseBody<PublishBody>(request);
  if (err) return err;

  const externalUrl = requireString(body as Record<string, unknown>, "externalUrl");
  if (!externalUrl) {
    return errorJson(400, "MISSING_FIELD", "externalUrl is required for manual publish");
  }

  if (!isValidUrl(externalUrl)) {
    return errorJson(400, "INVALID_URL", "externalUrl must be a valid http or https URL");
  }

  const createdByUserId = requireString(body as Record<string, unknown>, "createdByUserId");
  if (!createdByUserId) {
    return errorJson(400, "MISSING_FIELD", "createdByUserId is required");
  }

  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) {
    return errorJson(404, "NOT_FOUND", "Asset not found");
  }

  if (asset.status !== "APPROVED") {
    return errorJson(409, "NOT_APPROVED", `Asset is ${asset.status}, must be APPROVED to publish`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const publishJob = await tx.publishJob.create({
      data: {
        assetId,
        assetVersion: asset.version,
        platform: asset.platform,
        method: "MANUAL",
        status: "SUCCEEDED",
        externalUrl,
        createdByUserId,
      },
    });

    await logEvent(tx, {
      actorUserId: createdByUserId,
      entityType: "PUBLISH_JOB",
      entityId: publishJob.id,
      action: "PUBLISH_JOB_CREATED",
      metadata: {
        assetId,
        platform: asset.platform,
        method: "MANUAL",
        externalUrl,
      },
    });

    await logEvent(tx, {
      actorUserId: createdByUserId,
      entityType: "ASSET",
      entityId: assetId,
      action: "ASSET_PUBLISHED_MANUALLY",
      metadata: {
        publishJobId: publishJob.id,
        externalUrl,
        articleId: asset.articleId,
      },
    });

    // Recalculate article distribution status
    const newDistStatus = await updateDistributionStatus(tx, asset.articleId);

    await logEvent(tx, {
      actorUserId: createdByUserId,
      entityType: "ARTICLE",
      entityId: asset.articleId,
      action: "DISTRIBUTION_STATUS_UPDATED",
      metadata: { distributionStatus: newDistStatus },
    });

    return { publishJob, distributionStatus: newDistStatus };
  });

  return NextResponse.json(result, { status: 201 });
}
