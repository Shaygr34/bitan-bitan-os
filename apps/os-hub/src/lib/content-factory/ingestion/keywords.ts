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
 * Count keyword matches in text across all buckets.
 * Returns total count and list of matched keywords.
 */
export function countKeywordMatches(
  text: string,
  buckets: Record<string, string[]> = KEYWORD_BUCKETS,
): { count: number; matched: string[] } {
  const lowerText = text.toLowerCase();
  const matched: string[] = [];

  for (const keywords of Object.values(buckets)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matched.push(keyword);
      }
    }
  }

  // Deduplicate
  const unique = [...new Set(matched)];
  return { count: unique.length, matched: unique };
}
