/**
 * Draft generation orchestrator: Idea → Claude → Article.
 *
 * Flow:
 * 1. Load Idea + Source
 * 2. Build prompts from templates
 * 3. Call Claude Sonnet 4
 * 4. Parse response (extract meta + blocks)
 * 5. Validate blocks
 * 6. Generate slug
 * 7. Create Article (DRAFT, aiGenerated=true)
 * 8. Create AIProposal record
 * 9. Transition Idea → ENRICHED
 * 10. EventLog: DRAFT_GENERATED
 */

import type { PrismaClient } from "@prisma/client";
import { complete } from "@/lib/ai/claude-client";
import { loadPrompt } from "@/lib/ai/prompt-loader";
import { parseDraftResponse, validateContentBlocks } from "@/lib/ai/content-blocks";
import type { ContentBlock, DraftMeta } from "@/lib/ai/content-blocks";
import { logEvent } from "@/lib/content-factory/event-log";

function slugify(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\u0590-\u05FFa-zA-Z0-9-]/g, "")
    .slice(0, 96);
}

export interface DraftResult {
  articleId: string;
  title: string;
  tokensUsed: number;
  costUsd: number;
}

export async function generateDraft(
  prisma: PrismaClient,
  ideaId: string,
): Promise<DraftResult> {
  // 1. Load idea with source
  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    include: { source: true },
  });

  if (!idea) throw new Error("Idea not found");
  if (idea.status !== "NEW" && idea.status !== "SELECTED") {
    throw new Error(`Idea must be NEW or SELECTED, got ${idea.status}`);
  }

  // 2. Build prompts
  const systemPrompt = loadPrompt("article-draft-system.md");
  const userPrompt = loadPrompt("article-draft-user.md", {
    title: idea.title,
    description: idea.description ?? "לא זמין",
    sourceUrl: idea.sourceUrl ?? "לא זמין",
    sourcePublishedAt: idea.sourcePublishedAt?.toISOString() ?? "לא זמין",
    tags: idea.tags.length > 0 ? idea.tags.join(", ") : "לא צוינו",
  });

  // 3. Call Claude
  const response = await complete({
    systemPrompt,
    userPrompt,
    maxTokens: 4096,
    temperature: 0.3,
  });

  // 4. Parse response
  let draft = parseDraftResponse(response.text);

  // Retry once if parsing failed
  if (!draft) {
    const retryResponse = await complete({
      systemPrompt,
      userPrompt: userPrompt + "\n\nחשוב: החזר JSON תקני בלבד, ללא טקסט נוסף לפני או אחרי.",
      maxTokens: 4096,
      temperature: 0.2,
    });
    draft = parseDraftResponse(retryResponse.text);

    if (!draft) {
      // Fallback: wrap raw text in a single paragraph block
      draft = {
        meta: {
          seoTitle: idea.title,
          seoDescription: "",
          excerpt: "",
          tldr: "",
          difficulty: "basic" as const,
          checklist: [],
        },
        blocks: [
          { type: "heading" as const, text: idea.title, level: 1 },
          { type: "paragraph" as const, text: response.text.slice(0, 5000) },
          { type: "paragraph" as const, text: "מאמר זה נוצר אוטומטית ודורש עריכה." },
        ],
      };
    }
  }

  // 5. Validate blocks
  const validation = validateContentBlocks(draft.blocks);
  if (!validation.valid) {
    console.warn("ContentBlock validation warnings:", validation.errors);
  }

  // 6. Generate slug
  const slug = slugify(idea.title);
  const meta = draft.meta as DraftMeta;

  // 7-10. Create article, AIProposal, transition idea, log event — all in transaction
  const article = await prisma.$transaction(async (tx) => {
    const created = await tx.article.create({
      data: {
        title: idea.title,
        subtitle: meta.tldr || null,
        bodyBlocks: draft!.blocks as unknown as object,
        bodyText: draft!.blocks
          .filter((b: ContentBlock) => b.type === "paragraph" || b.type === "heading")
          .map((b: ContentBlock) => b.text ?? "")
          .join("\n\n"),
        ideaId: idea.id,
        tags: idea.tags,
        category: idea.source?.category ?? null,
        seoTitle: meta.seoTitle || idea.title,
        seoDescription: meta.seoDescription || null,
        slug,
        aiGenerated: true,
        createdByUserId: "system",
      },
    });

    // Create AIProposal record
    await tx.aIProposal.create({
      data: {
        entityType: "ARTICLE",
        entityId: created.id,
        entityVersion: 1,
        primitive: "SUGGEST",
        input: {
          ideaId: idea.id,
          ideaTitle: idea.title,
          systemPrompt: systemPrompt.slice(0, 200) + "...",
          userPrompt: userPrompt.slice(0, 200) + "...",
        } as object,
        output: {
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          costUsd: response.costUsd,
          durationMs: response.durationMs,
          blocksCount: draft!.blocks.length,
          meta,
        } as object,
        createdByUserId: "system",
      },
    });

    // Transition idea to ENRICHED
    await tx.idea.update({
      where: { id: ideaId },
      data: { status: "ENRICHED" },
    });

    // EventLog
    await logEvent(tx, {
      actorUserId: "system",
      entityType: "ARTICLE",
      entityId: created.id,
      action: "DRAFT_GENERATED",
      metadata: {
        ideaId: idea.id,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd: response.costUsd,
        durationMs: response.durationMs,
      },
    });

    return created;
  });

  return {
    articleId: article.id,
    title: article.title,
    tokensUsed: response.inputTokens + response.outputTokens,
    costUsd: response.costUsd,
  };
}
