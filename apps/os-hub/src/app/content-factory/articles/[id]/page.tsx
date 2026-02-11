"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { showToast } from "@/components/Toast";
import { t } from "@/lib/strings";
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

interface Article {
  id: string;
  title: string;
  status: string;
  version: number;
  distributionStatus: string;
  updatedAt: string;
  assets: Asset[];
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
  const hint = t(`contentFactory.nextAction.${article.status}`);
  return { text: hint, success: false };
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

      {/* Asset transition actions */}
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

      {/* Manual publish form — only for APPROVED assets */}
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

      {/* Show notice if trying to publish non-approved */}
      {!canPublish && asset.status !== "APPROVED" && succeededJobs.length === 0 && transitions.length === 0 && null}

      {/* Publish jobs list */}
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

      {/* Error detail accordion */}
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
  const [errorDetail, setErrorDetail] = useState<{ code: string; message: string } | null>(null);
  const [showError, setShowError] = useState(false);

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

  if (loading) {
    return (
      <div className={styles.loading}>{t("common.status.loading")}</div>
    );
  }

  if (error || !article) {
    return (
      <div>
        <Link href="/content-factory" className={styles.backLink}>
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

  return (
    <div>
      <Link href="/content-factory" className={styles.backLink}>
        {t("contentFactory.article.backToList")}
      </Link>

      <PageHeader
        title={article.title}
        description={t("contentFactory.article.title")}
      />

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
      </div>

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
