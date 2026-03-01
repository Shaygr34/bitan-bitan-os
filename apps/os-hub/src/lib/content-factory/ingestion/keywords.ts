/**
 * Keyword buckets for content scoring.
 * Hebrew + English keywords organized by domain.
 */

export const KEYWORD_BUCKETS: Record<string, string[]> = {
  tax_core: [
    "מס הכנסה", "מע\"מ", "מס חברות", "ניכוי במקור", "שומה", "החזר מס",
    "עוסק מורשה", "עוסק פטור", "תיאום מס", "הצהרת הון",
    "income tax", "VAT", "corporate tax", "withholding",
  ],
  payroll: [
    "שכר", "משכורת", "תלוש", "ביטוח לאומי", "פנסיה", "קרן השתלמות",
    "פיצויים", "דמי הבראה", "שעות נוספות", "payroll", "NII",
  ],
  compliance: [
    "דיווח", "חוזר מקצועי", "הוראת שעה", "תקנות", "הוראת ביצוע",
    "רשות המסים", "טופס", "הגשה", "מועד אחרון", "filing deadline",
  ],
  real_estate: [
    "מס שבח", "מס רכישה", "נדל\"ן", "מקרקעין", "היטל השבחה",
    "real estate tax", "betterment levy",
  ],
  grants: [
    "מענק", "סיוע", "הלוואה", "רשות החדשנות", "עסק קטן",
    "grant", "innovation authority", "small business",
  ],
  legal: [
    "פסק דין", "בית משפט", "ערעור", "תקדים", "חקיקה",
    "court ruling", "precedent", "legislation",
  ],
};

/**
 * High-value signal phrases — professional/regulatory content from
 * authoritative sources. Each match counts as 2 keyword matches.
 */
export const HIGH_VALUE_SIGNALS: string[] = [
  "חוזר מקצועי", "הוראת ביצוע", "פסק דין", "רשות המסים",
  "חוזר מס הכנסה", "חוזר מע\"מ", "הנחיה חדשה", "תיקון לחוק",
  "טיוטת חוק", "צו מסים", "הלכת", "בית המשפט העליון",
  "ועדת ערר", "professional circular", "tax ruling",
];

/**
 * Negative keywords — deal/market-oriented content that is not relevant
 * for CPA professional updates. Each match reduces score.
 */
export const NEGATIVE_KEYWORDS: string[] = [
  "רכשה", "מיליון שקל", "מיליארד", "הנפקה", "בורסה",
  "מניות", "אקזיט", "סטארטאפ", "גיוס הון", "IPO",
  "דירוג אשראי", "תשואה", "שוק ההון", "משקיעים",
  "ספורט", "כדורגל", "אופנה", "בידור", "סלבריטי",
];

/**
 * Count keyword matches in text across all buckets.
 * Returns total count, list of matched keywords, high-value count, and negative count.
 */
export function countKeywordMatches(
  text: string,
  buckets: Record<string, string[]> = KEYWORD_BUCKETS,
): { count: number; matched: string[]; highValueCount: number; negativeCount: number } {
  const lowerText = text.toLowerCase();
  const matched: string[] = [];

  for (const keywords of Object.values(buckets)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matched.push(keyword);
      }
    }
  }

  // High-value signals (each counts double)
  let highValueCount = 0;
  for (const signal of HIGH_VALUE_SIGNALS) {
    if (lowerText.includes(signal.toLowerCase())) {
      highValueCount++;
      matched.push(`[HV] ${signal}`);
    }
  }

  // Negative keywords
  let negativeCount = 0;
  for (const neg of NEGATIVE_KEYWORDS) {
    if (lowerText.includes(neg.toLowerCase())) {
      negativeCount++;
    }
  }

  // Deduplicate
  const unique = [...new Set(matched)];
  // Effective count: base matches + extra for high-value signals
  const effectiveCount = unique.filter((m) => !m.startsWith("[HV] ")).length + highValueCount * 2;
  return { count: effectiveCount, matched: unique, highValueCount, negativeCount };
}
