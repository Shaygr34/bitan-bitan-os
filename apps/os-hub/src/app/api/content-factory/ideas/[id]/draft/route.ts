/**
 * POST /api/content-factory/ideas/[id]/draft  — Generate AI draft from Idea
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, isValidUuid } from "@/lib/content-factory/validate";
import { generateDraft } from "@/lib/content-factory/drafting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds — streaming generation needs room (Railway max)

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUuid(id)) return errorJson(400, "INVALID_ID", "Invalid idea ID");

  const startTime = Date.now();
  try {
    console.log(`[DRAFT] Starting draft generation for idea ${id}`);
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
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(`[DRAFT] Failed for idea ${id} after ${elapsed}s:`, msg);
    console.error(`[DRAFT] Full error:`, e);

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
      return errorJson(504, "TIMEOUT", `יצירת הטיוטה נכשלה אחרי ${elapsed} שניות. נסו שוב.`);
    }
    if (msg.includes("Claude API error")) {
      return errorJson(502, "AI_ERROR", `שגיאת AI: ${msg.slice(0, 200)}`);
    }
    if (msg.includes("empty text")) {
      return errorJson(502, "AI_ERROR", "Claude החזיר תשובה ריקה. נסו שוב.");
    }

    return errorJson(500, "INTERNAL_ERROR", `שגיאה ביצירת טיוטה (${elapsed}s): ${msg.slice(0, 200)}`);
  }
}
