/**
 * Stage 4–6 onboarding ↔ Summit field registry.
 *
 * This is the typed source of truth for the "editing layer": every data point
 * the onboarding pipeline (Ron's קליטת לקוחות spec, stages 4–6 + the stage-1–3
 * Bucket-A revisions) needs to read/write on the Summit client entity, mapped
 * to the REAL Summit field as discovered from the live לקוחות folder schema
 * (folder 557688522) on 2026-05-18.
 *
 * `provisioning` classifies each row:
 *  - 'exists'   — the Summit field is live today; the OS writes values straight
 *                 through via /crm/data/updateentity/ using `summitApiName`.
 *  - 'create'   — no Summit home. Summit's API is value-level only (no
 *                 field-creation endpoint), so this is a one-time MANUAL task a
 *                 human does in the Summit admin UI. `getProvisioningWorklist()`
 *                 emits exactly these rows as the checklist for Shay/office.
 *  - 'os-side'  — deliberately NOT a Summit field; lives on the Sanity
 *                 onboardingRecord (office-only / spec says "לא בסאמיט").
 *  - 'decision' — needs a Shay/Ron call before Phase 1 (reuse vs. new field).
 *
 * Writing values: the existing summit-client.ts pattern keys Properties by the
 * Hebrew field Name (e.g. 'מנהל תיק') — `summitApiName` here matches that.
 * Nothing in this module performs writes; it is metadata + a worklist builder.
 */

export type Provisioning = 'exists' | 'create' | 'os-side' | 'decision'

export interface OnboardingFieldSpec {
  /** Human data point as named in Ron's spec (Hebrew). */
  dataPoint: string
  /** Summit field Name/APIName used as the Properties key on updateentity. Null when not in Summit. */
  summitApiName: string | null
  /** Summit field ID from the live schema, for traceability. Null when not in Summit. */
  summitFieldId: number | null
  valueType:
    | 'ShortText' | 'LongText' | 'RichText' | 'Int64' | 'Decimal'
    | 'Date' | 'Boolean' | 'Entity' | 'Enum' | 'File'
  /** Summit category the field sits in (UI grouping), or the target category for 'create' rows. */
  category: string
  provisioning: Provisioning
  /** Which pipeline stages touch this field. Bucket-A intake revisions = stage 1. */
  stages: number[]
  /** Whether the עצמאי vertical slice (the locked first build) needs this row. */
  inAtzmaiSlice: boolean
  notes?: string
}

export const ONBOARDING_FIELDS: OnboardingFieldSpec[] = [
  // ─── Bucket A — intake identity (exists; spec changes are FORM-side validation/labels) ───
  { dataPoint: 'שם מלא בעל העסק', summitApiName: 'Customers_FullName', summitFieldId: 557688525, valueType: 'ShortText', category: 'פרטים אישיים', provisioning: 'exists', stages: [1], inAtzmaiSlice: true, notes: 'Required in Summit. Spec adds text-only validation on the intake form, not Summit-side.' },
  { dataPoint: 'ת.ז.', summitApiName: 'Customers_CompanyNumber', summitFieldId: 557688526, valueType: 'ShortText', category: 'פרטים אישיים', provisioning: 'exists', stages: [1], inAtzmaiSlice: true, notes: 'Generic ShortText in Summit. 9-digit + Israeli checksum validation is enforced on the intake form.' },
  { dataPoint: 'פלאפון', summitApiName: 'Customers_Phone', summitFieldId: 557688527, valueType: 'ShortText', category: 'פרטים אישיים', provisioning: 'exists', stages: [1], inAtzmaiSlice: true, notes: '10-digit validation form-side.' },
  { dataPoint: 'דוא"ל', summitApiName: 'Customers_EmailAddress', summitFieldId: 557688528, valueType: 'ShortText', category: 'פרטים אישיים', provisioning: 'exists', stages: [1], inAtzmaiSlice: true },
  { dataPoint: 'רחוב ומספר', summitApiName: 'Customers_Address', summitFieldId: 557688534, valueType: 'ShortText', category: 'כתובת', provisioning: 'exists', stages: [1], inAtzmaiSlice: true, notes: 'Spec relabels "כתובת"→"רחוב ומספר"; Summit field is reused as-is.' },
  { dataPoint: 'יישוב', summitApiName: 'Customers_City', summitFieldId: 557688535, valueType: 'ShortText', category: 'כתובת', provisioning: 'exists', stages: [1], inAtzmaiSlice: true, notes: 'Spec moves יישוב BEFORE רחוב in the form. Order is a form concern; field exists.' },
  { dataPoint: 'מיקוד (להסרה מהטופס)', summitApiName: 'Customers_ZipCode', summitFieldId: 557688536, valueType: 'ShortText', category: 'כתובת', provisioning: 'exists', stages: [1], inAtzmaiSlice: false, notes: 'Spec REMOVES מיקוד from the intake form. Field stays in Summit; the OS just stops collecting/surfacing it.' },
  { dataPoint: 'תאריך לידה', summitApiName: 'Customers_Birthdate', summitFieldId: 557688532, valueType: 'Date', category: 'שמירה על קשר', provisioning: 'exists', stages: [1], inAtzmaiSlice: true },

  // ─── Bucket A — net-new intake fields (MUST be created in Summit admin) ───
  { dataPoint: 'סטטוס משפחתי (נשוי/רווק/גרוש/חד הורי/אלמן)', summitApiName: null, summitFieldId: null, valueType: 'Enum', category: 'פרטים אישיים', provisioning: 'create', stages: [1], inAtzmaiSlice: true, notes: 'Customers_Status is CONTACT status, not marital — distinct field. 5 values; default נשוי so married clients are not missed.' },
  { dataPoint: 'תאריך פתיחת עסק', summitApiName: null, summitFieldId: null, valueType: 'Date', category: 'מידע רשויות', provisioning: 'create', stages: [1], inAtzmaiSlice: true },
  { dataPoint: 'דוא"ל עסק', summitApiName: null, summitFieldId: null, valueType: 'ShortText', category: 'פרטים אישיים', provisioning: 'decision', stages: [1], inAtzmaiSlice: true, notes: 'Spec wants a SEPARATE business email. Decision: reuse Customers_EmailAddress vs. create dedicated field.' },

  // ─── Bucket A — structured בן/בת זוג (scope-reversal of the PR-#66 "bundled text-only" lock; all CREATE) ───
  { dataPoint: 'בן/בת זוג — שם מלא', summitApiName: null, summitFieldId: null, valueType: 'ShortText', category: 'בן/בת זוג', provisioning: 'create', stages: [1], inAtzmaiSlice: true, notes: 'Currently bundled as free text into הערות (PR #66). Spec reverses that to a structured category.' },
  { dataPoint: 'בן/בת זוג — פלאפון', summitApiName: null, summitFieldId: null, valueType: 'ShortText', category: 'בן/בת זוג', provisioning: 'create', stages: [1], inAtzmaiSlice: true },
  { dataPoint: 'בן/בת זוג — תאריך לידה', summitApiName: null, summitFieldId: null, valueType: 'Date', category: 'בן/בת זוג', provisioning: 'create', stages: [1], inAtzmaiSlice: true },
  { dataPoint: 'בן/בת זוג — דוא"ל', summitApiName: null, summitFieldId: null, valueType: 'ShortText', category: 'בן/בת זוג', provisioning: 'create', stages: [1], inAtzmaiSlice: true, notes: 'Not a required field per spec.' },
  { dataPoint: 'בן/בת זוג — ת.ז. (קובץ)', summitApiName: null, summitFieldId: null, valueType: 'File', category: 'בן/בת זוג', provisioning: 'create', stages: [1, 2], inAtzmaiSlice: true },
  { dataPoint: 'בן/בת זוג — רישיון נהיגה (קובץ)', summitApiName: null, summitFieldId: null, valueType: 'File', category: 'בן/בת זוג', provisioning: 'create', stages: [1, 2], inAtzmaiSlice: true },

  // ─── Routing / classification (exists) ───
  { dataPoint: 'סוג לקוח', summitApiName: 'סוג לקוח', summitFieldId: 1099290845, valueType: 'Entity', category: 'פרטים כלליים', provisioning: 'exists', stages: [1], inAtzmaiSlice: true, notes: 'Drives per-entity link type + checklist branch (getDocCategory).' },
  { dataPoint: 'מספר לקוח', summitApiName: 'מספר לקוח', summitFieldId: 1081758647, valueType: 'Int64', category: 'פרטים כלליים', provisioning: 'exists', stages: [1], inAtzmaiSlice: true },
  { dataPoint: 'מנהל תיק', summitApiName: 'מנהל תיק', summitFieldId: 1157966329, valueType: 'Entity', category: 'פרטים כלליים', provisioning: 'exists', stages: [1, 3], inAtzmaiSlice: true, notes: 'Resolves the counter-signing partner (resolveOfficeSigner).' },
  { dataPoint: 'מנהל/ת חשבונות', summitApiName: 'מנהל/ת חשבונות', summitFieldId: 1157966331, valueType: 'Entity', category: 'פרטים כלליים', provisioning: 'exists', stages: [4], inAtzmaiSlice: true },
  { dataPoint: 'אחראי שכר', summitApiName: 'אחראי שכר', summitFieldId: 1081740903, valueType: 'Entity', category: 'פרטים כלליים', provisioning: 'exists', stages: [4], inAtzmaiSlice: true, notes: 'Spec list אבי/רון/גולן/משי/חיה/יעל must match the Summit Entity options.' },
  { dataPoint: 'דרישה לדוח מ"ה', summitApiName: 'דרישה לדוח מ"ה', summitFieldId: 1081742621, valueType: 'Entity', category: 'מידע רשויות', provisioning: 'exists', stages: [1], inAtzmaiSlice: true, notes: 'Spec: default כן.' },
  { dataPoint: 'לקוח קשור/משלם', summitApiName: 'Billing_PayingCustomer', summitFieldId: 1071673134, valueType: 'Entity', category: 'פרטים אישיים', provisioning: 'exists', stages: [1], inAtzmaiSlice: false, notes: 'Linked-payer the spec asks for already exists. Relevant for company/partnership owner→entity link, not the עצמאי slice.' },

  // ─── Newsletter auto-tagging (all exist as Booleans) ───
  { dataPoint: 'ניוזלטר עצמאים', summitApiName: 'ניוזלטר עצמאים', summitFieldId: 1748291703, valueType: 'Boolean', category: 'ניוזלטר', provisioning: 'exists', stages: [1], inAtzmaiSlice: true },
  { dataPoint: 'ניוזלטר כלל משרדי', summitApiName: 'ניוזלטר כלל משרדי', summitFieldId: 1753767611, valueType: 'Boolean', category: 'ניוזלטר', provisioning: 'exists', stages: [1], inAtzmaiSlice: true },
  { dataPoint: 'ניוזלטר מעסיקים', summitApiName: 'ניוזלטר מעסיקים', summitFieldId: 1748193327, valueType: 'Boolean', category: 'ניוזלטר', provisioning: 'exists', stages: [1, 5], inAtzmaiSlice: true, notes: 'Set when a ניכויים file exists.' },
  { dataPoint: 'ניוזלטר חברות', summitApiName: 'ניוזלטר חברות', summitFieldId: 1748291709, valueType: 'Boolean', category: 'ניוזלטר', provisioning: 'exists', stages: [1], inAtzmaiSlice: false },
  { dataPoint: 'ניוזלטר מנהלים', summitApiName: 'ניוזלטר מנהלים', summitFieldId: 1748305378, valueType: 'Boolean', category: 'ניוזלטר', provisioning: 'exists', stages: [1], inAtzmaiSlice: false },

  // ─── Stage 4 (רשויות) — submission + dates ───
  { dataPoint: 'מסמך הגשת פתיחת תיק / איחוד מסמכים', summitApiName: 'פתיחת תיק רשויות / ייפוי כח', summitFieldId: 1388303368, valueType: 'File', category: 'פתיחת תיק / קבלת לקוח חדש', provisioning: 'exists', stages: [4], inAtzmaiSlice: true, notes: 'KEY FINDING: the merged-submission File field already exists, in a "פתיחת תיק / קבלת לקוח חדש" category. The OS writes the merged PDF here.' },
  { dataPoint: 'מועד תחילת ייצוג', summitApiName: 'מועד תחילת ייצוג', summitFieldId: 1081741249, valueType: 'Date', category: 'מידע רשויות', provisioning: 'exists', stages: [4], inAtzmaiSlice: true, notes: 'Spec: ייפוי-כח tax-authority "תאריך תחילת ייצוג" = file date, auto. Maps here.' },
  { dataPoint: 'תאריך הגשה פתיחת תיק', summitApiName: null, summitFieldId: null, valueType: 'Date', category: 'פתיחת תיק / קבלת לקוח חדש', provisioning: 'create', stages: [4], inAtzmaiSlice: true, notes: 'Distinct from מועד תחילת ייצוג. Auto-set when the אישור-הגשה file is uploaded; editable.' },
  { dataPoint: 'פקיד שומה', summitApiName: 'פקיד שומה', summitFieldId: 1081741880, valueType: 'Entity', category: 'מידע רשויות', provisioning: 'exists', stages: [4], inAtzmaiSlice: true },
  { dataPoint: 'סוג תיק', summitApiName: 'סוג תיק', summitFieldId: 1081741715, valueType: 'Entity', category: 'מידע רשויות', provisioning: 'exists', stages: [4], inAtzmaiSlice: true },

  // ─── Stage 4/5 — ניכויים (only the number exists; status/headcount/date are new) ───
  { dataPoint: 'מספר תיק ניכויים', summitApiName: 'מספר תיק ניכויים', summitFieldId: 1081739280, valueType: 'Int64', category: 'מידע רשויות', provisioning: 'exists', stages: [4, 5], inAtzmaiSlice: true },
  { dataPoint: 'סטטוס תיק ניכויים (כן/לא — מעסיק עובדים)', summitApiName: null, summitFieldId: null, valueType: 'Boolean', category: 'מידע רשויות', provisioning: 'create', stages: [1, 4], inAtzmaiSlice: true, notes: 'Only the ניכויים NUMBER exists; the spec needs an explicit employs-workers status.' },
  { dataPoint: 'כמות עובדים (מדורג)', summitApiName: null, summitFieldId: null, valueType: 'Int64', category: 'מידע רשויות', provisioning: 'create', stages: [4], inAtzmaiSlice: true, notes: 'Bucketed per spec (1–5→1, 5–10→5, …).' },
  { dataPoint: 'תאריך פתיחת תיק ניכויים', summitApiName: null, summitFieldId: null, valueType: 'Date', category: 'מידע רשויות', provisioning: 'create', stages: [4], inAtzmaiSlice: true },

  // ─── Stage 4 — office vs client פתיחת-תיק notes (both new; general הערות is not enough) ───
  { dataPoint: 'הערות פתיחת תיק (לקוח מזין)', summitApiName: null, summitFieldId: null, valueType: 'RichText', category: 'פתיחת תיק / קבלת לקוח חדש', provisioning: 'create', stages: [1, 4], inAtzmaiSlice: true, notes: 'Spec wants client-entered open-case notes SEPARATE from office notes and from the general הערות field.' },
  { dataPoint: 'הערות משרד פתיחת תיק (משרד בלבד)', summitApiName: null, summitFieldId: null, valueType: 'RichText', category: 'פתיחת תיק / קבלת לקוח חדש', provisioning: 'create', stages: [4], inAtzmaiSlice: true, notes: 'Office-only: שכ"ט, key points. Mirrors to Summit but never shown in the client link.' },

  // ─── Exists: turnover, bank, general notes, doc fields ───
  { dataPoint: 'מחזור פעילות משוער', summitApiName: 'מחזור שנתי משוער', summitFieldId: 1797775262, valueType: 'Int64', category: 'מידע רשויות', provisioning: 'exists', stages: [1, 4], inAtzmaiSlice: true, notes: 'CLAUDE.md flagged this exists but was never mapped from the intake form — now wired.' },
  { dataPoint: 'בנק/סניף/חשבון', summitApiName: 'Accounting_ActiveBankAccount', summitFieldId: 557689095, valueType: 'Entity', category: 'חשבון בנק', provisioning: 'exists', stages: [1, 4], inAtzmaiSlice: true },
  { dataPoint: 'הערות (כלליות)', summitApiName: 'הערות', summitFieldId: 1081743340, valueType: 'RichText', category: 'פרטים כלליים', provisioning: 'exists', stages: [1, 2, 3], inAtzmaiSlice: true, notes: 'The round-trip channel for doc URLs (extractDocUrls). NOT the open-case notes — those are dedicated new fields.' },
  { dataPoint: 'ת.ז/רישיון בעלים (קובץ)', summitApiName: 'ת.ז/ רישיון בעלים', summitFieldId: 1081748417, valueType: 'File', category: 'מסמכים', provisioning: 'exists', stages: [1, 2], inAtzmaiSlice: true },
  { dataPoint: 'אישור ניהול חשבון (קובץ)', summitApiName: 'אישור ניהול חשבון', summitFieldId: 1081748721, valueType: 'File', category: 'מסמכים', provisioning: 'exists', stages: [1, 2], inAtzmaiSlice: true },
  { dataPoint: 'תעודת עוסק מורשה (קובץ)', summitApiName: 'תעודת עוסק מורשה', summitFieldId: 1081748464, valueType: 'File', category: 'מסמכים', provisioning: 'exists', stages: [5], inAtzmaiSlice: true, notes: 'Stage 5 sends this certificate; upload round-trips to Summit.' },

  // ─── OS-side only (spec says NOT Summit, or office-operational) ───
  { dataPoint: 'תאריך השהייה ייפוי כוח', summitApiName: null, summitFieldId: null, valueType: 'Date', category: '(OS — onboardingRecord)', provisioning: 'os-side', stages: [4, 5], inAtzmaiSlice: true, notes: 'Spec EXPLICIT: "רק במערכת ניהול, לא בסאמיט". Lives on the Sanity onboardingRecord.' },
  { dataPoint: 'חוזה שכירות — בלוק נכס (תאור/בעלות/דמי שכירות/משכיר/כתובת)', summitApiName: null, summitFieldId: null, valueType: 'LongText', category: '(OS — onboardingRecord?)', provisioning: 'decision', stages: [4], inAtzmaiSlice: false, notes: 'Spec: office-only, "לא אצל הלקוח". Decision: OS-side Sanity vs. a Summit cluster. Not in the עצמאי slice (lease is typically company/partnership).' },
]

/** Worklist of Summit fields a human must create once in the Summit admin UI before the OS can write them. */
export function getProvisioningWorklist(opts?: { atzmaiSliceOnly?: boolean }): OnboardingFieldSpec[] {
  return ONBOARDING_FIELDS.filter(
    (f) => f.provisioning === 'create' && (!opts?.atzmaiSliceOnly || f.inAtzmaiSlice),
  )
}

/** Decisions that must be resolved with Shay/Ron before Phase 1 provisioning. */
export function getOpenDecisions(): OnboardingFieldSpec[] {
  return ONBOARDING_FIELDS.filter((f) => f.provisioning === 'decision')
}

/** Fields the OS writes through to Summit today (no provisioning needed). */
export function getWritableToday(opts?: { atzmaiSliceOnly?: boolean }): OnboardingFieldSpec[] {
  return ONBOARDING_FIELDS.filter(
    (f) => f.provisioning === 'exists' && (!opts?.atzmaiSliceOnly || f.inAtzmaiSlice),
  )
}
