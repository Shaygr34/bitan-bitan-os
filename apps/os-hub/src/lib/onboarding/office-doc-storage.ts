/**
 * Office doc storage — uploads onboarding documents on behalf of the client
 * from the OS UI. Two situations:
 *   1. Office is correcting a wrong upload (client made a mistake).
 *   2. Office is filling gaps for clients who never used the intake form.
 *
 * DUAL-WRITE pattern (since 2026-05-13):
 *   1. Sanity asset upload for the raw file (canonical storage, CDN-served).
 *   2. Summit typed File-field write via `/crm/data/updateentity/` —
 *      property value format is `${filename};${base64}`. Mirrors the
 *      breakthrough pattern from the intake form (bitan-bitan-website
 *      src/app/api/intake/route.ts + src/lib/intake-types.ts DOC_FIELDS).
 *      This makes the doc downloadable from inside Summit and lets the
 *      firm's completion dashboard count it via the typed-field check.
 *   3. Summit הערה (RichText) remark in `label: url` format — audit trail
 *      AND fallback signal for the OS view (summit-client.extractDocUrls
 *      scans remarks for `label: url` lines).
 *
 * If the typed-field write fails for any reason (rate-limit, schema drift,
 * etc.) the הערה path still works and the doc is still discoverable from
 * the OS view. Both paths are non-fatal w.r.t. Sanity upload success.
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

/**
 * Office doc-type → Summit typed File field name (the Hebrew APIName for the
 * field on folder 557688522, ValueType: "File"). Source of truth: the
 * intake form's DOC_FIELDS in bitan-bitan-website src/lib/intake-types.ts.
 *
 * Empty string ("") means "no typed Summit field for this doc-type" — only
 * the הערה path is used. Notes on collisions / naming:
 *   - idCard and driverLicense BOTH target 'ת.ז/ רישיון בעלים' (Summit
 *     stores one file per typed field; latest write wins per intake form
 *     convention — preserved here).
 *   - 'פתיחת תיק מעמ' is the field name the intake form writes; it does
 *     NOT appear in the canonical folder schema dump (which has
 *     'פתיחת תיק רשויות / ייפוי כח' instead). Sumit appears to silently
 *     accept the write either way. Matching the intake-form convention
 *     preserves round-trip parity for clients who used both pipelines.
 *   - rentalContract has no typed-field equivalent on this folder.
 */
export const OFFICE_DOC_SUMMIT_FIELDS: Record<string, string> = {
  idCard: 'ת.ז/ רישיון בעלים',
  driverLicense: 'ת.ז/ רישיון בעלים',
  bankApproval: 'אישור ניהול חשבון',
  osekMurshe: 'תעודת עוסק מורשה',
  ptihaTikMaam: 'פתיחת תיק מעמ',
  teudatHitagdut: 'תעודת התאגדות',
  takanonHevra: 'תקנון חברה',
  protokolMurshe: 'פרוטוקול מורשה חתימה',
  nesahHevra: 'נסח חברה',
  rentalContract: '',
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
 * Write the office doc to its typed Summit File field via /crm/data/updateentity/.
 * Property value format: `${filename};${base64}` — Sumit's documented inline
 * file format (no separate upload endpoint required).
 *
 * Non-fatal: if the typed-field write fails, the Sanity asset + הערה path
 * still works and the doc remains discoverable from the OS view.
 */
export async function persistOfficeDocToSummitFileField(
  entityId: string | number,
  docType: string,
  buffer: Buffer,
  filename: string,
): Promise<void> {
  const summitField = OFFICE_DOC_SUMMIT_FIELDS[docType]
  if (!summitField) return // no typed field for this doc-type

  const creds = {
    CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
    APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
  }
  if (!creds.APIKey || !creds.CompanyID) return
  const numericId = typeof entityId === 'string' ? parseInt(entityId, 10) : entityId
  if (!numericId || Number.isNaN(numericId)) return

  const base64 = buffer.toString('base64')
  const fieldValue = `${filename};${base64}`

  try {
    const res = await fetch(`${SUMMIT_BASE}/crm/data/updateentity/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
      body: JSON.stringify({
        Credentials: creds,
        Entity: {
          ID: numericId,
          Folder: CLIENT_FOLDER,
          Properties: {
            [summitField]: fieldValue,
          },
        },
      }),
    })
    if (!res.ok) {
      console.error('[OfficeDoc] Summit typed-field update HTTP error:', res.status, summitField)
      return
    }
    const json = await res.json().catch(() => null) as { Status?: number; UserErrorMessage?: string } | null
    if (json?.Status !== 0) {
      console.error('[OfficeDoc] Summit typed-field update error:', json?.UserErrorMessage || 'Unknown', summitField)
    }
  } catch (err) {
    console.error('[OfficeDoc] Summit typed-field update error:', err)
  }
}

/**
 * One-shot helper: Sanity upload + Summit typed File field write + Summit הערה.
 * Triple-write closes the loop:
 *   - Sanity: canonical CDN-served storage, returned for in-UI links.
 *   - Summit typed File field: downloadable from inside the Summit client
 *     card; counted by the firm's completion dashboard.
 *   - Summit הערה: audit trail + fallback signal for extractDocUrls.
 *
 * @returns Sanity CDN URL or null on Sanity failure. Summit failures are
 *          non-fatal and logged.
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
    // Serialize the two Summit writes (was: Promise.all). Observed 2026-05-14
    // demo: when both ran in parallel, the typed File field write succeeded
    // but addclientremark silently failed — likely entity-lock contention on
    // Sumit's side. Running them sequentially adds ~1s but the הערה write
    // becomes reliable, which the OS DocumentsCard depends on for round-trip
    // visibility via extractDocUrls.
    await persistOfficeDocToSummitFileField(
      opts.summitEntityId,
      opts.docType,
      opts.buffer,
      opts.filename,
    )
    await persistOfficeDocRemarkToSummit(
      opts.summitEntityId,
      getOfficeDocLabel(opts.docType),
      sanityUrl,
    )
  }
  return sanityUrl
}
