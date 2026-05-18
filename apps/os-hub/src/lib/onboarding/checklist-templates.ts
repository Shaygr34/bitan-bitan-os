import { type ChecklistItem, getDocCategory } from './types'

function item(key: string, label: string, stage: number): ChecklistItem {
  return { _key: key, key, label, completed: false, stageRelevance: stage }
}

/**
 * Stages 1–3 — UNCHANGED from the original template (shipped & working E2E).
 * Keys/labels/stages are intentionally byte-identical to preserve existing
 * records and the splice indices used by the EXTRAS below. Do not reorder.
 */
const STAGE_1_3_BASE: ChecklistItem[] = [
  item('data-collection', 'קליטת נתונים בסיסיים', 1),
  item('assign-manager', 'הגדרת מנהל תיק ועדכון הצוות', 1),
  item('send-link', 'שליחת קישור קליטה ללקוח', 1),
  item('power-of-attorney', 'הפקת ייפוי כוח — מ"ה / מע"מ / ניכויים / ב"ל', 2),
  item('complete-docs', 'השלמת מסמכים חסרים', 2),
  item('send-codes', 'שליחת קודי מוסד ללקוח', 2),
  item('manager-approval', 'אישור מנהל תיק', 3),
]

const COMPANY_EXTRAS: ChecklistItem[] = [
  item('company-docs', 'השלמת מסמכי חברה (תעודת התאגדות, תקנון, אישור מורשה חתימה)', 2),
]

const TRANSFER_EXTRAS: ChecklistItem[] = [
  item('contact-prev-cpa', 'יצירת קשר עם רו"ח קודם לשחרור תיק', 1),
]

/**
 * Stages 4–6 — rebuilt from Ron's קליטת לקוחות spec (§70–99), replacing the
 * earlier generic placeholders. The pipeline was "pill-only past stage 3"
 * until this spec, so these items are net-new behavior, not a revision.
 *
 * עצמאי (individual) is the locked vertical slice and is spec-exact here.
 * company/exempt derive from it: company adds the per-entity signing note,
 * exempt drops authority steps it doesn't have. Keys are stable kebab-case.
 *
 * NOTE: the Stage-4 signing item exists as a checklist step now; only its
 * PDF signature geometry is blocked (needs the blank בקשת רישום forms).
 */
type DocCategory = 'individual' | 'company' | 'exempt'

function stage4to6(cat: DocCategory): ChecklistItem[] {
  // Stage 4 — רשויות
  const stage4: ChecklistItem[] = [
    item('merge-authority-docs', 'איחוד מסמכי הגשת פתיחת תיק לפי סדר סימון (כולל ייפוי כח רשות המסים)', 4),
    item(
      'sign-registration-request',
      cat === 'company'
        ? 'החתמת בקשת רישום — חברה (§יב חתימה+חותמת חברה, §יג בעל מניות עיקרי, ביטן את ביטן)'
        : cat === 'exempt'
          ? 'החתמת בקשת רישום — עוסק פטור (§י הצהרת העוסק, §יא ביטן את ביטן)'
          : 'החתמת בקשת רישום — עצמאי (§י הצהרת העוסק, §יא ביטן את ביטן)',
      4,
    ),
    item('submit-authorities', 'הגשת פתיחת תיק ברשויות + העלאת אישור הגשה', 4),
    item('set-submission-date', 'עדכון תאריך הגשה פתיחת תיק', 4),
    item('update-reporting-systems', 'עדכון מערכות דיווח — הנה"ח / סאמיט / מיכפל', 4),
    item('open-office-files', 'הקמת תיקים במשרד — סאמיט/הנה"ח (גב 5 / גב 8) + ניכויים אם רלוונטי', 4),
    item('send-osek-cert', 'שליחת תעודת עוסק מורשה ללקוח', 4),
  ]

  // Stage 5 — לקוח חדש
  const stage5: ChecklistItem[] = [
    item('withholding-request', 'בקשת ניכוי מס במקור — פתיחת פנייה ברשות המסים', 5),
    item('add-to-office-mobile', 'הקמת לקוח בנייד המשרדי + הוספה לרשימות תפוצה', 5),
    item('track-poa-intake', 'מעקב קליטת ייפוי כוח — עדכון תאריך השהיית ייפוי כח מ"ה', 5),
  ]
  if (cat !== 'company') {
    stage5.push(item('set-bituah-leumi-status', 'הגדרת מעמד ביטוח לאומי עצמאי', 5))
  }
  stage5.push(
    item('send-institution-codes-link', 'שליחת לינק קודי מוסד ללקוח (כולל קוד מוסד משרד)', 5),
    item('setup-office-standing-order', 'הקמת הוראת קבע תשלום משרד בסאמיט', 5),
  )

  // Stage 6 — לקוח פעיל (terminal; spec: nothing to do, marks completion)
  const stage6: ChecklistItem[] = [
    item('confirm-active', 'אישור סיום קליטה — לקוח פעיל', 6),
  ]

  return [...stage4, ...stage5, ...stage6]
}

export function buildChecklist(clientType?: string, isTransfer?: boolean): ChecklistItem[] {
  const cat = getDocCategory(clientType)
  const items = [...STAGE_1_3_BASE]
  if (cat === 'company') items.splice(4, 0, ...COMPANY_EXTRAS)
  if (isTransfer) items.splice(3, 0, ...TRANSFER_EXTRAS)
  items.push(...stage4to6(cat))
  return items
}
