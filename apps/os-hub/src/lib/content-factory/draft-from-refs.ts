/**
 * Generate an article draft from uploaded reference files.
 * Flow: load refs → build Claude prompt → stream response → parse → create Article.
 */

import { prisma } from "@/lib/prisma";
import { streamComplete } from "@/lib/ai/claude-client";
import { loadPrompt } from "@/lib/ai/prompt-loader";
import { parseDraftResponse, validateContentBlocks } from "@/lib/ai/content-blocks";
import { truncateForContext } from "@/lib/content-factory/ref-extractor";
import type { ExtractedRef } from "@/lib/content-factory/ref-extractor";
import type { DraftResponse } from "@/lib/ai/content-blocks";
import crypto from "crypto";

export interface DraftFromRefsInput {
  refUploadIds: string[];
  topic?: string;
  userNotes?: string;
}

export interface DraftFromRefsResult {
  articleId: string;
  title: string;
  blockCount: number;
  durationMs: number;
}

export async function generateDraftFromRefs(
  input: DraftFromRefsInput,
): Promise<DraftFromRefsResult> {
  const t0 = Date.now();

  // 1. Load reference texts from DB
  const uploads = await prisma.refUpload.findMany({
    where: { id: { in: input.refUploadIds } },
  });

  if (!uploads.length) {
    throw new Error("No reference uploads found");
  }

  const refs: ExtractedRef[] = uploads
    .filter((u) => u.textContent)
    .map((u) => ({
      filename: u.filename,
      text: u.textContent!,
      charCount: u.textContent!.length,
    }));

  if (!refs.length) {
    throw new Error("No text could be extracted from uploaded files");
  }

  // 2. Build prompts
  const refContent = truncateForContext(refs);
  const systemPrompt = loadPrompt("article-from-refs-system.md");
  const userPrompt = loadPrompt("article-from-refs-user.md", {
    refContent,
    topic: input.topic || "(לא צוין — הסק מחומרי המקור)",
    userNotes: input.userNotes || "אין הנחיות נוספות.",
  });

  // 3. Call Claude (streaming)
  console.log("[draft-from-refs] Generating draft, ref chars:", refContent.length);
  const response = await streamComplete({
    systemPrompt,
    userPrompt,
    maxTokens: 4096,
    temperature: 0.3,
  });

  // 4. Parse response
  const parsed: DraftResponse | null = parseDraftResponse(response.text);
  if (!parsed) {
    throw new Error("Failed to parse Claude response into article blocks");
  }

  const validation = validateContentBlocks(parsed.blocks);
  if (!validation.valid) {
    console.warn("[draft-from-refs] Block validation warnings:", validation.errors);
  }

  // 5. Build article text for search/preview
  const bodyText = parsed.blocks
    .filter((b) => b.type === "paragraph" || b.type === "heading")
    .map((b) => b.text)
    .join("\n\n");

  // 6. Generate slug
  const titleSlug = (parsed.blocks.find((b) => b.type === "heading")?.text || "article")
    .replace(/[^\u0590-\u05FFa-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  const slug = `${titleSlug}-${crypto.randomBytes(3).toString("hex")}`;

  const title =
    parsed.blocks.find((b) => b.type === "heading" && b.level === 1)?.text ||
    parsed.meta.seoTitle ||
    input.topic ||
    "מאמר חדש";

  // 7. Create Article
  const article = await prisma.article.create({
    data: {
      title,
      subtitle: parsed.meta.tldr || parsed.meta.excerpt || null,
      bodyBlocks: parsed.blocks as unknown as any, // eslint-disable-line
      bodyText,
      status: "DRAFT",
      seoTitle: parsed.meta.seoTitle || null,
      seoDescription: parsed.meta.seoDescription || null,
      slug,
      tags: [],
      category: null,
      aiGenerated: true,
      createdByUserId: "system",
    },
  });

  // 8. Link reference uploads to the created article
  await prisma.refUpload.updateMany({
    where: { id: { in: input.refUploadIds } },
    data: { articleId: article.id },
  });

  const durationMs = Date.now() - t0;
  console.log(
    `[draft-from-refs] Created article ${article.id} — ${parsed.blocks.length} blocks, ${durationMs}ms`,
  );

  return {
    articleId: article.id,
    title,
    blockCount: parsed.blocks.length,
    durationMs,
  };
}
