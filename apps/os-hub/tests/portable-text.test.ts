/**
 * Unit tests for Portable Text conversion.
 *
 * Run: node --experimental-strip-types --test tests/portable-text.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";

// ── Inline parseInlineMarks (same logic as portable-text.ts) ────────────────

function generateKey(): string {
  return randomUUID().slice(0, 8);
}

interface PTSpan { _type: "span"; _key: string; text: string; marks: string[] }
interface PTMarkDef { _type: "link"; _key: string; href: string }
interface PTBlock {
  _type: "block"; _key: string; style: string;
  markDefs: PTMarkDef[]; children: PTSpan[];
  listItem?: string; level?: number;
}

function parseInlineMarks(text: string): { children: PTSpan[]; markDefs: PTMarkDef[] } {
  const children: PTSpan[] = [];
  const markDefs: PTMarkDef[] = [];
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      if (beforeText) children.push({ _type: "span", _key: generateKey(), text: beforeText, marks: [] });
    }
    if (match[2]) {
      children.push({ _type: "span", _key: generateKey(), text: match[2], marks: ["strong"] });
    } else if (match[3]) {
      children.push({ _type: "span", _key: generateKey(), text: match[3], marks: ["em"] });
    } else if (match[4] && match[5]) {
      const linkKey = generateKey();
      markDefs.push({ _type: "link", _key: linkKey, href: match[5] });
      children.push({ _type: "span", _key: generateKey(), text: match[4], marks: [linkKey] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText) children.push({ _type: "span", _key: generateKey(), text: remainingText, marks: [] });
  }
  if (children.length === 0) {
    children.push({ _type: "span", _key: generateKey(), text, marks: [] });
  }
  return { children, markDefs };
}

interface ContentBlock {
  type: string; text?: string; level?: number; items?: string[];
  style?: string; attribution?: string; title?: string;
  headers?: string[]; rows?: string[][];
}

function convertBlocksToPortableText(blocks: ContentBlock[]): PTBlock[] {
  const result: PTBlock[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const level = block.level ?? 2;
        const { children, markDefs } = parseInlineMarks(block.text ?? "");
        result.push({ _type: "block", _key: generateKey(), style: `h${level}`, markDefs, children });
        break;
      }
      case "paragraph": {
        const { children, markDefs } = parseInlineMarks(block.text ?? "");
        result.push({ _type: "block", _key: generateKey(), style: "normal", markDefs, children });
        break;
      }
      case "list": {
        const listType = block.style === "number" ? "number" : "bullet";
        for (const item of block.items ?? []) {
          const { children, markDefs } = parseInlineMarks(item);
          result.push({ _type: "block", _key: generateKey(), style: "normal", listItem: listType, level: 1, markDefs, children });
        }
        break;
      }
      case "quote": {
        const { children, markDefs } = parseInlineMarks(block.text ?? "");
        result.push({ _type: "block", _key: generateKey(), style: "blockquote", markDefs, children });
        if (block.attribution) {
          result.push({
            _type: "block", _key: generateKey(), style: "normal", markDefs: [],
            children: [{ _type: "span", _key: generateKey(), text: `— ${block.attribution}`, marks: ["em"] }],
          });
        }
        break;
      }
      case "callout": {
        const title = block.title ? `${block.title}: ` : "";
        const { children, markDefs } = parseInlineMarks(`${title}${block.text ?? ""}`);
        result.push({ _type: "block", _key: generateKey(), style: "blockquote", markDefs, children });
        break;
      }
      case "table": {
        if (block.headers && block.headers.length > 0) {
          result.push({
            _type: "block", _key: generateKey(), style: "normal", markDefs: [],
            children: [{ _type: "span", _key: generateKey(), text: block.headers.join(" | "), marks: ["strong"] }],
          });
        }
        for (const row of block.rows ?? []) {
          result.push({
            _type: "block", _key: generateKey(), style: "normal", markDefs: [],
            children: [{ _type: "span", _key: generateKey(), text: row.join(" | "), marks: [] }],
          });
        }
        break;
      }
      case "divider": break;
      case "image": break;
    }
  }
  return result;
}

function slugifyHebrew(input: string): string {
  return input.trim().replace(/\s+/g, "-").replace(/[^\u0590-\u05FFa-zA-Z0-9-]/g, "").slice(0, 96);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Portable Text conversion", () => {
  it("converts heading to correct style", () => {
    const result = convertBlocksToPortableText([
      { type: "heading", text: "כותרת ראשית", level: 1 },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].style, "h1");
    assert.equal(result[0].children[0].text, "כותרת ראשית");
  });

  it("converts h2 and h3 headings", () => {
    const result = convertBlocksToPortableText([
      { type: "heading", text: "h2", level: 2 },
      { type: "heading", text: "h3", level: 3 },
    ]);
    assert.equal(result[0].style, "h2");
    assert.equal(result[1].style, "h3");
  });

  it("converts paragraph to normal style", () => {
    const result = convertBlocksToPortableText([
      { type: "paragraph", text: "פסקה פשוטה" },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].style, "normal");
    assert.equal(result[0].children[0].text, "פסקה פשוטה");
  });

  it("converts bullet list to multiple blocks with listItem", () => {
    const result = convertBlocksToPortableText([
      { type: "list", style: "bullet", items: ["פריט 1", "פריט 2", "פריט 3"] },
    ]);
    assert.equal(result.length, 3);
    assert.equal(result[0].listItem, "bullet");
    assert.equal(result[0].level, 1);
    assert.equal(result[2].children[0].text, "פריט 3");
  });

  it("converts numbered list", () => {
    const result = convertBlocksToPortableText([
      { type: "list", style: "number", items: ["צעד 1", "צעד 2"] },
    ]);
    assert.equal(result.length, 2);
    assert.equal(result[0].listItem, "number");
  });

  it("converts quote to blockquote style", () => {
    const result = convertBlocksToPortableText([
      { type: "quote", text: "ציטוט חשוב" },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].style, "blockquote");
  });

  it("adds attribution after quote", () => {
    const result = convertBlocksToPortableText([
      { type: "quote", text: "ציטוט", attribution: "רשות המסים" },
    ]);
    assert.equal(result.length, 2);
    assert.equal(result[0].style, "blockquote");
    assert.equal(result[1].style, "normal");
    assert.ok(result[1].children[0].text.includes("רשות המסים"));
    assert.ok(result[1].children[0].marks.includes("em"));
  });

  it("converts callout to blockquote", () => {
    const result = convertBlocksToPortableText([
      { type: "callout", title: "שימו לב", text: "הערה חשובה" },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].style, "blockquote");
    assert.ok(result[0].children[0].text.includes("שימו לב"));
  });

  it("flattens table to text blocks", () => {
    const result = convertBlocksToPortableText([
      { type: "table", headers: ["עמודה 1", "עמודה 2"], rows: [["א", "ב"], ["ג", "ד"]] },
    ]);
    assert.equal(result.length, 3); // 1 header + 2 rows
    assert.ok(result[0].children[0].marks.includes("strong"));
    assert.ok(result[0].children[0].text.includes("עמודה 1"));
  });

  it("skips divider blocks", () => {
    const result = convertBlocksToPortableText([{ type: "divider" }]);
    assert.equal(result.length, 0);
  });

  it("skips image blocks", () => {
    const result = convertBlocksToPortableText([{ type: "image" }]);
    assert.equal(result.length, 0);
  });

  it("preserves Hebrew text through conversion", () => {
    const result = convertBlocksToPortableText([
      { type: "paragraph", text: "מס הכנסה: שינויים בשנת 2026" },
    ]);
    assert.equal(result[0].children[0].text, "מס הכנסה: שינויים בשנת 2026");
  });

  it("generates unique _key for each block", () => {
    const result = convertBlocksToPortableText([
      { type: "paragraph", text: "a" },
      { type: "paragraph", text: "b" },
    ]);
    assert.notEqual(result[0]._key, result[1]._key);
  });
});

describe("Inline mark parsing", () => {
  it("parses bold text", () => {
    const { children } = parseInlineMarks("טקסט **מודגש** רגיל");
    assert.equal(children.length, 3);
    assert.equal(children[0].text, "טקסט ");
    assert.equal(children[1].text, "מודגש");
    assert.ok(children[1].marks.includes("strong"));
    assert.equal(children[2].text, " רגיל");
  });

  it("parses italic text", () => {
    const { children } = parseInlineMarks("טקסט *נטוי* רגיל");
    assert.equal(children.length, 3);
    assert.equal(children[1].text, "נטוי");
    assert.ok(children[1].marks.includes("em"));
  });

  it("parses link", () => {
    const { children, markDefs } = parseInlineMarks("לחץ [כאן](https://example.com) לקריאה");
    assert.equal(children.length, 3);
    assert.equal(children[1].text, "כאן");
    assert.equal(markDefs.length, 1);
    assert.equal(markDefs[0].href, "https://example.com");
    assert.ok(children[1].marks.includes(markDefs[0]._key));
  });

  it("handles plain text without marks", () => {
    const { children, markDefs } = parseInlineMarks("טקסט רגיל ללא עיצוב");
    assert.equal(children.length, 1);
    assert.equal(children[0].text, "טקסט רגיל ללא עיצוב");
    assert.equal(children[0].marks.length, 0);
    assert.equal(markDefs.length, 0);
  });

  it("handles multiple marks in one text", () => {
    const { children } = parseInlineMarks("**bold** and *italic* together");
    assert.ok(children.some((c) => c.marks.includes("strong")));
    assert.ok(children.some((c) => c.marks.includes("em")));
  });
});

describe("Hebrew slugify", () => {
  it("converts spaces to hyphens", () => {
    assert.equal(slugifyHebrew("מס הכנסה"), "מס-הכנסה");
  });

  it("removes special characters", () => {
    assert.equal(slugifyHebrew("מס: הכנסה!"), "מס-הכנסה");
  });

  it("keeps Hebrew and Latin characters", () => {
    assert.equal(slugifyHebrew("מס Tax 2024"), "מס-Tax-2024");
  });

  it("truncates to 96 characters", () => {
    const long = "א".repeat(200);
    assert.ok(slugifyHebrew(long).length <= 96);
  });

  it("trims whitespace", () => {
    assert.equal(slugifyHebrew("  מס הכנסה  "), "מס-הכנסה");
  });

  it("handles quotes", () => {
    assert.equal(slugifyHebrew("מס רכישה (נדל\"ן)"), "מס-רכישה-נדלן");
  });
});
