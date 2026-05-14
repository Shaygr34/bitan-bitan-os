/**
 * POST /api/onboarding/docs/upload — Office-side onboarding doc upload.
 *
 * Lets the office fill onboarding doc slots (idCard, driverLicense, etc.)
 * directly from the OS instead of waiting for the client to use the intake
 * form. Used for two situations:
 *   1. Client uploaded a wrong file — office replaces with the right one.
 *   2. Client never used the intake form — office uploads the docs.
 *
 * Storage: Sanity asset for the file blob + Summit הערה in `label: url`
 * format that round-trips via summit-client.extractDocUrls back into the
 * OS DocumentsCard.
 *
 * P3.a — typed Summit fields (DOC_FIELDS_MAP in completion/summary route)
 * are NOT yet written. P3.b follow-up will wire those once Avi/Ron confirm
 * the field value format.
 */

import { NextResponse } from 'next/server'
import {
  isValidDocType,
  persistOfficeDoc,
} from '@/lib/onboarding/office-doc-storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Summit's documented per-file ceiling for Customers_Files is 20 MB. We match
// that. Original 12 MB cap was rejecting iPhone HEIC originals which routinely
// hit 14-18 MB. Tuned 2026-05-14 after a real demo hit the cap.
const MAX_FILE_BYTES = 20 * 1024 * 1024

const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
])

interface UploadRequestBody {
  summitEntityId: string
  docType: string
  /** Base64-encoded file bytes (without data URL prefix). */
  fileBase64: string
  /** MIME type — must be one of ALLOWED_CONTENT_TYPES. */
  contentType: string
  /** Original filename for the Sanity asset (defaults to a docType-based name). */
  filename?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<UploadRequestBody>
    const { summitEntityId, docType, fileBase64, contentType } = body
    const filename = body.filename

    if (!summitEntityId || !docType || !fileBase64 || !contentType) {
      return NextResponse.json(
        { error: 'summitEntityId, docType, fileBase64, and contentType are required' },
        { status: 400 },
      )
    }

    if (!isValidDocType(docType)) {
      return NextResponse.json(
        { error: `Unsupported docType: ${docType}` },
        { status: 400 },
      )
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `Unsupported contentType: ${contentType}. Allowed: ${[...ALLOWED_CONTENT_TYPES].join(', ')}` },
        { status: 400 },
      )
    }

    let buffer: Buffer
    try {
      buffer = Buffer.from(fileBase64, 'base64')
    } catch {
      return NextResponse.json({ error: 'Invalid base64' }, { status: 400 })
    }

    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    }
    if (buffer.byteLength > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${buffer.byteLength} bytes). Max ${MAX_FILE_BYTES} bytes.` },
        { status: 413 },
      )
    }

    const ext =
      contentType === 'application/pdf'
        ? 'pdf'
        : contentType === 'image/jpeg'
          ? 'jpg'
          : contentType === 'image/png'
            ? 'png'
            : contentType === 'image/webp'
              ? 'webp'
              : 'bin'
    const finalFilename = filename || `${docType}-${summitEntityId}-${Date.now()}.${ext}`

    const url = await persistOfficeDoc({
      buffer,
      filename: finalFilename,
      contentType,
      docType,
      summitEntityId,
    })

    if (!url) {
      return NextResponse.json(
        { error: 'Sanity upload failed (env creds may be missing on this deploy)' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, docType, url }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
