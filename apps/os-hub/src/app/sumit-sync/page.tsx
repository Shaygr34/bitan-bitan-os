"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { t } from "@/lib/strings";
import styles from "./page.module.css";

interface RunSummary {
  id: string;
  year: number;
  report_type: string;
  status: string;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  financial: "דוחות כספיים",
  annual: "דוחות שנתיים",
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

export default function SumitSyncPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sumit-sync/runs")
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(setRuns)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title={t("sumitSync.title")}
        description={t("sumitSync.subtitle")}
      />

      <div className={styles.toolbar}>
        <Link href="/sumit-sync/new" className="btn-primary">
          הרצה חדשה
        </Link>
      </div>

      {loading && (
        <div className={styles.skeletonTable}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.skeletonRow}>
              <div className={styles.skeletonCell} />
              <div className={styles.skeletonCell} />
              <div className={styles.skeletonCellShort} />
              <div className={styles.skeletonCell} />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>!</span>
          שגיאה בטעינת נתונים: {error}
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <EmptyState
          message="עדיין אין הרצות"
          detail="לחצו על ׳הרצה חדשה׳ כדי להתחיל סנכרון ראשון"
        />
      )}

      {!loading && !error && runs.length > 0 && (
        <table className={styles.runsTable}>
          <thead>
            <tr>
              <th>שנת מס</th>
              <th>סוג דוח</th>
              <th>סטטוס</th>
              <th>תאריך</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                className={styles.clickableRow}
                onClick={() => router.push(`/sumit-sync/runs/${run.id}`)}
              >
                <td className={styles.numericCell}>{run.year}</td>
                <td>{TYPE_LABELS[run.report_type] ?? run.report_type}</td>
                <td>
                  <StatusBadge status={run.status} />
                </td>
                <td
                  className={styles.dateCell}
                  title={new Date(run.created_at).toLocaleString("he-IL")}
                >
                  {relativeTime(run.created_at)}
                </td>
                <td>
                  <Link
                    href={`/sumit-sync/runs/${run.id}`}
                    className={styles.detailLink}
                    onClick={(e) => e.stopPropagation()}
                  >
                    פרטים
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
