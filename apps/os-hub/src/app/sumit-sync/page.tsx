"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { t } from "@/lib/strings";
import { TYPE_LABELS, relativeTime } from "@/lib/formatters";
import styles from "./page.module.css";

interface RunSummary {
  id: string;
  year: number;
  report_type: string;
  status: string;
  created_at: string;
}

export default function SumitSyncPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

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

  const filteredRuns =
    statusFilter === "all"
      ? runs
      : runs.filter((r) => r.status === statusFilter);

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
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">כל הסטטוסים</option>
          <option value="uploading">העלאה</option>
          <option value="processing">מעבד</option>
          <option value="review">בבדיקה</option>
          <option value="completed">הושלם</option>
          <option value="failed">נכשל</option>
        </select>
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

      {!loading && !error && filteredRuns.length === 0 && (
        <EmptyState
          message={statusFilter === "all" ? "עדיין אין הרצות" : "אין הרצות בסטטוס זה"}
          detail={statusFilter === "all" ? "לחצו על ׳הרצה חדשה׳ כדי להתחיל סנכרון ראשון" : "נסו לשנות את הסינון"}
        />
      )}

      {!loading && !error && filteredRuns.length > 0 && (
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
            {filteredRuns.map((run) => (
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
