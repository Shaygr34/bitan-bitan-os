/**
 * ContentBlock JSON schema and validation.
 *
 * ContentBlocks are the canonical intermediate format for article bodies:
 * AI generates them → we validate → we store in Article.bodyBlocks → we convert to Portable Text for Sanity.
 */

export interface ContentBlock {
  type: "heading" | "paragraph" | "list" | "quote" | "callout" | "divider" | "table" | "image";
  text?: string;
  level?: number;        // heading level: 1, 2, 3
  items?: string[];      // list items
  style?: string;        // list style: "bullet" | "number"
  attribution?: string;  // quote attribution
  title?: string;        // callout title
  headers?: string[];    // table headers
  rows?: string[][];     // table rows
  src?: string;          // image source
  alt?: string;          // image alt text
}

export interface DraftMeta {
  seoTitle: string;
  seoDescription: string;
  excerpt: string;
  tldr: string;
  difficulty: "basic" | "intermediate" | "advanced";
  checklist: string[];
}

export interface DraftResponse {
  meta: DraftMeta;
  blocks: ContentBlock[];
}

/**
 * Validate a ContentBlock array. Must have at least 1 heading and 2 paragraphs.
 */
export function validateContentBlocks(blocks: unknown[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { valid: false, errors: ["blocks must be a non-empty array"] };
  }

  const validTypes = ["heading", "paragraph", "list", "quote", "callout", "divider", "table", "image"];

  let headingCount = 0;
  let paragraphCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as ContentBlock;

    if (!block || typeof block !== "object") {
      errors.push(`block[${i}] is not an object`);
      continue;
    }

    if (!block.type || !validTypes.includes(block.type)) {
      errors.push(`block[${i}].type is invalid: ${block.type}`);
      continue;
    }

    if (block.type === "heading") {
      if (!block.text || typeof block.text !== "string") {
        errors.push(`block[${i}] heading missing text`);
      }
      if (block.level !== undefined && (block.level < 1 || block.level > 3)) {
        errors.push(`block[${i}] heading level must be 1-3`);
      }
      headingCount++;
    }

    if (block.type === "paragraph") {
      if (!block.text || typeof block.text !== "string") {
        errors.push(`block[${i}] paragraph missing text`);
      }
      paragraphCount++;
    }

    if (block.type === "list") {
      if (!Array.isArray(block.items) || block.items.length === 0) {
        errors.push(`block[${i}] list missing items`);
      }
    }

    if (block.type === "quote") {
      if (!block.text || typeof block.text !== "string") {
        errors.push(`block[${i}] quote missing text`);
      }
    }
  }

  if (headingCount < 1) {
    errors.push("must have at least 1 heading block");
  }
  if (paragraphCount < 2) {
    errors.push("must have at least 2 paragraph blocks");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Parse a Claude response into DraftResponse (meta + blocks).
 * The response should be a JSON object with "meta" and "blocks" fields.
 */
export function parseDraftResponse(text: string): DraftResponse | null {
  try {
    // Try to extract JSON from the response (may be wrapped in markdown code fence)
    let jsonStr = text;

    // Strip markdown code fence if present
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1];
    }

    const parsed = JSON.parse(jsonStr);

    if (parsed.meta && parsed.blocks) {
      return parsed as DraftResponse;
    }

    // Maybe the whole response is just blocks array
    if (Array.isArray(parsed)) {
      return {
        meta: {
          seoTitle: "",
          seoDescription: "",
          excerpt: "",
          tldr: "",
          difficulty: "basic",
          checklist: [],
        },
        blocks: parsed,
      };
    }

    return null;
  } catch {
    return null;
  }
}
