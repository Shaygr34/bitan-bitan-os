/**
 * Deterministic state machine transitions for Content Factory entities.
 *
 * Each entity type has an explicit map of allowed (from → to[]) transitions.
 * No implicit transitions — every move must be declared here.
 */

import type {
  ArticleStatus,
  AssetStatus,
  PublishJobStatus,
} from "@prisma/client";

// ── Article status transitions ──────────────────────────────────────────────

const ARTICLE_TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  DRAFT: ["IN_REVIEW", "ARCHIVED"],
  IN_REVIEW: ["APPROVED", "DRAFT", "ARCHIVED"],
  APPROVED: ["ARCHIVED"],
  ARCHIVED: [],
};

// ── Asset status transitions ────────────────────────────────────────────────

const ASSET_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["APPROVED", "DRAFT"],
  APPROVED: [],
};

// ── PublishJob status transitions ───────────────────────────────────────────

const PUBLISH_JOB_TRANSITIONS: Record<PublishJobStatus, PublishJobStatus[]> = {
  QUEUED: ["RUNNING"],
  RUNNING: ["SUCCEEDED", "FAILED", "PARTIAL"],
  SUCCEEDED: [],
  FAILED: [],
  PARTIAL: [],
};

// ── Validation helpers ──────────────────────────────────────────────────────

export type TransitionError = {
  code: "INVALID_TRANSITION";
  message: string;
  from: string;
  to: string;
};

export function validateArticleTransition(
  from: ArticleStatus,
  to: ArticleStatus,
): TransitionError | null {
  if (ARTICLE_TRANSITIONS[from].includes(to)) return null;
  return {
    code: "INVALID_TRANSITION",
    message: `Article cannot transition from ${from} to ${to}`,
    from,
    to,
  };
}

export function validateAssetTransition(
  from: AssetStatus,
  to: AssetStatus,
): TransitionError | null {
  if (ASSET_TRANSITIONS[from].includes(to)) return null;
  return {
    code: "INVALID_TRANSITION",
    message: `Asset cannot transition from ${from} to ${to}`,
    from,
    to,
  };
}

export function validatePublishJobTransition(
  from: PublishJobStatus,
  to: PublishJobStatus,
): TransitionError | null {
  if (PUBLISH_JOB_TRANSITIONS[from].includes(to)) return null;
  return {
    code: "INVALID_TRANSITION",
    message: `PublishJob cannot transition from ${from} to ${to}`,
    from,
    to,
  };
}

// ── Exported maps (for tests) ───────────────────────────────────────────────

export {
  ARTICLE_TRANSITIONS,
  ASSET_TRANSITIONS,
  PUBLISH_JOB_TRANSITIONS,
};
