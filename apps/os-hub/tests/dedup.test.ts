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

function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[^\w\s\u0590-\u05FF]/g, "")
    .replace(/\s+/g, " ");
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
});
