/**
 * PATCH /api/content-factory/assets/[id]/transition
 *
 * Transition an asset's status. Enforces deterministic state machine.
 *
 * Body: { to: AssetStatus, actorUserId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { AssetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateAssetTransition } from "@/lib/content-factory/transitions";
import { logEvent } from "@/lib/content-factory/event-log";
import { errorJson, isValidUuid, parseBody, requireString } from "@/lib/content-factory/validate";

export const runtime = "nodejs";

type TransitionBody = {
  to: AssetStatus;
  actorUserId: string;
};

const VALID_STATUSES = new Set<string>(Object.values(AssetStatus));

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!isValidUuid(id)) {
    return errorJson(400, "INVALID_ID", "id must be a valid UUID");
  }

  const [body, err] = await parseBody<TransitionBody>(request);
  if (err) return err;

  const to = requireString(body as Record<string, unknown>, "to");
  if (!to || !VALID_STATUSES.has(to)) {
    return errorJson(400, "INVALID_STATUS", `to must be one of: ${[...VALID_STATUSES].join(", ")}`);
  }

  const actorUserId = requireString(body as Record<string, unknown>, "actorUserId");
  if (!actorUserId) {
    return errorJson(400, "MISSING_FIELD", "actorUserId is required");
  }

  try {
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) {
      return errorJson(404, "NOT_FOUND", "Asset not found");
    }

    const validationError = validateAssetTransition(
      asset.status,
      to as AssetStatus,
    );
    if (validationError) {
      return errorJson(409, validationError.code, validationError.message);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.asset.update({
        where: { id },
        data: { status: to as AssetStatus },
      });

      await logEvent(tx, {
        actorUserId,
        entityType: "ASSET",
        entityId: id,
        action: "ASSET_STATUS_CHANGED",
        metadata: { from: asset.status, to, articleId: asset.articleId },
      });

      return result;
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(`PATCH /api/content-factory/assets/${id}/transition failed:`, e);
    return errorJson(500, "INTERNAL_ERROR", "Failed to transition asset");
  }
}
