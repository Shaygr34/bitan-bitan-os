"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import { t } from "@/lib/strings";
import { showToast } from "@/components/Toast";
import styles from "./page.module.css";

interface UploadedRef {
  id: string;
  filename: string;
  charCount: number;
  preview: string;
}

type Stage = "idle" | "uploading" | "generating" | "done" | "error";

export default function NewArticlePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploads, setUploads] = useState<UploadedRef[]>([]);
  const [topic, setTopic] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genStep, setGenStep] = useState("");
  const dragCount = useRef(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timed progress simulation for draft generation
  const PROGRESS_STEPS = [
    { at: 0, label: "מנתח חומרי מקור..." },
    { at: 15, label: "בונה הנחיות למערכת..." },
    { at: 25, label: "Claude כותב טיוטה..." },
    { at: 50, label: "ממשיך לכתוב..." },
    { at: 75, label: "מסיים כתיבה ומפרסר תוצאות..." },
    { at: 90, label: "שומר מאמר..." },
  ];

  function startProgress() {
    setGenProgress(0);
    setGenStep(PROGRESS_STEPS[0].label);
    let elapsed = 0;
    progressTimer.current = setInterval(() => {
      elapsed += 1;
      // Asymptotic progress: fast at start, slows toward 95%
      const pct = Math.min(95, Math.round(100 * (1 - Math.exp(-elapsed / 60))));
      setGenProgress(pct);
      // Find the latest matching step
      const step = [...PROGRESS_STEPS].reverse().find((s) => pct >= s.at);
      if (step) setGenStep(step.label);
    }, 1000);
  }

  function stopProgress(success: boolean) {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    if (success) {
      setGenProgress(100);
      setGenStep("הטיוטה מוכנה!");
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;

    // Validate
    for (const f of fileArray) {
      if (!/\.(pdf|docx)$/i.test(f.name)) {
        showToast({ type: "error", message: `סוג קובץ לא נתמך: ${f.name}` });
        return;
      }
      if (f.size > 20 * 1024 * 1024) {
        showToast({ type: "error", message: `הקובץ ${f.name} חורג מ-20MB` });
        return;
      }
    }

    setStage("uploading");
    setErrorMsg("");

    const formData = new FormData();
    for (const f of fileArray) {
      formData.append("files", f);
    }

    try {
      const res = await fetch("/api/content-factory/upload-refs", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploads((prev) => [...prev, ...data.uploads]);
      setStage("idle");
      showToast({ type: "success", message: `${data.uploads.length} קבצים הועלו בהצלחה` });
    } catch (err) {
      setStage("error");
      setErrorMsg(err instanceof Error ? err.message : "שגיאה בהעלאה");
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current++;
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current--;
    if (dragCount.current === 0) setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCount.current = 0;
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleGenerate = useCallback(async () => {
    if (!uploads.length) return;

    setStage("generating");
    setErrorMsg("");
    startProgress();

    try {
      const res = await fetch("/api/content-factory/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refUploadIds: uploads.map((u) => u.id),
          topic: topic.trim() || undefined,
          userNotes: userNotes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Draft generation failed");
      }

      stopProgress(true);
      setStage("done");
      showToast({ type: "success", message: `טיוטה נוצרה: ${data.title}` });

      // Redirect to article editor
      router.push(`/content-factory/articles/${data.articleId}`);
    } catch (err) {
      stopProgress(false);
      setStage("error");
      setErrorMsg(err instanceof Error ? err.message : "שגיאה ביצירת טיוטה");
    }
  }, [uploads, topic, userNotes, router]);

  const removeUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const isWorking = stage === "uploading" || stage === "generating";

  return (
    <div className="animate-page">
      <PageHeader
        title={t("contentFactory.new.title")}
        description={t("contentFactory.new.subtitle")}
      />

      <div className={styles.layout}>
        {/* Upload Zone */}
        <Card>
          <h2 className={styles.sectionTitle}>{t("contentFactory.new.uploadTitle")}</h2>
          <div
            className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ""} ${isWorking ? styles.dropZoneDisabled : ""}`}
            onDragEnter={handleDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isWorking && fileInputRef.current?.click()}
          >
            <div className={styles.dropIcon}>{stage === "uploading" ? "⏳" : "+"}</div>
            <p className={styles.dropText}>
              {stage === "uploading" ? "מעלה ומעבד קבצים..." : t("contentFactory.new.uploadDesc")}
            </p>
            <p className={styles.dropFormats}>PDF, DOCX — עד 20MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              multiple
              className={styles.hiddenInput}
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                // Reset value so re-selecting same file triggers onChange
                e.target.value = "";
              }}
            />
          </div>

          {/* Uploaded files list */}
          {uploads.length > 0 && (
            <div className={styles.fileList}>
              {uploads.map((u) => (
                <div key={u.id} className={styles.fileChip}>
                  <span className={styles.fileName}>{u.filename}</span>
                  <span className={styles.fileChars}>
                    {(u.charCount / 1000).toFixed(1)}K תווים
                  </span>
                  <button
                    className={styles.fileRemove}
                    onClick={() => removeUpload(u.id)}
                    disabled={isWorking}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Topic & Notes */}
        <Card>
          <div className={styles.formField}>
            <label htmlFor="topic">{t("contentFactory.new.topicLabel")}</label>
            <input
              id="topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t("contentFactory.new.topicPlaceholder")}
              disabled={isWorking}
            />
          </div>
          <div className={styles.formField}>
            <label htmlFor="notes">{t("contentFactory.new.notesLabel")}</label>
            <textarea
              id="notes"
              rows={3}
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder={t("contentFactory.new.notesPlaceholder")}
              disabled={isWorking}
            />
          </div>
        </Card>

        {/* Generate Button */}
        <button
          className={`btn-primary ${styles.generateBtn}`}
          onClick={handleGenerate}
          disabled={!uploads.length || isWorking}
        >
          {stage === "uploading"
            ? "מעלה קבצים..."
            : stage === "generating"
              ? t("contentFactory.new.generating")
              : t("contentFactory.new.generateDraft")}
        </button>

        {/* Progress Bar */}
        {stage === "generating" && (
          <Card>
            <div className={styles.progressContainer}>
              <div className={styles.progressHeader}>
                <span className={styles.progressStep}>{genStep}</span>
                <span className={styles.progressPct}>{genProgress}%</span>
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${genProgress}%` }}
                />
              </div>
              <p className={styles.progressHint}>
                יצירת טיוטה אורכת בדרך כלל 1-3 דקות
              </p>
            </div>
          </Card>
        )}

        {/* Error */}
        {stage === "error" && errorMsg && (
          <Card className={styles.errorCard}>
            <p className={styles.errorText}>{errorMsg}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
