/**
 * PATCH /api/content-factory/publish-jobs/[id]/status
 *
 * Update a PublishJob's status. Enforces deterministic transitions.
 * After status change, recalculates article distributionStatus.
 *
 * Body: { to: PublishJobStatus, actorUserId: string, errorCode?: string, errorMessage?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { PublishJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validatePublishJobTransition } from "@/lib/content-factory/transitions";
import { logEvent } from "@/lib/content-factory/event-log";
import { updateDistributionStatus } from "@/lib/content-factory/distribution";
import { errorJson, isValidUuid, parseBody, requireString } from "@/lib/content-factory/validate";

export const runtime = "nodejs";

type StatusBody = {
  to: PublishJobStatus;
  actorUserId: string;
  errorCode?: string;
  errorMessage?: string;
};

const VALID_STATUSES = new Set<string>(Object.values(PublishJobStatus));

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!isValidUuid(id)) {
    return errorJson(400, "INVALID_ID", "id must be a valid UUID");
  }

  const [body, err] = await parseBody<StatusBody>(request);
  if (err) return err;

  const to = requireString(body as Record<string, unknown>, "to");
  if (!to || !VALID_STATUSES.has(to)) {
    return errorJson(400, "INVALID_STATUS", `to must be one of: ${[...VALID_STATUSES].join(", ")}`);
  }

  const actorUserId = requireString(body as Record<string, unknown>, "actorUserId");
  if (!actorUserId) {
    return errorJson(400, "MISSING_FIELD", "actorUserId is required");
  }

  const publishJob = await prisma.publishJob.findUnique({
    where: { id },
    include: { asset: { select: { articleId: true } } },
  });
  if (!publishJob) {
    return errorJson(404, "NOT_FOUND", "PublishJob not found");
  }

  const validationError = validatePublishJobTransition(
    publishJob.status,
    to as PublishJobStatus,
  );
  if (validationError) {
    return errorJson(409, validationError.code, validationError.message);
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.publishJob.update({
      where: { id },
      data: {
        status: to as PublishJobStatus,
        errorCode: body.errorCode ?? null,
        errorMessage: body.errorMessage ?? null,
      },
    });

    await logEvent(tx, {
      actorUserId,
      entityType: "PUBLISH_JOB",
      entityId: id,
      action: "PUBLISH_JOB_STATUS_CHANGED",
      metadata: {
        from: publishJob.status,
        to,
        assetId: publishJob.assetId,
      },
    });

    // Recalculate distribution status
    const newDistStatus = await updateDistributionStatus(
      tx,
      publishJob.asset.articleId,
    );

    return { publishJob: updated, distributionStatus: newDistStatus };
  });

  return NextResponse.json(result);
}
