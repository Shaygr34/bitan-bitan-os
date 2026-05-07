/**
 * Onboarding letter templates — pre-filled Hebrew text for office staff to send
 * to clients via WhatsApp / clipboard. Keyed by checklist item.key.
 *
 * Originally introduced in PR #103 (April 9, 2026), removed during V4 dashboard
 * rewrite (April 26+), restored here so ChecklistCard can offer "click to send"
 * actions on relevant items.
 *
 * Add a new template:
 *   1. Write a builder fn here that takes the data it needs.
 *   2. Wire it into ChecklistCard's renderItemAction switch by item.key.
 */

/** קודי מוסד — institution codes letter (verbatim from Avi's April 9 spec). */
export function getKodeiMosadLetter(clientName: string): string {
  const name = clientName?.trim() || 'לקוח יקר'
  return `${name} שלום,

כחלק מייעול העבודה השוטפת בעניין תשלומים שוטפים למוסדות, נבקש להקים הרשאת חיוב בחשבון הבנק בהתאם לקודי המוסד המפורטים:

2760 – מ"ה מקדמות
2761 – מע"מ
2762 – מ"ה ניכויים
38286 – ב"ל ניכויים
28900 – ביטוח לאומי עצמאי
55755 – ביטן

מספר דגשים:
א. קוד מוסד הנו הרשאת חיוב ספציפית ישירות למוסדות במקום תשלום בשיקים.
ב. בעת הקמת הרשאת החיוב לא להגביל תאריכים וסכומים אחרת הוראת החיוב לא תאושר ע"י המוסד.
ג. מילוי מספר אסמכתא / מזהה / מספר לקוח — בעת הקמת הוראת החיוב זה שדה שקיים, צריך למלא מספר ת.ז/ח.פ/תיק ניכויים — חשוב מאוד!
ד. הוראת החיוב מבוצעת ע"י משרדנו בלבד. (מלבד ב"ל עצמאי שיורד באופן שוטף ובסכום קבוע ואוטומטי ב-22 לחודש).
ה. לשמור את מסמך הקמת הוראת החיוב ולשלוח למשרדנו. למייל heli@bitancpa.com או לפקס 03-5174298

לאחר סיום הליך הקמת הוראות החיוב לעדכן את משרדנו ע"מ שנעקוב מול הרשויות בקליטתן.

לכל שאלה ניתן לפנות למשרדנו 03-5174295
ביטן את ביטן — רואי חשבון`
}

/**
 * ייפוי כוח ב"ל מיוצגים — short message that ships the per-client BTL link.
 * Office staff (Avi/Guy) generate the link in the BTL portal and paste it in
 * the SigningCard; this builder embeds it in a drafted Hebrew WhatsApp message.
 */
export function getBtlMiyutzagimMessage(clientName: string, link: string): string {
  const name = clientName?.trim() || 'לקוח יקר'
  return `שלום ${name},

לצורך השלמת תהליך הקליטה — אישור ייצוג שלנו מול ביטוח לאומי:
${link}

אנא היכנס/י לקישור, אשר/י את ייצוגנו, ושלח/י לנו את מספר האסמכתא שתתקבל.

תודה,
ביטן את ביטן — רואי חשבון
03-5174295`
}

/**
 * Build a wa.me URL with text. If phone is provided, sends to that number;
 * otherwise opens the no-recipient WhatsApp web form (April 9 behavior).
 *
 * Phone normalization mirrors the parent page handler (page.tsx:230):
 * strip spaces/dashes, replace leading 0 with Israel country code 972.
 */
export function buildWhatsAppUrl(text: string, phone?: string): string {
  const encoded = encodeURIComponent(text)
  if (phone) {
    const normalized = phone.replace(/[-\s]/g, '').replace(/^0/, '972')
    return `https://wa.me/${normalized}?text=${encoded}`
  }
  return `https://web.whatsapp.com/send?text=${encoded}`
}
