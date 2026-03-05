/**
 * POST /api/content-factory/ideas/[id]/draft  — Generate AI draft from Idea
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, isValidUuid } from "@/lib/content-factory/validate";
import { generateDraft } from "@/lib/content-factory/drafting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 100; // seconds — 90s Claude timeout + margin for DB ops

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUuid(id)) return errorJson(400, "INVALID_ID", "Invalid idea ID");

  try {
    console.log(`[DRAFT] Starting draft generation for idea ${id}`);
    const startTime = Date.now();
    const result = await generateDraft(prisma, id);
    console.log(`[DRAFT] Complete in ${Date.now() - startTime}ms — article: ${result.articleId}`);

    return NextResponse.json(
      {
        articleId: result.articleId,
        title: result.title,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
      },
      { status: 201 },
    );
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[DRAFT] Failed for idea ${id}:`, msg);

    if (msg.includes("not found")) {
      return errorJson(404, "NOT_FOUND", msg);
    }
    if (msg.includes("must be NEW or SELECTED")) {
      return errorJson(400, "INVALID_STATUS", msg);
    }
    if (msg.includes("ANTHROPIC_API_KEY")) {
      return errorJson(500, "CONFIG_ERROR", "AI service not configured — check ANTHROPIC_API_KEY");
    }
    if (msg.includes("timeout") || msg.includes("AbortError")) {
      return errorJson(504, "TIMEOUT", "יצירת הטיוטה נכשלה (timeout). נסו שוב — זמני תגובה משתנים.");
    }
    if (msg.includes("Claude API error")) {
      return errorJson(502, "AI_ERROR", `שגיאת AI: ${msg.slice(0, 200)}`);
    }

    console.error(`POST /api/content-factory/ideas/${id}/draft failed:`, msg, e);
    return errorJson(500, "INTERNAL_ERROR", `שגיאה ביצירת טיוטה: ${msg.slice(0, 200)}`);
  }
}
