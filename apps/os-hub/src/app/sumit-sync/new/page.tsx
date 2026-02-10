"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import styles from "./page.module.css";

type Step = "config" | "upload" | "executing" | "error";

export default function NewRunPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("config");
  const [year, setYear] = useState(new Date().getFullYear());
  const [reportType, setReportType] = useState("financial");
  const [runId, setRunId] = useState<string | null>(null);
  const [idomFile, setIdomFile] = useState<File | null>(null);
  const [sumitFile, setSumitFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  async function handleCreateRun() {
    setError(null);
    try {
      const res = await fetch("/api/sumit-sync/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, report_type: reportType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || `${res.status}`);
      }
      const run = await res.json();
      setRunId(run.id);
      setStep("upload");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "שגיאה ביצירת הרצה");
    }
  }

  async function handleUploadAndExecute() {
    if (!runId || !idomFile || !sumitFile) return;
    setError(null);
    setStep("executing");

    try {
      // Upload IDOM
      setProgress("מעלה קובץ IDOM...");
      const idomForm = new FormData();
      idomForm.append("file_role", "idom_upload");
      idomForm.append("file", idomFile);
      const idomRes = await fetch(`/api/sumit-sync/runs/${runId}/upload`, {
        method: "POST",
        body: idomForm,
      });
      if (!idomRes.ok) {
        const data = await idomRes.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "העלאת קובץ IDOM נכשלה");
      }

      // Upload SUMIT
      setProgress("מעלה קובץ SUMIT...");
      const sumitForm = new FormData();
      sumitForm.append("file_role", "sumit_upload");
      sumitForm.append("file", sumitFile);
      const sumitRes = await fetch(`/api/sumit-sync/runs/${runId}/upload`, {
        method: "POST",
        body: sumitForm,
      });
      if (!sumitRes.ok) {
        const data = await sumitRes.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "העלאת קובץ SUMIT נכשלה");
      }

      // Execute
      setProgress("מריץ סנכרון...");
      const execRes = await fetch(`/api/sumit-sync/runs/${runId}/execute`, {
        method: "POST",
      });
      if (!execRes.ok) {
        const data = await execRes.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "הרצת הסנכרון נכשלה");
      }

      // Success → redirect to run detail
      router.push(`/sumit-sync/runs/${runId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "התהליך נכשל");
      setStep("error");
    }
  }

  return (
    <div>
      <PageHeader title="הרצה חדשה" description="הגדרת סנכרון IDOM ← SUMIT" />

      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>!</span>
          {error}
        </div>
      )}

      {step === "config" && (
        <Card>
          <h2 className={styles.stepTitle}>שלב 1: הגדרות</h2>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="year">שנת מס</label>
              <input
                id="year"
                type="number"
                min={2020}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="reportType">סוג דוח</label>
              <select
                id="reportType"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="financial">דוחות כספיים</option>
                <option value="annual">דוחות שנתיים</option>
              </select>
            </div>
          </div>
          <button className="btn-primary" onClick={handleCreateRun}>
            המשך
          </button>
        </Card>
      )}

      {step === "upload" && (
        <Card>
          <h2 className={styles.stepTitle}>שלב 2: העלאת קבצים</h2>
          <div className={styles.uploadGrid}>
            <div className={styles.uploadBox}>
              <label className={styles.uploadLabel} htmlFor="idom-file">
                קובץ IDOM (שע״מ)
              </label>
              <input
                id="idom-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setIdomFile(e.target.files?.[0] ?? null)}
                className={styles.fileInput}
              />
              {idomFile && (
                <span className={styles.fileName}>{idomFile.name}</span>
              )}
            </div>
            <div className={styles.uploadBox}>
              <label className={styles.uploadLabel} htmlFor="sumit-file">
                קובץ SUMIT (ייצוא)
              </label>
              <input
                id="sumit-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setSumitFile(e.target.files?.[0] ?? null)}
                className={styles.fileInput}
              />
              {sumitFile && (
                <span className={styles.fileName}>{sumitFile.name}</span>
              )}
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={handleUploadAndExecute}
            disabled={!idomFile || !sumitFile}
          >
            העלה והרץ סנכרון
          </button>
        </Card>
      )}

      {step === "executing" && (
        <Card>
          <div className={styles.executingState}>
            <div className={styles.spinner} />
            <p className={styles.progressText}>{progress}</p>
          </div>
        </Card>
      )}

      {step === "error" && (
        <Card>
          <p className={styles.errorRetryText}>ההרצה נכשלה. ניתן לנסות שוב.</p>
          <button
            className="btn-secondary"
            onClick={() => {
              setStep("upload");
              setError(null);
            }}
          >
            חזור להעלאת קבצים
          </button>
        </Card>
      )}
    </div>
  );
}
