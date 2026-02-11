"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import { t } from "@/lib/strings";
import { TYPE_LABELS, FILE_ROLE_LABELS, formatBytes, relativeTime } from "@/lib/formatters";
import styles from "./page.module.css";

interface DocumentFile {
  fileId: string;
  runId: string;
  fileName: string;
  fileRole: string;
  sizeBytes: number;
  year: number;
  reportType: string;
  createdAt: string;
}

interface RunSummary {
  id: string;
  year: number;
  report_type: string;
  status: string;
  created_at: string;
}

interface RunFile {
  id: string;
  file_role: string;
  original_name: string;
  size_bytes: number;
}

interface RunDetail extends RunSummary {
  files: RunFile[];
}

export default function DocumentsPage() {
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<DocumentFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadFiles() {
      try {
        const runsRes = await fetch("/api/sumit-sync/runs");
        if (!runsRes.ok) throw new Error("טעינת הרצות נכשלה");
        const runs: RunSummary[] = await runsRes.json();

        const details = await Promise.all(
          runs.map((run) =>
            fetch(`/api/sumit-sync/runs/${run.id}`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
        );

        const allFiles: DocumentFile[] = [];
        for (const detail of details) {
          if (!detail?.files) continue;
          const rd = detail as RunDetail;
          for (const f of rd.files) {
            allFiles.push({
              fileId: f.id,
              runId: rd.id,
              fileName: f.original_name,
              fileRole: f.file_role,
              sizeBytes: f.size_bytes,
              year: rd.year,
              reportType: rd.report_type,
              createdAt: rd.created_at,
            });
          }
        }

        setFiles(allFiles);
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בטעינת קבצים");
      } finally {
        setLoading(false);
      }
    }

    loadFiles();
  }, []);

  const handleDeleteRun = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sumit-sync/runs/${deleteTarget.runId}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "מחיקה נכשלה");
      }
      // Remove all files belonging to that run
      setFiles((prev) => prev.filter((f) => f.runId !== deleteTarget.runId));
      showToast({ type: "success", message: "ההרצה וכל קבציה נמחקו" });
    } catch (err) {
      showToast({ type: "error", message: err instanceof Error ? err.message : "שגיאה במחיקה" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const years = [...new Set(files.map((f) => f.year))].sort((a, b) => b - a);
  const roles = [...new Set(files.map((f) => f.fileRole))];

  const filtered = files.filter((f) => {
    if (search && !f.fileName.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (filterYear !== "all" && f.year !== Number(filterYear)) return false;
    if (filterType !== "all" && f.reportType !== filterType) return false;
    if (filterRole !== "all" && f.fileRole !== filterRole) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title={t("documents.title")}
        description="מרכז הקבצים — כל קבצי הפלט והקלט ממערכת הסנכרון"
      />

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={t("documents.search.placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.filters}>
          <select
            className={styles.filterSelect}
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
          >
            <option value="all">כל השנים</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">כל הסוגים</option>
            <option value="financial">דוחות כספיים</option>
            <option value="annual">דוחות שנתיים</option>
          </select>
          <select
            className={styles.filterSelect}
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="all">כל התפקידים</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {FILE_ROLE_LABELS[r] ?? r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className={styles.skeletonTable}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.skeletonRow}>
              <div className={styles.skeletonCell} />
              <div className={styles.skeletonCell} />
              <div className={styles.skeletonCellShort} />
              <div className={styles.skeletonCell} />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>!</span>
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          message={files.length === 0 ? "אין קבצים להצגה" : "אין תוצאות לסינון הנוכחי"}
          detail={files.length === 0 ? "קבצים ייווצרו אוטומטית לאחר הרצת סנכרון" : "נסו לשנות את הסינון או החיפוש"}
        />
      )}

      {/* File count */}
      {!loading && !error && filtered.length > 0 && (
        <>
          <p className={styles.fileCount}>
            סה״כ {filtered.length} קבצים
          </p>
          <table className={styles.filesTable}>
            <thead>
              <tr>
                <th>שם קובץ</th>
                <th>הרצה</th>
                <th>תפקיד</th>
                <th>תאריך</th>
                <th>גודל</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={`${f.runId}-${f.fileId}`}>
                  <td className={styles.fileNameCell}>{f.fileName}</td>
                  <td>
                    {TYPE_LABELS[f.reportType] ?? f.reportType} {f.year}
                  </td>
                  <td>{FILE_ROLE_LABELS[f.fileRole] ?? f.fileRole}</td>
                  <td
                    className={styles.dateCell}
                    title={new Date(f.createdAt).toLocaleString("he-IL")}
                  >
                    {relativeTime(f.createdAt)}
                  </td>
                  <td className={styles.sizeCell}>
                    {formatBytes(f.sizeBytes)}
                  </td>
                  <td className={styles.fileActions}>
                    <a
                      href={`/api/sumit-sync/runs/${f.runId}/files/${f.fileId}/download`}
                      download
                      className={styles.downloadLink}
                    >
                      ↓
                    </a>
                    <button
                      className={styles.deleteBtn}
                      title="מחק הרצה (כל הקבצים)"
                      onClick={() => setDeleteTarget(f)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="מחיקת הרצה"
        body={
          deleteTarget
            ? `למחוק את ההרצה ${TYPE_LABELS[deleteTarget.reportType] ?? deleteTarget.reportType} ${deleteTarget.year}? כל הקבצים השייכים להרצה זו יימחקו לצמיתות.`
            : ""
        }
        cancelLabel="ביטול"
        confirmLabel={deleting ? "מוחק..." : "מחק"}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteRun}
      />
    </div>
  );
}
