/**
 * POST /api/content-factory/ideas/[id]/draft  — Generate AI draft from Idea
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, isValidUuid } from "@/lib/content-factory/validate";
import { generateDraft } from "@/lib/content-factory/drafting";

export const runtime = "nodejs";
export const maxDuration = 150; // seconds — allow 2.5 min for Claude API call + retries

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUuid(id)) return errorJson(400, "INVALID_ID", "Invalid idea ID");

  try {
    const result = await generateDraft(prisma, id);

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

    if (msg.includes("not found")) {
      return errorJson(404, "NOT_FOUND", msg);
    }
    if (msg.includes("must be NEW or SELECTED")) {
      return errorJson(400, "INVALID_STATUS", msg);
    }
    if (msg.includes("ANTHROPIC_API_KEY")) {
      return errorJson(500, "CONFIG_ERROR", "AI service not configured");
    }
    if (msg.includes("timeout")) {
      return errorJson(504, "TIMEOUT", "AI generation timed out. Please try again.");
    }

    const detail = (e as Error).message ?? "unknown error";
    console.error(`POST /api/content-factory/ideas/${id}/draft failed:`, detail, e);
    return errorJson(500, "INTERNAL_ERROR", `Failed to generate draft: ${detail}`);
  }
}
