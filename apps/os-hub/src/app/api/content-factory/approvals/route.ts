/**
 * POST /api/content-factory/approvals
 *
 * Create an approval decision for an Article or Asset.
 * Side effects:
 *   - APPROVE  → transitions entity to APPROVED (must be IN_REVIEW)
 *   - REJECT / REQUEST_CHANGES → transitions entity back to DRAFT (must be IN_REVIEW)
 * Writes EventLog for both the approval record and the status change.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  ApprovalDecision,
  ApprovalEntityType,
  ArticleStatus,
  AssetStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateArticleTransition } from "@/lib/content-factory/transitions";
import { validateAssetTransition } from "@/lib/content-factory/transitions";
import { logEvent } from "@/lib/content-factory/event-log";
import { errorJson, isValidUuid, parseBody, requireString } from "@/lib/content-factory/validate";

export const runtime = "nodejs";

type ApprovalBody = {
  entityType: ApprovalEntityType;
  entityId: string;
  decision: ApprovalDecision;
  comment?: string;
  approvedByUserId: string;
};

const VALID_ENTITY_TYPES = new Set<string>(Object.values(ApprovalEntityType));
const VALID_DECISIONS = new Set<string>(Object.values(ApprovalDecision));

export async function POST(request: NextRequest) {
  const [body, err] = await parseBody<ApprovalBody>(request);
  if (err) return err;

  const entityType = requireString(body as Record<string, unknown>, "entityType");
  if (!entityType || !VALID_ENTITY_TYPES.has(entityType)) {
    return errorJson(400, "INVALID_ENTITY_TYPE", `entityType must be one of: ${[...VALID_ENTITY_TYPES].join(", ")}`);
  }

  const entityId = requireString(body as Record<string, unknown>, "entityId");
  if (!entityId || !isValidUuid(entityId)) {
    return errorJson(400, "INVALID_ENTITY_ID", "entityId must be a valid UUID");
  }

  const decision = requireString(body as Record<string, unknown>, "decision");
  if (!decision || !VALID_DECISIONS.has(decision)) {
    return errorJson(400, "INVALID_DECISION", `decision must be one of: ${[...VALID_DECISIONS].join(", ")}`);
  }

  const approvedByUserId = requireString(body as Record<string, unknown>, "approvedByUserId");
  if (!approvedByUserId) {
    return errorJson(400, "MISSING_FIELD", "approvedByUserId is required");
  }

  // ── Look up entity, validate it's IN_REVIEW ───────────────────────────

  if (entityType === "ARTICLE") {
    return handleArticleApproval(
      entityId,
      decision as ApprovalDecision,
      body.comment ?? null,
      approvedByUserId,
    );
  }

  return handleAssetApproval(
    entityId,
    decision as ApprovalDecision,
    body.comment ?? null,
    approvedByUserId,
  );
}

// ── Article approval ────────────────────────────────────────────────────────

async function handleArticleApproval(
  entityId: string,
  decision: ApprovalDecision,
  comment: string | null,
  approvedByUserId: string,
) {
  const article = await prisma.article.findUnique({ where: { id: entityId } });
  if (!article) {
    return errorJson(404, "NOT_FOUND", "Article not found");
  }

  if (article.status !== "IN_REVIEW") {
    return errorJson(409, "NOT_IN_REVIEW", `Article is ${article.status}, must be IN_REVIEW for approval`);
  }

  const targetStatus: ArticleStatus =
    decision === "APPROVE" ? "APPROVED" : "DRAFT";

  const transitionErr = validateArticleTransition(article.status, targetStatus);
  if (transitionErr) {
    return errorJson(409, transitionErr.code, transitionErr.message);
  }

  const approval = await prisma.$transaction(async (tx) => {
    const created = await tx.approval.create({
      data: {
        entityType: "ARTICLE",
        entityId,
        entityVersion: article.version,
        decision,
        comment,
        approvedByUserId,
      },
    });

    await tx.article.update({
      where: { id: entityId },
      data: { status: targetStatus },
    });

    await logEvent(tx, {
      actorUserId: approvedByUserId,
      entityType: "ARTICLE",
      entityId,
      action: "APPROVAL_CREATED",
      metadata: { decision, targetStatus, version: article.version },
    });

    await logEvent(tx, {
      actorUserId: approvedByUserId,
      entityType: "ARTICLE",
      entityId,
      action: "ARTICLE_STATUS_CHANGED",
      metadata: { from: article.status, to: targetStatus, viaApproval: created.id },
    });

    return created;
  });

  return NextResponse.json(approval, { status: 201 });
}

// ── Asset approval ──────────────────────────────────────────────────────────

async function handleAssetApproval(
  entityId: string,
  decision: ApprovalDecision,
  comment: string | null,
  approvedByUserId: string,
) {
  const asset = await prisma.asset.findUnique({ where: { id: entityId } });
  if (!asset) {
    return errorJson(404, "NOT_FOUND", "Asset not found");
  }

  if (asset.status !== "IN_REVIEW") {
    return errorJson(409, "NOT_IN_REVIEW", `Asset is ${asset.status}, must be IN_REVIEW for approval`);
  }

  const targetStatus: AssetStatus =
    decision === "APPROVE" ? "APPROVED" : "DRAFT";

  const transitionErr = validateAssetTransition(asset.status, targetStatus);
  if (transitionErr) {
    return errorJson(409, transitionErr.code, transitionErr.message);
  }

  const approval = await prisma.$transaction(async (tx) => {
    const created = await tx.approval.create({
      data: {
        entityType: "ASSET",
        entityId,
        entityVersion: asset.version,
        decision,
        comment,
        approvedByUserId,
      },
    });

    await tx.asset.update({
      where: { id: entityId },
      data: { status: targetStatus },
    });

    await logEvent(tx, {
      actorUserId: approvedByUserId,
      entityType: "ASSET",
      entityId,
      action: "APPROVAL_CREATED",
      metadata: {
        decision,
        targetStatus,
        version: asset.version,
        articleId: asset.articleId,
      },
    });

    await logEvent(tx, {
      actorUserId: approvedByUserId,
      entityType: "ASSET",
      entityId,
      action: "ASSET_STATUS_CHANGED",
      metadata: {
        from: asset.status,
        to: targetStatus,
        viaApproval: created.id,
      },
    });

    return created;
  });

  return NextResponse.json(approval, { status: 201 });
}
