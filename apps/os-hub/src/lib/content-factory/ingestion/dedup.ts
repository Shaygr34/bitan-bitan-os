/**
 * Fingerprint generation and deduplication for Ideas.
 *
 * Fingerprint = SHA-256 hash of normalized title.
 * Duplicate = same fingerprint OR same normalized URL.
 */

import { createHash } from "crypto";

/** Common Hebrew stopwords stripped for better cross-source matching. */
const HE_STOPWORDS = new Set([
  "ה", "ו", "של", "את", "על", "עם", "כי", "גם", "לא", "או", "כל",
  "אם", "מ", "ב", "ל", "כ", "ש", "זה", "זו", "זאת", "אל", "הם",
  "אין", "היא", "הוא", "אני", "הן", "עד", "רק", "כן", "בין", "מן",
]);

/** Tracking / analytics query params that should be stripped for URL normalization. */
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "ref", "source", "mc_cid", "mc_eid",
]);

/**
 * Normalize a title for fingerprint generation:
 * - Trim whitespace
 * - Lowercase
 * - Strip Hebrew diacritics (nikud)
 * - Strip common Hebrew stopwords for better cross-source matching
 * - Keep only Hebrew + alphanumeric + spaces
 * - Collapse multiple spaces to single space
 */
export function normalizeTitle(title: string): string {
  const cleaned = title
    .trim()
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, "")               // Remove Hebrew nikud
    .replace(/[^\w\s\u0590-\u05FF]/g, "")           // Keep Hebrew + alphanumeric
    .replace(/\s+/g, " ");

  // Strip Hebrew stopwords for better cross-source matching
  const words = cleaned.split(" ").filter((w) => !HE_STOPWORDS.has(w));
  return words.join(" ").trim();
}

/**
 * Normalize a URL for dedup comparison:
 * - Strip tracking/analytics query params (utm_*, fbclid, etc.)
 * - Remove trailing slash
 * - Lowercase hostname
 * - Remove www. prefix
 * - Remove fragment (#...)
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);

    // Lowercase hostname + strip www.
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");

    // Remove tracking params
    for (const param of TRACKING_PARAMS) {
      u.searchParams.delete(param);
    }

    // Remove fragment
    u.hash = "";

    // Build normalized URL and strip trailing slash
    let normalized = u.toString();
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    // If URL parsing fails, return lowercase trimmed version
    return url.trim().toLowerCase();
  }
}

/**
 * Generate a SHA-256 fingerprint from a title.
 */
export function generateFingerprint(title: string): string {
  const normalized = normalizeTitle(title);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Generate a SHA-256 fingerprint from a URL (for URL-based dedup).
 */
export function generateUrlFingerprint(url: string): string {
  const normalized = normalizeUrl(url);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
