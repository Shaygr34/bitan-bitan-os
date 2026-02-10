"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
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

export default function SumitSyncPage() {
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
        title="Sumit Sync"
        description="סנכרון נתוני IDOM/שע״מ מול מערכת SUMIT"
      />

      <div className={styles.toolbar}>
        <Link href="/sumit-sync/new" className="btn-primary">
          הרצה חדשה
        </Link>
      </div>

      {loading && <p className={styles.loadingText}>טוען...</p>}

      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>!</span>
          שגיאה בטעינת נתונים: {error}
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <EmptyState
          message="אין הרצות"
          detail="לחץ ׳הרצה חדשה׳ כדי להתחיל סנכרון ראשון."
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
              <tr key={run.id}>
                <td className={styles.numericCell}>{run.year}</td>
                <td>{TYPE_LABELS[run.report_type] ?? run.report_type}</td>
                <td>
                  <StatusBadge status={run.status} />
                </td>
                <td className={styles.dateCell}>
                  {new Date(run.created_at).toLocaleDateString("he-IL")}
                </td>
                <td>
                  <Link
                    href={`/sumit-sync/runs/${run.id}`}
                    className={styles.detailLink}
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
