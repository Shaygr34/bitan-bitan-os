/**
 * POST /api/content-factory/articles/[id]/assets — Create asset for article
 * GET  /api/content-factory/articles/[id]/assets — List assets for article
 */

import { NextRequest, NextResponse } from "next/server";
import { Platform, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/content-factory/event-log";
import { errorJson, isValidUuid, parseBody, requireString } from "@/lib/content-factory/validate";

export const runtime = "nodejs";

type CreateAssetBody = {
  platform: Platform;
  contentPayload: unknown;
  platformMeta?: Record<string, unknown>;
  createdByUserId: string;
};

const VALID_PLATFORMS = new Set<string>(Object.values(Platform));

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const articleId = params.id;
  if (!isValidUuid(articleId)) {
    return errorJson(400, "INVALID_ID", "Article id must be a valid UUID");
  }

  const [body, err] = await parseBody<CreateAssetBody>(request);
  if (err) return err;

  const platform = requireString(body as Record<string, unknown>, "platform");
  if (!platform || !VALID_PLATFORMS.has(platform)) {
    return errorJson(400, "INVALID_PLATFORM", `platform must be one of: ${[...VALID_PLATFORMS].join(", ")}`);
  }

  const createdByUserId = requireString(body as Record<string, unknown>, "createdByUserId");
  if (!createdByUserId) {
    return errorJson(400, "MISSING_FIELD", "createdByUserId is required");
  }

  if (body.contentPayload === undefined || body.contentPayload === null) {
    return errorJson(400, "MISSING_FIELD", "contentPayload is required");
  }

  // Verify article exists
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) {
    return errorJson(404, "NOT_FOUND", "Article not found");
  }

  // Determine next version for this article+platform combo
  const latestAsset = await prisma.asset.findFirst({
    where: { articleId, platform: platform as Platform },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestAsset?.version ?? 0) + 1;

  const asset = await prisma.$transaction(async (tx) => {
    const created = await tx.asset.create({
      data: {
        articleId,
        platform: platform as Platform,
        version: nextVersion,
        contentPayload: body.contentPayload as object,
        platformMeta: (body.platformMeta ?? {}) as Prisma.InputJsonValue,
        createdByUserId,
      },
    });

    await logEvent(tx, {
      actorUserId: createdByUserId,
      entityType: "ASSET",
      entityId: created.id,
      action: "ASSET_CREATED",
      metadata: { articleId, platform, version: nextVersion },
    });

    return created;
  });

  return NextResponse.json(asset, { status: 201 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const articleId = params.id;
  if (!isValidUuid(articleId)) {
    return errorJson(400, "INVALID_ID", "Article id must be a valid UUID");
  }

  const assets = await prisma.asset.findMany({
    where: { articleId },
    orderBy: [{ platform: "asc" }, { version: "desc" }],
    include: {
      publishJobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  return NextResponse.json(assets);
}
