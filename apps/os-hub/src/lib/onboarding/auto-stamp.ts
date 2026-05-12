/**
 * Auto-stamp — applies the office אישור מנהל תיק watermark + date to a
 * client-signed PDF, removing the need for a manual office counter-sign step
 * in 2Sign.
 *
 * Flow elevation: previously the office signer (Avi/Ron) received a 2Sign
 * email after the client signed and had to log in and draw their signature.
 * Now: the client signs once → this module fetches the signed PDF → embeds
 * Avi/Ron's autograph PNG at the office signature position from FORM_POSITIONS
 * → fills the date next to it → returns the final stamped PDF as a Buffer.
 *
 * Coordinates are owned by pdf-marker.ts (single source of truth for both
 * signature placement and stamping). Date strings are formatted in he-IL
 * dd/mm/yyyy.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getManagerStamp, type ManagerName } from './manager-stamps'

/** Layout per form. Mirrors FORM_POSITIONS in pdf-marker.ts but for stamping. */
interface StampLayout {
  office?: {
    /** Bottom-left x in PDF points where stamp image is drawn */
    x: number
    /** Distance from top of page in PDF points */
    yFromTop: number
    /** Stamp width in pt (height auto-computed from PNG aspect ratio) */
    widthPt: number
  }
  /** Date text drawn next to office stamp */
  officeDate?: {
    x: number
    yFromTop: number
    fontSize: number
  }
  /** Date text drawn next to client signature (auto-fill replacement when 2Sign field unreliable) */
  clientDate?: {
    x: number
    yFromTop: number
    fontSize: number
  }
}

/**
 * Stamp + date positions per form type.
 *
 * Tuned against the real PDFs in /tmp/bitan-autograph-extract:
 *   tax-authority.pdf (Letter 612x792)
 *   btl-nikuyim.pdf   (A4 594.96x841.92) — no office stamp (employer signs alone)
 */
const STAMP_LAYOUTS: Record<string, StampLayout> = {
  'poa-tax-authority': {
    // Section ב on רשות המיסים POA — אישור מנהל התיק.
    // Coordinates tuned visually against signed PDFs from production (2026-05-12).
    // - office stamp anchored top-edge at y=540 from page top → bottom of stamp lands on firm signature line.
    // - Date positions (verified against shay-test-3 stamped PDF on 2026-05-12):
    //   * officeDate at yFromTop=640 (post-#126) dropped INTO "דברי הסבר" body text — bug.
    //   * officeDate at yFromTop=615 (pre-#126) sat ON the label "תאריך" row — also wrong.
    //   * The actual underline (where dates fill) sits ~12pt ABOVE the label row.
    //   * Date column x: signature labels measure ~420pt; the prior 485 was 65pt too far right.
    office: { x: 90, yFromTop: 540, widthPt: 95 },
    officeDate: { x: 420, yFromTop: 605, fontSize: 11 },
    clientDate: { x: 420, yFromTop: 422, fontSize: 11 },
  },
  'poa-nii-withholdings': {
    // BTL ניכויים has no office counter-sign (employer signs alone) — date only.
    clientDate: { x: 350, yFromTop: 542, fontSize: 11 },
  },
}

/** Format today's date as dd/mm/yyyy (Israeli convention). */
function formatToday(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export interface ApplyStampOptions {
  /** Form type — must match a key in STAMP_LAYOUTS */
  formType: string
  /** Which manager's autograph to apply (resolved from מנהל תיק upstream) */
  manager: ManagerName
  /** Override signed-on date (defaults to today). Format: dd/mm/yyyy */
  signedDate?: string
  /** Stamp client signature date too — useful when 2Sign auto-fill missed */
  alsoFillClientDate?: boolean
}

/**
 * Apply office אישור מנהל תיק stamp + date to a signed PDF.
 *
 * @param signedPdfBuffer  Client-signed PDF as returned from 2Sign
 * @param options          Form type, manager, optional date overrides
 * @returns                Final stamped PDF buffer (pdf-lib output)
 */
export async function applyOfficeStamp(
  signedPdfBuffer: Buffer,
  options: ApplyStampOptions,
): Promise<Buffer> {
  const layout = STAMP_LAYOUTS[options.formType]
  if (!layout) {
    throw new Error(`No stamp layout for form type: ${options.formType}`)
  }

  const pdfDoc = await PDFDocument.load(signedPdfBuffer)
  const page = pdfDoc.getPages()[0]
  const { height } = page.getSize()
  const dateStr = options.signedDate || formatToday()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // Office stamp + date (only if form requires it)
  if (layout.office) {
    const stamp = getManagerStamp(options.manager)
    const png = await pdfDoc.embedPng(stamp.png)
    const aspect = png.height / png.width
    const stampWidth = layout.office.widthPt
    const stampHeight = stampWidth * aspect
    page.drawImage(png, {
      x: layout.office.x,
      // Anchor the bottom of the image at (yFromTop) measured from page top
      y: height - layout.office.yFromTop - stampHeight,
      width: stampWidth,
      height: stampHeight,
      opacity: 0.9,
    })
  }

  if (layout.officeDate) {
    page.drawText(dateStr, {
      x: layout.officeDate.x,
      y: height - layout.officeDate.yFromTop,
      size: layout.officeDate.fontSize,
      font,
      color: rgb(0, 0, 0),
    })
  }

  if (options.alsoFillClientDate && layout.clientDate) {
    page.drawText(dateStr, {
      x: layout.clientDate.x,
      y: height - layout.clientDate.yFromTop,
      size: layout.clientDate.fontSize,
      font,
      color: rgb(0, 0, 0),
    })
  }

  const out = await pdfDoc.save()
  return Buffer.from(out)
}

/** Whether a form type triggers auto-stamp (i.e. has an office position). */
export function formNeedsAutoStamp(formType: string): boolean {
  return !!STAMP_LAYOUTS[formType]?.office
}
