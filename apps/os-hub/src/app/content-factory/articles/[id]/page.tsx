"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ContentBlockRenderer from "@/components/ContentBlockRenderer";
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
  bodyBlocks?: ContentBlock[] | null;
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

const PLATFORMS = ["EMAIL", "WEBSITE", "FACEBOOK", "INSTAGRAM", "LINKEDIN"];

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

function BlockEditor({
  blocks,
  onSave,
  saving,
}: {
  blocks: ContentBlock[];
  onSave: (blocks: ContentBlock[]) => void;
  saving: boolean;
}) {
  const [editBlocks, setEditBlocks] = useState<ContentBlock[]>(blocks);
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

  function addBlock(type: ContentBlock["type"], afterIndex: number) {
    const newBlock: ContentBlock = type === "heading"
      ? { type: "heading", text: "", level: 2 }
      : type === "list"
        ? { type: "list", style: "bullet", items: [""] }
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
      {/* Save bar */}
      <div className={styles.editorToolbar}>
        <span className={styles.editorLabel}>
          {dirty ? "יש שינויים שלא נשמרו" : "מצב עריכה"}
        </span>
        <button
          className="btn-primary"
          disabled={!dirty || saving}
          onClick={() => onSave(editBlocks)}
        >
          {saving ? "שומר..." : "שמור שינויים"}
        </button>
      </div>

      {editBlocks.map((block, i) => (
        <div key={i} className={styles.editorBlock}>
          <div className={styles.editorBlockHeader}>
            <span className={styles.editorBlockType}>{block.type}</span>
            <div className={styles.editorBlockActions}>
              <button
                className={styles.editorSmallBtn}
                title="הוסף פסקה"
                onClick={() => addBlock("paragraph", i)}
              >
                + פסקה
              </button>
              <button
                className={styles.editorSmallBtn}
                title="הוסף כותרת"
                onClick={() => addBlock("heading", i)}
              >
                + כותרת
              </button>
              <button
                className={styles.editorSmallBtn}
                title="הוסף רשימה"
                onClick={() => addBlock("list", i)}
              >
                + רשימה
              </button>
              {editBlocks.length > 1 && (
                <button
                  className={styles.editorDeleteBtn}
                  title="מחק בלוק"
                  onClick={() => removeBlock(i)}
                >
                  מחק
                </button>
              )}
            </div>
          </div>

          {(block.type === "heading" || block.type === "paragraph" || block.type === "quote" || block.type === "callout") && (
            <textarea
              className={styles.editorTextarea}
              value={block.text ?? ""}
              onChange={(e) => updateBlock(i, { text: e.target.value })}
              rows={block.type === "heading" ? 1 : Math.max(2, Math.ceil((block.text?.length ?? 0) / 80))}
              placeholder={block.type === "heading" ? "כותרת..." : "תוכן הפסקה..."}
            />
          )}

          {block.type === "list" && (
            <div className={styles.editorListItems}>
              {(block.items ?? []).map((item, li) => (
                <div key={li} className={styles.editorListItem}>
                  <input
                    type="text"
                    className={styles.editorInput}
                    value={item}
                    onChange={(e) => updateListItem(i, li, e.target.value)}
                    placeholder="פריט ברשימה..."
                  />
                  <button
                    className={styles.editorDeleteBtn}
                    onClick={() => removeListItem(i, li)}
                    title="הסר פריט"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                className={styles.editorSmallBtn}
                onClick={() => addListItem(i)}
              >
                + פריט
              </button>
            </div>
          )}

          {block.type === "divider" && (
            <hr style={{ border: "none", borderTop: "1px dashed #ccc", margin: "0.5rem 0" }} />
          )}
        </div>
      ))}
    </div>
  );
}

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

  const transitions = ASSET_TRANSITIONS[asset.status] ?? [];
  const succeededJobs = asset.publishJobs.filter((j) => j.status === "SUCCEEDED");
  const canPublish = asset.status === "APPROVED";

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

  return (
    <div className={styles.assetCard}>
      <div className={styles.assetHeader}>
        <span className={styles.assetPlatform}>{asset.platform}</span>
        <span className={`${styles.statusBadge} ${styles[STATUS_CLASS[asset.status] ?? "statusDraft"]}`}>
          {t(`contentFactory.status.${asset.status}`)}
        </span>
      </div>

      <div className={styles.assetMeta}>
        <span>{t("contentFactory.article.version")}: {asset.version}</span>
        <span>{succeededJobs.length > 0 ? `${succeededJobs.length} ${t("contentFactory.publishJob.SUCCEEDED")}` : ""}</span>
      </div>

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
              {job.status === "FAILED" && job.errorMessage && (
                <span className={styles.statusBadge} style={{ color: "var(--status-error)" }}>
                  {job.errorMessage}
                </span>
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

  async function handlePublishToSanity() {
    setPublishingToSanity(true);
    setErrorDetail(null);
    try {
      const res = await fetch(`/api/content-factory/articles/${articleId}/publish-website`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorDetail(data?.error ?? null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      showToast({ type: "success", message: t("contentFactory.publish.sanitySuccess") });
      await fetchArticle();
    } catch (err) {
      showToast({
        type: "error",
        message: `${t("contentFactory.error.publishSanity")}: ${(err as Error).message}`,
      });
    } finally {
      setPublishingToSanity(false);
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

      {/* Meta grid */}
      <div className={styles.metaGrid}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>{t("contentFactory.article.status")}</span>
          <span className={`${styles.statusBadge} ${styles[STATUS_CLASS[article.status] ?? "statusDraft"]}`}>
            {t(`contentFactory.status.${article.status}`)}
          </span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>{t("contentFactory.article.version")}</span>
          <span className={styles.metaValue}>{article.version}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>{t("contentFactory.article.distribution")}</span>
          <span className={`${styles.statusBadge} ${styles[DIST_CLASS[article.distributionStatus] ?? "distNotPublished"]}`}>
            {t(`contentFactory.distribution.${article.distributionStatus}`)}
          </span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>{t("contentFactory.article.updatedAt")}</span>
          <span className={styles.metaValue}>
            {new Date(article.updatedAt).toLocaleString("he-IL")}
          </span>
        </div>
        {article.category && (
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>קטגוריה</span>
            <span className={styles.metaValue}>{article.category}</span>
          </div>
        )}
        {article.tags && article.tags.length > 0 && (
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>תגיות</span>
            <span className={styles.metaValue}>{article.tags.join(", ")}</span>
          </div>
        )}
      </div>

      {/* SEO Meta — collapsible */}
      {(article.seoTitle || article.seoDescription) && (
        <div className={styles.seoSection}>
          <div className={styles.seoTitle}>SEO</div>
          {article.seoTitle && (
            <div className={styles.seoRow}>
              <span className={styles.seoLabel}>כותרת SEO:</span>
              <span>{article.seoTitle}</span>
            </div>
          )}
          {article.seoDescription && (
            <div className={styles.seoRow}>
              <span className={styles.seoLabel}>תיאור:</span>
              <span>{article.seoDescription}</span>
            </div>
          )}
          {article.slug && (
            <div className={styles.seoRow}>
              <span className={styles.seoLabel}>Slug:</span>
              <span style={{ direction: "ltr", display: "inline-block" }}>{article.slug}</span>
            </div>
          )}
        </div>
      )}

      {/* Article body — read mode vs edit mode */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t("contentFactory.article.body")}</h2>
        {isDraft && !editing && Array.isArray(article.bodyBlocks) && article.bodyBlocks.length > 0 && (
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

      {editing && isDraft && Array.isArray(article.bodyBlocks) ? (
        <BlockEditor
          blocks={article.bodyBlocks}
          onSave={handleSaveBlocks}
          saving={saving}
        />
      ) : Array.isArray(article.bodyBlocks) && article.bodyBlocks.length > 0 ? (
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

      {/* Publish to Sanity — only for APPROVED articles without sanityId */}
      {article.status === "APPROVED" && !article.sanityId && (
        <div className={styles.actions}>
          <button
            className="btn-primary"
            onClick={handlePublishToSanity}
            disabled={publishingToSanity}
          >
            {publishingToSanity ? t("common.status.processing") : t("contentFactory.publish.toSanity")}
          </button>
        </div>
      )}

      {/* Sanity link — show if already published */}
      {article.sanityId && article.sanityUrl && (
        <div className={styles.nextAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span>{t("contentFactory.publish.sanityPublished")}</span>
          <a
            href={article.sanityUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "underline" }}
          >
            {t("contentFactory.publish.openInSanity")}
          </a>
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

      {/* Assets section */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t("contentFactory.assets.title")}</h2>
        <div className={styles.createAssetRow}>
          <select
            className={styles.platformSelect}
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button
            className="btn-primary"
            onClick={handleCreateAsset}
            disabled={creatingAsset}
          >
            {creatingAsset ? t("common.status.processing") : t("contentFactory.assets.create")}
          </button>
        </div>
      </div>

      {article.assets.length === 0 ? (
        <EmptyState
          message={t("contentFactory.assets.empty")}
          detail={t("contentFactory.assets.emptyDetail")}
        />
      ) : (
        <div className={styles.assetsGrid}>
          {article.assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onRefresh={fetchArticle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
