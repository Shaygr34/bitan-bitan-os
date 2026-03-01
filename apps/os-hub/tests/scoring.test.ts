/**
 * Unit tests for scoring formula.
 *
 * Run: node --experimental-strip-types --test tests/scoring.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Inline scoring logic (same as scoring.ts) ──────────────────────────────

const KEYWORD_BUCKETS: Record<string, string[]> = {
  tax_core: ["מס הכנסה", "מע\"מ", "מס חברות", "income tax", "VAT"],
  payroll: ["שכר", "ביטוח לאומי", "פנסיה", "payroll"],
  compliance: ["דיווח", "חוזר מקצועי", "רשות המסים", "filing deadline"],
  real_estate: ["מס שבח", "מס רכישה", "נדל\"ן"],
  grants: ["מענק", "סיוע", "grant"],
  legal: ["פסק דין", "בית משפט", "court ruling"],
};

function countKeywordMatches(text: string): { count: number; matched: string[] } {
  const lowerText = text.toLowerCase();
  const matched: string[] = [];
  for (const keywords of Object.values(KEYWORD_BUCKETS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) matched.push(keyword);
    }
  }
  const unique = [...new Set(matched)];
  return { count: unique.length, matched: unique };
}

function recencyScore(publishedAt: Date | null): number {
  if (!publishedAt) return 5;
  const hoursAge = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
  if (hoursAge < 6) return 25;
  if (hoursAge < 24) return 20;
  if (hoursAge < 48) return 15;
  if (hoursAge < 168) return 10;
  return 5;
}

function categoryBonusScore(category: string | null): number {
  if (!category) return 5;
  if (["Tax", "Payroll", "Regulation"].includes(category)) return 20;
  if (["Legal", "Grants"].includes(category)) return 12;
  return 5;
}

function scoreIdea(params: {
  title: string;
  description: string | null;
  sourceWeight: number;
  sourceCategory: string | null;
  publishedAt: Date | null;
}): { total: number; sourceWeight: number; recency: number; keywordScore: number; categoryBonus: number; matchedKeywords: string[] } {
  const sourceWeightScore = (params.sourceWeight / 2.0) * 25;
  const recency = recencyScore(params.publishedAt);
  const text = `${params.title} ${params.description ?? ""}`;
  const { count, matched } = countKeywordMatches(text);
  const keywordScore = count >= 3 ? 30 : count === 2 ? 20 : count === 1 ? 10 : 0;
  const categoryBonus = categoryBonusScore(params.sourceCategory);
  const total = Math.min(100, Math.round(sourceWeightScore + recency + keywordScore + categoryBonus));
  return {
    sourceWeight: Math.round(sourceWeightScore * 10) / 10,
    recency, keywordScore, categoryBonus, matchedKeywords: matched, total,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Scoring formula", () => {
  it("source weight 2.0 gives maximum 25 points", () => {
    const result = scoreIdea({
      title: "test", description: null, sourceWeight: 2.0, sourceCategory: null, publishedAt: null,
    });
    assert.equal(result.sourceWeight, 25);
  });

  it("source weight 1.0 gives 12.5 points", () => {
    const result = scoreIdea({
      title: "test", description: null, sourceWeight: 1.0, sourceCategory: null, publishedAt: null,
    });
    assert.equal(result.sourceWeight, 12.5);
  });

  it("source weight 0.5 gives 6.3 points", () => {
    const result = scoreIdea({
      title: "test", description: null, sourceWeight: 0.5, sourceCategory: null, publishedAt: null,
    });
    assert.equal(result.sourceWeight, 6.3);
  });

  it("recently published (<6h) gives 25 recency points", () => {
    const result = scoreIdea({
      title: "test", description: null, sourceWeight: 1.0, sourceCategory: null,
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    assert.equal(result.recency, 25);
  });

  it("published 12h ago gives 20 recency points", () => {
    const result = scoreIdea({
      title: "test", description: null, sourceWeight: 1.0, sourceCategory: null,
      publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    });
    assert.equal(result.recency, 20);
  });

  it("published 3 days ago gives 10 recency points", () => {
    const result = scoreIdea({
      title: "test", description: null, sourceWeight: 1.0, sourceCategory: null,
      publishedAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
    });
    assert.equal(result.recency, 10);
  });

  it("no publish date gives 5 recency points", () => {
    const result = scoreIdea({
      title: "test", description: null, sourceWeight: 1.0, sourceCategory: null, publishedAt: null,
    });
    assert.equal(result.recency, 5);
  });

  it("3+ keyword matches give 30 points", () => {
    const result = scoreIdea({
      title: "מס הכנסה מע\"מ חוזר מקצועי", description: null,
      sourceWeight: 1.0, sourceCategory: null, publishedAt: null,
    });
    assert.equal(result.keywordScore, 30);
    assert.ok(result.matchedKeywords.length >= 3);
  });

  it("2 keyword matches give 20 points", () => {
    const result = scoreIdea({
      title: "מס הכנסה דיווח", description: null,
      sourceWeight: 1.0, sourceCategory: null, publishedAt: null,
    });
    assert.equal(result.keywordScore, 20);
  });

  it("1 keyword match gives 10 points", () => {
    const result = scoreIdea({
      title: "שכר עובדים", description: null,
      sourceWeight: 1.0, sourceCategory: null, publishedAt: null,
    });
    assert.equal(result.keywordScore, 10);
  });

  it("no keyword matches give 0 points", () => {
    const result = scoreIdea({
      title: "כדורגל ספורט", description: null,
      sourceWeight: 1.0, sourceCategory: null, publishedAt: null,
    });
    assert.equal(result.keywordScore, 0);
  });

  it("Tax category gives 20 bonus points", () => {
    const result = scoreIdea({
      title: "test", description: null, sourceWeight: 1.0, sourceCategory: "Tax", publishedAt: null,
    });
    assert.equal(result.categoryBonus, 20);
  });

  it("Legal category gives 12 bonus points", () => {
    const result = scoreIdea({
      title: "test", description: null, sourceWeight: 1.0, sourceCategory: "Legal", publishedAt: null,
    });
    assert.equal(result.categoryBonus, 12);
  });

  it("Business-News category gives 5 bonus points", () => {
    const result = scoreIdea({
      title: "test", description: null, sourceWeight: 1.0, sourceCategory: "Business-News", publishedAt: null,
    });
    assert.equal(result.categoryBonus, 5);
  });

  it("score is capped at 100", () => {
    const result = scoreIdea({
      title: "מס הכנסה מע\"מ מס חברות שכר פנסיה חוזר מקצועי", description: null,
      sourceWeight: 2.0, sourceCategory: "Tax",
      publishedAt: new Date(Date.now() - 60 * 1000),
    });
    assert.ok(result.total <= 100);
  });

  it("high-value item scores above 70", () => {
    const result = scoreIdea({
      title: "רשות המסים: חוזר מקצועי חדש בנושא מס הכנסה ומע\"מ",
      description: "דיווח חדש של רשות המסים",
      sourceWeight: 1.5, sourceCategory: "Tax",
      publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    });
    assert.ok(result.total >= 70, `Expected >= 70, got ${result.total}`);
  });

  it("low-value item scores below 40", () => {
    const result = scoreIdea({
      title: "כדורגל ישראלי",
      description: null,
      sourceWeight: 0.5, sourceCategory: "Markets",
      publishedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    });
    assert.ok(result.total < 40, `Expected < 40, got ${result.total}`);
  });
});
