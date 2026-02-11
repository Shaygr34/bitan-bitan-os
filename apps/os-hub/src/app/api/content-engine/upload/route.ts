/**
 * POST /api/content-engine/upload
 *
 * Accepts a DOCX file via multipart form-data, runs the Content Engine
 * pipeline, and returns the branded PDF.
 *
 * Must run on Node runtime (not Edge) for filesystem + child_process access.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runDocxToPdf, type RunError } from "@/lib/content-engine/runner";
import { saveRecord, type HistoryRecord } from "@/lib/content-engine/history";

export const runtime = "nodejs";

// ── Constants ──

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXTENSIONS = [".docx"];
const ALLOWED_MIMES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream", // Some browsers send this for .docx
];

/**
 * Resolve the jobs directory. Uses /tmp on Railway (ephemeral), or
 * a local directory in the engine output folder for dev.
 */
function getJobsDir(): string {
  const dir = process.env.JOBS_DIR || path.join("/tmp", "content-engine-jobs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Sanitize filename ──

function sanitizeFilename(raw: string): string {
  // Strip path components, keep only the filename
  const base = raw.split(/[/\\]/).pop() || "document";
  // Remove dangerous characters, keep Hebrew/Latin/digits/dots/hyphens
  const clean = base.replace(/[^\p{L}\p{N}.\-_ ]/gu, "").trim();
  return clean || "document";
}

// ── POST handler ──

export async function POST(request: NextRequest) {
  const jobId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return errorResponse(jobId, 400, "MISSING_FILE", "לא התקבל קובץ.");
    }

    // ── Extension check ──
    const originalName = file.name || "document.docx";
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return errorResponse(
        jobId,
        400,
        "INVALID_FORMAT",
        "סוג הקובץ אינו נתמך. יש להעלות קובץ DOCX."
      );
    }

    // ── MIME check (lenient — some browsers misidentify) ──
    if (file.type && !ALLOWED_MIMES.includes(file.type)) {
      // Log but don't block — the extension check is the hard gate
      console.warn(
        JSON.stringify({
          event: "upload_mime_mismatch",
          jobId,
          expected: ALLOWED_MIMES,
          received: file.type,
        })
      );
    }

    // ── Size check ──
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(
        jobId,
        400,
        "FILE_TOO_LARGE",
        `הקובץ חורג מהגודל המותר (${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB).`
      );
    }

    // ── Write to disk ──
    const jobDir = path.join(getJobsDir(), jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const safeName = sanitizeFilename(originalName);
    const inputPath = path.join(jobDir, safeName);
    const outputPath = path.join(jobDir, safeName.replace(/\.docx$/i, ".pdf"));

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(inputPath, buffer);

    // ── DOCX magic bytes check (PK zip header) ──
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      cleanup(jobDir);
      return errorResponse(
        jobId,
        400,
        "INVALID_FORMAT",
        "הקובץ אינו קובץ DOCX תקין."
      );
    }

    // ── Run engine ──
    const result = await runDocxToPdf({ inputPath, outputPath, jobId });

    // ── Read and return PDF ──
    const pdfBuffer = fs.readFileSync(result.pdfPath);
    const pdfName = safeName.replace(/\.docx$/i, ".pdf");

    // Save to history (persistent storage for download later)
    const historyRecord: HistoryRecord = {
      id: jobId,
      originalName,
      pdfName,
      inputSize: file.size,
      outputSize: pdfBuffer.length,
      blockCount: result.blockCount,
      durationMs: result.durationMs,
      status: "success",
      timestamp: new Date().toISOString(),
    };
    saveRecord(historyRecord, pdfBuffer);

    // Clean up job dir (PDF now lives in history)
    scheduleCleanup(jobDir, 30_000);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(pdfName)}"`,
        "X-Job-Id": jobId,
        "X-Duration-Ms": String(result.durationMs),
        "X-Block-Count": String(result.blockCount ?? ""),
      },
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    const runErr = err as RunError;

    console.error(
      JSON.stringify({
        event: "upload_error",
        jobId,
        durationMs: duration,
        errorCode: runErr.code || "UNKNOWN",
        message: runErr.message || String(err),
      })
    );

    const statusCode =
      runErr.code === "ENGINE_TIMEOUT" ? 504 :
      runErr.code === "ENGINE_NOT_FOUND" ? 503 : 500;

    const userMessage =
      runErr.code === "ENGINE_TIMEOUT"
        ? "עיבוד המסמך ארך זמן רב מדי. נסו מסמך קטן יותר."
        : "שגיאה בעיבוד המסמך. נסו שנית.";

    return errorResponse(jobId, statusCode, runErr.code || "UNKNOWN", userMessage);
  }
}

// ── Helpers ──

function errorResponse(
  jobId: string,
  status: number,
  errorCode: string,
  message: string
): NextResponse {
  return NextResponse.json(
    { jobId, errorCode, message },
    {
      status,
      headers: { "X-Job-Id": jobId },
    }
  );
}

function writeRunMeta(jobDir: string, meta: Record<string, unknown>): void {
  try {
    fs.writeFileSync(
      path.join(jobDir, "run.json"),
      JSON.stringify(meta, null, 2)
    );
  } catch {
    // Non-critical — don't fail the request
  }
}

function scheduleCleanup(dir: string, delayMs: number): void {
  setTimeout(() => cleanup(dir), delayMs);
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}
