import { type ChecklistItem, getDocCategory } from './types'

function item(key: string, label: string, stage: number): ChecklistItem {
  return { _key: key, key, label, completed: false, stageRelevance: stage }
}

const BASE_TEMPLATE: ChecklistItem[] = [
  item('data-collection', 'קליטת נתונים בסיסיים', 1),
  item('assign-manager', 'הגדרת מנהל תיק ועדכון הצוות', 1),
  item('send-link', 'שליחת קישור קליטה ללקוח', 1),
  item('power-of-attorney', 'הפקת ייפוי כוח — מ"ה / מע"מ / ניכויים / ב"ל', 2),
  item('complete-docs', 'השלמת מסמכים חסרים', 2),
  item('send-codes', 'שליחת קודי מוסד ללקוח', 2),
  item('manager-approval', 'אישור מנהל תיק', 3),
  item('open-gov-files', 'פתיחת תיקים — קבע / ניכויים / הנה"ח / דפי בנק', 4),
  item('track-poa', 'מעקב קליטת ייפוי כוח ועדכון דיווחים', 4),
  item('withholding-request', 'בקשת ניכוי מס במקור', 5),
  item('send-osek-cert', 'שליחת תעודת עוסק מורשה', 5),
  item('save-contact', 'שמירת לקוח בנייד המשרדי (WhatsApp)', 6),
]

const COMPANY_EXTRAS: ChecklistItem[] = [
  item('company-docs', 'השלמת מסמכי חברה (תעודת התאגדות, תקנון, אישור מורשה חתימה)', 2),
]

const TRANSFER_EXTRAS: ChecklistItem[] = [
  item('contact-prev-cpa', 'יצירת קשר עם רו"ח קודם לשחרור תיק', 1),
]

export function buildChecklist(clientType?: string, isTransfer?: boolean): ChecklistItem[] {
  const items = [...BASE_TEMPLATE]
  const cat = getDocCategory(clientType)
  if (cat === 'company') items.splice(4, 0, ...COMPANY_EXTRAS)
  if (isTransfer) items.splice(3, 0, ...TRANSFER_EXTRAS)
  return items
}
