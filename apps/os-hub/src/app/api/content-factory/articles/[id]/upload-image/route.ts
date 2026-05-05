/**
 * POST /api/content-factory/articles/:id/upload-image
 *
 * Multipart upload of a custom hero image. Uploads to Sanity asset library,
 * stashes the asset ref on the Article, and patches mainImage if the article
 * has already been pushed to Sanity.
 */

import { NextResponse } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";
import { isValidUuid, errorJson, isTableOrConnectionError } from "@/lib/content-factory/validate";
import { uploadImageToSanity } from "@/lib/content-factory/image-generator";
import { sanityConfig } from "@/config/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(
  request: Request,
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

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return errorJson(400, "NO_FILE", "Missing 'file' field in multipart upload");
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return errorJson(400, "INVALID_TYPE", `Unsupported image type: ${file.type}`);
    }

    if (file.size > MAX_BYTES) {
      return errorJson(400, "TOO_LARGE", `Image exceeds 10MB limit (${file.size} bytes)`);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const slug = article.slug || article.id.slice(0, 8);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `cf-upload-${slug}.${ext}`;

    const assetId = await uploadImageToSanity(buffer, filename);

    await withRetry(() =>
      prisma.article.update({
        where: { id },
        data: { imageAssetId: assetId },
      }),
    );

    let sanityPatchError: string | undefined;
    if (article.sanityId && sanityConfig.apiToken) {
      try {
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
                  id: article.sanityId,
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
        console.log("[upload-image] Patched mainImage on Sanity doc:", article.sanityId);
      } catch (patchErr) {
        console.warn("[upload-image] Failed to patch Sanity mainImage:", patchErr);
        sanityPatchError = (patchErr as Error).message;
      }
    }

    return NextResponse.json({
      assetId,
      articleId: id,
      sanityPatched: article.sanityId ? !sanityPatchError : false,
      sanityPatchError,
    });
  } catch (error) {
    if (isTableOrConnectionError(error)) {
      return errorJson(503, "DB_UNAVAILABLE", "Database is not available");
    }

    console.error("[upload-image] Error:", error);
    const message = error instanceof Error ? error.message : "Image upload failed";
    return errorJson(500, "INTERNAL_ERROR", message);
  }
}
