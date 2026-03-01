/**
 * ContentBlock → Portable Text converter.
 *
 * Converts our canonical ContentBlock JSON format into Sanity Portable Text blocks.
 * Handles: heading, paragraph, list, quote, callout, table, divider (skip), image (skip in v0).
 * Inline marks: **bold** → strong, *italic* → em, [text](url) → link markDef.
 */

import { randomUUID } from "crypto";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PTSpan {
  _type: "span";
  _key: string;
  text: string;
  marks: string[];
}

export interface PTMarkDef {
  _type: "link";
  _key: string;
  href: string;
}

export interface PTBlock {
  _type: "block";
  _key: string;
  style: string;
  markDefs: PTMarkDef[];
  children: PTSpan[];
  listItem?: string;
  level?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  level?: number;
  items?: string[];
  style?: string;
  attribution?: string;
  title?: string;
  headers?: string[];
  rows?: string[][];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateKey(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Parse inline marks from text:
 * - **bold** → strong decorator
 * - *italic* → em decorator
 * - [text](url) → link markDef
 */
export function parseInlineMarks(text: string): {
  children: PTSpan[];
  markDefs: PTMarkDef[];
} {
  const children: PTSpan[] = [];
  const markDefs: PTMarkDef[] = [];

  // Regex to match: **bold**, *italic*, [link text](url)
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((.+?)\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before this match as plain span
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      if (beforeText) {
        children.push({
          _type: "span",
          _key: generateKey(),
          text: beforeText,
          marks: [],
        });
      }
    }

    if (match[2]) {
      // **bold**
      children.push({
        _type: "span",
        _key: generateKey(),
        text: match[2],
        marks: ["strong"],
      });
    } else if (match[3]) {
      // *italic*
      children.push({
        _type: "span",
        _key: generateKey(),
        text: match[3],
        marks: ["em"],
      });
    } else if (match[4] && match[5]) {
      // [link text](url)
      const linkKey = generateKey();
      markDefs.push({
        _type: "link",
        _key: linkKey,
        href: match[5],
      });
      children.push({
        _type: "span",
        _key: generateKey(),
        text: match[4],
        marks: [linkKey],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      children.push({
        _type: "span",
        _key: generateKey(),
        text: remainingText,
        marks: [],
      });
    }
  }

  // If no children were created (no inline marks), create single plain span
  if (children.length === 0) {
    children.push({
      _type: "span",
      _key: generateKey(),
      text: text,
      marks: [],
    });
  }

  return { children, markDefs };
}

// ── Main converter ──────────────────────────────────────────────────────────

export function convertBlocksToPortableText(blocks: ContentBlock[]): PTBlock[] {
  const result: PTBlock[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const level = block.level ?? 2;
        const { children, markDefs } = parseInlineMarks(block.text ?? "");
        result.push({
          _type: "block",
          _key: generateKey(),
          style: `h${level}`,
          markDefs,
          children,
        });
        break;
      }

      case "paragraph": {
        const { children, markDefs } = parseInlineMarks(block.text ?? "");
        result.push({
          _type: "block",
          _key: generateKey(),
          style: "normal",
          markDefs,
          children,
        });
        break;
      }

      case "list": {
        const listType = block.style === "number" ? "number" : "bullet";
        for (const item of block.items ?? []) {
          const { children, markDefs } = parseInlineMarks(item);
          result.push({
            _type: "block",
            _key: generateKey(),
            style: "normal",
            listItem: listType,
            level: 1,
            markDefs,
            children,
          });
        }
        break;
      }

      case "quote": {
        const { children, markDefs } = parseInlineMarks(block.text ?? "");
        result.push({
          _type: "block",
          _key: generateKey(),
          style: "blockquote",
          markDefs,
          children,
        });
        if (block.attribution) {
          result.push({
            _type: "block",
            _key: generateKey(),
            style: "normal",
            markDefs: [],
            children: [{
              _type: "span",
              _key: generateKey(),
              text: `— ${block.attribution}`,
              marks: ["em"],
            }],
          });
        }
        break;
      }

      case "callout": {
        const title = block.title ? `${block.title}: ` : "";
        const { children, markDefs } = parseInlineMarks(`${title}${block.text ?? ""}`);
        result.push({
          _type: "block",
          _key: generateKey(),
          style: "blockquote",
          markDefs,
          children,
        });
        break;
      }

      case "table": {
        if (block.headers && block.headers.length > 0) {
          result.push({
            _type: "block",
            _key: generateKey(),
            style: "normal",
            markDefs: [],
            children: [{
              _type: "span",
              _key: generateKey(),
              text: block.headers.join(" | "),
              marks: ["strong"],
            }],
          });
        }
        for (const row of block.rows ?? []) {
          result.push({
            _type: "block",
            _key: generateKey(),
            style: "normal",
            markDefs: [],
            children: [{
              _type: "span",
              _key: generateKey(),
              text: row.join(" | "),
              marks: [],
            }],
          });
        }
        break;
      }

      case "divider":
        // Sanity standard PT has no HR block; skip
        break;

      case "image":
        // Skip in v0 — AI articles won't have inline images
        break;
    }
  }

  return result;
}
