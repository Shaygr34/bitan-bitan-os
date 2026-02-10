"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import StatusBadge from "@/components/StatusBadge";
import styles from "./page.module.css";

interface RunMetrics {
  total_idom_records: number;
  total_sumit_records: number;
  matched_count: number;
  unmatched_count: number;
  changed_count: number;
  unchanged_count: number;
  status_completed_count: number;
  status_preserved_count: number;
  status_regression_flags: number;
  processing_seconds: number | null;
}

interface RunFile {
  id: string;
  file_role: string;
  original_name: string;
  size_bytes: number;
}

interface RunException {
  id: string;
  exception_type: string;
  idom_ref: string | null;
  client_name: string | null;
  description: string;
  resolution: string;
}

interface RunDetail {
  id: string;
  year: number;
  report_type: string;
  status: string;
  operator_notes: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  metrics: RunMetrics | null;
  files: RunFile[];
  exceptions: RunException[];
}

const TYPE_LABELS: Record<string, string> = {
  financial: "דוחות כספיים",
  annual: "דוחות שנתיים",
};

const FILE_ROLE_LABELS: Record<string, string> = {
  idom_upload: "קובץ IDOM (קלט)",
  sumit_upload: "קובץ SUMIT (קלט)",
  import_output: "קובץ ייבוא (פלט)",
  diff_report: "דו״ח שינויים",
  exceptions_report: "דו״ח חריגים",
};

const EXCEPTION_TYPE_LABELS: Record<string, string> = {
  no_sumit_match: "ללא התאמה ב-SUMIT",
  idom_duplicate: "כפילות IDOM",
  status_regression: "נסיגת סטטוס",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sumit-sync/runs/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(setRun)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div>
        <PageHeader title="פרטי הרצה" />
        <p className={styles.loadingText}>טוען...</p>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div>
        <PageHeader title="פרטי הרצה" />
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>!</span>
          {error || "הרצה לא נמצאה"}
        </div>
        <Link href="/sumit-sync" className="btn-secondary">
          חזרה לרשימה
        </Link>
      </div>
    );
  }

  const matchRate =
    run.metrics && run.metrics.total_idom_records > 0
      ? (
          (run.metrics.matched_count / run.metrics.total_idom_records) *
          100
        ).toFixed(1)
      : null;

  const outputFiles = run.files.filter(
    (f) => !f.file_role.endsWith("_upload")
  );
  const inputFiles = run.files.filter((f) => f.file_role.endsWith("_upload"));

  return (
    <div>
      <PageHeader
        title={`הרצה — ${TYPE_LABELS[run.report_type] ?? run.report_type} ${run.year}`}
      />

      {/* Header info row */}
      <div className={styles.infoRow}>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>סטטוס</span>
          <StatusBadge status={run.status} />
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>תאריך יצירה</span>
          <span className={styles.infoValue}>
            {new Date(run.created_at).toLocaleString("he-IL")}
          </span>
        </div>
        {run.metrics?.processing_seconds != null && (
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>זמן עיבוד</span>
            <span className={styles.infoValue}>
              {run.metrics.processing_seconds.toFixed(2)} שניות
            </span>
          </div>
        )}
        <div className={styles.backLink}>
          <Link href="/sumit-sync" className="btn-ghost">
            ← חזרה לרשימה
          </Link>
        </div>
      </div>

      {/* Metrics */}
      {run.metrics && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>מדדים</h2>
          <div className={styles.metricsGrid}>
            <MetricCard
              label="רשומות IDOM"
              value={run.metrics.total_idom_records}
            />
            <MetricCard
              label="רשומות SUMIT"
              value={run.metrics.total_sumit_records}
            />
            <MetricCard
              label="התאמות"
              value={run.metrics.matched_count}
              accent={matchRate ? `${matchRate}%` : undefined}
            />
            <MetricCard
              label="ללא התאמה"
              value={run.metrics.unmatched_count}
              warning={run.metrics.unmatched_count > 0}
            />
            <MetricCard label="שינויים" value={run.metrics.changed_count} />
            <MetricCard
              label="סטטוס → הושלם"
              value={run.metrics.status_completed_count}
            />
            <MetricCard
              label="נסיגות סטטוס"
              value={run.metrics.status_regression_flags}
              warning={run.metrics.status_regression_flags > 0}
            />
          </div>
        </section>
      )}

      {/* Output files */}
      {outputFiles.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>קבצי פלט</h2>
          <div className={styles.fileList}>
            {outputFiles.map((f) => (
              <div key={f.id} className={styles.fileItem}>
                <span className={styles.fileRole}>
                  {FILE_ROLE_LABELS[f.file_role] ?? f.file_role}
                </span>
                <span className={styles.fileNameDisplay}>{f.original_name}</span>
                <span className={styles.fileSize}>
                  {formatBytes(f.size_bytes)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Input files */}
      {inputFiles.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>קבצי קלט</h2>
          <div className={styles.fileList}>
            {inputFiles.map((f) => (
              <div key={f.id} className={styles.fileItem}>
                <span className={styles.fileRole}>
                  {FILE_ROLE_LABELS[f.file_role] ?? f.file_role}
                </span>
                <span className={styles.fileNameDisplay}>{f.original_name}</span>
                <span className={styles.fileSize}>
                  {formatBytes(f.size_bytes)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Exceptions summary */}
      {run.exceptions.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            חריגים ({run.exceptions.length})
          </h2>
          <table className={styles.exceptionsTable}>
            <thead>
              <tr>
                <th>סוג</th>
                <th>מספר תיק</th>
                <th>שם</th>
                <th>תיאור</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {run.exceptions.map((exc) => (
                <tr key={exc.id}>
                  <td>
                    {EXCEPTION_TYPE_LABELS[exc.exception_type] ??
                      exc.exception_type}
                  </td>
                  <td className={styles.numericCell}>{exc.idom_ref || "—"}</td>
                  <td>{exc.client_name || "—"}</td>
                  <td className={styles.descCell}>{exc.description}</td>
                  <td>
                    <StatusBadge status={exc.resolution === "pending" ? "review" : "completed"} />
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

function MetricCard({
  label,
  value,
  accent,
  warning,
}: {
  label: string;
  value: number;
  accent?: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`${styles.metricCard} ${warning ? styles.metricWarning : ""}`}
    >
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
      {accent && <span className={styles.metricAccent}>{accent}</span>}
    </div>
  );
}
