/**
 * PDF Marker — adds invisible signature markers to PDFs for 2Sign placement,
 * and surfaces the 2Sign date-field rectangle that the signing API consumes.
 *
 * Coordinates: imported from `form-layouts.ts` (single source of truth).
 * This file is the 2Sign-side consumer; `auto-stamp.ts` is the post-sign
 * paint-side consumer.
 *
 * Marker approach:
 * - Client signature: "§" characters (white, opacity 0.01) — invisible
 * - Office counter-sign: previously "†" — REMOVED post-Option C (PR #127).
 *   Forms with `officeStamp` in FORM_LAYOUTS now use auto-stamp instead of
 *   2Sign for the office side, so no office marker is needed in the uploaded
 *   PDF.
 * - Size determines the signature field dimensions.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { FORM_LAYOUTS, getSupportedFormTypes } from './form-layouts'

const CLIENT_MARKER = '§§§§§§§§§§'
const MARKER_SIZE = 22
const MARKER_COLOR = rgb(1, 1, 1) // white = invisible
const MARKER_OPACITY = 0.01

/** Date field position for 2Sign SignaturePositions array (fieldType: 4 = Date auto-fill). */
export interface DatePosition {
  x: number
  y: number // 2Sign coords (from top), corresponds to the rectangle TOP
  width: number
  height: number
}

export interface MarkedPdfResult {
  /** Modified PDF buffer with invisible marker(s) */
  pdfBuffer: Buffer
  /** Marker character for client signature */
  clientMarker: string
  /**
   * Whether this form requires an office counter-signature in 2Sign.
   * Post-Option C, ALL forms with auto-stamp return false here — the office
   * side is handled post-sign by auto-stamp.ts. Future forms that still need
   * a 2Sign office signer (no auto-stamp path) can set this true.
   */
  requiresCounterSign: boolean
  /** 2Sign date-field rectangle for client side (passed via SignaturePositions with fieldType: 4) */
  clientDatePosition?: DatePosition
  /**
   * Office marker character — kept for API compatibility with the callers in
   * twosign-client.ts. Always undefined post-Option C since no forms use a
   * 2Sign office signer anymore. The office routine block in
   * initiateSigning() is provably unreachable as a result; P2 cleanup will
   * remove it. Until then, this field keeps the type contract intact.
   */
  officeMarker?: string
  /**
   * Office date 2Sign rectangle — same API-compat reason as officeMarker.
   * Always undefined post-Option C.
   */
  officeDatePosition?: DatePosition
}

/**
 * Add invisible signature marker(s) to a PDF for 2Sign placement.
 *
 * @param pdfBuffer - Original PDF file buffer
 * @param formType - Form type key from FORM_LAYOUTS
 * @returns Modified PDF with marker(s) + 2Sign date-field rectangle for client
 */
export async function addSignatureMarkers(
  pdfBuffer: Buffer,
  formType: string,
): Promise<MarkedPdfResult> {
  const layout = FORM_LAYOUTS[formType]
  if (!layout) {
    throw new Error(`Unknown form type: ${formType}. Valid: ${getSupportedFormTypes().join(', ')}`)
  }

  const pdfDoc = await PDFDocument.load(pdfBuffer)
  const page = pdfDoc.getPages()[0]
  const { height } = page.getSize()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // Client signature marker (always present)
  page.drawText(CLIENT_MARKER, {
    x: layout.clientSignature.x,
    y: height - layout.clientSignature.yFromTop,
    size: MARKER_SIZE,
    font,
    color: MARKER_COLOR,
    opacity: MARKER_OPACITY,
  })

  // Note: no office marker is drawn. Forms with `officeStamp` use auto-stamp
  // (post-Option C); forms without it have no office step at all.

  const modifiedBytes = await pdfDoc.save()

  return {
    pdfBuffer: Buffer.from(modifiedBytes),
    clientMarker: '§',
    // requiresCounterSign refers ONLY to 2Sign-side counter-sign (which is now
    // always false for forms in this codebase). Auto-stamp is decided
    // separately via form-layouts.formNeedsAutoStamp().
    requiresCounterSign: false,
    clientDatePosition: {
      x: layout.clientDate.x,
      y: layout.clientDate.twoSignFieldRectTopFromTop,
      width: layout.clientDate.twoSignFieldWidth,
      height: layout.clientDate.twoSignFieldHeight,
    },
  }
}

/** Re-exported for callers that import from pdf-marker.ts. */
export { getSupportedFormTypes } from './form-layouts'
