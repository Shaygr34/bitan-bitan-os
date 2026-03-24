"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import StatusBadge from "@/components/StatusBadge";
import { t } from "@/lib/strings";
import styles from "./page.module.css";

interface Article {
  id: string;
  title: string;
  status: string;
  distributionStatus: string;
  updatedAt: string;
  aiGenerated?: boolean;
  sanityId?: string | null;
}

interface HubStats {
  _status: "ok" | "unavailable";
  articles: number;
  articlesInReview: number;
  articlesApproved: number;
  articlesDraft: number;
  ideas: number;
  ideasNewToday: number;
  activeSources: number;
  sourceErrors: number;
  lastSuccessfulPoll: string | null;
}

const MAX_RETRY = 3;

export default function ContentFactoryHub() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [stats, setStats] = useState<HubStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        const [articlesRes, statsRes] = await Promise.all([
          fetch("/api/content-factory/articles"),
          fetch("/api/content-factory/hub-stats"),
        ]);

        if (articlesRes.ok) {
          const data = await articlesRes.json();
          setArticles(Array.isArray(data) ? data : []);
        }
        if (statsRes.ok) {
          const data = await statsRes.json();
          if (data._status === "ok") setStats(data);
        }

        setLoading(false);
        return;
      } catch {
        if (attempt < MAX_RETRY) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }

    setLoading(false);
    setFailed(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const recentArticles = articles
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  return (
    <div className="animate-page">
      <PageHeader
        title={t("contentFactory.hub.title")}
        description={t("contentFactory.hub.subtitle")}
      />

      {/* Loading */}
      {loading && (
        <div className={styles.loadingBar}>
          <div className={styles.loadingBarInner} />
        </div>
      )}

      {failed && !loading && (
        <div className={styles.unavailableNotice}>
          <span>מסד הנתונים לא זמין כרגע</span>
          <button className={styles.retryButton} onClick={load}>נסו שוב</button>
        </div>
      )}

      {/* CTA + Stats Row */}
      <div className={styles.topRow}>
        <Link href="/content-factory/new" className={`btn-primary ${styles.newArticleBtn}`}>
          + מאמר חדש
        </Link>

        <div className={styles.statsRow}>
          <div className={styles.statPill}>
            <span className={styles.statValue}>{stats?.articles ?? "—"}</span>
            <span className={styles.statLabel}>מאמרים</span>
          </div>
          <div className={styles.statPill}>
            <span className={styles.statValue}>{stats?.articlesDraft ?? "—"}</span>
            <span className={styles.statLabel}>טיוטות</span>
          </div>
          <div className={styles.statPill}>
            <span className={styles.statValue}>{stats?.articlesInReview ?? "—"}</span>
            <span className={styles.statLabel}>בבדיקה</span>
          </div>
          <div className={styles.statPill}>
            <span className={styles.statValue}>{stats?.articlesApproved ?? "—"}</span>
            <span className={styles.statLabel}>פורסמו</span>
          </div>
        </div>
      </div>

      {/* Articles Table */}
      <section className={styles.articlesSection}>
        <h2 className={styles.sectionTitle}>מאמרים אחרונים</h2>
        <div className={styles.goldSeparator} />

        {recentArticles.length === 0 && !loading ? (
          <Card>
            <div className={styles.emptyState}>
              <p>אין מאמרים עדיין</p>
              <Link href="/content-factory/new" className="btn-primary">
                צור מאמר ראשון
              </Link>
            </div>
          </Card>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.articlesTable}>
              <thead>
                <tr>
                  <th>{t("contentFactory.col.title")}</th>
                  <th>{t("contentFactory.col.status")}</th>
                  <th>אתר</th>
                  <th>{t("contentFactory.col.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {recentArticles.map((article) => (
                  <tr key={article.id}>
                    <td>
                      <Link
                        href={`/content-factory/articles/${article.id}`}
                        className={styles.articleTitleLink}
                      >
                        {article.title}
                        {article.aiGenerated && (
                          <span className={styles.aiBadge}>AI</span>
                        )}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={article.status.toLowerCase()} />
                    </td>
                    <td>
                      <span className={article.sanityId ? styles.sanityYes : styles.sanityNo}>
                        {article.sanityId ? "✓" : "—"}
                      </span>
                    </td>
                    <td className={styles.dateCell}>
                      {new Date(article.updatedAt).toLocaleDateString("he-IL")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Idea Monitor Link */}
      {stats && (stats.ideas > 0 || stats.activeSources > 0) && (
        <section className={styles.ideaMonitorSection}>
          <Link href="/content-factory/ideas" className={styles.ideaMonitorLink}>
            <Card>
              <div className={styles.ideaMonitorInner}>
                <span className={styles.ideaMonitorTitle}>מקורות רעיונות</span>
                <span className={styles.ideaMonitorStats}>
                  {stats.activeSources} מקורות · {stats.ideas} רעיונות
                  {stats.ideasNewToday > 0 && ` · ${stats.ideasNewToday} חדשים היום`}
                </span>
              </div>
            </Card>
          </Link>
        </section>
      )}
    </div>
  );
}
