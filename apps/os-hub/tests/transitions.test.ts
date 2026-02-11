/**
 * Unit tests for Content Factory state machine transitions.
 *
 * Uses Node.js built-in test runner + --experimental-strip-types.
 * Run: node --experimental-strip-types --test tests/transitions.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Inline the transition maps (same as transitions.ts) ─────────────────────
// We duplicate the maps here so tests run without Prisma client installed.
// If these drift from the source, that's a signal to update both.

const ARTICLE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["IN_REVIEW", "ARCHIVED"],
  IN_REVIEW: ["APPROVED", "DRAFT", "ARCHIVED"],
  APPROVED: ["ARCHIVED"],
  ARCHIVED: [],
};

const ASSET_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["APPROVED", "DRAFT"],
  APPROVED: [],
};

const PUBLISH_JOB_TRANSITIONS: Record<string, string[]> = {
  QUEUED: ["RUNNING"],
  RUNNING: ["SUCCEEDED", "FAILED", "PARTIAL"],
  SUCCEEDED: [],
  FAILED: [],
  PARTIAL: [],
};

// ── Validation helpers (same logic as transitions.ts) ───────────────────────

type TransitionError = { code: string; message: string; from: string; to: string } | null;

function validateTransition(
  map: Record<string, string[]>,
  entity: string,
  from: string,
  to: string,
): TransitionError {
  if (map[from]?.includes(to)) return null;
  return {
    code: "INVALID_TRANSITION",
    message: `${entity} cannot transition from ${from} to ${to}`,
    from,
    to,
  };
}

const validateArticle = (from: string, to: string) =>
  validateTransition(ARTICLE_TRANSITIONS, "Article", from, to);

const validateAsset = (from: string, to: string) =>
  validateTransition(ASSET_TRANSITIONS, "Asset", from, to);

const validatePublishJob = (from: string, to: string) =>
  validateTransition(PUBLISH_JOB_TRANSITIONS, "PublishJob", from, to);

// ── Article transitions ─────────────────────────────────────────────────────

describe("Article state machine", () => {
  it("DRAFT → IN_REVIEW is allowed", () => {
    assert.equal(validateArticle("DRAFT", "IN_REVIEW"), null);
  });

  it("DRAFT → ARCHIVED is allowed", () => {
    assert.equal(validateArticle("DRAFT", "ARCHIVED"), null);
  });

  it("IN_REVIEW → APPROVED is allowed", () => {
    assert.equal(validateArticle("IN_REVIEW", "APPROVED"), null);
  });

  it("IN_REVIEW → DRAFT is allowed (rejection)", () => {
    assert.equal(validateArticle("IN_REVIEW", "DRAFT"), null);
  });

  it("IN_REVIEW → ARCHIVED is allowed", () => {
    assert.equal(validateArticle("IN_REVIEW", "ARCHIVED"), null);
  });

  it("APPROVED → ARCHIVED is allowed", () => {
    assert.equal(validateArticle("APPROVED", "ARCHIVED"), null);
  });

  it("DRAFT → APPROVED is NOT allowed (must go through IN_REVIEW)", () => {
    const err = validateArticle("DRAFT", "APPROVED");
    assert.notEqual(err, null);
    assert.equal(err!.code, "INVALID_TRANSITION");
  });

  it("APPROVED → DRAFT is NOT allowed", () => {
    const err = validateArticle("APPROVED", "DRAFT");
    assert.notEqual(err, null);
  });

  it("ARCHIVED → anything is NOT allowed (terminal state)", () => {
    for (const to of ["DRAFT", "IN_REVIEW", "APPROVED"]) {
      const err = validateArticle("ARCHIVED", to);
      assert.notEqual(err, null, `ARCHIVED → ${to} should be blocked`);
    }
  });

  it("transition map covers all statuses", () => {
    const expected = ["APPROVED", "ARCHIVED", "DRAFT", "IN_REVIEW"];
    assert.deepEqual(Object.keys(ARTICLE_TRANSITIONS).sort(), expected);
  });
});

// ── Asset transitions ───────────────────────────────────────────────────────

describe("Asset state machine", () => {
  it("DRAFT → IN_REVIEW is allowed", () => {
    assert.equal(validateAsset("DRAFT", "IN_REVIEW"), null);
  });

  it("IN_REVIEW → APPROVED is allowed", () => {
    assert.equal(validateAsset("IN_REVIEW", "APPROVED"), null);
  });

  it("IN_REVIEW → DRAFT is allowed (rejection)", () => {
    assert.equal(validateAsset("IN_REVIEW", "DRAFT"), null);
  });

  it("DRAFT → APPROVED is NOT allowed", () => {
    const err = validateAsset("DRAFT", "APPROVED");
    assert.notEqual(err, null);
    assert.equal(err!.code, "INVALID_TRANSITION");
  });

  it("APPROVED is terminal (no outgoing transitions)", () => {
    for (const to of ["DRAFT", "IN_REVIEW"]) {
      const err = validateAsset("APPROVED", to);
      assert.notEqual(err, null, `APPROVED → ${to} should be blocked`);
    }
  });

  it("transition map covers all statuses", () => {
    const expected = ["APPROVED", "DRAFT", "IN_REVIEW"];
    assert.deepEqual(Object.keys(ASSET_TRANSITIONS).sort(), expected);
  });
});

// ── PublishJob transitions ──────────────────────────────────────────────────

describe("PublishJob state machine", () => {
  it("QUEUED → RUNNING is allowed", () => {
    assert.equal(validatePublishJob("QUEUED", "RUNNING"), null);
  });

  it("RUNNING → SUCCEEDED is allowed", () => {
    assert.equal(validatePublishJob("RUNNING", "SUCCEEDED"), null);
  });

  it("RUNNING → FAILED is allowed", () => {
    assert.equal(validatePublishJob("RUNNING", "FAILED"), null);
  });

  it("RUNNING → PARTIAL is allowed", () => {
    assert.equal(validatePublishJob("RUNNING", "PARTIAL"), null);
  });

  it("QUEUED → SUCCEEDED is NOT allowed (must go through RUNNING)", () => {
    const err = validatePublishJob("QUEUED", "SUCCEEDED");
    assert.notEqual(err, null);
  });

  it("SUCCEEDED is terminal", () => {
    for (const to of ["QUEUED", "RUNNING", "FAILED", "PARTIAL"]) {
      const err = validatePublishJob("SUCCEEDED", to);
      assert.notEqual(err, null, `SUCCEEDED → ${to} should be blocked`);
    }
  });

  it("FAILED is terminal", () => {
    for (const to of ["QUEUED", "RUNNING", "SUCCEEDED", "PARTIAL"]) {
      const err = validatePublishJob("FAILED", to);
      assert.notEqual(err, null, `FAILED → ${to} should be blocked`);
    }
  });

  it("transition map covers all statuses", () => {
    const expected = ["FAILED", "PARTIAL", "QUEUED", "RUNNING", "SUCCEEDED"];
    assert.deepEqual(Object.keys(PUBLISH_JOB_TRANSITIONS).sort(), expected);
  });
});
