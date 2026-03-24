/**
 * AI image generation for article hero images.
 * Uses Google Gemini + Sanity CDN upload.
 */

import { GoogleGenAI } from "@google/genai";
import { sanityConfig } from "@/config/integrations";

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.0-flash-exp";

const CATEGORY_VISUALS: Record<string, string> = {
  "real-estate-tax": "buildings, property outlines, house silhouettes, land plots, keys",
  "tax-planning": "calendar pages, planning charts, timeline arrows, strategy diagrams",
  "corporate-tax": "office towers, corporate buildings, boardroom table, business charts",
  "employee-tax": "payroll documents, office workspace items, salary slips",
  vat: "receipt rolls, cash register, shopping bags, invoice documents",
  "tax-credits": "coins flowing, credit cards, money returning arrows, piggy bank",
  legislation: "gavel, law books, parliament building, newspaper headlines",
  bookkeeping: "ledger books, calculator, spreadsheet grids, filing cabinets",
  grants: "hands receiving, gift box, government building, upward arrows, growth seedlings",
  "tax-refunds": "money returning, refund arrows, coins flowing back",
  "severance-pay": "handshake, employment contract, calculator, coins stacking",
  mortgage: "house with key, bank building, loan documents, percentage symbols",
};
const DEFAULT_VISUALS = "documents, calculator, pen, coins, abstract geometric financial shapes";

function buildPrompt(title: string, category?: string | null): string {
  const visuals = (category && CATEGORY_VISUALS[category]) || DEFAULT_VISUALS;
  return `Professional financial illustration for a Hebrew CPA firm website. Clean, modern isometric style with rich depth, dimension and detailed textures. Color palette: deep navy blue (#102040) dominant, gold (#C5A572) accents and highlights, white and light elements for contrast. Topic: ${title}. Include: ${visuals}. Wide format 16:9. Premium, corporate, trustworthy aesthetic. No photographs, no people, no text, no letters, no words in any language. Detailed, layered composition with subtle shadows and depth.`;
}

/**
 * Generate an image using Gemini and return the raw PNG buffer.
 */
export async function generateArticleImage(
  title: string,
  category?: string | null,
): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY not configured");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(title, category);

  console.log("[image-gen] Generating image for:", title);
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseModalities: ["image"],
    },
  });

  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) {
    throw new Error("No parts in Gemini response");
  }

  for (const part of parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  throw new Error("No image data in Gemini response");
}

/**
 * Upload a PNG buffer to Sanity CDN and return the asset _id.
 */
export async function uploadImageToSanity(
  imageBuffer: Buffer,
  filename: string,
): Promise<string> {
  const url = `https://${sanityConfig.projectId}.api.sanity.io/v2024-01-01/assets/images/${sanityConfig.dataset}?filename=${filename}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sanityConfig.apiToken}`,
      "Content-Type": "image/png",
    },
    body: new Uint8Array(imageBuffer),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sanity upload failed (${resp.status}): ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  const assetId = data.document?._id;
  if (!assetId) {
    throw new Error("No asset ID in Sanity upload response");
  }

  console.log("[image-gen] Uploaded to Sanity:", assetId);
  return assetId;
}

/**
 * Generate + upload: full pipeline.
 */
export async function generateAndUploadImage(
  title: string,
  slug: string,
  category?: string | null,
): Promise<{ assetId: string }> {
  const imageBuffer = await generateArticleImage(title, category);
  const filename = `cf-${slug}.png`;
  const assetId = await uploadImageToSanity(imageBuffer, filename);
  return { assetId };
}
