"use client";

import type { ContentBlock } from "@/lib/ai/content-blocks";
import styles from "./ContentBlockRenderer.module.css";

interface Props {
  blocks: ContentBlock[];
}

function renderInlineHtml(text: string): string {
  // Convert markdown-style bold, italic, and links to HTML
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "heading": {
      const Tag = block.level === 3 ? "h3" : block.level === 2 ? "h2" : "h1";
      return <Tag className={styles[`h${block.level ?? 1}`]}>{block.text}</Tag>;
    }

    case "paragraph":
      return (
        <p
          className={styles.paragraph}
          dangerouslySetInnerHTML={{ __html: renderInlineHtml(block.text ?? "") }}
        />
      );

    case "list": {
      const ListTag = block.style === "number" ? "ol" : "ul";
      return (
        <ListTag className={styles.list}>
          {(block.items ?? []).map((item, i) => (
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
      return (
        <blockquote className={styles.quote}>
          <p dangerouslySetInnerHTML={{ __html: renderInlineHtml(block.text ?? "") }} />
          {block.attribution && (
            <footer className={styles.quoteAttribution}>— {block.attribution}</footer>
          )}
        </blockquote>
      );

    case "callout":
      return (
        <div className={styles.callout}>
          {block.title && <div className={styles.calloutTitle}>{block.title}</div>}
          <div dangerouslySetInnerHTML={{ __html: renderInlineHtml(block.text ?? "") }} />
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
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className={styles.articleBody}>
      {blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </div>
  );
}
