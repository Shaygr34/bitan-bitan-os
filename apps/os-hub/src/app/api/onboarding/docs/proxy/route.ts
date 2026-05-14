/**
 * GET /api/onboarding/docs/proxy?entityId=X&docType=Y
 *
 * Server-side proxy for downloading a Sumit-stored typed File-field doc.
 * Sumit's typed File fields are auth-walled (`/crm/downloadfile/{GUID}/`);
 * partners can't fetch them directly from the browser. This route reads
 * the entity, extracts the file GUID from the typed File field that
 * corresponds to `docType`, and streams the file back same-origin.
 *
 * Pattern mirrors /api/onboarding/signing/pre-stamp-pdf which we built for
 * react-pdf's CORS-blocked fetch. Same approach: server-side fetch with
 * our SUMMIT_API_KEY, return bytes to the client.
 *
 * Defensive GUID extraction
 * --------------------------
 * Sumit's exact typed-File-field response shape isn't documented. The
 * helper below tries multiple likely shapes:
 *   - Array of strings (treated as GUIDs).
 *   - Array of `{ GUID | ID | FileGuid | FileID, FileName? }` objects.
 *   - Plain string (single GUID).
 * If none match, returns 404 with a helpful diagnostic.
 */

import { NextResponse } from 'next/server'
import { getSummitEntity } from '@/lib/onboarding/summit-client'
import { OFFICE_DOC_SUMMIT_FIELDS } from '@/lib/onboarding/office-doc-storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SUMMIT_BASE = 'https://api.sumit.co.il'

/** Best-effort extraction of a downloadable file identifier from a typed File-field value. */
function extractFileGuid(fieldValue: unknown): string | null {
  if (!fieldValue) return null
  if (typeof fieldValue === 'string') return fieldValue
  if (Array.isArray(fieldValue)) {
    for (const item of fieldValue) {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        const guid =
          o.GUID || o.guid ||
          o.FileGuid || o.fileGuid ||
          o.FileID || o.fileId ||
          o.ID || o.id
        if (typeof guid === 'string' && guid.length > 0) return guid
        if (typeof guid === 'number') return String(guid)
      }
    }
  }
  return null
}

/** Best-effort filename extraction (for Content-Disposition). */
function extractFileName(fieldValue: unknown): string | null {
  if (!Array.isArray(fieldValue)) return null
  for (const item of fieldValue) {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const name = o.FileName || o.fileName || o.Name || o.name
      if (typeof name === 'string' && name.length > 0) return name
    }
  }
  return null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const entityId = searchParams.get('entityId')
  const docType = searchParams.get('docType')

  if (!entityId || !docType) {
    return NextResponse.json({ error: 'entityId and docType are required' }, { status: 400 })
  }

  const summitField = OFFICE_DOC_SUMMIT_FIELDS[docType]
  if (!summitField) {
    return NextResponse.json({ error: `No Sumit field mapped for docType: ${docType}` }, { status: 400 })
  }

  try {
    const entity = await getSummitEntity(entityId)
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    const fieldValue = entity[summitField]
    const guid = extractFileGuid(fieldValue)
    if (!guid) {
      return NextResponse.json(
        {
          error: `Typed Sumit field "${summitField}" is empty or has an unrecognized shape — cannot extract file GUID`,
          shapeSample: Array.isArray(fieldValue)
            ? `array length ${fieldValue.length}, first item keys: ${
                fieldValue[0] && typeof fieldValue[0] === 'object'
                  ? Object.keys(fieldValue[0]).join(',')
                  : typeof fieldValue[0]
              }`
            : typeof fieldValue,
        },
        { status: 404 },
      )
    }

    const fileName = extractFileName(fieldValue) || `${docType}.bin`

    // Sumit downloadfile with our credentials. Auth pattern: API key in
    // headers or via query params depending on the endpoint variant. Sumit's
    // /crm/downloadfile/{GUID}/ accepts query-string credentials.
    const apiKey = (process.env.SUMMIT_API_KEY || '').trim()
    const companyId = process.env.SUMMIT_COMPANY_ID || ''
    if (!apiKey || !companyId) {
      return NextResponse.json({ error: 'Sumit credentials missing' }, { status: 500 })
    }

    const downloadUrl = `${SUMMIT_BASE}/crm/downloadfile/${encodeURIComponent(guid)}/?APIKey=${encodeURIComponent(apiKey)}&CompanyID=${encodeURIComponent(companyId)}`
    const upstream = await fetch(downloadUrl)
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Sumit downloadfile returned HTTP ${upstream.status}`, guid },
        { status: 502 },
      )
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
        'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
