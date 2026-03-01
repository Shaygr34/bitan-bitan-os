/**
 * Unit tests for ContentBlock validation.
 *
 * Run: node --experimental-strip-types --test tests/content-blocks.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Inline validation logic (same as content-blocks.ts) ─────────────────────

function validateContentBlocks(blocks: unknown[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { valid: false, errors: ["blocks must be a non-empty array"] };
  }

  const validTypes = ["heading", "paragraph", "list", "quote", "callout", "divider", "table", "image"];
  let headingCount = 0;
  let paragraphCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as Record<string, unknown>;
    if (!block || typeof block !== "object") {
      errors.push(`block[${i}] is not an object`);
      continue;
    }
    if (!block.type || !validTypes.includes(block.type as string)) {
      errors.push(`block[${i}].type is invalid: ${block.type}`);
      continue;
    }
    if (block.type === "heading") {
      if (!block.text || typeof block.text !== "string") errors.push(`block[${i}] heading missing text`);
      if (block.level !== undefined && ((block.level as number) < 1 || (block.level as number) > 3))
        errors.push(`block[${i}] heading level must be 1-3`);
      headingCount++;
    }
    if (block.type === "paragraph") {
      if (!block.text || typeof block.text !== "string") errors.push(`block[${i}] paragraph missing text`);
      paragraphCount++;
    }
    if (block.type === "list") {
      if (!Array.isArray(block.items) || block.items.length === 0) errors.push(`block[${i}] list missing items`);
    }
    if (block.type === "quote") {
      if (!block.text || typeof block.text !== "string") errors.push(`block[${i}] quote missing text`);
    }
  }

  if (headingCount < 1) errors.push("must have at least 1 heading block");
  if (paragraphCount < 2) errors.push("must have at least 2 paragraph blocks");

  return { valid: errors.length === 0, errors };
}

function parseDraftResponse(text: string): { meta: Record<string, unknown>; blocks: unknown[] } | null {
  try {
    let jsonStr = text;
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) jsonStr = fenceMatch[1];
    const parsed = JSON.parse(jsonStr);
    if (parsed.meta && parsed.blocks) return parsed;
    if (Array.isArray(parsed)) return { meta: {}, blocks: parsed };
    return null;
  } catch {
    return null;
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("ContentBlock validation", () => {
  it("accepts valid blocks with heading and paragraphs", () => {
    const result = validateContentBlocks([
      { type: "heading", text: "כותרת", level: 1 },
      { type: "paragraph", text: "פסקה ראשונה" },
      { type: "paragraph", text: "פסקה שנייה" },
    ]);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("rejects empty array", () => {
    const result = validateContentBlocks([]);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("non-empty"));
  });

  it("rejects missing heading", () => {
    const result = validateContentBlocks([
      { type: "paragraph", text: "פסקה 1" },
      { type: "paragraph", text: "פסקה 2" },
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("heading")));
  });

  it("rejects fewer than 2 paragraphs", () => {
    const result = validateContentBlocks([
      { type: "heading", text: "כותרת", level: 1 },
      { type: "paragraph", text: "פסקה יחידה" },
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("2 paragraph")));
  });

  it("rejects invalid block type", () => {
    const result = validateContentBlocks([
      { type: "heading", text: "כותרת", level: 1 },
      { type: "paragraph", text: "פסקה 1" },
      { type: "paragraph", text: "פסקה 2" },
      { type: "unknown_type", text: "test" },
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("invalid")));
  });

  it("accepts full article with all block types", () => {
    const result = validateContentBlocks([
      { type: "heading", text: "כותרת ראשית", level: 1 },
      { type: "paragraph", text: "פסקת פתיחה" },
      { type: "heading", text: "כותרת משנה", level: 2 },
      { type: "paragraph", text: "תוכן עיקרי" },
      { type: "list", style: "bullet", items: ["פריט 1", "פריט 2"] },
      { type: "quote", text: "ציטוט", attribution: "מקור" },
      { type: "callout", title: "שימו לב", text: "הערה חשובה" },
      { type: "divider" },
      { type: "paragraph", text: "סיכום" },
    ]);
    assert.equal(result.valid, true);
  });

  it("rejects heading with invalid level", () => {
    const result = validateContentBlocks([
      { type: "heading", text: "כותרת", level: 5 },
      { type: "paragraph", text: "פסקה 1" },
      { type: "paragraph", text: "פסקה 2" },
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("level")));
  });

  it("rejects list with empty items", () => {
    const result = validateContentBlocks([
      { type: "heading", text: "כותרת", level: 1 },
      { type: "paragraph", text: "פסקה 1" },
      { type: "paragraph", text: "פסקה 2" },
      { type: "list", style: "bullet", items: [] },
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("list")));
  });
});

describe("parseDraftResponse", () => {
  it("parses valid JSON with meta and blocks", () => {
    const input = JSON.stringify({
      meta: { seoTitle: "test", seoDescription: "desc" },
      blocks: [{ type: "heading", text: "title", level: 1 }],
    });
    const result = parseDraftResponse(input);
    assert.ok(result);
    assert.ok(result.meta);
    assert.ok(result.blocks);
    assert.equal(result.blocks.length, 1);
  });

  it("parses JSON wrapped in code fence", () => {
    const input = "```json\n" + JSON.stringify({
      meta: { seoTitle: "test" },
      blocks: [{ type: "heading", text: "title", level: 1 }],
    }) + "\n```";
    const result = parseDraftResponse(input);
    assert.ok(result);
    assert.equal(result.blocks.length, 1);
  });

  it("parses bare blocks array", () => {
    const input = JSON.stringify([
      { type: "heading", text: "title", level: 1 },
      { type: "paragraph", text: "content" },
    ]);
    const result = parseDraftResponse(input);
    assert.ok(result);
    assert.equal(result.blocks.length, 2);
  });

  it("returns null for invalid JSON", () => {
    const result = parseDraftResponse("not json at all");
    assert.equal(result, null);
  });

  it("returns null for JSON without blocks or meta", () => {
    const result = parseDraftResponse(JSON.stringify({ foo: "bar" }));
    assert.equal(result, null);
  });
});
