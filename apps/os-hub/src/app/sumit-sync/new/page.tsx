"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import { loadSyncPrefs } from "@/lib/syncPrefs";
import styles from "./page.module.css";

type Step = "upload" | "executing" | "done" | "error";

interface MappingSummary {
  total_mappings: number;
  with_names: number;
}

export default function NewRunPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("upload");
  const [year, setYear] = useState(new Date().getFullYear() - 1); // Default to previous tax year
  const [runId, setRunId] = useState<string | null>(null);
  const [idomFile, setIdomFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [progressStage, setProgressStage] = useState(0);
  const [mapping, setMapping] = useState<MappingSummary | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prefs = loadSyncPrefs();
    setYear(prefs.defaultYear);
  }, []);

  // Fetch mapping summary
  useEffect(() => {
    fetch("/api/sumit-sync/runs/mapping/summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setMapping(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const isWarm = mapping != null && mapping.total_mappings > 200;

  const startPolling = useCallback(
    (id: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      // Poll every 5s (not 10) for faster failure detection
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
            setError(data.operator_notes || data.error || "הסנכרון נכשל — ייתכן שהקובץ לא תואם את המבנה הנדרש");
            setStep("error");
          }
        } catch {
          // Keep polling
        }
      }, 5_000);
    },
    [router]
  );

  // Drag & drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave() {
    setIsDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      setIdomFile(file);
    }
  }

  async function handleExecute() {
    if (!idomFile) return;
    setError(null);
    setStep("executing");
    setProgressStage(0);

    try {
      // 1. Create run — report_type "annual" is placeholder, workbook handles routing
      setProgress("יוצר הרצה...");
      setProgressStage(0);
      const createRes = await fetch("/api/sumit-sync/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, report_type: "annual" }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "שגיאה ביצירת הרצה");
      }
      const run = await createRes.json();
      const id = run.id;
      setRunId(id);

      // 2. Upload IDOM workbook
      setProgress("מעלה קובץ IDOM...");
      setProgressStage(1);
      const form = new FormData();
      form.append("file_role", "idom_upload");
      form.append("file", idomFile);
      const uploadRes = await fetch(`/api/sumit-sync/runs/${id}/upload`, {
        method: "POST",
        body: form,
      });
      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "העלאת קובץ נכשלה");
      }
      setProgressStage(2);

      // 3. Execute API mode — long running, start polling immediately
      setProgress("שולף נתונים מ-Summit ומבצע סנכרון...");
      setProgressStage(2); // Only mark upload as done, not the sync stages

      // Fire execute-api — returns immediately, sync runs in background
      const execRes = await fetch(`/api/sumit-sync/runs/${id}/execute-api`, {
        method: "POST",
      });
      if (!execRes.ok) {
        const data = await execRes.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "הסנכרון נכשל");
      }

      // Backend accepted — switch to background polling mode
      setProgress("background");
      setProgressStage(3);
      startPolling(id);
    } catch (err: unknown) {
      if (pollRef.current) clearInterval(pollRef.current);
      setError(err instanceof Error ? err.message : "התהליך נכשל");
      setStep("error");
    }
  }

  const stages = [
    "יצירת הרצה",
    "העלאת קובץ IDOM",
    "שליפת נתונים מ-Summit",
    "הסנכרון פועל ברקע...",
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="סנכרון שע״מ ↔ סאמיט"
        description="העלאת קובץ אידום — הנתונים מסונכרנים אוטומטית"
      />

      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>!</span>
          {error}
        </div>
      )}

      {step === "upload" && (
        <>
          {/* Status bar */}
          <div className={styles.statusBar}>
            <div className={`${styles.statusChip} ${isWarm ? styles.chipWarm : styles.chipCold}`}>
              <span className={styles.statusDot} />
              {mapping
                ? isWarm
                  ? `מטמון פעיל · ${mapping.total_mappings} לקוחות`
                  : `מטמון חלקי · ${mapping.total_mappings} לקוחות`
                : "טוען מטמון..."}
            </div>
            <select
              className={styles.yearSelect}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[2026, 2025, 2024, 2023, 2022].map((y) => (
                <option key={y} value={y}>שנת מס {y}</option>
              ))}
            </select>
          </div>

          <Card>
            {/* Drop zone */}
            <div
              className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ""} ${idomFile ? styles.dropZoneReady : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setIdomFile(e.target.files?.[0] ?? null)}
                className={styles.hiddenInput}
              />

              {idomFile ? (
                <div className={styles.fileReady}>
                  <div className={styles.fileIcon}>📊</div>
                  <div className={styles.fileDetails}>
                    <span className={styles.fileName}>{idomFile.name}</span>
                    <span className={styles.fileSize}>
                      {(idomFile.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  <button
                    className={styles.fileRemove}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIdomFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className={styles.dropPrompt}>
                  <div className={styles.dropIcon}>
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <rect x="8" y="12" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
                      <path d="M24 8v16M18 18l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className={styles.dropTitle}>גרור קובץ IDOM לכאן</p>
                  <p className={styles.dropSubtitle}>או לחץ לבחירת קובץ · XLSX</p>
                </div>
              )}
            </div>

            {/* Template download */}
            <div className={styles.templateBar}>
              <a href="/idom-template.xlsx" download className={styles.templateLink}>
                <span className={styles.templateIcon}>⬇</span>
                הורד תבנית IDOM
              </a>
              <span className={styles.templateHint}>
                תבנית מוכנה עם כותרות — להדביק בה נתונים מהשאילתא בשע״מ
              </span>
            </div>

            {/* Execute button */}
            <button
              className={`${styles.executeBtn} ${idomFile ? styles.executeBtnReady : ""}`}
              onClick={handleExecute}
              disabled={!idomFile}
            >
              <span className={styles.executeBtnIcon}>⚡</span>
              {idomFile ? "הרץ סנכרון" : "בחר קובץ להמשך"}
            </button>

            {isWarm && idomFile && (
              <p className={styles.timeHint}>זמן משוער: 3-4 דקות</p>
            )}
            {!isWarm && idomFile && (
              <p className={styles.timeHint}>הרצה ראשונה עשויה לקחת ~15 דקות</p>
            )}
          </Card>
        </>
      )}

      {step === "executing" && (
        <Card>
          <div className={styles.executingState}>
            <div className={styles.spinnerRing}>
              <div className={styles.spinnerInner} />
            </div>
            {progress === "background" ? (
              <>
                <p className={styles.progressText}>הסנכרון פועל ברקע</p>
                <p className={styles.backgroundHint}>
                  שליפת הנתונים מ-Summit לוקחת 3-15 דקות.
                  <br />
                  אפשר לסגור את הדף — התוצאות יחכו לך.
                </p>
                {runId && (
                  <a
                    href={`/sumit-sync/runs/${runId}`}
                    className={styles.viewRunLink}
                  >
                    עבור לדף ההרצה →
                  </a>
                )}
              </>
            ) : (
              <p className={styles.progressText}>{progress}</p>
            )}
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
          </div>
        </Card>
      )}

      {step === "error" && (
        <Card>
          <div className={styles.errorState}>
            <div className={styles.errorEmoji}>⚠️</div>
            <p className={styles.errorMessage}>ההרצה נכשלה</p>
            <p className={styles.errorDetail}>{error}</p>
            <button
              className="btn-secondary"
              onClick={() => {
                setStep("upload");
                setError(null);
                setRunId(null);
              }}
            >
              נסה שוב
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
