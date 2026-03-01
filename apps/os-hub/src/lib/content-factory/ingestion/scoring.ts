/**
 * Scoring rubric for Ideas.
 *
 * score = (sourceWeight × 25) + (recency × 25) + (keywordMatch × 30) + (categoryBonus × 20)
 * Range: 0–100
 */

import { countKeywordMatches, KEYWORD_BUCKETS } from "./keywords";

export interface ScoreBreakdown {
  sourceWeight: number;
  recency: number;
  keywordScore: number;
  categoryBonus: number;
  matchedKeywords: string[];
  total: number;
}

/**
 * Calculate recency score based on hours since publication.
 */
function recencyScore(publishedAt: Date | null): number {
  if (!publishedAt) return 5; // Unknown age → minimum score
  const hoursAge = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
  if (hoursAge < 6) return 25;
  if (hoursAge < 24) return 20;
  if (hoursAge < 48) return 15;
  if (hoursAge < 168) return 10; // 7 days
  return 5;
}

/**
 * Calculate category bonus.
 */
function categoryBonusScore(category: string | null): number {
  if (!category) return 5;
  const priority = ["Tax", "Payroll", "Regulation"];
  const standard = ["Legal", "Grants"];
  if (priority.includes(category)) return 20;
  if (standard.includes(category)) return 12;
  return 5;
}

/**
 * Score an idea based on its source, content, and timing.
 */
export function scoreIdea(params: {
  title: string;
  description: string | null;
  sourceWeight: number;
  sourceCategory: string | null;
  publishedAt: Date | null;
}): ScoreBreakdown {
  // Source weight: normalize to 0–25 (weight 2.0 → 25, weight 0.5 → 6.25)
  const sourceWeightScore = (params.sourceWeight / 2.0) * 25;

  // Recency
  const recency = recencyScore(params.publishedAt);

  // Keyword match
  const text = `${params.title} ${params.description ?? ""}`;
  const { count, matched } = countKeywordMatches(text, KEYWORD_BUCKETS);
  const keywordScore = count >= 3 ? 30 : count === 2 ? 20 : count === 1 ? 10 : 0;

  // Category bonus
  const categoryBonus = categoryBonusScore(params.sourceCategory);

  const total = Math.min(100, Math.round(sourceWeightScore + recency + keywordScore + categoryBonus));

  return {
    sourceWeight: Math.round(sourceWeightScore * 10) / 10,
    recency,
    keywordScore,
    categoryBonus,
    matchedKeywords: matched,
    total,
  };
}
