/**
 * Unit tests for fingerprint generation and dedup logic.
 *
 * Run: node --experimental-strip-types --test tests/dedup.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";

// ── Inline the dedup functions (same as dedup.ts) ───────────────────────────
// Duplicated here so tests run without module resolution.

const HE_STOPWORDS = new Set([
  "ה", "ו", "של", "את", "על", "עם", "כי", "גם", "לא", "או", "כל",
  "אם", "מ", "ב", "ל", "כ", "ש", "זה", "זו", "זאת", "אל", "הם",
  "אין", "היא", "הוא", "אני", "הן", "עד", "רק", "כן", "בין", "מן",
]);

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "ref", "source", "mc_cid", "mc_eid",
]);

function normalizeTitle(title: string): string {
  const cleaned = title
    .trim()
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[^\w\s\u0590-\u05FF]/g, "")
    .replace(/\s+/g, " ");

  const words = cleaned.split(" ").filter((w) => !HE_STOPWORDS.has(w));
  return words.join(" ").trim();
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const param of TRACKING_PARAMS) {
      u.searchParams.delete(param);
    }
    u.hash = "";
    let normalized = u.toString();
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url.trim().toLowerCase();
  }
}

function generateFingerprint(title: string): string {
  const normalized = normalizeTitle(title);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("normalizeTitle", () => {
  it("trims whitespace", () => {
    assert.equal(normalizeTitle("  hello  "), "hello");
  });

  it("converts to lowercase", () => {
    assert.equal(normalizeTitle("Hello World"), "hello world");
  });

  it("strips Hebrew nikud", () => {
    // שָׁלוֹם → שלום
    assert.equal(normalizeTitle("שָׁלוֹם"), "שלום");
  });

  it("removes special characters but keeps Hebrew and alphanumeric", () => {
    assert.equal(normalizeTitle("מס הכנסה: 2024!"), "מס הכנסה 2024");
  });

  it("collapses multiple spaces", () => {
    assert.equal(normalizeTitle("hello   world   test"), "hello world test");
  });

  it("handles mixed Hebrew and English", () => {
    const result = normalizeTitle("  מיסים Tax 2024  ");
    assert.equal(result, "מיסים tax 2024");
  });

  it("strips Hebrew stopwords", () => {
    // "ה" and "של" and "על" are stopwords
    const result = normalizeTitle("מס הכנסה של ישראל על עסקים");
    assert.equal(result, "מס הכנסה ישראל עסקים");
  });

  it("strips single-char prefix stopwords", () => {
    // "ה", "ו", "ב", "ל", "מ", "כ", "ש" are stopwords
    const result = normalizeTitle("ה ו ב ל מ כ ש שלום");
    assert.equal(result, "שלום");
  });
});

describe("normalizeUrl", () => {
  it("strips utm tracking params", () => {
    const result = normalizeUrl(
      "https://www.globes.co.il/news/article?id=123&utm_source=twitter&utm_medium=social",
    );
    assert.equal(result, "https://globes.co.il/news/article?id=123");
  });

  it("removes www prefix", () => {
    const result = normalizeUrl("https://www.themarker.com/article/123");
    assert.equal(result, "https://themarker.com/article/123");
  });

  it("removes trailing slash", () => {
    const result = normalizeUrl("https://globes.co.il/article/123/");
    assert.equal(result, "https://globes.co.il/article/123");
  });

  it("removes hash fragment", () => {
    const result = normalizeUrl("https://globes.co.il/article#comments");
    assert.equal(result, "https://globes.co.il/article");
  });

  it("lowercases hostname", () => {
    const result = normalizeUrl("https://WWW.Globes.CO.IL/article");
    assert.equal(result, "https://globes.co.il/article");
  });

  it("preserves meaningful query params", () => {
    const result = normalizeUrl("https://globes.co.il/news?id=123&page=2");
    assert.equal(result, "https://globes.co.il/news?id=123&page=2");
  });

  it("strips fbclid param", () => {
    const result = normalizeUrl(
      "https://globes.co.il/article?id=1&fbclid=abc123",
    );
    assert.equal(result, "https://globes.co.il/article?id=1");
  });

  it("handles invalid URL gracefully", () => {
    const result = normalizeUrl("not-a-url");
    assert.equal(result, "not-a-url");
  });
});

describe("generateFingerprint", () => {
  it("produces consistent SHA-256 hash", () => {
    const fp1 = generateFingerprint("מס הכנסה חדש");
    const fp2 = generateFingerprint("מס הכנסה חדש");
    assert.equal(fp1, fp2);
    assert.equal(fp1.length, 64); // SHA-256 hex length
  });

  it("same title with different whitespace → same fingerprint", () => {
    const fp1 = generateFingerprint("מס הכנסה חדש");
    const fp2 = generateFingerprint("  מס הכנסה   חדש  ");
    assert.equal(fp1, fp2);
  });

  it("same title with different casing → same fingerprint", () => {
    const fp1 = generateFingerprint("Tax Update");
    const fp2 = generateFingerprint("tax update");
    assert.equal(fp1, fp2);
  });

  it("different titles → different fingerprints", () => {
    const fp1 = generateFingerprint("מס הכנסה");
    const fp2 = generateFingerprint("מע\"מ חדש");
    assert.notEqual(fp1, fp2);
  });

  it("title with nikud vs without → same fingerprint", () => {
    const fp1 = generateFingerprint("שָׁלוֹם");
    const fp2 = generateFingerprint("שלום");
    assert.equal(fp1, fp2);
  });

  it("titles differing only by stopwords → same fingerprint", () => {
    const fp1 = generateFingerprint("מס הכנסה של ישראל");
    const fp2 = generateFingerprint("מס הכנסה ישראל");
    assert.equal(fp1, fp2);
  });
});
