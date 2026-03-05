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
import { randomBytes } from "crypto";
import { streamComplete } from "@/lib/ai/claude-client";
import { loadPrompt } from "@/lib/ai/prompt-loader";
import { parseDraftResponse, validateContentBlocks } from "@/lib/ai/content-blocks";
import type { ContentBlock, DraftMeta, DraftResponse } from "@/lib/ai/content-blocks";
import { logEvent } from "@/lib/content-factory/event-log";

function slugify(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\u0590-\u05FFa-zA-Z0-9-]/g, "")
    .slice(0, 96);
}

/**
 * Build a readable DraftResponse from raw Claude text when JSON parsing fails.
 * Strips code fences, JSON syntax, and extracts the Hebrew text content.
 */
function buildFallbackDraft(title: string, rawText: string): DraftResponse {
  let text = rawText;

  // Strip markdown code fences
  text = text.replace(/```(?:json)?\s*\n?/g, "").replace(/```/g, "");

  // Try to extract "text" values from JSON-like content
  // This handles the case where the JSON structure is visible but unparseable
  const textValues: string[] = [];
  const textPattern = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = textPattern.exec(text)) !== null) {
    const val = match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
    if (val.trim().length > 10) {
      textValues.push(val.trim());
    }
  }

  // Also try to extract "items" arrays for list blocks
  const itemValues: string[][] = [];
  const itemsPattern = /"items"\s*:\s*\[((?:[^\]]*?))\]/g;
  while ((match = itemsPattern.exec(text)) !== null) {
    const items = match[1]
      .split(/",\s*"/)
      .map((s) => s.replace(/^"/, "").replace(/"$/, "").replace(/\\"/g, '"').replace(/\\n/g, " ").trim())
      .filter((s) => s.length > 0);
    if (items.length > 0) {
      itemValues.push(items);
    }
  }

  const blocks: ContentBlock[] = [
    { type: "heading", text: title, level: 1 },
  ];

  if (textValues.length > 0) {
    // We got text from JSON — use it as structured content
    for (let i = 0; i < textValues.length; i++) {
      blocks.push({ type: "paragraph", text: textValues[i] });
      // Insert list items after paragraphs if available
      if (i < itemValues.length) {
        blocks.push({ type: "list", style: "bullet", items: itemValues[i] });
      }
    }
    // Remaining lists
    for (let i = textValues.length; i < itemValues.length; i++) {
      blocks.push({ type: "list", style: "bullet", items: itemValues[i] });
    }
  } else {
    // No JSON text found — strip JSON syntax and split into paragraphs
    const cleaned = text
      .replace(/[{}\[\]]/g, "")
      .replace(/"type"\s*:\s*"[^"]*"\s*,?/g, "")
      .replace(/"level"\s*:\s*\d+\s*,?/g, "")
      .replace(/"style"\s*:\s*"[^"]*"\s*,?/g, "")
      .replace(/"text"\s*:\s*/g, "")
      .replace(/"items"\s*:\s*/g, "")
      .replace(/"meta"\s*:\s*/g, "")
      .replace(/"blocks"\s*:\s*/g, "")
      .replace(/"seoTitle"\s*:\s*"[^"]*"\s*,?/g, "")
      .replace(/"seoDescription"\s*:\s*"[^"]*"\s*,?/g, "")
      .replace(/"excerpt"\s*:\s*"[^"]*"\s*,?/g, "")
      .replace(/"tldr"\s*:\s*"[^"]*"\s*,?/g, "")
      .replace(/"difficulty"\s*:\s*"[^"]*"\s*,?/g, "")
      .replace(/"checklist"\s*:\s*\[[^\]]*\]\s*,?/g, "")
      .replace(/"attribution"\s*:\s*"[^"]*"\s*,?/g, "")
      .replace(/"[a-zA-Z]+"\s*:/g, "") // strip remaining JSON keys
      .replace(/,\s*$/gm, "")
      .replace(/"\s*,\s*"/g, "\n")
      .replace(/"/g, "");

    // Split into paragraphs by double newlines or multiple blank lines
    const paragraphs = cleaned
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20); // Only keep substantial text

    if (paragraphs.length > 0) {
      for (const para of paragraphs.slice(0, 20)) {
        blocks.push({ type: "paragraph", text: para });
      }
    } else {
      blocks.push({
        type: "paragraph",
        text: "לא ניתן היה לעבד את תגובת הבינה המלאכותית. נא ליצור טיוטה חדשה או לערוך ידנית.",
      });
    }
  }

  blocks.push({
    type: "callout",
    title: "הערה",
    text: "מאמר זה נוצר אוטומטית ודורש עריכה. עיבוד התגובה המקורית נכשל — ייתכן שחלק מהתוכן חסר.",
  });

  return {
    meta: {
      seoTitle: title,
      seoDescription: "",
      excerpt: "",
      tldr: "",
      difficulty: "basic" as const,
      checklist: [],
    },
    blocks,
  };
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

  // 3. Call Claude (streaming — tokens arrive incrementally, no timeout)
  console.log(`[DRAFT] Starting streaming generation — prompt: system=${systemPrompt.length}, user=${userPrompt.length} chars`);
  const response = await streamComplete({
    systemPrompt,
    userPrompt,
    maxTokens: 4096,
    temperature: 0.3,
  });

  // 4. Parse response
  console.log("[DRAFT] Claude response received — length:", response.text.length,
    "tokens:", response.inputTokens + response.outputTokens,
    "duration:", response.durationMs, "ms",
    "preview:", response.text.substring(0, 300));
  let draft = parseDraftResponse(response.text);

  // Fallback: if parsing failed, try to extract readable text from the response
  // instead of dumping raw JSON into a paragraph.
  if (!draft) {
    console.warn("[DRAFT] Parse failed — building fallback from raw text");
    draft = buildFallbackDraft(idea.title, response.text);
  }

  // 5. Validate blocks
  const validation = validateContentBlocks(draft.blocks);
  if (!validation.valid) {
    console.warn("ContentBlock validation warnings:", validation.errors);
  }

  // 6. Generate slug (append short random suffix to prevent collisions)
  const slug = slugify(idea.title) + "-" + randomBytes(3).toString("hex");
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
