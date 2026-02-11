/**
 * Unit tests for distribution status calculation logic.
 *
 * Pure function tests — no database needed.
 * Run: node --experimental-strip-types --test tests/distribution.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Pure computation (mirrors distribution.ts logic) ────────────────────────

type AssetWithJobs = {
  id: string;
  status: string;
  publishJobs: Array<{ status: string }>;
};

type DistributionStatus =
  | "NOT_PUBLISHED"
  | "PARTIALLY_PUBLISHED"
  | "FULLY_PUBLISHED";

function computeDistributionStatus(assets: AssetWithJobs[]): DistributionStatus {
  const approvedAssets = assets.filter((a) => a.status === "APPROVED");
  const anySucceeded = assets.some((a) => a.publishJobs.length > 0);

  if (!anySucceeded) {
    return "NOT_PUBLISHED";
  }

  if (
    approvedAssets.length > 0 &&
    approvedAssets.every((a) => a.publishJobs.length > 0)
  ) {
    return "FULLY_PUBLISHED";
  }

  return "PARTIALLY_PUBLISHED";
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Distribution status computation", () => {
  it("NOT_PUBLISHED when no assets at all", () => {
    assert.equal(computeDistributionStatus([]), "NOT_PUBLISHED");
  });

  it("NOT_PUBLISHED when assets exist but none have succeeded jobs", () => {
    const assets: AssetWithJobs[] = [
      { id: "a1", status: "APPROVED", publishJobs: [] },
      { id: "a2", status: "DRAFT", publishJobs: [] },
    ];
    assert.equal(computeDistributionStatus(assets), "NOT_PUBLISHED");
  });

  it("PARTIALLY_PUBLISHED when one of two APPROVED assets has a succeeded job", () => {
    const assets: AssetWithJobs[] = [
      { id: "a1", status: "APPROVED", publishJobs: [{ status: "SUCCEEDED" }] },
      { id: "a2", status: "APPROVED", publishJobs: [] },
    ];
    assert.equal(computeDistributionStatus(assets), "PARTIALLY_PUBLISHED");
  });

  it("PARTIALLY_PUBLISHED when only non-APPROVED assets have jobs", () => {
    const assets: AssetWithJobs[] = [
      { id: "a1", status: "DRAFT", publishJobs: [{ status: "SUCCEEDED" }] },
      { id: "a2", status: "APPROVED", publishJobs: [] },
    ];
    assert.equal(computeDistributionStatus(assets), "PARTIALLY_PUBLISHED");
  });

  it("FULLY_PUBLISHED when every APPROVED asset has at least one succeeded job", () => {
    const assets: AssetWithJobs[] = [
      { id: "a1", status: "APPROVED", publishJobs: [{ status: "SUCCEEDED" }] },
      {
        id: "a2",
        status: "APPROVED",
        publishJobs: [{ status: "SUCCEEDED" }, { status: "SUCCEEDED" }],
      },
    ];
    assert.equal(computeDistributionStatus(assets), "FULLY_PUBLISHED");
  });

  it("FULLY_PUBLISHED with one APPROVED (has job) and one DRAFT (no job)", () => {
    // DRAFT assets don't count for the "every APPROVED" check
    const assets: AssetWithJobs[] = [
      { id: "a1", status: "APPROVED", publishJobs: [{ status: "SUCCEEDED" }] },
      { id: "a2", status: "DRAFT", publishJobs: [] },
    ];
    assert.equal(computeDistributionStatus(assets), "FULLY_PUBLISHED");
  });

  it("PARTIALLY_PUBLISHED when no APPROVED assets exist but jobs do", () => {
    // anySucceeded is true, but no approved assets → can't be FULLY_PUBLISHED
    const assets: AssetWithJobs[] = [
      { id: "a1", status: "DRAFT", publishJobs: [{ status: "SUCCEEDED" }] },
    ];
    assert.equal(computeDistributionStatus(assets), "PARTIALLY_PUBLISHED");
  });

  it("FULLY_PUBLISHED with single APPROVED asset having single job", () => {
    const assets: AssetWithJobs[] = [
      { id: "a1", status: "APPROVED", publishJobs: [{ status: "SUCCEEDED" }] },
    ];
    assert.equal(computeDistributionStatus(assets), "FULLY_PUBLISHED");
  });

  it("handles mix of IN_REVIEW and APPROVED correctly", () => {
    const assets: AssetWithJobs[] = [
      { id: "a1", status: "APPROVED", publishJobs: [{ status: "SUCCEEDED" }] },
      { id: "a2", status: "IN_REVIEW", publishJobs: [] },
    ];
    // Only APPROVED assets matter for the "fully" check
    assert.equal(computeDistributionStatus(assets), "FULLY_PUBLISHED");
  });
});
