"use client";

import { useState, useCallback, useRef } from "react";
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
  const dragCount = useRef(0);

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

      setStage("done");
      showToast({ type: "success", message: `טיוטה נוצרה: ${data.title}` });

      // Redirect to article editor
      router.push(`/content-factory/articles/${data.articleId}`);
    } catch (err) {
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
            <div className={styles.dropIcon}>+</div>
            <p className={styles.dropText}>{t("contentFactory.new.uploadDesc")}</p>
            <p className={styles.dropFormats}>PDF, DOCX — עד 20MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              multiple
              className={styles.hiddenInput}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
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
