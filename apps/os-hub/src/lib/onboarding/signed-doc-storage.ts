/**
 * Shared signed-document storage helpers.
 *
 * Closes the loop on every signing flow (2Sign auto-stamp, BTL מיוצגים external,
 * manual office-paper override): every completed signing produces a retrievable
 * PDF in Sanity AND a הערות line in Summit so the office can see/download it
 * from the client card without leaving the CRM.
 *
 * No new Summit File-field is created — until field schema is confirmed with
 * Avi/Ron we append to הערות via addclientremark/ (non-destructive, history-preserving).
 */

import { sanityConfig } from '@/config/integrations'

const SUMMIT_BASE = 'https://api.sumit.co.il'
const CLIENT_FOLDER = '557688522'

export const SIGNED_DOC_LABELS: Record<string, string> = {
  'poa-tax-authority': 'ייפוי כוח רשות המסים (חתום)',
  'poa-nii-withholdings': 'ייפוי כוח ב"ל ניכויים (חתום)',
  'poa-nii-representatives': 'ייפוי כוח ב"ל מיוצגים (אסמכתא)',
}

export function getSignedDocLabel(documentType: string): string {
  return SIGNED_DOC_LABELS[documentType] || `מסמך חתום (${documentType})`
}

/**
 * Upload a signed/stamped PDF buffer to Sanity assets.
 * @returns CDN URL or null if creds missing / upload failed.
 */
export async function uploadSignedPdfToSanity(
  buffer: Buffer,
  filename: string,
): Promise<string | null> {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || sanityConfig.projectId
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || sanityConfig.dataset || 'production'
  const apiToken = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN || sanityConfig.apiToken
  if (!projectId || !apiToken) return null

  const url = `https://${projectId}.api.sanity.io/v2024-01-01/assets/files/${dataset}?filename=${encodeURIComponent(filename)}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/pdf',
    },
    body: new Uint8Array(buffer),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    console.error('[SignedDoc] Sanity asset upload failed:', resp.status, text.slice(0, 200))
    return null
  }
  const data = await resp.json() as { document?: { url?: string } }
  return data.document?.url || null
}

/**
 * Append a "<label>: <url>" remark to the Summit client הערות.
 * Uses /crm/data/addclientremark/ which preserves prior remark history.
 * Non-fatal — silently no-ops if creds missing or call fails.
 */
export async function addSignedDocRemarkToSummit(
  entityId: string | number,
  label: string,
  url: string,
): Promise<void> {
  const creds = {
    CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
    APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
  }
  if (!creds.APIKey || !creds.CompanyID) return
  const numericId = typeof entityId === 'string' ? parseInt(entityId, 10) : entityId
  if (!numericId || Number.isNaN(numericId)) return

  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const content = `${label} — ${dd}/${mm}/${today.getFullYear()}\n${url}`

  try {
    const res = await fetch(`${SUMMIT_BASE}/crm/data/addclientremark/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
      body: JSON.stringify({
        Credentials: creds,
        EntityID: numericId,
        Folder: CLIENT_FOLDER,
        Content: content,
      }),
    })
    if (!res.ok) {
      console.error('[SignedDoc] Summit addclientremark HTTP error:', res.status)
    }
  } catch (err) {
    console.error('[SignedDoc] Summit addclientremark error:', err)
  }
}

/**
 * One-shot: Sanity upload + Summit remark.
 * @returns Sanity CDN URL or null on Sanity failure.
 */
export async function persistSignedDoc(opts: {
  buffer: Buffer
  filename: string
  documentType: string
  summitEntityId: string | number
}): Promise<string | null> {
  const sanityUrl = await uploadSignedPdfToSanity(opts.buffer, opts.filename)
  if (sanityUrl) {
    await addSignedDocRemarkToSummit(
      opts.summitEntityId,
      getSignedDocLabel(opts.documentType),
      sanityUrl,
    )
  }
  return sanityUrl
}
