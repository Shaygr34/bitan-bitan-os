/**
 * Onboarding event notifications for office staff.
 *
 * Every relevant onboarding event (signing sent, signing completed,
 * external task done, stage advanced) emits an email to the firm
 * mailbox so Shay/Ops have full visibility — independent of Avi/Ron's
 * personal Gmail.
 *
 * Required env vars:
 *   RESEND_API_KEY            — Resend API key (shared with website)
 *
 * Optional env vars:
 *   ONBOARDING_NOTIFY_FROM    — sender (default reports@bitancpa.com)
 *   ONBOARDING_NOTIFY_EXTRA   — comma-separated extra recipients
 */

import { STAGE_LABELS } from './types'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

// Always-recipient: firm shared mailbox. Spec'd by Shay.
const FIRM_MAILBOX = 'bitan@bitancpa.com'

const EMAIL_FROM =
  process.env.ONBOARDING_NOTIFY_FROM ||
  'ביטן את ביטן — מערכת קליטה <reports@bitancpa.com>'

const DOC_TYPE_LABELS: Record<string, string> = {
  'poa-tax-authority': 'ייפוי כוח רשות המיסים',
  'poa-nii-withholdings': 'ייפוי כוח ביטוח לאומי — ניכויים',
  'poa-nii-representatives': 'ייפוי כוח ביטוח לאומי — מיוצגים',
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getDocLabel(documentType: string): string {
  return DOC_TYPE_LABELS[documentType] || documentType
}

function getRecipients(): string[] {
  const extra = (process.env.ONBOARDING_NOTIFY_EXTRA || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return Array.from(new Set([FIRM_MAILBOX, ...extra]))
}

function summitClientUrl(summitEntityId: string): string {
  return `https://app.sumit.co.il/f557688522/c${summitEntityId}/`
}

function osClientUrl(summitEntityId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://os.bitancpa.com'
  return `${base.replace(/\/$/, '')}/onboarding/${summitEntityId}`
}

function renderShell(title: string, bodyHtml: string, summitEntityId?: string): string {
  const links = summitEntityId
    ? `<div style="margin-top:18px">
        <a href="${osClientUrl(summitEntityId)}" style="display:inline-block;background:#1B2A4A;color:#fff;padding:9px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;margin-inline-end:8px">פתיחה ב-OS</a>
        <a href="${summitClientUrl(summitEntityId)}" style="display:inline-block;background:#C5A572;color:#fff;padding:9px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px">פתיחה בסאמיט</a>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:15px;color:#2D3748;direction:rtl;text-align:right;margin:0;padding:0;background:#F7F6F3">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#1B2A4A;padding:18px 24px;border-radius:8px 8px 0 0">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700">${escapeHtml(title)}</h1>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #E2E0DB;border-top:none">
      ${bodyHtml}
      ${links}
      <hr style="border:none;border-top:1px solid #E2E0DB;margin:20px 0 12px">
      <p style="font-size:11px;color:#718096;margin:0">הודעה אוטומטית ממערכת הקליטה — ביטן את ביטן.</p>
    </div>
  </div>
</body>
</html>`
}

async function sendResend(subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email-notifier] RESEND_API_KEY missing — skipping notification')
    return false
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: getRecipients(),
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[email-notifier] Resend ${res.status}: ${text.slice(0, 200)}`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[email-notifier] send failed:', err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Fire-and-forget wrapper. Never throws; never blocks the caller.
 */
function fireAndForget(subject: string, html: string): void {
  sendResend(subject, html).catch(() => {
    /* swallowed — already logged */
  })
}

// ---------- Public notifiers ----------

export function notifySigningSent(opts: {
  clientName: string
  summitEntityId: string
  documentType: string
  clientEmail?: string
}): void {
  const docLabel = getDocLabel(opts.documentType)
  const subject = `📤 ${docLabel} נשלח לחתימה — ${opts.clientName}`
  const body = `
    <p style="margin:0 0 14px;font-size:15px">נשלחה בקשת חתימה ללקוח דרך 2Sign.</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">לקוח:</td><td>${escapeHtml(opts.clientName)}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">מסמך:</td><td>${escapeHtml(docLabel)}</td></tr>
      ${opts.clientEmail ? `<tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">דוא"ל לקוח:</td><td>${escapeHtml(opts.clientEmail)}</td></tr>` : ''}
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">מזהה Summit:</td><td>${escapeHtml(opts.summitEntityId)}</td></tr>
    </table>`
  fireAndForget(subject, renderShell(subject, body, opts.summitEntityId))
}

export function notifySigningCompleted(opts: {
  clientName: string
  summitEntityId: string
  documentType: string
  signedDocUrl?: string | null
  source?: 'auto-stamp' | 'manual' | 'late-upload' | '2sign'
}): void {
  const docLabel = getDocLabel(opts.documentType)
  const sourceLabel: Record<string, string> = {
    'auto-stamp': 'נחתם + הוטבע אוטומטית',
    manual: 'סומן כחתום ידנית',
    'late-upload': 'הועלה PDF חתום',
    '2sign': 'נחתם דרך 2Sign',
  }
  const subject = `✅ ${docLabel} חתום — ${opts.clientName}`
  const linkRow = opts.signedDocUrl
    ? `<tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">קובץ חתום:</td><td><a href="${opts.signedDocUrl}" style="color:#C5A572;font-weight:600">צפה ב-PDF</a></td></tr>`
    : ''
  const body = `
    <p style="margin:0 0 14px;font-size:15px">${sourceLabel[opts.source || '2sign']}.</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">לקוח:</td><td>${escapeHtml(opts.clientName)}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">מסמך:</td><td>${escapeHtml(docLabel)}</td></tr>
      ${linkRow}
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">מזהה Summit:</td><td>${escapeHtml(opts.summitEntityId)}</td></tr>
    </table>`
  fireAndForget(subject, renderShell(subject, body, opts.summitEntityId))
}

export function notifyExternalDone(opts: {
  clientName: string
  summitEntityId: string
  documentType: string
  signedDocUrl?: string | null
}): void {
  const docLabel = getDocLabel(opts.documentType)
  const subject = `✅ ${docLabel} סומן כהושלם — ${opts.clientName}`
  const linkRow = opts.signedDocUrl
    ? `<tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">קובץ חתום:</td><td><a href="${opts.signedDocUrl}" style="color:#C5A572;font-weight:600">צפה ב-PDF</a></td></tr>`
    : `<tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">סטטוס:</td><td>אסמכתא אושרה (ללא PDF)</td></tr>`
  const body = `
    <p style="margin:0 0 14px;font-size:15px">משימה חיצונית סומנה כהושלמה ב-OS.</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">לקוח:</td><td>${escapeHtml(opts.clientName)}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">מסמך:</td><td>${escapeHtml(docLabel)}</td></tr>
      ${linkRow}
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">מזהה Summit:</td><td>${escapeHtml(opts.summitEntityId)}</td></tr>
    </table>`
  fireAndForget(subject, renderShell(subject, body, opts.summitEntityId))
}

export function notifyStageAdvanced(opts: {
  clientName?: string
  summitEntityId: string
  toStage: number
  reason?: string
}): void {
  const stageLabel = STAGE_LABELS[opts.toStage] || `שלב ${opts.toStage}`
  const clientLabel = opts.clientName ? ` — ${opts.clientName}` : ''
  const subject = `🔄 שלב ${opts.toStage}: ${stageLabel}${clientLabel}`
  const body = `
    <p style="margin:0 0 14px;font-size:15px">לקוח עבר לשלב <strong>${escapeHtml(stageLabel)}</strong>.</p>
    <table style="border-collapse:collapse;font-size:14px">
      ${opts.clientName ? `<tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">לקוח:</td><td>${escapeHtml(opts.clientName)}</td></tr>` : ''}
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">שלב חדש:</td><td>${opts.toStage} — ${escapeHtml(stageLabel)}</td></tr>
      ${opts.reason ? `<tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">סיבה:</td><td>${escapeHtml(opts.reason)}</td></tr>` : ''}
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#1B2A4A">מזהה Summit:</td><td>${escapeHtml(opts.summitEntityId)}</td></tr>
    </table>`
  fireAndForget(subject, renderShell(subject, body, opts.summitEntityId))
}
