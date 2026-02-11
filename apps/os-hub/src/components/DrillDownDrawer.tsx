"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./DrillDownDrawer.module.css";

interface DrillDownData {
  metric: string;
  total_rows: number;
  columns: string[];
  rows: Record<string, unknown>[];
}

interface DrillDownDrawerProps {
  open: boolean;
  runId: string;
  metric: string;
  label: string;
  onClose: () => void;
}

export default function DrillDownDrawer({
  open,
  runId,
  metric,
  label,
  onClose,
}: DrillDownDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<DrillDownData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    if (!runId || !metric) return;
    setLoading(true);
    setError(null);
    fetch(`/api/sumit-sync/runs/${runId}/drill-down/${metric}?limit=200`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((d: DrillDownData) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [runId, metric]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      fetchData();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, fetchData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h2 className={styles.title}>{label}</h2>
          {data && (
            <span className={styles.rowCount}>{data.total_rows} שורות</span>
          )}
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="סגור"
          >
            &times;
          </button>
        </div>

        {loading && (
          <div className={styles.loadingBar}>
            <div className={styles.loadingFill} />
          </div>
        )}

        {error && (
          <div className={styles.errorMsg}>שגיאה בטעינת נתונים: {error}</div>
        )}

        {data && data.rows.length === 0 && !loading && (
          <p className={styles.emptyMsg}>אין נתונים להצגה</p>
        )}

        {data && data.rows.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {data.columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    {data.columns.map((col) => (
                      <td key={col}>{String(row[col] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total_rows > data.rows.length && (
          <p className={styles.truncated}>
            מוצגות {data.rows.length} מתוך {data.total_rows} שורות
          </p>
        )}
      </div>
    </dialog>
  );
}
