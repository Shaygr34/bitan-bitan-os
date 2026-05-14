/**
 * Sumit entity-ref lookup tables for editable ClientInfoCard dropdowns.
 *
 * These mirror the canonical maps in `bitan-bitan-website/src/lib/intake-types.ts`
 * (CLIENT_TYPE_IDS, BUSINESS_SECTOR_IDS, ACCOUNT_MANAGER_IDS, AUDIT_WORKER_IDS).
 * Source of truth lives there because the client-side intake form created them
 * first. Duplicated here intentionally for the office-side edit UI so we don't
 * cross-repo import.
 *
 * Drift risk: if the taxonomy changes (new sector, new manager) update BOTH
 * repos. Long-term cleanup: extract to a shared package or fetch live via
 * /crm/data/listentities/ on each folder; for now hardcoded.
 */

export interface SumitOption {
  /** Sumit entity ID — what we send in updateentity Properties. */
  id: number
  /** Display label (Hebrew). */
  label: string
}

/** סוג לקוח (folder 1099290064) */
export const CLIENT_TYPE_OPTIONS: SumitOption[] = [
  { id: 1099570216, label: 'עצמאי' },
  { id: 1099570129, label: 'עצמאי שנתי' },
  { id: 1099570010, label: 'חברה' },
  { id: 1099569991, label: 'חברה שנתי' },
  { id: 1099570246, label: 'פטור' },
  { id: 1099570170, label: 'שותפות' },
  { id: 1099570107, label: 'עמותה' },
  { id: 1099570213, label: 'עסק זעיר' },
  { id: 1179325026, label: 'החזר מס' },
]

/** תחום עיסוק (folder 1081738742) — 25 canonical categories */
export const BUSINESS_SECTOR_OPTIONS: SumitOption[] = [
  { id: 1840456818, label: 'נדל"ן ושכירות' },
  { id: 1840457091, label: 'בנייה ושיפוצים' },
  { id: 1099298826, label: 'ייעוץ וניהול' },
  { id: 1840457217, label: 'טכנולוגיה ודיגיטל' },
  { id: 1840456923, label: 'מזון ומסעדנות' },
  { id: 1840457450, label: 'אופנה וטקסטיל' },
  { id: 1099298366, label: 'ביטוח ופיננסים' },
  { id: 1099298876, label: 'עריכת דין' },
  { id: 1840457580, label: 'ראיית חשבון' },
  { id: 1840457466, label: 'בריאות ורפואה' },
  { id: 1840457142, label: 'טיפול ופסיכולוגיה' },
  { id: 1840457494, label: 'חינוך והדרכה' },
  { id: 1099298678, label: 'עיצוב ויצירה' },
  { id: 1840457867, label: 'צילום ומדיה' },
  { id: 1840457501, label: 'מוזיקה ובידור' },
  { id: 1840457509, label: 'יבוא וסחר' },
  { id: 1840458123, label: 'קמעונאות' },
  { id: 1840457516, label: 'הובלות ושליחויות' },
  { id: 1840458274, label: 'כושר וספורט' },
  { id: 1840458558, label: 'יופי וטיפוח' },
  { id: 1840458289, label: 'רכב ומוסכים' },
  { id: 1840458434, label: 'ניקיון ותחזוקה' },
  { id: 1840458656, label: 'תעשייה וייצור' },
  { id: 1840458295, label: 'חקלאות ובעלי חיים' },
  { id: 1840458584, label: 'אחר' },
]

/** מנהל תיק (folder 1081739389) */
export const ACCOUNT_MANAGER_OPTIONS: SumitOption[] = [
  { id: 1081753575, label: 'אבי ביטן' },
  { id: 1081754061, label: 'רון ביטן' },
]

/** עובד/ת ביקורת (folder 1081740413) — used for ראיית חשבון workflow */
export const AUDIT_WORKER_OPTIONS: SumitOption[] = [
  { id: 1099334847, label: 'אבי ביטן' },
  { id: 1099335750, label: 'גיא מחאני' },
  { id: 1099335784, label: 'חיה כהן גבורה' },
  { id: 1099336153, label: 'יצחק ביטן' },
  { id: 1099336180, label: 'משי כהן' },
  { id: 1099336636, label: 'רון ביטן' },
  { id: 1099337096, label: 'שי גרייבר' },
  { id: 1099337428, label: 'הודיה יוסף' },
  { id: 1099339185, label: 'נלה פרידמן' },
]

/** Resolve a display label → entity ID for one of the lookups. */
export function findOptionByLabel(options: SumitOption[], label: string): SumitOption | undefined {
  return options.find((o) => o.label === label.trim())
}

/** Resolve entity ID → display label. */
export function findOptionById(options: SumitOption[], id: number): SumitOption | undefined {
  return options.find((o) => o.id === id)
}
