/**
 * Fingerprint generation and deduplication for Ideas.
 *
 * Fingerprint = SHA-256 hash of normalized title.
 * Duplicate = same fingerprint OR same sourceUrl.
 */

import { createHash } from "crypto";

/**
 * Normalize a title for fingerprint generation:
 * - Trim whitespace
 * - Lowercase
 * - Strip Hebrew diacritics (nikud)
 * - Keep only Hebrew + alphanumeric + spaces
 * - Collapse multiple spaces to single space
 */
export function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, "")               // Remove Hebrew nikud
    .replace(/[^\w\s\u0590-\u05FF]/g, "")           // Keep Hebrew + alphanumeric
    .replace(/\s+/g, " ");
}

/**
 * Generate a SHA-256 fingerprint from a title.
 */
export function generateFingerprint(title: string): string {
  const normalized = normalizeTitle(title);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
