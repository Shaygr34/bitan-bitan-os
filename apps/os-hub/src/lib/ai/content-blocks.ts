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
 *
 * Multiple extraction strategies for robustness:
 * 1. Strip markdown code fences (greedy and non-greedy patterns)
 * 2. Find outermost { ... } braces
 * 3. Repair common JSON issues (trailing commas)
 * 4. If all fail, return null
 */
/**
 * Attempt to repair truncated JSON by closing open brackets/braces and
 * removing trailing partial strings.
 */
function repairTruncatedJson(json: string): string {
  // Remove trailing partial string (unclosed quote)
  let fixed = json.replace(/,\s*"[^"]*$/, "");
  // Remove trailing comma before we close brackets
  fixed = fixed.replace(/,\s*$/, "");

  // Count open vs close brackets
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (const ch of fixed) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") openBraces++;
    if (ch === "}") openBraces--;
    if (ch === "[") openBrackets++;
    if (ch === "]") openBrackets--;
  }

  // Close any unclosed structures
  while (openBrackets > 0) { fixed += "]"; openBrackets--; }
  while (openBraces > 0) { fixed += "}"; openBraces--; }

  return fixed;
}

export function parseDraftResponse(text: string): DraftResponse | null {
  const jsonCandidates: string[] = [];
  const raw = text.trim();

  // Strategy 1: Greedy code fence extraction
  const fenceGreedy = raw.match(/```(?:json)?\s*\n([\s\S]*)\n\s*```/);
  if (fenceGreedy) {
    jsonCandidates.push(fenceGreedy[1].trim());
  }

  // Strategy 2: Non-greedy code fence extraction (first code block only)
  const fenceNonGreedy = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (fenceNonGreedy && fenceNonGreedy[1].trim() !== jsonCandidates[0]) {
    jsonCandidates.push(fenceNonGreedy[1].trim());
  }

  // Strategy 3: Code fence without strict newline requirements
  const fenceRelaxed = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceRelaxed) {
    const candidate = fenceRelaxed[1].trim();
    if (!jsonCandidates.includes(candidate)) {
      jsonCandidates.push(candidate);
    }
  }

  // Strategy 4: Find outermost { ... } (no code fence)
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1);
    if (!jsonCandidates.includes(candidate)) {
      jsonCandidates.push(candidate);
    }
  }

  // Strategy 5: Full text as-is (maybe it's just JSON)
  if (!jsonCandidates.includes(raw)) {
    jsonCandidates.push(raw);
  }

  console.log("[DRAFT] Attempting parse with", jsonCandidates.length, "strategies, text length:", raw.length);

  for (let i = 0; i < jsonCandidates.length; i++) {
    const jsonStr = jsonCandidates[i];
    const result = tryParseDraft(jsonStr, `strategy-${i + 1}`);
    if (result) return result;

    // Try with trailing comma repair
    const repaired = jsonStr.replace(/,\s*([\]}])/g, "$1");
    if (repaired !== jsonStr) {
      const repairedResult = tryParseDraft(repaired, `strategy-${i + 1}-repaired`);
      if (repairedResult) return repairedResult;
    }

    // Try with truncation repair: close all open brackets/braces
    const truncRepaired = repairTruncatedJson(jsonStr);
    if (truncRepaired !== jsonStr) {
      const truncResult = tryParseDraft(truncRepaired, `strategy-${i + 1}-trunc-repaired`);
      if (truncResult) return truncResult;
    }
  }

  console.error("[DRAFT] All parse strategies failed — raw preview:", raw.substring(0, 500));
  return null;
}

function tryParseDraft(jsonStr: string, label: string): DraftResponse | null {
  try {
    const parsed = JSON.parse(jsonStr);

    if (parsed.meta && parsed.blocks && Array.isArray(parsed.blocks)) {
      console.log(`[DRAFT] ${label}: Parsed {meta, blocks} — blocks:`, parsed.blocks.length);
      return parsed as DraftResponse;
    }

    // Maybe the whole response is just blocks array
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type) {
      console.log(`[DRAFT] ${label}: Parsed as bare blocks array, count:`, parsed.length);
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

    // Log what we got so we can debug
    console.warn(`[DRAFT] ${label}: Parsed JSON but missing meta/blocks. Keys:`, Object.keys(parsed), "Type:", typeof parsed);
    return null;
  } catch (err) {
    console.warn(`[DRAFT] ${label}: JSON.parse failed:`, (err as Error).message, "— preview:", jsonStr.slice(0, 100));
    return null;
  }
}
