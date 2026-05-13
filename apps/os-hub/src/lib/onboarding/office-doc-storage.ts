/**
 * Office doc storage — uploads onboarding documents on behalf of the client
 * from the OS UI (P3 of the manual-overtake arc). Two situations:
 *   1. Office is correcting a wrong upload (client made a mistake).
 *   2. Office is filling gaps for clients who never used the intake form.
 *
 * Mirrors the existing intake-form storage pattern: Sanity asset upload + a
 * Summit הערה remark in `label: url` format. The OS view picks the new doc
 * up via `extractDocUrls` (summit-client.ts) which scans all remarks for that
 * `label: url` shape and maps Hebrew label keywords back to doc-type keys.
 *
 * Future P3.b: once Avi/Ron confirm the typed Summit field schema (see
 * `apps/os-hub/src/app/api/completion/summary/route.ts` DOC_FIELDS_MAP for
 * the field names that already EXIST in Summit), additionally write the URL
 * to the typed field via `/crm/data/updateentity/`. The remark path stays
 * as audit history.
 */

import { sanityConfig } from '@/config/integrations'

const SUMMIT_BASE = 'https://api.sumit.co.il'
const CLIENT_FOLDER = '557688522'

/**
 * Office UI doc-type → Hebrew label written into the Summit remark.
 * The label must include a keyword that `summit-client.extractDocUrls` matches
 * so the office-uploaded doc round-trips back into the OS view.
 * Source of truth for keywords: summit-client.ts:64-73 (do not drift).
 */
export const OFFICE_DOC_LABELS: Record<string, string> = {
  idCard: 'ת.ז',
  driverLicense: 'רישיון נהיגה',
  bankApproval: 'אישור ניהול חשבון',
  osekMurshe: 'תעודת עוסק מורשה',
  ptihaTikMaam: 'פתיחת תיק מע"מ',
  teudatHitagdut: 'תעודת התאגדות',
  takanonHevra: 'תקנון חברה',
  protokolMurshe: 'פרוטוקול מורשה חתימה',
  nesahHevra: 'נסח חברה',
  rentalContract: 'חוזה שכירות',
}

export function getOfficeDocLabel(docType: string): string {
  return OFFICE_DOC_LABELS[docType] || docType
}

/** Allowed doc-types for office upload. */
export function isValidDocType(docType: string): docType is keyof typeof OFFICE_DOC_LABELS {
  return docType in OFFICE_DOC_LABELS
}

/**
 * Upload an office-supplied doc to Sanity assets. Accepts any MIME type
 * (PDFs, JPEG/PNG scans, etc.) — caller passes the content-type explicitly.
 * Returns CDN URL or null on failure.
 */
export async function uploadOfficeDocToSanity(
  buffer: Buffer,
  filename: string,
  contentType: string,
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
      'Content-Type': contentType,
    },
    body: new Uint8Array(buffer),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    console.error('[OfficeDoc] Sanity asset upload failed:', resp.status, text.slice(0, 200))
    return null
  }
  const data = (await resp.json()) as { document?: { url?: string } }
  return data.document?.url || null
}

/**
 * Append a "<label>: <url>" remark to the Summit client הערות.
 * Format matches the intake-form convention so `extractDocUrls` picks it up
 * (regex: /^(.+?):\s*(https:\/\/cdn\.sanity\.io\/.+)$/).
 *
 * NOTE: this uses the COLON separator (`:`). The signing flow's
 * `addSignedDocRemarkToSummit` uses a DASH separator (`—`) on purpose — so
 * the two paths don't collide and signed-doc URLs are not parsed as
 * office-uploaded docs.
 */
export async function persistOfficeDocRemarkToSummit(
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

  // "label: url" — the colon is the critical separator for the round-trip
  // through extractDocUrls. Date is appended on a second line as readable
  // audit context; the regex anchors on the line start so it ignores it.
  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const content = `${label}: ${url}\nהועלה מ-OS — ${dd}/${mm}/${today.getFullYear()}`

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
      console.error('[OfficeDoc] Summit addclientremark HTTP error:', res.status)
    }
  } catch (err) {
    console.error('[OfficeDoc] Summit addclientremark error:', err)
  }
}

/**
 * One-shot helper: Sanity upload + Summit remark.
 * @returns Sanity CDN URL or null on Sanity failure (Summit failure is non-fatal).
 */
export async function persistOfficeDoc(opts: {
  buffer: Buffer
  filename: string
  contentType: string
  docType: string
  summitEntityId: string | number
}): Promise<string | null> {
  const sanityUrl = await uploadOfficeDocToSanity(opts.buffer, opts.filename, opts.contentType)
  if (sanityUrl) {
    await persistOfficeDocRemarkToSummit(
      opts.summitEntityId,
      getOfficeDocLabel(opts.docType),
      sanityUrl,
    )
  }
  return sanityUrl
}
