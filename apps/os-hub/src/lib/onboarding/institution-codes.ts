/**
 * Stage-5 קודי מוסד (institution codes) + standing-order payment calendar.
 *
 * Verbatim from Ron's קליטת לקוחות spec §85–97 (codes per entity type) and
 * §83 (הוראת קבע payment days). Pure data + lookups — no network, no form
 * dependency. The Stage-5 client link surfaces exactly the codes relevant to
 * the client's entity type + ניכויים status, plus this fixed explanation:
 *
 *   "בעת הקמת קוד מוסד באתר הבנק חשוב להקפיד בשדה אסמכתא לרשום ע.מ. של
 *    העסק, אחרת קוד המוסד לא ייקלט במערכת."
 *
 * Standing orders are paid by the office, EXCEPT ביטוח לאומי עצמאי which is
 * auto-debited by BTL on a fixed day.
 */

export type Authority =
  | 'מס הכנסה מקדמות'
  | 'מע"מ'
  | 'מס הכנסה ניכויים'
  | 'ביטוח לאומי ניכויים'
  | 'ביטוח לאומי מקדמות'
  | 'ביטן רואי חשבון'

export interface InstitutionCode {
  code: string
  authority: Authority
}

const C = {
  mhMikdamot: { code: '2760', authority: 'מס הכנסה מקדמות' as const },
  maam: { code: '2761', authority: 'מע"מ' as const },
  mhNikuyim: { code: '2762', authority: 'מס הכנסה ניכויים' as const },
  blNikuyim: { code: '38286', authority: 'ביטוח לאומי ניכויים' as const },
  blMikdamot: { code: '28900', authority: 'ביטוח לאומי מקדמות' as const },
  bitan: { code: '55755', authority: 'ביטן רואי חשבון' as const },
} satisfies Record<string, InstitutionCode>

/** Entity kinds as they map from Summit "סוג לקוח". */
export type EntityKind =
  | 'company' // חברה / חברה שנתי
  | 'self-employed' // עצמאי (the locked slice)
  | 'partnership' // שותפות (the entity)
  | 'partner-in-partnership' // שותף בשותפות

/**
 * Codes relevant to a client, per spec §85–97.
 * `hasNikuyim` = the client has an active תיק ניכויים (employs workers).
 * Note: partner-in-partnership has a fixed personal set regardless of ניכויים.
 */
export function getInstitutionCodes(kind: EntityKind, hasNikuyim: boolean): InstitutionCode[] {
  switch (kind) {
    case 'company':
      return hasNikuyim
        ? [C.mhMikdamot, C.maam, C.mhNikuyim, C.blNikuyim, C.bitan]
        : [C.mhMikdamot, C.maam, C.bitan]
    case 'self-employed':
      return hasNikuyim
        ? [C.mhMikdamot, C.maam, C.mhNikuyim, C.blNikuyim, C.blMikdamot, C.bitan]
        : [C.mhMikdamot, C.maam, C.blMikdamot, C.bitan]
    case 'partnership':
      return hasNikuyim
        ? [C.maam, C.mhNikuyim, C.blNikuyim, C.bitan]
        : [C.maam, C.bitan]
    case 'partner-in-partnership':
      return [C.mhMikdamot, C.blMikdamot]
  }
}

/** Map a Summit "סוג לקוח" string to an EntityKind. Returns null when not codes-relevant. */
export function entityKindFromClientType(clientType?: string): EntityKind | null {
  const t = (clientType || '').trim()
  if (['חברה', 'חברה בע"מ', 'חברה שנתי', 'עמותה'].includes(t)) return 'company'
  if (['עצמאי', 'עוסק מורשה', 'עוסק פטור', 'פטור'].includes(t)) return 'self-employed'
  if (t === 'שותפות') return 'partnership'
  if (t === 'שותף בשותפות') return 'partner-in-partnership'
  return null
}

export interface StandingOrderDay {
  dayOfMonth: number
  authorities: Authority[]
  /** When true the office does NOT debit this — BTL auto-debits on the fixed day. */
  autoDebitedByBTL?: boolean
  note?: string
}

/** §83 — fixed monthly הוראת קבע calendar. Office pays all except the BTL-עצמאי auto-debit. */
export const STANDING_ORDER_CALENDAR: StandingOrderDay[] = [
  { dayOfMonth: 5, authorities: ['ביטן רואי חשבון'] },
  { dayOfMonth: 15, authorities: ['ביטוח לאומי ניכויים'] },
  { dayOfMonth: 19, authorities: ['מע"מ', 'מס הכנסה מקדמות', 'מס הכנסה ניכויים'] },
  {
    dayOfMonth: 22,
    authorities: ['ביטוח לאומי מקדמות'],
    autoDebitedByBTL: true,
    note: 'עצמאי בלבד — נגבה אוטומטית ע"י ביטוח לאומי בתאריך קבוע',
  },
]

/** The fixed bank-reference instruction shown in the Stage-5 client link. */
export const INSTITUTION_CODE_CLIENT_NOTE =
  'בעת הקמת קוד מוסד באתר הבנק חשוב להקפיד בשדה אסמכתא לרשום ע.מ. של העסק, ' +
  'אחרת קוד המוסד לא ייקלט במערכת. יש לצרף קובץ הקמת קוד מוסד לאימות.'
