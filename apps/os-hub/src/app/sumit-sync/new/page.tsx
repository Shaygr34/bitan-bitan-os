"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import { loadSyncPrefs, saveSyncPrefs } from "@/lib/syncPrefs";
import styles from "./page.module.css";

type SyncMode = "api" | "manual";
type Step = "config" | "upload" | "executing" | "error";

interface MappingSummary {
  total_mappings: number;
  with_names: number;
}

export default function NewRunPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("config");
  const [year, setYear] = useState(new Date().getFullYear());
  const [reportType, setReportType] = useState("financial");
  const [mode, setMode] = useState<SyncMode>("api");

  const [runId, setRunId] = useState<string | null>(null);
  const [idomFile, setIdomFile] = useState<File | null>(null);
  const [sumitFile, setSumitFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [progressStage, setProgressStage] = useState(0);

  const [mapping, setMapping] = useState<MappingSummary | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load preferences
  useEffect(() => {
    const prefs = loadSyncPrefs();
    setYear(prefs.defaultYear);
    setReportType(prefs.defaultReportType);
    setMode(prefs.defaultMode || "api");
  }, []);

  // Fetch mapping summary for API mode indicator
  useEffect(() => {
    fetch("/api/sumit-sync/runs/mapping/summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setMapping(data);
      })
      .catch(() => {});
  }, []);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleModeChange = (newMode: SyncMode) => {
    setMode(newMode);
    const prefs = loadSyncPrefs();
    saveSyncPrefs({ ...prefs, defaultMode: newMode });
  };

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

  const startPolling = useCallback(
    (id: string) => {
      if (pollRef.current) clearInterval(pollRef.current);

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/sumit-sync/runs/${id}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.status === "review" || data.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            router.push(`/sumit-sync/runs/${id}`);
          } else if (data.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setError("הסנכרון נכשל בשרת");
            setStep("error");
          }
        } catch {
          // Keep polling — transient network error
        }
      }, 10_000);
    },
    [router]
  );

  async function handleUploadAndExecute() {
    if (!runId || !idomFile) return;
    if (mode === "manual" && !sumitFile) return;
    setError(null);
    setStep("executing");
    setProgressStage(0);

    try {
      // Upload IDOM
      setProgress("מעלה קובץ IDOM...");
      setProgressStage(1);
      const idomForm = new FormData();
      idomForm.append("file_role", "idom_upload");
      idomForm.append("file", idomFile);
      const idomRes = await fetch(`/api/sumit-sync/runs/${runId}/upload`, {
        method: "POST",
        body: idomForm,
      });
      if (!idomRes.ok) {
        const data = await idomRes.json().catch(() => ({}));
        throw new Error(
          data.detail || data.error || "העלאת קובץ IDOM נכשלה"
        );
      }
      setProgressStage(2);

      if (mode === "manual") {
        // Upload SUMIT file
        setProgress("מעלה קובץ SUMIT...");
        const sumitForm = new FormData();
        sumitForm.append("file_role", "sumit_upload");
        sumitForm.append("file", sumitFile!); // eslint-disable-line
        const sumitRes = await fetch(
          `/api/sumit-sync/runs/${runId}/upload`,
          { method: "POST", body: sumitForm }
        );
        if (!sumitRes.ok) {
          const data = await sumitRes.json().catch(() => ({}));
          throw new Error(
            data.detail || data.error || "העלאת קובץ SUMIT נכשלה"
          );
        }

        // Execute XLSX mode
        setProgress("מריץ סנכרון...");
        setProgressStage(3);
        const execRes = await fetch(
          `/api/sumit-sync/runs/${runId}/execute`,
          { method: "POST" }
        );
        if (!execRes.ok) {
          const data = await execRes.json().catch(() => ({}));
          throw new Error(
            data.detail || data.error || "הרצת הסנכרון נכשלה"
          );
        }
        router.push(`/sumit-sync/runs/${runId}`);
      } else {
        // Execute API mode — long-running
        setProgress("שולף נתונים מ-Summit CRM...");
        setProgressStage(3);

        // Start polling immediately — the HTTP call may time out
        startPolling(runId);

        try {
          const execRes = await fetch(
            `/api/sumit-sync/runs/${runId}/execute-api`,
            { method: "POST" }
          );
          // If we get a response (didn't timeout), handle it directly
          if (pollRef.current) clearInterval(pollRef.current);

          if (!execRes.ok) {
            const data = await execRes.json().catch(() => ({}));
            throw new Error(
              data.detail || data.error || "הסנכרון נכשל"
            );
          }
          router.push(`/sumit-sync/runs/${runId}`);
        } catch (fetchErr) {
          // If it's a timeout/network error, the poll will catch completion
          if (pollRef.current) {
            // Polling is active — let it handle completion
            setProgress("מחכה לתוצאות... (הסנכרון פועל ברקע)");
            setProgressStage(4);
          } else {
            throw fetchErr;
          }
        }
      }
    } catch (err: unknown) {
      if (pollRef.current) clearInterval(pollRef.current);
      setError(err instanceof Error ? err.message : "התהליך נכשל");
      setStep("error");
    }
  }

  const apiStages = [
    "יצירת הרצה",
    "העלאת קובץ IDOM",
    "שליפת נתונים מ-Summit CRM",
    "התאמה וסנכרון",
    "ממתין לתוצאות...",
  ];

  const manualStages = [
    "יצירת הרצה",
    "העלאת קובץ IDOM",
    "העלאת קובץ SUMIT",
    "התאמה וסנכרון",
  ];

  const stages = mode === "api" ? apiStages : manualStages;
  const isWarm = mapping != null && mapping.total_mappings > 200;

  return (
    <div>
      <PageHeader
        title="הרצה חדשה"
        description="סנכרון נתוני שע״מ עם Summit CRM"
      />

      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>!</span>
          {error}
        </div>
      )}

      {step === "config" && (
        <Card>
          <h2 className={styles.stepTitle}>שלב 1: הגדרות</h2>

          {/* Mode toggle */}
          <div className={styles.modeToggle}>
            <button
              type="button"
              className={`${styles.modeOption} ${mode === "api" ? styles.modeOptionActive : ""}`}
              onClick={() => handleModeChange("api")}
            >
              <span className={styles.modeLabel}>
                אוטומטי (API)
                <span className={styles.modeRecommended}>מומלץ</span>
              </span>
              <span className={styles.modeDesc}>
                העלאת קובץ IDOM בלבד — נתוני Summit נשלפים אוטומטית
              </span>
            </button>
            <button
              type="button"
              className={`${styles.modeOption} ${mode === "manual" ? styles.modeOptionActive : ""}`}
              onClick={() => handleModeChange("manual")}
            >
              <span className={styles.modeLabel}>ידני (קבצים)</span>
              <span className={styles.modeDesc}>
                העלאת שני קבצים — IDOM + ייצוא SUMIT ידני
              </span>
            </button>
          </div>

          {/* Mapping status for API mode */}
          {mode === "api" && mapping && (
            <div
              className={`${styles.mappingIndicator} ${isWarm ? styles.mappingWarm : styles.mappingCold}`}
            >
              {isWarm
                ? `✓ מטמון לקוחות פעיל (${mapping.total_mappings} לקוחות) — הרצה מהירה (~3-4 דקות)`
                : `מטמון חלקי (${mapping.total_mappings} לקוחות) — הרצה ראשונה עשויה לקחת ~15 דקות`}
            </div>
          )}

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
          <h2 className={styles.stepTitle}>
            שלב 2: {mode === "api" ? "העלאת קובץ IDOM" : "העלאת קבצים"}
          </h2>
          <div
            className={
              mode === "manual" ? styles.uploadGrid : styles.uploadSingle
            }
          >
            <div className={styles.uploadBox}>
              <label className={styles.uploadLabel} htmlFor="idom-file">
                קובץ IDOM (שע״מ)
              </label>
              <input
                id="idom-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) =>
                  setIdomFile(e.target.files?.[0] ?? null)
                }
                className={styles.fileInput}
              />
              {idomFile && (
                <span className={styles.fileName}>{idomFile.name}</span>
              )}
            </div>
            {mode === "manual" && (
              <div className={styles.uploadBox}>
                <label className={styles.uploadLabel} htmlFor="sumit-file">
                  קובץ SUMIT (ייצוא)
                </label>
                <input
                  id="sumit-file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) =>
                    setSumitFile(e.target.files?.[0] ?? null)
                  }
                  className={styles.fileInput}
                />
                {sumitFile && (
                  <span className={styles.fileName}>{sumitFile.name}</span>
                )}
              </div>
            )}
          </div>
          <button
            className="btn-primary"
            onClick={handleUploadAndExecute}
            disabled={!idomFile || (mode === "manual" && !sumitFile)}
          >
            {mode === "api"
              ? "העלה והרץ סנכרון אוטומטי"
              : "העלה והרץ סנכרון"}
          </button>
        </Card>
      )}

      {step === "executing" && (
        <Card>
          <div className={styles.executingState}>
            <div className={styles.spinner} />
            <p className={styles.progressText}>{progress}</p>
            <div className={styles.progressStages}>
              {stages.map((label, i) => {
                const isDone = i < progressStage;
                const isActive = i === progressStage;
                return (
                  <div
                    key={label}
                    className={`${styles.progressStage} ${isActive ? styles.stageActive : ""} ${isDone ? styles.stageDone : ""}`}
                  >
                    <span className={styles.stageIcon}>
                      {isDone ? "✓" : isActive ? "●" : "○"}
                    </span>
                    {label}
                  </div>
                );
              })}
            </div>
            {mode === "api" && (
              <p className={styles.timeEstimate}>
                {isWarm
                  ? "זמן משוער: 3-4 דקות"
                  : "זמן משוער: 10-15 דקות (הרצה ראשונה)"}
              </p>
            )}
          </div>
        </Card>
      )}

      {step === "error" && (
        <Card>
          <p className={styles.errorRetryText}>
            ההרצה נכשלה. ניתן לנסות שוב.
          </p>
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
