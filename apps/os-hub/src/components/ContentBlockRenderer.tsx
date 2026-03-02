"use client";

import type { ContentBlock } from "@/lib/ai/content-blocks";
import styles from "./ContentBlockRenderer.module.css";

interface Props {
  blocks: ContentBlock[];
}

/**
 * Normalize raw bodyBlocks from the DB into a clean ContentBlock[].
 * Handles edge cases: double-wrapped arrays, {meta, blocks} objects,
 * stringified JSON, unknown types, and missing text fields.
 */
function normalizeBlocks(raw: unknown): ContentBlock[] {
  if (!raw) return [];

  // If it's a string, try to parse it as JSON
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      // If it's just text, wrap it as a paragraph
      return [{ type: "paragraph", text: raw as string }];
    }
  }

  // If it's { meta, blocks } (the full DraftResponse stored by mistake)
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "blocks" in raw) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.blocks)) {
      return normalizeBlocks(obj.blocks);
    }
  }

  // If it's not an array at this point, can't render
  if (!Array.isArray(raw)) return [];

  // If it's a double-wrapped array [[...]]
  if (raw.length === 1 && Array.isArray(raw[0])) {
    return normalizeBlocks(raw[0]);
  }

  const validTypes = new Set(["heading", "paragraph", "list", "quote", "callout", "divider", "table", "image"]);
  const blocks: ContentBlock[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const block = item as ContentBlock;

    // Skip blocks with invalid/missing type
    if (!block.type || !validTypes.has(block.type)) {
      // If it has text, render as paragraph anyway
      if (block.text && typeof block.text === "string") {
        blocks.push({ type: "paragraph", text: block.text });
      }
      continue;
    }

    blocks.push(block);
  }

  return blocks;
}

function renderInlineHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, "<br/>");
}

function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "heading": {
      const level = block.level ?? 1;
      const Tag = level === 3 ? "h3" : level === 2 ? "h2" : "h1";
      const cls = level === 3 ? styles.h3 : level === 2 ? styles.h2 : styles.h1;
      return <Tag className={cls}>{block.text}</Tag>;
    }

    case "paragraph":
      if (!block.text) return null;
      return (
        <p
          className={styles.paragraph}
          dangerouslySetInnerHTML={{ __html: renderInlineHtml(block.text) }}
        />
      );

    case "list": {
      const items = block.items ?? [];
      if (items.length === 0) return null;
      const ListTag = block.style === "number" ? "ol" : "ul";
      return (
        <ListTag className={styles.list}>
          {items.map((item, i) => (
            <li
              key={i}
              className={styles.listItem}
              dangerouslySetInnerHTML={{ __html: renderInlineHtml(item) }}
            />
          ))}
        </ListTag>
      );
    }

    case "quote":
      if (!block.text) return null;
      return (
        <blockquote className={styles.quote}>
          <p dangerouslySetInnerHTML={{ __html: renderInlineHtml(block.text) }} />
          {block.attribution && (
            <footer className={styles.quoteAttribution}>— {block.attribution}</footer>
          )}
        </blockquote>
      );

    case "callout":
      return (
        <div className={styles.callout}>
          {block.title && <div className={styles.calloutTitle}>{block.title}</div>}
          {block.text && (
            <div dangerouslySetInnerHTML={{ __html: renderInlineHtml(block.text) }} />
          )}
        </div>
      );

    case "divider":
      return <hr className={styles.divider} />;

    case "table":
      return (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            {block.headers && (
              <thead>
                <tr>
                  {block.headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
            )}
            {block.rows && (
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      );

    default:
      return null;
  }
}

export default function ContentBlockRenderer({ blocks }: Props) {
  const normalized = normalizeBlocks(blocks);
  if (normalized.length === 0) return null;

  return (
    <div className={styles.articleBody}>
      {normalized.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </div>
  );
}
