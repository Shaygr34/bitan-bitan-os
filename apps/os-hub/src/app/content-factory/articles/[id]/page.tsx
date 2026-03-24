"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ContentBlockRenderer, { normalizeBlocks } from "@/components/ContentBlockRenderer";
import { showToast } from "@/components/Toast";
import { t } from "@/lib/strings";
import type { ContentBlock } from "@/lib/ai/content-blocks";
import styles from "./page.module.css";

/* ═══ Types ═══ */

interface PublishJob {
  id: string;
  status: string;
  method: string;
  externalUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface Asset {
  id: string;
  platform: string;
  status: string;
  version: number;
  contentPayload: Record<string, string> | null;
  publishJobs: PublishJob[];
  createdAt: string;
}

interface IdeaSource {
  id: string;
  name: string;
  nameHe: string | null;
}

interface Idea {
  id: string;
  title: string;
  sourceUrl: string | null;
  source: IdeaSource | null;
}

interface Article {
  id: string;
  title: string;
  subtitle: string | null;
  status: string;
  version: number;
  distributionStatus: string;
  updatedAt: string;
  assets: Asset[];
  bodyBlocks?: unknown;
  bodyText?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  sanityId?: string | null;
  sanityUrl?: string | null;
  aiGenerated?: boolean;
  category?: string | null;
  slug?: string | null;
  tags?: string[];
  idea?: Idea | null;
}

/* ═══ Constants ═══ */

const PLATFORMS = ["WEBSITE", "EMAIL", "FACEBOOK", "INSTAGRAM", "LINKEDIN"];

const PLATFORM_HE: Record<string, string> = {
  WEBSITE: "אתר",
  EMAIL: "אימייל",
  FACEBOOK: "פייסבוק",
  INSTAGRAM: "אינסטגרם",
  LINKEDIN: "לינקדאין",
};

const CATEGORY_HE: Record<string, string> = {
  Tax: "מיסים",
  Legal: "משפט ורגולציה",
  "Business-News": "חדשות עסקיות",
  Markets: "שוק ההון",
  Payroll: "שכר ותעסוקה",
};

const TAG_HE: Record<string, string> = {
  "court-ruling": "פסיקה",
  compliance: "ציות ורגולציה",
  "corp-tax": "מס חברות",
  "real-estate-tax": "מיסוי מקרקעין",
  "income-tax": "מס הכנסה",
  VAT: "מע״מ",
  grants: "מענקים",
  "interest-rates": "ריביות",
  enforcement: "אכיפה",
  payroll: "שכר",
  "employment-law": "דיני עבודה",
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "statusDraft",
  IN_REVIEW: "statusInReview",
  APPROVED: "statusApproved",
  ARCHIVED: "statusArchived",
};

const DIST_CLASS: Record<string, string> = {
  NOT_PUBLISHED: "distNotPublished",
  PARTIALLY_PUBLISHED: "distPartial",
  FULLY_PUBLISHED: "distFull",
};

const ARTICLE_TRANSITIONS: Record<string, { to: string; labelKey: string; variant: string }[]> = {
  DRAFT: [
    { to: "IN_REVIEW", labelKey: "contentFactory.transition.submitReview", variant: "btn-primary" },
    { to: "ARCHIVED", labelKey: "contentFactory.transition.archive", variant: "btn-ghost" },
  ],
  IN_REVIEW: [
    { to: "APPROVED", labelKey: "contentFactory.transition.approve", variant: "btn-primary" },
    { to: "DRAFT", labelKey: "contentFactory.transition.reject", variant: "btn-secondary" },
    { to: "ARCHIVED", labelKey: "contentFactory.transition.archive", variant: "btn-ghost" },
  ],
  APPROVED: [
    { to: "ARCHIVED", labelKey: "contentFactory.transition.archive", variant: "btn-ghost" },
  ],
  ARCHIVED: [],
};

const ASSET_TRANSITIONS: Record<string, { to: string; labelKey: string; variant: string }[]> = {
  DRAFT: [
    { to: "IN_REVIEW", labelKey: "contentFactory.assets.submitReview", variant: "btn-primary" },
  ],
  IN_REVIEW: [
    { to: "APPROVED", labelKey: "contentFactory.assets.approve", variant: "btn-primary" },
    { to: "DRAFT", labelKey: "contentFactory.assets.reject", variant: "btn-secondary" },
  ],
  APPROVED: [],
};

/* ═══ Helpers ═══ */

function getNextActionHint(article: Article): { text: string; success: boolean } {
  if (article.distributionStatus === "FULLY_PUBLISHED") {
    return { text: t("contentFactory.nextAction.allPublished"), success: true };
  }
  if (article.status === "DRAFT") {
    return { text: "עריכת הטיוטה — עברו על התוכן, ערכו לפי הצורך, ואז שלחו לבדיקה.", success: false };
  }
  const hint = t(`contentFactory.nextAction.${article.status}`);
  return { text: hint, success: false };
}

/* ═══ BlockEditor — Inline editing for DRAFT articles ═══ */

const BLOCK_TYPE_LABELS: Record<string, string> = {
  heading: "כותרת",
  paragraph: "פסקה",
  list: "רשימה",
  quote: "ציטוט",
  callout: "הערה",
  divider: "קו הפרדה",
  table: "טבלה",
  image: "תמונה",
};

function autoRows(text: string | undefined, min: number): number {
  if (!text) return min;
  const lines = text.split("\n").length;
  const charLines = Math.ceil(text.length / 70);
  return Math.max(min, lines, charLines);
}

/**
 * Merge consecutive paragraph blocks into one block with \n\n separators.
 * This gives the editor a more natural feel — users edit sections, not sentences.
 */
function mergeConsecutiveParagraphs(blocks: ContentBlock[]): ContentBlock[] {
  const merged: ContentBlock[] = [];
  let pendingTexts: string[] = [];

  function flushPending() {
    if (pendingTexts.length > 0) {
      merged.push({ type: "paragraph", text: pendingTexts.join("\n\n") });
      pendingTexts = [];
    }
  }

  for (const block of blocks) {
    if (block.type === "paragraph" && block.text) {
      pendingTexts.push(block.text);
    } else {
      flushPending();
      merged.push(block);
    }
  }
  flushPending();

  return merged;
}

/**
 * Split merged paragraph blocks back into individual blocks (one per paragraph).
 * Opposite of mergeConsecutiveParagraphs — used when saving.
 */
function splitMergedParagraphs(blocks: ContentBlock[]): ContentBlock[] {
  const result: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph" && block.text && block.text.includes("\n\n")) {
      const parts = block.text.split("\n\n").map((t) => t.trim()).filter((t) => t.length > 0);
      for (const part of parts) {
        result.push({ type: "paragraph", text: part });
      }
    } else {
      result.push(block);
    }
  }
  return result;
}

function BlockEditor({
  blocks,
  onSave,
  saving,
}: {
  blocks: ContentBlock[];
  onSave: (blocks: ContentBlock[]) => void;
  saving: boolean;
}) {
  const [editBlocks, setEditBlocks] = useState<ContentBlock[]>(() => mergeConsecutiveParagraphs(blocks));
  const [dirty, setDirty] = useState(false);

  function updateBlock(index: number, updates: Partial<ContentBlock>) {
    setEditBlocks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
    setDirty(true);
  }

  function updateListItem(blockIndex: number, itemIndex: number, value: string) {
    setEditBlocks((prev) => {
      const next = [...prev];
      const items = [...(next[blockIndex].items ?? [])];
      items[itemIndex] = value;
      next[blockIndex] = { ...next[blockIndex], items };
      return next;
    });
    setDirty(true);
  }

  function addListItem(blockIndex: number) {
    setEditBlocks((prev) => {
      const next = [...prev];
      const items = [...(next[blockIndex].items ?? []), ""];
      next[blockIndex] = { ...next[blockIndex], items };
      return next;
    });
    setDirty(true);
  }

  function removeListItem(blockIndex: number, itemIndex: number) {
    setEditBlocks((prev) => {
      const next = [...prev];
      const items = (next[blockIndex].items ?? []).filter((_, i) => i !== itemIndex);
      next[blockIndex] = { ...next[blockIndex], items };
      return next;
    });
    setDirty(true);
  }

  function removeBlock(index: number) {
    setEditBlocks((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    setEditBlocks((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  function addBlock(type: ContentBlock["type"], afterIndex: number) {
    const newBlock: ContentBlock = type === "heading"
      ? { type: "heading", text: "", level: 2 }
      : type === "list"
        ? { type: "list", style: "bullet", items: [""] }
        : type === "quote"
          ? { type: "quote", text: "" }
          : type === "callout"
            ? { type: "callout", text: "", title: "" }
            : type === "divider"
              ? { type: "divider" }
              : { type: "paragraph", text: "" };

    setEditBlocks((prev) => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newBlock);
      return next;
    });
    setDirty(true);
  }

  return (
    <div className={styles.editorContainer}>
      {/* Save bar — sticky */}
      <div className={styles.editorToolbar}>
        <span className={styles.editorLabel}>
          {dirty ? "* יש שינויים שלא נשמרו" : "מצב עריכה"}
        </span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn-primary"
            disabled={!dirty || saving}
            onClick={() => onSave(splitMergedParagraphs(editBlocks))}
          >
            {saving ? "שומר..." : "שמור שינויים"}
          </button>
        </div>
      </div>

      {editBlocks.map((block, i) => (
        <div key={i} className={styles.editorBlock}>
          <div className={styles.editorBlockHeader}>
            <span className={styles.editorBlockType}>
              {BLOCK_TYPE_LABELS[block.type] ?? block.type}
              {block.type === "heading" && ` (${block.level ?? 1})`}
            </span>
            <div className={styles.editorBlockActions}>
              {i > 0 && (
                <button className={styles.editorSmallBtn} onClick={() => moveBlock(i, -1)} title="הזז למעלה">
                  ↑
                </button>
              )}
              {i < editBlocks.length - 1 && (
                <button className={styles.editorSmallBtn} onClick={() => moveBlock(i, 1)} title="הזז למטה">
                  ↓
                </button>
              )}
              {editBlocks.length > 1 && (
                <button className={styles.editorDeleteBtn} title="מחק בלוק" onClick={() => removeBlock(i)}>
                  מחק
                </button>
              )}
            </div>
          </div>

          {/* Text-based blocks: heading, paragraph, quote, callout */}
          {(block.type === "heading" || block.type === "paragraph" || block.type === "quote" || block.type === "callout") && (
            <>
              {block.type === "callout" && (
                <input
                  type="text"
                  className={styles.editorInput}
                  value={block.title ?? ""}
                  onChange={(e) => updateBlock(i, { title: e.target.value })}
                  placeholder="כותרת ההערה..."
                  style={{ marginBottom: "0.25rem", fontWeight: 600 }}
                />
              )}
              <textarea
                className={`${styles.editorTextarea} ${block.type === "heading" ? styles.editorHeadingInput : ""}`}
                value={block.text ?? ""}
                onChange={(e) => updateBlock(i, { text: e.target.value })}
                rows={block.type === "heading" ? 2 : autoRows(block.text, 3)}
                placeholder={
                  block.type === "heading" ? "כותרת..."
                    : block.type === "quote" ? "ציטוט..."
                      : block.type === "callout" ? "תוכן ההערה..."
                        : "תוכן הפסקה..."
                }
                dir="rtl"
              />
              {block.type === "quote" && (
                <input
                  type="text"
                  className={styles.editorInput}
                  value={block.attribution ?? ""}
                  onChange={(e) => updateBlock(i, { attribution: e.target.value })}
                  placeholder="מקור הציטוט (אופציונלי)..."
                  style={{ marginTop: "0.25rem", fontSize: "0.85rem" }}
                />
              )}
            </>
          )}

          {/* List block */}
          {block.type === "list" && (
            <div className={styles.editorListItems}>
              {(block.items ?? []).map((item, li) => (
                <div key={li} className={styles.editorListItem}>
                  <span className={styles.editorListBullet}>
                    {block.style === "number" ? `${li + 1}.` : "•"}
                  </span>
                  <input
                    type="text"
                    className={styles.editorInput}
                    value={item}
                    onChange={(e) => updateListItem(i, li, e.target.value)}
                    placeholder="פריט ברשימה..."
                    dir="rtl"
                  />
                  <button
                    className={styles.editorDeleteBtn}
                    onClick={() => removeListItem(i, li)}
                    title="הסר פריט"
                    style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button className={styles.editorSmallBtn} onClick={() => addListItem(i)}>
                + פריט
              </button>
            </div>
          )}

          {/* Divider */}
          {block.type === "divider" && (
            <hr style={{ border: "none", borderTop: "1px dashed #ccc", margin: "0.5rem 0" }} />
          )}

          {/* Add block row — between blocks */}
          <div className={styles.editorAddRow}>
            <button className={styles.editorAddBtn} onClick={() => addBlock("paragraph", i)}>+ פסקה</button>
            <button className={styles.editorAddBtn} onClick={() => addBlock("heading", i)}>+ כותרת</button>
            <button className={styles.editorAddBtn} onClick={() => addBlock("list", i)}>+ רשימה</button>
            <button className={styles.editorAddBtn} onClick={() => addBlock("quote", i)}>+ ציטוט</button>
            <button className={styles.editorAddBtn} onClick={() => addBlock("callout", i)}>+ הערה</button>
            <button className={styles.editorAddBtn} onClick={() => addBlock("divider", i)}>+ הפרדה</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══ Platform-specific content payload fields ═══ */

interface PayloadField {
  key: string;
  label: string;
  type: "text" | "textarea";
  placeholder: string;
  hint?: string;
}

const PLATFORM_PAYLOAD_FIELDS: Record<string, PayloadField[]> = {
  EMAIL: [
    { key: "subjectLine", label: "נושא המייל", type: "text", placeholder: "כותרת שתופיע בתיבת הדואר...", hint: "עד 60 תווים — ברור, ספציפי, עם ערך" },
    { key: "preheaderText", label: "טקסט מקדים", type: "text", placeholder: "תקציר שמופיע אחרי הנושא...", hint: "עד 90 תווים — משלים את הנושא" },
    { key: "ctaText", label: "כפתור CTA", type: "text", placeholder: "לקריאה המלאה" },
  ],
  FACEBOOK: [
    { key: "postText", label: "טקסט הפוסט", type: "textarea", placeholder: "תוכן הפוסט לפייסבוק...", hint: "עד 500 תווים — שפה נגישה, שורה ראשונה חזקה" },
    { key: "hashtags", label: "האשטגים", type: "text", placeholder: "#מיסים #חשבונאות #עדכון" },
  ],
  INSTAGRAM: [
    { key: "caption", label: "כיתוב", type: "textarea", placeholder: "טקסט הפוסט לאינסטגרם...", hint: "עד 2200 תווים — שורה ראשונה חזקה, רווחים בין פסקאות" },
    { key: "hashtags", label: "האשטגים", type: "text", placeholder: "#מיסים #חשבונאות #ביתן_את_ביתן" },
  ],
  LINKEDIN: [
    { key: "postText", label: "טקסט הפוסט", type: "textarea", placeholder: "תוכן הפוסט ללינקדאין...", hint: "טון מקצועי, שורה ראשונה חזקה, עד 3000 תווים" },
    { key: "hashtags", label: "האשטגים", type: "text", placeholder: "#Tax #Accounting #Israel" },
  ],
  WEBSITE: [
    { key: "metaTitle", label: "כותרת SEO", type: "text", placeholder: "כותרת לתוצאות חיפוש..." },
    { key: "metaDescription", label: "תיאור SEO", type: "text", placeholder: "תיאור עד 155 תווים..." },
  ],
};

/* ═══ AssetCard component ═══ */

function AssetCard({
  asset,
  onRefresh,
}: {
  asset: Asset;
  onRefresh: () => void;
}) {
  const [transitioning, setTransitioning] = useState(false);
  const [publishUrl, setPublishUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [errorDetail, setErrorDetail] = useState<{ code: string; message: string } | null>(null);
  const [showError, setShowError] = useState(false);
  const [editingPayload, setEditingPayload] = useState(false);
  const [payloadDraft, setPayloadDraft] = useState<Record<string, string>>({});
  const [savingPayload, setSavingPayload] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const transitions = ASSET_TRANSITIONS[asset.status] ?? [];
  const succeededJobs = asset.publishJobs.filter((j) => j.status === "SUCCEEDED");
  const failedJobs = asset.publishJobs.filter((j) => j.status === "FAILED");
  const canPublish = asset.status === "APPROVED";
  const fields = PLATFORM_PAYLOAD_FIELDS[asset.platform] ?? [];
  const payload = (asset.contentPayload ?? {}) as Record<string, string>;
  const hasPayload = Object.keys(payload).some((k) => payload[k]);

  function startEditPayload() {
    const draft: Record<string, string> = {};
    for (const f of fields) {
      draft[f.key] = payload[f.key] ?? "";
    }
    setPayloadDraft(draft);
    setEditingPayload(true);
  }

  async function savePayload() {
    setSavingPayload(true);
    try {
      const res = await fetch(`/api/content-factory/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentPayload: payloadDraft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      setEditingPayload(false);
      showToast({ type: "success", message: "התוכן נשמר" });
      onRefresh();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    } finally {
      setSavingPayload(false);
    }
  }

  async function handleTransition(to: string) {
    setTransitioning(true);
    setErrorDetail(null);
    try {
      const res = await fetch(`/api/content-factory/assets/${asset.id}/transition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, actorUserId: "system" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorDetail(data?.error ?? null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      onRefresh();
    } catch (err) {
      showToast({
        type: "error",
        message: `${t("contentFactory.error.transition")}: ${(err as Error).message}`,
      });
    } finally {
      setTransitioning(false);
    }
  }

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    if (!publishUrl.trim()) return;
    setPublishing(true);
    setErrorDetail(null);
    try {
      const res = await fetch(`/api/content-factory/assets/${asset.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalUrl: publishUrl.trim(),
          createdByUserId: "system",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorDetail(data?.error ?? null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      setPublishUrl("");
      showToast({ type: "success", message: t("contentFactory.publish.success") });
      onRefresh();
    } catch (err) {
      showToast({
        type: "error",
        message: `${t("contentFactory.error.publish")}: ${(err as Error).message}`,
      });
    } finally {
      setPublishing(false);
    }
  }

  async function handleRetry(jobId: string) {
    setRetrying(jobId);
    try {
      // Re-publish by creating a new publish job (same URL as original)
      const failedJob = asset.publishJobs.find((j) => j.id === jobId);
      const res = await fetch(`/api/content-factory/assets/${asset.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalUrl: failedJob?.externalUrl || "",
          createdByUserId: "system",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      showToast({ type: "success", message: "נוצרה עבודת פרסום חדשה" });
      onRefresh();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className={styles.assetCard}>
      <div className={styles.assetHeader}>
        <span className={styles.assetPlatform}>{PLATFORM_HE[asset.platform] ?? asset.platform}</span>
        <span className={`${styles.statusBadge} ${styles[STATUS_CLASS[asset.status] ?? "statusDraft"]}`}>
          {t(`contentFactory.status.${asset.status}`)}
        </span>
      </div>

      <div className={styles.assetMeta}>
        <span>{t("contentFactory.article.version")}: {asset.version}</span>
        <span>{succeededJobs.length > 0 ? `${succeededJobs.length} ${t("contentFactory.publishJob.SUCCEEDED")}` : ""}</span>
      </div>

      {/* Platform-specific content payload — read mode */}
      {hasPayload && !editingPayload && (
        <div className={styles.assetPayloadEditor}>
          <div className={styles.assetPayloadTitle}>
            תוכן לפלטפורמה
            {asset.status === "DRAFT" && (
              <button className={styles.editorSmallBtn} onClick={startEditPayload} style={{ marginInlineStart: "0.5rem" }}>
                ערוך
              </button>
            )}
          </div>
          {fields.map((f) => payload[f.key] ? (
            <div key={f.key} className={styles.payloadFieldGroup}>
              <label>{f.label}</label>
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-body)" }}>{payload[f.key]}</span>
            </div>
          ) : null)}
        </div>
      )}

      {/* Platform-specific content payload — edit mode */}
      {editingPayload && fields.length > 0 && (
        <div className={styles.assetPayloadEditor}>
          <div className={styles.assetPayloadTitle}>עריכת תוכן — {PLATFORM_HE[asset.platform] ?? asset.platform}</div>
          {fields.map((f) => (
            <div key={f.key} className={styles.payloadFieldGroup}>
              <label>{f.label}</label>
              {f.type === "textarea" ? (
                <textarea
                  value={payloadDraft[f.key] ?? ""}
                  onChange={(e) => setPayloadDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  rows={3}
                />
              ) : (
                <input
                  type="text"
                  value={payloadDraft[f.key] ?? ""}
                  onChange={(e) => setPayloadDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
              )}
              {f.hint && <span className={styles.payloadHint}>{f.hint}</span>}
            </div>
          ))}
          <div className={styles.payloadActions}>
            <button className="btn-primary" onClick={savePayload} disabled={savingPayload}>
              {savingPayload ? "שומר..." : "שמור"}
            </button>
            <button className="btn-secondary" onClick={() => setEditingPayload(false)}>ביטול</button>
          </div>
        </div>
      )}

      {/* Show edit button when no payload yet and asset is DRAFT */}
      {!hasPayload && !editingPayload && fields.length > 0 && asset.status === "DRAFT" && (
        <div className={styles.assetPayloadEditor}>
          <button className="btn-secondary" onClick={startEditPayload} style={{ fontSize: "0.8rem" }}>
            הוסף תוכן לפלטפורמה
          </button>
        </div>
      )}

      {transitions.length > 0 && (
        <div className={styles.assetActions}>
          {transitions.map((tr) => (
            <button
              key={tr.to}
              className={tr.variant}
              onClick={() => handleTransition(tr.to)}
              disabled={transitioning}
            >
              {t(tr.labelKey)}
            </button>
          ))}
        </div>
      )}

      {canPublish && (
        <div className={styles.publishSection}>
          <form className={styles.publishForm} onSubmit={handlePublish}>
            <div className={styles.publishInputGroup}>
              <label>{t("contentFactory.publish.urlLabel")}</label>
              <input
                type="url"
                placeholder={t("contentFactory.publish.urlPlaceholder")}
                value={publishUrl}
                onChange={(e) => setPublishUrl(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={publishing}>
              {publishing ? t("common.status.processing") : t("contentFactory.publish.submit")}
            </button>
          </form>
        </div>
      )}

      {asset.publishJobs.length > 0 && (
        <div className={styles.publishJobs}>
          <div className={styles.publishJobsTitle}>
            {t("contentFactory.publish.title")}
          </div>
          {asset.publishJobs.map((job) => (
            <div key={job.id} className={styles.publishJobItem}>
              <span className={`${styles.statusBadge} ${
                job.status === "SUCCEEDED" ? styles.statusApproved :
                job.status === "FAILED" ? styles.statusDraft :
                styles.statusInReview
              }`}>
                {t(`contentFactory.publishJob.${job.status}`)}
              </span>
              {job.externalUrl && (
                <a
                  href={job.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.publishJobUrl}
                  onClick={(e) => e.stopPropagation()}
                >
                  {job.externalUrl}
                </a>
              )}
              {job.status === "FAILED" && (
                <>
                  {job.errorMessage && (
                    <span className={styles.statusBadge} style={{ color: "var(--status-error)" }}>
                      {job.errorMessage}
                    </span>
                  )}
                  <button
                    className={styles.retryBtn}
                    onClick={() => handleRetry(job.id)}
                    disabled={retrying === job.id}
                  >
                    {retrying === job.id ? "..." : "נסה שוב"}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {errorDetail && (
        <div className={styles.errorAccordion}>
          <button
            className={styles.errorToggle}
            onClick={() => setShowError(!showError)}
          >
            {t("contentFactory.error.technicalDetails")}
          </button>
          {showError && (
            <div className={styles.errorDetails}>
              {errorDetail.code && <div>code: {errorDetail.code}</div>}
              <div>{errorDetail.message}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══ Main page ═══ */

export default function ArticleDetailPage() {
  const params = useParams();
  const articleId = params.id as string;

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(PLATFORMS[0]);
  const [publishingToSanity, setPublishingToSanity] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [newsletterHtml, setNewsletterHtml] = useState<string | null>(null);
  const [showNewsletterPreview, setShowNewsletterPreview] = useState(false);
  const [preparingNewsletter, setPreparingNewsletter] = useState(false);
  const [errorDetail, setErrorDetail] = useState<{ code: string; message: string } | null>(null);
  const [showError, setShowError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const fetchArticle = useCallback(async () => {
    try {
      const res = await fetch(`/api/content-factory/articles/${articleId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError(t("contentFactory.error.notFound"));
          return;
        }
        throw new Error(`${res.status}`);
      }
      setArticle(await res.json());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  async function handleArticleTransition(to: string) {
    setTransitioning(true);
    setErrorDetail(null);
    try {
      const res = await fetch(`/api/content-factory/articles/${articleId}/transition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, actorUserId: "system" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorDetail(data?.error ?? null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      setEditing(false);
      await fetchArticle();
    } catch (err) {
      showToast({
        type: "error",
        message: `${t("contentFactory.error.transition")}: ${(err as Error).message}`,
      });
    } finally {
      setTransitioning(false);
    }
  }

  async function handleSaveBlocks(blocks: ContentBlock[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/content-factory/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyBlocks: blocks }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      showToast({ type: "success", message: "השינויים נשמרו" });
      await fetchArticle();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה בשמירה: ${(err as Error).message}` });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTitle() {
    if (!titleDraft.trim() || titleDraft.trim() === article?.title) {
      setEditingTitle(false);
      return;
    }
    try {
      const res = await fetch(`/api/content-factory/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleDraft.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      showToast({ type: "success", message: "הכותרת עודכנה" });
      setEditingTitle(false);
      await fetchArticle();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    }
  }

  async function handleCreateAsset() {
    setCreatingAsset(true);
    setErrorDetail(null);
    try {
      const res = await fetch(`/api/content-factory/articles/${articleId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: selectedPlatform,
          contentPayload: {},
          createdByUserId: "system",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorDetail(data?.error ?? null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      await fetchArticle();
    } catch (err) {
      showToast({
        type: "error",
        message: `${t("contentFactory.error.createAsset")}: ${(err as Error).message}`,
      });
    } finally {
      setCreatingAsset(false);
    }
  }

  async function handlePushToSanity() {
    setPublishingToSanity(true);
    setErrorDetail(null);
    try {
      const res = await fetch(`/api/content-factory/articles/${articleId}/push-to-sanity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorDetail(data?.error ?? null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      const result = await res.json();
      showToast({ type: "success", message: t("contentFactory.articles.pushedToSanity") });
      await fetchArticle();
      // Auto-open Sanity Studio in new tab
      if (result.sanityUrl) {
        window.open(result.sanityUrl, "_blank");
      }
    } catch (err) {
      showToast({
        type: "error",
        message: `${t("contentFactory.error.publishSanity")}: ${(err as Error).message}`,
      });
    } finally {
      setPublishingToSanity(false);
    }
  }

  async function handleGenerateImage() {
    setGeneratingImage(true);
    try {
      const res = await fetch(`/api/content-factory/articles/${articleId}/generate-image`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.error?.message || (typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
        throw new Error(msg);
      }
      showToast({ type: "success", message: "תמונה נוצרה בהצלחה" });
    } catch (err) {
      showToast({
        type: "error",
        message: `שגיאה ביצירת תמונה: ${(err as Error).message}`,
      });
    } finally {
      setGeneratingImage(false);
    }
  }

  async function handlePrepareNewsletter() {
    setPreparingNewsletter(true);
    try {
      const res = await fetch("/api/content-factory/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setNewsletterHtml(data.html);
      setShowNewsletterPreview(true);
    } catch (err) {
      showToast({
        type: "error",
        message: `שגיאה בהכנת ניוזלטר: ${(err as Error).message}`,
      });
    } finally {
      setPreparingNewsletter(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>{t("common.status.loading")}</div>
    );
  }

  if (error || !article) {
    return (
      <div>
        <Link href="/content-factory/articles" className={styles.backLink}>
          {t("contentFactory.article.backToList")}
        </Link>
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>!</span>
          {t("contentFactory.error.loadArticle")}: {error}
        </div>
      </div>
    );
  }

  const articleTransitions = ARTICLE_TRANSITIONS[article.status] ?? [];
  const hint = getNextActionHint(article);
  const isDraft = article.status === "DRAFT";
  const normalizedBlocks = normalizeBlocks(article.bodyBlocks);
  const hasBlocks = normalizedBlocks.length > 0;

  return (
    <div>
      <Link href="/content-factory/articles" className={styles.backLink}>
        {t("contentFactory.article.backToList")}
      </Link>

      {/* Title — editable for DRAFT */}
      {editingTitle && isDraft ? (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
            style={{
              flex: 1, fontSize: "1.5rem", fontWeight: 700,
              padding: "0.5rem", border: "2px solid #2563eb",
              borderRadius: "6px", direction: "rtl",
            }}
            autoFocus
          />
          <button className="btn-primary" onClick={handleSaveTitle}>שמור</button>
          <button className="btn-secondary" onClick={() => setEditingTitle(false)}>ביטול</button>
        </div>
      ) : (
        <PageHeader
          title={article.title}
          description={t("contentFactory.article.title")}
          action={isDraft ? (
            <button
              className="btn-secondary"
              onClick={() => { setTitleDraft(article.title); setEditingTitle(true); }}
              style={{ fontSize: "0.8rem" }}
            >
              ערוך כותרת
            </button>
          ) : undefined}
        />
      )}

      {/* Source idea link */}
      {article.idea && (
        <div className={styles.sourceLink}>
          <span>מקור: </span>
          <Link href={`/content-factory/ideas`} style={{ color: "var(--status-info)", marginInlineEnd: "0.5rem" }}>
            {article.idea.source?.nameHe || article.idea.source?.name || "רעיון"}
          </Link>
          {article.idea.sourceUrl && (
            <a
              href={article.idea.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--status-info)", textDecoration: "underline", fontSize: "0.85rem" }}
            >
              מאמר מקורי
            </a>
          )}
          {article.aiGenerated && (
            <span className={styles.aiBadge}>AI</span>
          )}
        </div>
      )}

      {/* Next action hint */}
      <div className={`${styles.nextAction} ${hint.success ? styles.nextActionSuccess : ""}`}>
        {hint.text}
      </div>

      {/* Meta bar — compact horizontal strip */}
      <div className={styles.metaBar}>
        <span className={`${styles.statusBadge} ${styles[STATUS_CLASS[article.status] ?? "statusDraft"]}`}>
          {t(`contentFactory.status.${article.status}`)}
        </span>
        <span className={`${styles.statusBadge} ${styles[DIST_CLASS[article.distributionStatus] ?? "distNotPublished"]}`}>
          {t(`contentFactory.distribution.${article.distributionStatus}`)}
        </span>
        {article.category && (
          <span className={styles.metaTag}>{CATEGORY_HE[article.category] ?? article.category}</span>
        )}
        {article.tags && article.tags.map((tag) => (
          <span key={tag} className={styles.metaTagLight}>{TAG_HE[tag] ?? tag}</span>
        ))}
        <span className={styles.metaDate}>
          {new Date(article.updatedAt).toLocaleDateString("he-IL")}
        </span>
      </div>

      {/* SEO — compact, no slug */}
      {(article.seoTitle || article.seoDescription) && (
        <div className={styles.seoSection}>
          <div className={styles.seoTitle}>קידום אתרים</div>
          {article.seoTitle && (
            <div className={styles.seoRow}>
              <span className={styles.seoLabel}>כותרת:</span>
              <span>{article.seoTitle}</span>
            </div>
          )}
          {article.seoDescription && (
            <div className={styles.seoRow}>
              <span className={styles.seoLabel}>תיאור:</span>
              <span>{article.seoDescription}</span>
            </div>
          )}
        </div>
      )}

      {/* Article body — read mode vs edit mode */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t("contentFactory.article.body")}</h2>
        {isDraft && !editing && hasBlocks && (
          <button
            className="btn-secondary"
            onClick={() => setEditing(true)}
            style={{ fontSize: "0.8rem" }}
          >
            ערוך תוכן
          </button>
        )}
        {editing && (
          <button
            className="btn-secondary"
            onClick={() => setEditing(false)}
            style={{ fontSize: "0.8rem" }}
          >
            תצוגה מקדימה
          </button>
        )}
      </div>

      {editing && isDraft && hasBlocks ? (
        <BlockEditor
          blocks={normalizedBlocks}
          onSave={handleSaveBlocks}
          saving={saving}
        />
      ) : hasBlocks ? (
        <ContentBlockRenderer blocks={article.bodyBlocks} />
      ) : (
        <EmptyState message="אין תוכן במאמר" detail={isDraft ? "ערכו את המאמר להוספת תוכן" : undefined} />
      )}

      {/* Article transition actions */}
      {articleTransitions.length > 0 && (
        <div className={styles.actions}>
          {articleTransitions.map((tr) => (
            <button
              key={tr.to}
              className={tr.variant}
              onClick={() => handleArticleTransition(tr.to)}
              disabled={transitioning}
            >
              {t(tr.labelKey)}
            </button>
          ))}
        </div>
      )}

      {/* Error detail accordion (article-level) */}
      {errorDetail && (
        <div className={styles.errorAccordion}>
          <button
            className={styles.errorToggle}
            onClick={() => setShowError(!showError)}
          >
            {t("contentFactory.error.technicalDetails")}
          </button>
          {showError && (
            <div className={styles.errorDetails}>
              {errorDetail.code && <div>code: {errorDetail.code}</div>}
              <div>{errorDetail.message}</div>
            </div>
          )}
        </div>
      )}

      {/* ── V2 Publishing Actions ── */}
      <div className={styles.publishSection}>
        <div className={styles.publishSectionHeader}>
          <h2 className={styles.sectionTitle}>פרסום והפצה</h2>
          <div className={styles.goldSeparator} />
        </div>

        <div className={styles.publishGrid}>
          {/* Step 1: Image */}
          <div className={styles.publishStep}>
            <div className={styles.publishStepNumber}>1</div>
            <div className={styles.publishStepContent}>
              <div className={styles.publishStepTitle}>תמונה ראשית</div>
              <p className={styles.publishStepDesc}>יצירת תמונה ממותגת באמצעות AI</p>
              <button
                className="btn-secondary"
                onClick={handleGenerateImage}
                disabled={generatingImage}
              >
                {generatingImage
                  ? t("contentFactory.articles.generatingImage")
                  : t("contentFactory.articles.generateImage")}
              </button>
            </div>
          </div>

          {/* Step 2: Push to Sanity */}
          <div className={styles.publishStep}>
            <div className={styles.publishStepNumber}>2</div>
            <div className={styles.publishStepContent}>
              <div className={styles.publishStepTitle}>העברה לאתר</div>
              <p className={styles.publishStepDesc}>
                {article.sanityId
                  ? "המאמר הועבר — לחץ שוב לעדכון"
                  : "העברת המאמר ל-Sanity CMS לבדיקה סופית ופרסום"}
              </p>
              <button
                className="btn-primary"
                onClick={handlePushToSanity}
                disabled={publishingToSanity}
              >
                {publishingToSanity
                  ? t("contentFactory.articles.pushingToSanity")
                  : article.sanityId
                    ? "עדכן באתר"
                    : t("contentFactory.articles.pushToSanity")}
              </button>
            </div>
          </div>

          {/* Step 3: Newsletter */}
          <div className={styles.publishStep}>
            <div className={styles.publishStepNumber}>3</div>
            <div className={styles.publishStepContent}>
              <div className={styles.publishStepTitle}>ניוזלטר</div>
              <p className={styles.publishStepDesc}>הכנת ניוזלטר ממותג לשליחה דרך Summit</p>
              <button
                className="btn-secondary"
                onClick={handlePrepareNewsletter}
                disabled={preparingNewsletter || !article.sanityId}
              >
                {preparingNewsletter ? "מכין..." : t("contentFactory.articles.sendNewsletter")}
              </button>
              {!article.sanityId && (
                <span className={styles.publishStepHint}>יש להעביר לאתר תחילה</span>
              )}
            </div>
          </div>
        </div>

        {/* Sanity status bar */}
        {article.sanityId && article.sanityUrl && (
          <div className={styles.sanityStatus}>
            <span className={styles.sanityStatusDot} />
            <span>המאמר באתר — ממתין לפרסום ב-Sanity Studio</span>
            <a
              href={article.sanityUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.sanityLink}
            >
              פתח ב-Sanity Studio ←
            </a>
          </div>
        )}
      </div>

      {/* Newsletter preview modal */}
      {showNewsletterPreview && newsletterHtml && (
        <div className={styles.publishCard}>
          <div className={styles.publishCardTitle}>תצוגה מקדימה — ניוזלטר</div>
          <p className={styles.publishCardDesc}>
            העתק את ה-HTML והדבק ב-Summit CRM לשליחת הניוזלטר.
          </p>
          <div className={styles.newsletterPreview}>
            <iframe
              srcDoc={newsletterHtml}
              title="Newsletter Preview"
              style={{ width: "100%", height: "400px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}
            />
          </div>
          <div className={styles.publishActions}>
            <button
              className="btn-primary"
              onClick={() => {
                navigator.clipboard.writeText(newsletterHtml);
                showToast({ type: "success", message: "HTML הועתק ללוח" });
              }}
            >
              העתק HTML
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowNewsletterPreview(false)}
            >
              סגור
            </button>
          </div>
        </div>
      )}

      {/* Assets section — only shown for legacy articles that already have assets */}
      {article.assets.length > 0 && (
        <>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>נכסים</h2>
            <div className={styles.createAssetRow}>
              <select
                className={styles.platformSelect}
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{PLATFORM_HE[p] ?? p}</option>
                ))}
              </select>
              <button
                className="btn-primary"
                onClick={handleCreateAsset}
                disabled={creatingAsset}
              >
                {creatingAsset ? t("common.status.processing") : "צור נכס"}
              </button>
            </div>
          </div>
          <div className={styles.assetsGrid}>
            {article.assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onRefresh={fetchArticle}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
