/**
 * POST /api/content-factory/articles/:id/generate-image
 *
 * Generates a hero image using Gemini, uploads to Sanity CDN.
 * If the article is already pushed to Sanity, patches the mainImage field.
 */

import { NextResponse } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";
import { isValidUuid, errorJson, isTableOrConnectionError } from "@/lib/content-factory/validate";
import { generateAndUploadImage } from "@/lib/content-factory/image-generator";
import { sanityConfig } from "@/config/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 min for image gen

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    return errorJson(400, "INVALID_ID", "Article ID must be a valid UUID");
  }

  try {
    const article = await withRetry(() =>
      prisma.article.findUnique({ where: { id } }),
    );

    if (!article) {
      return errorJson(404, "NOT_FOUND", "Article not found");
    }

    if (!process.env.GOOGLE_AI_API_KEY) {
      return errorJson(503, "CONFIG_ERROR", "GOOGLE_AI_API_KEY not configured");
    }

    // Generate + upload to Sanity CDN
    const slug = article.slug || article.id.slice(0, 8);
    const { assetId } = await generateAndUploadImage(
      article.title,
      slug,
      article.category,
    );

    // If article already pushed to Sanity, patch the mainImage field
    let sanityPatchError: string | undefined;
    if (article.sanityId && sanityConfig.apiToken) {
      try {
        const sanityDocId = article.sanityId;
        const url = `https://${sanityConfig.projectId}.api.sanity.io/v2024-01-01/data/mutate/${sanityConfig.dataset}`;
        await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sanityConfig.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mutations: [
              {
                patch: {
                  id: sanityDocId,
                  set: {
                    mainImage: {
                      _type: "image",
                      asset: { _type: "reference", _ref: assetId },
                    },
                  },
                },
              },
            ],
          }),
        });
        console.log("[generate-image] Patched mainImage on Sanity doc:", sanityDocId);
      } catch (patchErr) {
        console.warn("[generate-image] Failed to patch Sanity mainImage:", patchErr);
        sanityPatchError = (patchErr as Error).message;
      }
    }

    return NextResponse.json({
      assetId,
      articleId: id,
      sanityPatched: !sanityPatchError,
      sanityPatchError,
    });
  } catch (error) {
    if (isTableOrConnectionError(error)) {
      return errorJson(503, "DB_UNAVAILABLE", "Database is not available");
    }

    console.error("[generate-image] Error:", error);
    const message = error instanceof Error ? error.message : "Image generation failed";
    return errorJson(500, "INTERNAL_ERROR", message);
  }
}
