"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
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
  resolution_note: string | null;
  resolved_at: string | null;
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
  diff_report: 'דו"ח שינויים',
  exceptions_report: 'דו"ח חריגים',
};

const EXCEPTION_TYPE_LABELS: Record<string, string> = {
  no_sumit_match: "ללא התאמה ב-SUMIT",
  idom_duplicate: "כפילות IDOM",
  status_regression: "נסיגת סטטוס",
};

const RESOLUTION_LABELS: Record<string, string> = {
  pending: "ממתין",
  acknowledged: "נבדק",
  dismissed: "נדחה",
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRun = useCallback(() => {
    fetch(`/api/sumit-sync/runs/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(setRun)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  const patchException = async (exId: string, resolution: string) => {
    if (!run) return;
    setActionLoading(exId);
    try {
      const res = await fetch(`/api/sumit-sync/runs/${id}/exceptions/${exId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      if (!res.ok) throw new Error("עדכון נכשל");
      const updated = await res.json();
      setRun((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          exceptions: prev.exceptions.map((e) =>
            e.id === exId ? { ...e, ...updated } : e
          ),
        };
      });
    } catch {
      setError("שגיאה בעדכון חריג");
    } finally {
      setActionLoading(null);
    }
  };

  const bulkAcknowledge = async () => {
    if (!run) return;
    setActionLoading("bulk");
    try {
      const res = await fetch(`/api/sumit-sync/runs/${id}/exceptions/bulk`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: "acknowledged" }),
      });
      if (!res.ok) throw new Error("עדכון נכשל");
      fetchRun();
    } catch {
      setError("שגיאה בעדכון חריגים");
    } finally {
      setActionLoading(null);
    }
  };

  const completeRun = async () => {
    if (!run) return;
    const pendingCount = run.exceptions.filter(
      (e) => e.resolution === "pending"
    ).length;
    if (pendingCount > 0) {
      const ok = window.confirm(
        `יש ${pendingCount} חריגים שטרם נבדקו. להשלים בכל זאת?`
      );
      if (!ok) return;
    }
    setActionLoading("complete");
    try {
      const res = await fetch(`/api/sumit-sync/runs/${id}/complete`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "השלמה נכשלה");
      }
      fetchRun();
    } catch (err) {
      setError(err instanceof Error ? err.message : "השלמה נכשלה");
    } finally {
      setActionLoading(null);
    }
  };

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

  const isCompleted = run.status === "completed";
  const isReview = run.status === "review";
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

  const pendingExc = run.exceptions.filter(
    (e) => e.resolution === "pending"
  ).length;
  const reviewedExc = run.exceptions.length - pendingExc;

  return (
    <div>
      <PageHeader
        title={`הרצה — ${TYPE_LABELS[run.report_type] ?? run.report_type} ${run.year}`}
      />

      {/* Completed banner */}
      {isCompleted && (
        <div className={styles.completedBanner}>
          ההרצה הושלמה ונעולה לעריכה.
          {run.completed_at && (
            <span className={styles.completedDate}>
              {" "}
              ({new Date(run.completed_at).toLocaleString("he-IL")})
            </span>
          )}
        </div>
      )}

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
        <div className={styles.infoActions}>
          {isReview && (
            <button
              className="btn-primary"
              onClick={completeRun}
              disabled={actionLoading === "complete"}
            >
              {actionLoading === "complete"
                ? "מסיים..."
                : "סמן הרצה כהושלמה"}
            </button>
          )}
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
              <a
                key={f.id}
                href={`/api/sumit-sync/runs/${id}/files/${f.id}/download`}
                download
                className={styles.fileItem}
              >
                <span className={styles.fileRole}>
                  {FILE_ROLE_LABELS[f.file_role] ?? f.file_role}
                </span>
                <span className={styles.fileNameDisplay}>
                  {f.original_name}
                </span>
                <span className={styles.fileSize}>
                  {formatBytes(f.size_bytes)}
                </span>
                <span className={styles.downloadIcon}>↓</span>
              </a>
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
              <a
                key={f.id}
                href={`/api/sumit-sync/runs/${id}/files/${f.id}/download`}
                download
                className={styles.fileItem}
              >
                <span className={styles.fileRole}>
                  {FILE_ROLE_LABELS[f.file_role] ?? f.file_role}
                </span>
                <span className={styles.fileNameDisplay}>
                  {f.original_name}
                </span>
                <span className={styles.fileSize}>
                  {formatBytes(f.size_bytes)}
                </span>
                <span className={styles.downloadIcon}>↓</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Exceptions with review */}
      {run.exceptions.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              חריגים ({run.exceptions.length})
            </h2>
            <div className={styles.exceptionCounters}>
              <span className={styles.counterPending}>
                {pendingExc} ממתינים
              </span>
              <span className={styles.counterReviewed}>
                {reviewedExc} נבדקו
              </span>
            </div>
            {isReview && pendingExc > 0 && (
              <button
                className="btn-secondary"
                onClick={bulkAcknowledge}
                disabled={actionLoading === "bulk"}
              >
                {actionLoading === "bulk"
                  ? "מעדכן..."
                  : "סמן הכל כנבדק"}
              </button>
            )}
          </div>
          <table className={styles.exceptionsTable}>
            <thead>
              <tr>
                <th>סוג</th>
                <th>מספר תיק</th>
                <th>שם</th>
                <th>תיאור</th>
                <th>סטטוס</th>
                {!isCompleted && <th>פעולות</th>}
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
                    <span
                      className={`${styles.resolutionBadge} ${
                        styles[`resolution_${exc.resolution}`] || ""
                      }`}
                    >
                      {RESOLUTION_LABELS[exc.resolution] ?? exc.resolution}
                    </span>
                  </td>
                  {!isCompleted && (
                    <td className={styles.actionsCell}>
                      {exc.resolution === "pending" ? (
                        <>
                          <button
                            className={styles.actionBtn}
                            onClick={() =>
                              patchException(exc.id, "acknowledged")
                            }
                            disabled={actionLoading === exc.id}
                            title="סמן כנבדק"
                          >
                            נבדק
                          </button>
                          <button
                            className={`${styles.actionBtn} ${styles.actionDismiss}`}
                            onClick={() =>
                              patchException(exc.id, "dismissed")
                            }
                            disabled={actionLoading === exc.id}
                            title="דחה חריג"
                          >
                            דחייה
                          </button>
                        </>
                      ) : (
                        <span className={styles.resolvedMark}>—</span>
                      )}
                    </td>
                  )}
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
