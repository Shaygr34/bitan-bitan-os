"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import DrillDownDrawer from "@/components/DrillDownDrawer";
import { showToast } from "@/components/Toast";
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

import { TYPE_LABELS, FILE_ROLE_LABELS, formatBytes } from "@/lib/formatters";

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

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drillDown, setDrillDown] = useState<{ metric: string; label: string } | null>(null);

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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "עדכון נכשל");
      }
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
      showToast({ type: "success", message: `חריג סומן כ${resolution === "acknowledged" ? "נבדק" : "נדחה"}` });
    } catch (err) {
      showToast({ type: "error", message: err instanceof Error ? err.message : "שגיאה בעדכון חריג" });
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "עדכון נכשל");
      }
      const result = await res.json();
      showToast({ type: "success", message: `${result.updated_count} חריגים סומנו כנבדק` });
      fetchRun();
    } catch (err) {
      showToast({ type: "error", message: err instanceof Error ? err.message : "שגיאה בעדכון חריגים" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteClick = () => {
    if (!run) return;
    const pendingCount = run.exceptions.filter(
      (e) => e.resolution === "pending"
    ).length;
    if (pendingCount > 0) {
      setConfirmOpen(true);
    } else {
      doCompleteRun();
    }
  };

  const doCompleteRun = async () => {
    setConfirmOpen(false);
    setActionLoading("complete");
    try {
      const res = await fetch(`/api/sumit-sync/runs/${id}/complete`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "השלמה נכשלה");
      }
      // Optimistic update: hide action buttons immediately
      setRun((prev) =>
        prev ? { ...prev, status: "completed" } : prev
      );
      showToast({ type: "success", message: "ההרצה הושלמה ונעולה" });
      fetchRun();
    } catch (err) {
      showToast({ type: "error", message: err instanceof Error ? err.message : "השלמה נכשלה" });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="פרטי הרצה" />
        <div className={styles.skeletonInfoRow}>
          <div className={styles.skeletonBlock} />
          <div className={styles.skeletonBlock} />
          <div className={styles.skeletonBlockWide} />
        </div>
        <div className={styles.skeletonMetrics}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.skeletonMetricCard} />
          ))}
        </div>
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
              onClick={handleCompleteClick}
              disabled={actionLoading === "complete"}
            >
              {actionLoading === "complete"
                ? "מסיים..."
                : "סמן הרצה כהושלמה"}
            </button>
          )}
          <Link href="/sumit-sync" className="btn-ghost">
            חזרה לרשימה
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
              metric="idom_records"
              onClick={setDrillDown}
            />
            <MetricCard
              label="רשומות SUMIT"
              value={run.metrics.total_sumit_records}
              metric="sumit_records"
              onClick={setDrillDown}
            />
            <MetricCard
              label="התאמות"
              value={run.metrics.matched_count}
              accent={matchRate ? `${matchRate}%` : undefined}
              metric="matched"
              onClick={setDrillDown}
            />
            <MetricCard
              label="ללא התאמה"
              value={run.metrics.unmatched_count}
              warning={run.metrics.unmatched_count > 0}
              metric="unmatched"
              onClick={setDrillDown}
            />
            <MetricCard
              label="שינויים"
              value={run.metrics.changed_count}
              metric="changed"
              onClick={setDrillDown}
            />
            <MetricCard
              label="סטטוס → הושלם"
              value={run.metrics.status_completed_count}
              metric="status_completed"
              onClick={setDrillDown}
            />
            <MetricCard
              label="נסיגות סטטוס"
              value={run.metrics.status_regression_flags}
              warning={run.metrics.status_regression_flags > 0}
              metric="regressions"
              onClick={setDrillDown}
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

      {/* Completion confirmation dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title="השלמת הרצה"
        body={`יש ${pendingExc} חריגים שטרם נבדקו. לאחר השלמה ההרצה תינעל לעריכה. להמשיך?`}
        cancelLabel="ביטול"
        confirmLabel="השלם"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doCompleteRun}
      />

      {/* Drill-down data drawer */}
      <DrillDownDrawer
        open={drillDown !== null}
        runId={id}
        metric={drillDown?.metric ?? ""}
        label={drillDown?.label ?? ""}
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
  warning,
  metric,
  onClick,
}: {
  label: string;
  value: number;
  accent?: string;
  warning?: boolean;
  metric?: string;
  onClick?: (info: { metric: string; label: string }) => void;
}) {
  const clickable = !!(metric && onClick);
  return (
    <div
      className={`${styles.metricCard} ${warning ? styles.metricWarning : ""} ${clickable ? styles.metricCardClickable : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onClick({ metric, label }) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick({ metric, label });
              }
            }
          : undefined
      }
    >
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
      {accent && <span className={styles.metricAccent}>{accent}</span>}
    </div>
  );
}
