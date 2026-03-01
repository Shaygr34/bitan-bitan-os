/**
 * GET /api/content-factory/debug/latest-draft — Debug endpoint to inspect
 * the latest AI-generated article and its AIProposal record.
 *
 * TEMPORARY: delete after verifying the draft pipeline works.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const article = await prisma.article.findFirst({
    where: { aiGenerated: true },
    orderBy: { createdAt: "desc" },
    include: { idea: true },
  });

  const proposal = await prisma.aIProposal.findFirst({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    article: article
      ? {
          id: article.id,
          title: article.title,
          slug: article.slug,
          seoTitle: article.seoTitle,
          seoDescription: article.seoDescription,
          aiGenerated: article.aiGenerated,
          ideaId: article.ideaId,
          bodyBlocksType: typeof article.bodyBlocks,
          bodyBlocksLength: Array.isArray(article.bodyBlocks)
            ? article.bodyBlocks.length
            : "not array",
          bodyBlocksPreview: JSON.stringify(article.bodyBlocks)?.substring(0, 2000),
          bodyTextLength: article.bodyText?.length ?? null,
          createdAt: article.createdAt,
        }
      : null,
    proposal: proposal
      ? {
          id: proposal.id,
          entityType: proposal.entityType,
          entityId: proposal.entityId,
          primitive: proposal.primitive,
          outputPreview: JSON.stringify(proposal.output)?.substring(0, 3000),
          createdAt: proposal.createdAt,
        }
      : null,
  });
}
