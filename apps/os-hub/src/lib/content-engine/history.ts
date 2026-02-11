/**
 * Content Engine — Conversion history (file-based).
 *
 * Stores metadata JSON + PDF files in a persistent directory.
 * In production, swap for a database-backed store.
 */

import fs from "node:fs";
import path from "node:path";

export interface HistoryRecord {
  id: string;
  originalName: string;
  pdfName: string;
  inputSize: number;
  outputSize: number;
  blockCount: number | null;
  durationMs: number;
  status: "success" | "error";
  errorCode?: string;
  timestamp: string; // ISO
}

const HISTORY_DIR =
  process.env.CE_HISTORY_DIR ||
  path.join("/tmp", "content-engine-history");

function ensureDir(): void {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function metaPath(id: string): string {
  return path.join(HISTORY_DIR, `${id}.json`);
}

function pdfPath(id: string): string {
  return path.join(HISTORY_DIR, `${id}.pdf`);
}

/** Save a conversion record + keep the PDF. */
export function saveRecord(
  record: HistoryRecord,
  pdfBuffer: Buffer
): void {
  ensureDir();
  fs.writeFileSync(metaPath(record.id), JSON.stringify(record, null, 2));
  fs.writeFileSync(pdfPath(record.id), pdfBuffer);
}

/** List all records, newest first. */
export function listRecords(): HistoryRecord[] {
  ensureDir();
  const files = fs.readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
  const records: HistoryRecord[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(HISTORY_DIR, file), "utf-8");
      records.push(JSON.parse(raw));
    } catch {
      // Skip corrupt/unreadable files
    }
  }

  // Sort newest first
  records.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return records;
}

/** Get a single record by ID. */
export function getRecord(id: string): HistoryRecord | null {
  const p = metaPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

/** Get the PDF buffer for a record. Returns null if not found. */
export function getPdfBuffer(id: string): Buffer | null {
  const p = pdfPath(id);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

/** Delete a record + its PDF. */
export function deleteRecord(id: string): boolean {
  let deleted = false;
  for (const p of [metaPath(id), pdfPath(id)]) {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      deleted = true;
    }
  }
  return deleted;
}
