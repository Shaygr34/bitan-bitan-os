"use client";

import { useCallback, useRef, useState } from "react";
import { showToast } from "@/components/Toast";
import { t } from "@/lib/strings";
import styles from "./ContentEngineClient.module.css";

// ── Types ──

type FlowState =
  | { step: "idle" }
  | { step: "uploading"; fileName: string; progress: number }
  | { step: "processing"; fileName: string }
  | {
      step: "success";
      fileName: string;
      pdfUrl: string;
      pdfName: string;
      jobId: string;
      durationMs: number;
      blockCount: number | null;
    }
  | {
      step: "error";
      fileName: string;
      message: string;
      jobId: string;
      errorCode: string;
    };

// ── Constants ──

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPTED_EXTENSION = ".docx";
const ACCEPTED_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ── Component ──

export default function ContentEngineClient() {
  const [state, setState] = useState<FlowState>({ step: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── File validation ──

  const validateFile = useCallback(
    (file: File): string | null => {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      if (ext !== ACCEPTED_EXTENSION) {
        return t("common.messages.invalidFormat");
      }
      if (file.size > MAX_FILE_SIZE) {
        return t("common.messages.fileTooLarge");
      }
      if (file.size === 0) {
        return "הקובץ ריק.";
      }
      return null;
    },
    []
  );

  // ── Upload handler ──

  const handleUpload = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        showToast({ type: "error", message: error });
        return;
      }

      // Cancel any previous in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ step: "uploading", fileName: file.name, progress: 0 });

      try {
        const formData = new FormData();
        formData.append("file", file);

        setState({ step: "processing", fileName: file.name });

        const response = await fetch("/api/content-engine/upload", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        const jobId = response.headers.get("X-Job-Id") || "";
        const durationMs = parseInt(
          response.headers.get("X-Duration-Ms") || "0",
          10
        );
        const blockCount = response.headers.get("X-Block-Count")
          ? parseInt(response.headers.get("X-Block-Count")!, 10)
          : null;

        if (!response.ok) {
          const body = await response.json();
          setState({
            step: "error",
            fileName: file.name,
            message: body.message || t("contentEngine.upload.error"),
            jobId: body.jobId || jobId,
            errorCode: body.errorCode || String(response.status),
          });
          showToast({ type: "error", message: body.message || t("contentEngine.upload.error") });
          return;
        }

        // Success — create blob URL for preview
        const blob = await response.blob();
        const pdfUrl = URL.createObjectURL(blob);
        const pdfName = file.name.replace(/\.docx$/i, ".pdf");

        setState({
          step: "success",
          fileName: file.name,
          pdfUrl,
          pdfName,
          jobId,
          durationMs,
          blockCount,
        });

        showToast({ type: "success", message: t("contentEngine.upload.success") });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        setState({
          step: "error",
          fileName: file.name,
          message: t("common.messages.networkError"),
          jobId: "",
          errorCode: "NETWORK",
        });
        showToast({ type: "error", message: t("common.messages.networkError") });
      }
    },
    [validateFile]
  );

  // ── Drag & Drop handlers ──

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current += 1;
    if (dragCountRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current -= 1;
    if (dragCountRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleUpload(files[0]);
      }
    },
    [handleUpload]
  );

  // ── File picker ──

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleUpload(files[0]);
      }
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleUpload]
  );

  // ── Reset ──

  const handleReset = useCallback(() => {
    if (state.step === "success") {
      URL.revokeObjectURL(state.pdfUrl);
    }
    abortRef.current?.abort();
    setState({ step: "idle" });
  }, [state]);

  // ── Download ──

  const handleDownload = useCallback(() => {
    if (state.step !== "success") return;
    const a = document.createElement("a");
    a.href = state.pdfUrl;
    a.download = state.pdfName;
    a.click();
  }, [state]);

  // ── Render ──

  // Hidden file input (shared across all states)
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ACCEPTED_MIME + "," + ACCEPTED_EXTENSION}
      onChange={handleFileChange}
      className={styles.hiddenInput}
      aria-hidden="true"
    />
  );

  // ── IDLE state ──
  if (state.step === "idle") {
    return (
      <div>
        {fileInput}
        <div
          className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={openFilePicker}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") openFilePicker();
          }}
        >
          <div className={styles.dropzoneIcon}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <rect x="8" y="6" width="32" height="36" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
              <path d="M24 18v12M18 24h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className={styles.dropzoneTitle}>{t("contentEngine.upload.title")}</p>
          <p className={styles.dropzoneDesc}>{t("contentEngine.upload.description")}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              openFilePicker();
            }}
          >
            {t("contentEngine.upload.button")}
          </button>
        </div>
      </div>
    );
  }

  // ── UPLOADING / PROCESSING state ──
  if (state.step === "uploading" || state.step === "processing") {
    return (
      <div className={styles.processingCard}>
        {fileInput}
        <div className={styles.spinner} />
        <p className={styles.processingText}>
          {t("contentEngine.upload.processing")}
        </p>
        <p className={styles.processingFile}>{state.fileName}</p>
      </div>
    );
  }

  // ── SUCCESS state ──
  if (state.step === "success") {
    return (
      <div>
        {fileInput}
        <div className={styles.successHeader}>
          <div className={styles.successInfo}>
            <span className={styles.successBadge}>{t("common.status.completed")}</span>
            <span className={styles.successMeta}>
              {state.pdfName} &middot; {(state.durationMs / 1000).toFixed(1)}s
              {state.blockCount ? ` \u00b7 ${state.blockCount} blocks` : ""}
            </span>
          </div>
          <div className={styles.successActions}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleDownload}
            >
              {t("contentEngine.download.button")}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleReset}
            >
              {t("contentEngine.upload.another")}
            </button>
          </div>
        </div>
        <div className={styles.previewContainer}>
          <object
            data={state.pdfUrl}
            type="application/pdf"
            className={styles.pdfPreview}
            aria-label={t("contentEngine.preview.title")}
          >
            <p className={styles.previewFallback}>
              {t("contentEngine.preview.fallback")}
              <button
                type="button"
                className="btn-primary"
                onClick={handleDownload}
                style={{ marginTop: "var(--space-md)" }}
              >
                {t("contentEngine.download.button")}
              </button>
            </p>
          </object>
        </div>
      </div>
    );
  }

  // ── ERROR state ──
  if (state.step === "error") {
    return (
      <div>
        {fileInput}
        <div className={styles.errorCard}>
          <div className={styles.errorIcon}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="none" />
              <path d="M16 10v8M16 22v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className={styles.errorMessage}>{state.message}</p>
          <details className={styles.errorDetails}>
            <summary>{t("contentEngine.error.details")}</summary>
            <div className={styles.errorMeta}>
              <span>Job ID: {state.jobId || "—"}</span>
              <span>Error: {state.errorCode}</span>
              <span>File: {state.fileName}</span>
            </div>
          </details>
          <div className={styles.errorActions}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleReset}
            >
              {t("common.actions.tryAgain")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
