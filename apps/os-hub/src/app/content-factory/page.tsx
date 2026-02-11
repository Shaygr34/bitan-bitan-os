"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import { t } from "@/lib/strings";
import styles from "./page.module.css";

interface ArticleSummary {
  id: string;
  title: string;
  status: string;
  distributionStatus: string;
  updatedAt: string;
  assets: { id: string; platform: string; status: string; version: number }[];
}

type StatusFilter = "ALL" | "DRAFT" | "IN_REVIEW" | "APPROVED";

const STATUS_FILTERS: { value: StatusFilter; labelKey: string }[] = [
  { value: "ALL", labelKey: "contentFactory.filter.all" },
  { value: "DRAFT", labelKey: "contentFactory.status.DRAFT" },
  { value: "IN_REVIEW", labelKey: "contentFactory.status.IN_REVIEW" },
  { value: "APPROVED", labelKey: "contentFactory.status.APPROVED" },
];

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString("he-IL");
}

export default function ContentFactoryPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ArticleSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/content-factory/articles")
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(setArticles)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = articles;
    if (statusFilter !== "ALL") {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.title.toLowerCase().includes(q));
    }
    return list;
  }, [articles, statusFilter, search]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/content-factory/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "מאמר חדש",
          bodyBlocks: {},
          createdByUserId: "system",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      const article = await res.json();
      router.push(`/content-factory/articles/${article.id}`);
    } catch (err) {
      showToast({
        type: "error",
        message: `${t("contentFactory.error.createArticle")}: ${(err as Error).message}`,
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/content-factory/articles/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || "מחיקה נכשלה");
      }
      setArticles((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      showToast({ type: "success", message: "המאמר נמחק" });
    } catch (err) {
      showToast({ type: "error", message: err instanceof Error ? err.message : "שגיאה במחיקה" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("contentFactory.title")}
        description={t("contentFactory.subtitle")}
        action={
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? t("common.status.processing") : t("contentFactory.newArticle")}
          </button>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`${styles.filterBtn} ${statusFilter === f.value ? styles.filterBtnActive : ""}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={t("contentFactory.search.placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && (
        <div className={styles.skeletonTable}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.skeletonRow}>
              <div className={styles.skeletonCell} />
              <div className={styles.skeletonCellShort} />
              <div className={styles.skeletonCellShort} />
              <div className={styles.skeletonCell} />
              <div className={styles.skeletonCellShort} />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>!</span>
          {t("contentFactory.error.loadArticles")}: {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          message={articles.length === 0 ? "אין מאמרים עדיין" : t("common.emptyState.searchResults")}
          detail={articles.length === 0 ? "לחצו על ׳Article חדש׳ כדי להתחיל" : undefined}
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <table className={styles.articlesTable}>
          <thead>
            <tr>
              <th>{t("contentFactory.col.title")}</th>
              <th>{t("contentFactory.col.status")}</th>
              <th>{t("contentFactory.col.distribution")}</th>
              <th>{t("contentFactory.col.assets")}</th>
              <th>{t("contentFactory.col.updated")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((article) => (
              <tr
                key={article.id}
                className={styles.clickableRow}
                onClick={() => router.push(`/content-factory/articles/${article.id}`)}
              >
                <td>{article.title}</td>
                <td>
                  <span className={`${styles.statusBadge} ${styles[STATUS_CLASS[article.status] ?? "statusDraft"]}`}>
                    {t(`contentFactory.status.${article.status}`)}
                  </span>
                </td>
                <td>
                  <span className={`${styles.statusBadge} ${styles[DIST_CLASS[article.distributionStatus] ?? "distNotPublished"]}`}>
                    {t(`contentFactory.distribution.${article.distributionStatus}`)}
                  </span>
                </td>
                <td className={styles.assetCount}>
                  {article.assets.length}
                </td>
                <td
                  className={styles.dateCell}
                  title={new Date(article.updatedAt).toLocaleString("he-IL")}
                >
                  {relativeTime(article.updatedAt)}
                </td>
                <td>
                  <button
                    className={styles.deleteBtn}
                    title="מחק מאמר"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(article);
                    }}
                  >
                    מחיקה
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="מחיקת מאמר"
        body={
          deleteTarget
            ? `למחוק את המאמר "${deleteTarget.title}"? כל הנכסים והפרסומים ייאבדו לצמיתות.`
            : ""
        }
        cancelLabel="ביטול"
        confirmLabel={deleting ? "מוחק..." : "מחק"}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
