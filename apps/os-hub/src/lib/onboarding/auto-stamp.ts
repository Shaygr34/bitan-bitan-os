/**
 * Auto-stamp — applies the office אישור מנהל תיק watermark + date to a
 * client-signed PDF, removing the need for a manual office counter-sign step
 * in 2Sign (Option C / PR #127).
 *
 * Flow: client signs once → this module fetches the signed PDF → embeds
 * Avi/Ron's autograph PNG at the office stamp position → fills the office
 * date next to it → optionally fills the client date as a backup when 2Sign's
 * auto-fill missed → returns the final stamped PDF as a Buffer.
 *
 * Coordinates: imported from `form-layouts.ts` (single source of truth).
 * pdf-marker.ts is the 2Sign-side consumer; this file is the post-sign
 * paint-side consumer. See form-layouts.ts for the rationale on why some
 * fields (like clientDate) carry both 2Sign-rectangle and text-baseline
 * anchors.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getManagerStamp, type ManagerName } from './manager-stamps'
import { FORM_LAYOUTS } from './form-layouts'

/**
 * Coordinate overrides for Path B manual-overtake re-stamp.
 * Each subfield is partial — missing keys fall through to FORM_LAYOUTS defaults.
 * Used by the office click-to-place UI to nudge stamp / date placement when
 * auto-stamp's default location is wrong for a specific signed PDF.
 */
export interface ApplyStampCoordOverrides {
  officeStamp?: { x?: number; yFromTop?: number; widthPt?: number }
  officeDate?: { x?: number; yFromTop?: number; fontSize?: number }
  officeFirmName?: { x?: number; yFromTop?: number; fontSize?: number; text?: string }
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
  /** Form type — must match a key in FORM_LAYOUTS */
  formType: string
  /** Which manager's autograph to apply (resolved from מנהל תיק upstream) */
  manager: ManagerName
  /** Override signed-on date (defaults to today). Format: dd/mm/yyyy */
  signedDate?: string
  /** Stamp client signature date too — useful when 2Sign auto-fill missed */
  alsoFillClientDate?: boolean
  /**
   * Per-call coordinate overrides for officeStamp / officeDate. Missing keys
   * fall through to FORM_LAYOUTS defaults. Used by the Path B manual-overtake
   * re-stamp flow so the office can nudge placement on a specific signed PDF
   * without changing the form's defaults for everyone.
   */
  coordOverrides?: ApplyStampCoordOverrides
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
  const layout = FORM_LAYOUTS[options.formType]
  if (!layout) {
    throw new Error(`No form layout for form type: ${options.formType}`)
  }

  const pdfDoc = await PDFDocument.load(signedPdfBuffer)
  const page = pdfDoc.getPages()[0]
  const { width, height } = page.getSize()
  const dateStr = options.signedDate || formatToday()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // Resolve effective coordinates: FORM_LAYOUTS defaults, overridden per-call
  // by options.coordOverrides (Path B manual-overtake). Each override key is
  // optional and only the provided fields shift; missing keys keep defaults.
  const effOfficeStamp = layout.officeStamp
    ? {
        x: options.coordOverrides?.officeStamp?.x ?? layout.officeStamp.x,
        yFromTop: options.coordOverrides?.officeStamp?.yFromTop ?? layout.officeStamp.yFromTop,
        widthPt: options.coordOverrides?.officeStamp?.widthPt ?? layout.officeStamp.widthPt,
      }
    : undefined
  const effOfficeDate = layout.officeDate
    ? {
        x: options.coordOverrides?.officeDate?.x ?? layout.officeDate.x,
        yFromTop: options.coordOverrides?.officeDate?.yFromTop ?? layout.officeDate.yFromTop,
        fontSize: options.coordOverrides?.officeDate?.fontSize ?? layout.officeDate.fontSize,
      }
    : undefined
  const effOfficeFirmName = layout.officeFirmName
    ? {
        x: options.coordOverrides?.officeFirmName?.x ?? layout.officeFirmName.x,
        yFromTop: options.coordOverrides?.officeFirmName?.yFromTop ?? layout.officeFirmName.yFromTop,
        fontSize: options.coordOverrides?.officeFirmName?.fontSize ?? layout.officeFirmName.fontSize,
        text: options.coordOverrides?.officeFirmName?.text ?? layout.officeFirmName.text,
      }
    : undefined

  // Diagnostic — surfaces effective coordinates in Railway logs so any future
  // placement drift (#126-class bug) is debuggable in seconds, not hours.
  console.log('[auto-stamp]', {
    formType: options.formType,
    manager: options.manager,
    pageSize: { width, height },
    officeStamp: effOfficeStamp,
    officeDate: effOfficeDate,
    clientDate: layout.clientDate,
    overridden: !!options.coordOverrides,
    dateStr,
  })

  // Office stamp + date (only if form has an office counter-stamp)
  if (effOfficeStamp) {
    const stamp = getManagerStamp(options.manager)
    const png = await pdfDoc.embedPng(stamp.png)
    const aspect = png.height / png.width
    const stampWidth = effOfficeStamp.widthPt
    const stampHeight = stampWidth * aspect
    page.drawImage(png, {
      x: effOfficeStamp.x,
      // Anchor the bottom of the image at (yFromTop) measured from page top
      y: height - effOfficeStamp.yFromTop - stampHeight,
      width: stampWidth,
      height: stampHeight,
      opacity: 0.9,
    })
  }

  if (effOfficeDate) {
    page.drawText(dateStr, {
      x: effOfficeDate.x,
      y: height - effOfficeDate.yFromTop,
      size: effOfficeDate.fontSize,
      font,
      color: rgb(0, 0, 0),
    })
  }

  if (effOfficeFirmName) {
    page.drawText(effOfficeFirmName.text, {
      x: effOfficeFirmName.x,
      y: height - effOfficeFirmName.yFromTop,
      size: effOfficeFirmName.fontSize,
      font,
      color: rgb(0, 0, 0),
    })
  }

  if (options.alsoFillClientDate) {
    page.drawText(dateStr, {
      x: layout.clientDate.x,
      y: height - layout.clientDate.autoStampTextBaselineFromTop,
      size: layout.clientDate.autoStampFontSize,
      font,
      color: rgb(0, 0, 0),
    })
  }

  const out = await pdfDoc.save()
  return Buffer.from(out)
}

/** Re-exported for callers that import from auto-stamp.ts. */
export { formNeedsAutoStamp } from './form-layouts'
