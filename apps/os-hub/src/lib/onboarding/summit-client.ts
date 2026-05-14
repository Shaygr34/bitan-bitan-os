import { STATUS_ID_TO_STAGE } from './types'

const BASE_URL = 'https://api.sumit.co.il'

function getCredentials() {
  return {
    CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
    APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
  }
}

export async function getSummitEntity(entityId: string): Promise<Record<string, unknown> | null> {
  const creds = getCredentials()
  if (!creds.APIKey) return null
  try {
    const res = await fetch(`${BASE_URL}/crm/data/getentity/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
      body: JSON.stringify({ Credentials: creds, EntityID: parseInt(entityId, 10), Folder: '557688522' }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    if (json.Status !== 0) return null
    return json.Data?.Entity ?? null
  } catch {
    return null
  }
}

export function extractStageFromEntity(entity: Record<string, unknown>): number {
  const status = entity['Customers_Status'] as Array<{ ID: number }> | undefined
  if (!status?.[0]?.ID) return 0
  return STATUS_ID_TO_STAGE[status[0].ID] ?? 0
}

export function extractClientData(entity: Record<string, unknown>) {
  return {
    phone: (entity['Customers_Phone'] as string[])?.[0] ?? '',
    email: (entity['Customers_EmailAddress'] as string[])?.[0] ?? '',
    sector: (entity['תחום עיסוק'] as Array<{ Name: string }>)?.[0]?.Name ?? '',
    address: (entity['Customers_Address'] as string[])?.[0] ?? '',
    clientType: (entity['סוג לקוח'] as Array<{ Name: string }>)?.[0]?.Name ?? '',
    accountManager: (entity['מנהל תיק'] as Array<{ Name: string }>)?.[0]?.Name ?? '',
    auditWorker: (entity['עובד/ת ביקורת'] as Array<{ Name: string }>)?.[0]?.Name ?? '',
    bookkeeper: (entity['מנהל/ת חשבונות'] as Array<{ Name: string }>)?.[0]?.Name ?? '',
  }
}

/**
 * Defensive extraction of items from the `קבצים אחרים` multi-file field.
 *
 * Sumit's exact response shape for populated multi-file fields isn't
 * documented; based on patterns from sibling fields it's likely either:
 *   (a) Array of strings — file GUIDs.
 *   (b) Array of objects with { Name | FileName, GUID | ID }.
 *   (c) Same shape as Entity references — array of `{ ID, Name, ... }`.
 *
 * Returns a count + best-effort list of `{ name }` items. We don't try to
 * construct downloadable URLs yet — Sumit's downloadfile/{GUID}/ requires
 * auth, so partners view these directly in the Sumit client card. The OS
 * UI just surfaces presence so partners know historical other-docs exist.
 */
export interface OtherDocItem {
  name: string
}
export function extractOtherDocs(entity: Record<string, unknown>): OtherDocItem[] {
  const raw = entity['קבצים אחרים']
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): OtherDocItem | null => {
      if (typeof item === 'string') {
        // Strip leading filename if it's our `${name};${base64}` pattern;
        // otherwise treat as bare name.
        const semi = item.indexOf(';')
        const name = semi > 0 ? item.slice(0, semi) : item
        return { name: name || 'מסמך' }
      }
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        const name = (o.Name || o.FileName || o.fileName || o.name) as string | undefined
        if (typeof name === 'string' && name) return { name }
        return { name: 'מסמך' }
      }
      return null
    })
    .filter((x): x is OtherDocItem => x !== null)
}

/**
 * Map of Summit typed File field name → our internal doc-type key.
 * Mirrors the intake-form DOC_FIELDS map (bitan-bitan-website
 * src/lib/intake-types.ts) and the OFFICE_DOC_SUMMIT_FIELDS map in
 * office-doc-storage.ts. Source of truth across all three should match.
 */
const SUMMIT_TYPED_FILE_FIELDS_TO_DOC_KEY: Record<string, string> = {
  'ת.ז/ רישיון בעלים': 'idCard',  // also covers driverLicense (intake form puts both here)
  'אישור ניהול חשבון': 'bankApproval',
  'תעודת עוסק מורשה': 'osekMurshe',
  'פתיחת תיק מעמ': 'ptihaTikMaam',
  'תעודת התאגדות': 'teudatHitagdut',
  'תקנון חברה': 'takanonHevra',
  'פרוטוקול מורשה חתימה': 'protokolMurshe',
  'נסח חברה': 'nesahHevra',
}

/**
 * Check which doc-types have content in their typed Summit File field.
 * Complements `extractDocUrls` (which reads from הערות only). Used by the
 * entity route to surface a "doc is uploaded to Summit even if הערה write
 * failed/missed" signal to the OS DocumentsCard.
 *
 * Returns Record<docTypeKey, boolean>. True means a typed Summit File field
 * for this docKey is non-empty. No URL is returned because typed File field
 * content is base64-inline in Summit — view links require Summit's UI.
 */
export function extractTypedFileFieldPresence(
  entity: Record<string, unknown>,
): Record<string, boolean> {
  const presence: Record<string, boolean> = {}
  for (const [summitField, docKey] of Object.entries(SUMMIT_TYPED_FILE_FIELDS_TO_DOC_KEY)) {
    const value = entity[summitField]
    // Summit File-field response shape: array of refs/objects when filled,
    // null/undefined/empty array when empty.
    const filled = Array.isArray(value) ? value.length > 0 : !!value
    if (filled) presence[docKey] = true
  }
  return presence
}

/**
 * Extract uploaded doc URLs from Summit הערות.
 *
 * Scans ALL remarks (not just notes[0]) so that office-side uploads from the
 * OS (which arrive as fresh remarks via /crm/data/addclientremark/) round-trip
 * into the OS view. First match wins per doc-type — since `addclientremark`
 * appends, the most recent remark naturally wins because it ends up at notes[0]
 * (Summit returns remarks newest-first).
 *
 * Format anchor: lines of the form `label: https://cdn.sanity.io/...`.
 * Signed-doc remarks (signed-doc-storage.ts) intentionally use a DASH
 * separator (`—`) and have no colon, so they don't accidentally match here.
 */
export function extractDocUrls(entity: Record<string, unknown>): Record<string, string> {
  const notes = entity['הערות'] as Array<{ Item1?: string; Item2?: string }> | undefined
  if (!notes || notes.length === 0) return {}

  const docs: Record<string, string> = {}

  for (const note of notes) {
    const text = note?.Item2 || note?.Item1 || ''
    if (!text) continue

    const lines = text.split('\n')
    for (const line of lines) {
      const match = line.match(/^(.+?):\s*(https:\/\/cdn\.sanity\.io\/.+)$/i)
      if (!match) continue
      const label = match[1].trim()
      const url = match[2].trim()

      // Map Hebrew label back to doc key — first match wins per doc-type so
      // a newer remark doesn't get overwritten by an older one we scan later.
      const set = (key: string) => { if (!docs[key]) docs[key] = url }

      if (label.includes('ת.ז')) set('idCard')
      else if (label.includes('רישיון')) set('driverLicense')
      else if (label.includes('ניהול חשבון') || label.includes('שיק')) set('bankApproval')
      else if (label.includes('עוסק מורשה')) set('osekMurshe')
      else if (label.includes('מע"מ') || label.includes('מעמ')) set('ptihaTikMaam')
      else if (label.includes('התאגדות')) set('teudatHitagdut')
      else if (label.includes('תקנון')) set('takanonHevra')
      else if (label.includes('מורשה חתימה') || label.includes('פרוטוקול')) set('protokolMurshe')
      else if (label.includes('נסח')) set('nesahHevra')
      else if (label.includes('שכירות')) set('rentalContract')
    }
  }
  return docs
}
