/**
 * PATCH /api/content-factory/articles/[id]/transition
 *
 * Transition an article's status. Enforces deterministic state machine.
 *
 * Body: { to: ArticleStatus, actorUserId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { ArticleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateArticleTransition } from "@/lib/content-factory/transitions";
import { logEvent } from "@/lib/content-factory/event-log";
import { errorJson, isValidUuid, parseBody, requireString } from "@/lib/content-factory/validate";

export const runtime = "nodejs";

type TransitionBody = {
  to: ArticleStatus;
  actorUserId: string;
};

const VALID_STATUSES = new Set<string>(Object.values(ArticleStatus));

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

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) {
    return errorJson(404, "NOT_FOUND", "Article not found");
  }

  const validationError = validateArticleTransition(
    article.status,
    to as ArticleStatus,
  );
  if (validationError) {
    return errorJson(409, validationError.code, validationError.message);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.article.update({
      where: { id },
      data: { status: to as ArticleStatus },
    });

    await logEvent(tx, {
      actorUserId,
      entityType: "ARTICLE",
      entityId: id,
      action: "ARTICLE_STATUS_CHANGED",
      metadata: { from: article.status, to },
    });

    return result;
  });

  return NextResponse.json(updated);
}
