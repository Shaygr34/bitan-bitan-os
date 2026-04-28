/**
 * PDF Marker — adds invisible signature markers to PDFs for 2Sign placement.
 *
 * 2Sign's SearchWordForMarkingSignature finds these markers and places
 * drawable signature fields at their exact positions.
 *
 * Marker approach:
 * - Client signature: "§" characters (white, opacity 0.01)
 * - Office counter-sign: "†" characters
 * - Size determines the signature field dimensions
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const CLIENT_MARKER = '§§§§§§§§§§'
const OFFICE_MARKER = '††††††††††'
const MARKER_SIZE = 22
const MARKER_COLOR = rgb(1, 1, 1) // white = invisible
const MARKER_OPACITY = 0.01

/**
 * Signature positions per form type.
 * Coordinates are in pdf-lib system (origin = bottom-left).
 */
const FORM_POSITIONS: Record<string, {
  client: { x: number; yFromTop: number }
  office?: { x: number; yFromTop: number }
}> = {
  // רשות המיסים ייפוי כוח (page: 612 x 792)
  'poa-tax-authority': {
    client: { x: 220, yFromTop: 430 },  // חתימת בן זוג רשום/העוסק
    office: { x: 100, yFromTop: 618 },  // חתימה וחותמת in section ב (~78% from top)
  },
  // ביטוח לאומי ניכויים (page: 594.96 x 841.92)
  'poa-nii-withholdings': {
    client: { x: 150, yFromTop: 539 },  // חתימת המעסיק/ה (~64% from top = height * 0.64)
    // No office counter-signature needed
  },
}

export interface MarkedPdfResult {
  /** Modified PDF buffer with invisible markers */
  pdfBuffer: Buffer
  /** Marker character for client signature */
  clientMarker: string
  /** Marker character for office counter-signature (if applicable) */
  officeMarker?: string
  /** Whether this form requires office counter-signature */
  requiresCounterSign: boolean
}

/**
 * Add invisible signature markers to a PDF for 2Sign placement.
 *
 * @param pdfBuffer - Original PDF file buffer
 * @param formType - Form type key from FORM_POSITIONS
 * @returns Modified PDF with markers + marker characters for SearchWord
 */
export async function addSignatureMarkers(
  pdfBuffer: Buffer,
  formType: string,
): Promise<MarkedPdfResult> {
  const positions = FORM_POSITIONS[formType]
  if (!positions) {
    throw new Error(`Unknown form type: ${formType}. Valid: ${Object.keys(FORM_POSITIONS).join(', ')}`)
  }

  const pdfDoc = await PDFDocument.load(pdfBuffer)
  const page = pdfDoc.getPages()[0]
  const { height } = page.getSize()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // Add client signature marker
  page.drawText(CLIENT_MARKER, {
    x: positions.client.x,
    y: height - positions.client.yFromTop,
    size: MARKER_SIZE,
    font,
    color: MARKER_COLOR,
    opacity: MARKER_OPACITY,
  })

  // Add office counter-signature marker if needed
  const requiresCounterSign = !!positions.office
  if (positions.office) {
    page.drawText(OFFICE_MARKER, {
      x: positions.office.x,
      y: height - positions.office.yFromTop,
      size: MARKER_SIZE,
      font,
      color: MARKER_COLOR,
      opacity: MARKER_OPACITY,
    })
  }

  const modifiedBytes = await pdfDoc.save()

  return {
    pdfBuffer: Buffer.from(modifiedBytes),
    clientMarker: '§',
    officeMarker: requiresCounterSign ? '†' : undefined,
    requiresCounterSign,
  }
}

/** Get the list of supported form types */
export function getSupportedFormTypes(): string[] {
  return Object.keys(FORM_POSITIONS)
}
