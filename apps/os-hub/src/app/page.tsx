"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import StatusBadge from "@/components/StatusBadge";
import { t } from "@/lib/strings";
import { TYPE_LABELS, relativeTime } from "@/lib/formatters";
import styles from "./page.module.css";

interface Module {
  key: string;
  descKey: string;
  href: string;
  comingSoon?: boolean;
}

interface RunSummary {
  id: string;
  year: number;
  report_type: string;
  status: string;
  created_at: string;
}

const modules: Module[] = [
  {
    key: "nav.items.bitanWebsite",
    descKey: "dashboard.modules.bitanWebsite.description",
    href: "/bitan-website",
  },
  {
    key: "nav.items.contentEngine",
    descKey: "dashboard.modules.contentEngine.description",
    href: "/content-engine",
  },
  {
    key: "nav.items.contentFactory",
    descKey: "dashboard.modules.contentFactory.description",
    href: "/content-factory",
  },
  {
    key: "nav.items.sumitSync",
    descKey: "dashboard.modules.sumitSync.description",
    href: "/sumit-sync",
  },
  {
    key: "nav.items.customerOnboarding",
    descKey: "dashboard.modules.customerOnboarding.description",
    href: "#",
    comingSoon: true,
  },
  {
    key: "nav.items.analytics",
    descKey: "dashboard.modules.analytics.description",
    href: "#",
    comingSoon: true,
  },
];

export default function Home() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [totalArticles, setTotalArticles] = useState<number | null>(null);
  const [statsLoaded, setStatsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/sumit-sync/runs")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRuns(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setStatsLoaded(true));

    fetch("/api/content-factory/articles")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTotalArticles(Array.isArray(data) ? data.length : 0))
      .catch(() => setTotalArticles(0));
  }, []);

  const recentRuns = runs.slice(0, 5);
  const runsInReview = runs.filter((r) => r.status === "review").length;

  return (
    <div>
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.subtitle")}
      />

      {/* Module Cards */}
      <section className={styles.modulesSection}>
        <h2 className={styles.sectionTitle}>{t("dashboard.modules.title")}</h2>
        <div className={styles.goldSeparator} />
        <div className={styles.modulesGrid}>
          {modules.map((mod) =>
            mod.comingSoon ? (
              <div key={mod.key} className={styles.moduleLink}>
                <Card className={styles.comingSoonCard}>
                  <div className={styles.moduleHeader}>
                    <h3 className={styles.moduleName}>{t(mod.key)}</h3>
                    <span className={styles.comingSoonBadge}>{t("dashboard.comingSoon")}</span>
                  </div>
                  <p className={styles.moduleDescription}>{t(mod.descKey)}</p>
                </Card>
              </div>
            ) : (
              <Link key={mod.href} href={mod.href} className={styles.moduleLink}>
                <Card>
                  <h3 className={styles.moduleName}>{t(mod.key)}</h3>
                  <p className={styles.moduleDescription}>{t(mod.descKey)}</p>
                </Card>
              </Link>
            )
          )}
        </div>
      </section>

      {/* Quick Actions */}
      <section className={styles.quickActions}>
        <Link href="/sumit-sync/new" className="btn-primary">
          הרצה חדשה
        </Link>
        <Link href="/documents" className="btn-secondary">
          מרכז קבצים
        </Link>
      </section>

      {/* Stats Grid */}
      <section className={styles.statsSection}>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>סה״כ הרצות</span>
            <span className={styles.statValue}>
              {statsLoaded ? runs.length : "—"}
            </span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>בבדיקה</span>
            <span className={styles.statValue}>
              {statsLoaded ? runsInReview : "—"}
            </span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>מאמרים</span>
            <span className={styles.statValue}>
              {totalArticles !== null ? totalArticles : "—"}
            </span>
          </div>
        </div>
      </section>

      {/* Recent Runs */}
      {statsLoaded && recentRuns.length > 0 && (
        <section className={styles.recentSection}>
          <div className={styles.recentHeader}>
            <h2 className={styles.sectionTitle}>הרצות אחרונות</h2>
            <Link href="/sumit-sync" className={styles.viewAllLink}>
              הצג הכל
            </Link>
          </div>
          <div className={styles.goldSeparator} />
          <table className={styles.miniTable}>
            <thead>
              <tr>
                <th>שנת מס</th>
                <th>סוג דוח</th>
                <th>סטטוס</th>
                <th>תאריך</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id}>
                  <td className={styles.numericCell}>{run.year}</td>
                  <td>{TYPE_LABELS[run.report_type] ?? run.report_type}</td>
                  <td>
                    <StatusBadge status={run.status} />
                  </td>
                  <td className={styles.dateCell}>
                    {relativeTime(run.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
