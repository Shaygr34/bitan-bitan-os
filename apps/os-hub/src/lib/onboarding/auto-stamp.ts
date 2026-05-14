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
import fontkit from '@pdf-lib/fontkit'
import { getManagerStamp, type ManagerName } from './manager-stamps'
import { FORM_LAYOUTS } from './form-layouts'

/**
 * Hebrew-capable TTF cache. pdf-lib's StandardFonts.Helvetica is WinAnsi-
 * encoded and throws on any code point outside that range (e.g. ב = 0x05d1).
 * The firm name text "ביטן את ביטן רואי חשבון" hit this, breaking Path B
 * re-stamps. We fetch a variable-weight Heebo TTF from the Google Fonts
 * GitHub repo on first stamp, cache in module scope. ~150KB one-time fetch
 * per server boot.
 */
const HEEBO_TTF_URL = 'https://github.com/google/fonts/raw/main/ofl/heebo/Heebo%5Bwght%5D.ttf'
let cachedHebrewFontBytes: Uint8Array | null = null

async function getHebrewFontBytes(): Promise<Uint8Array | null> {
  if (cachedHebrewFontBytes) return cachedHebrewFontBytes
  try {
    const res = await fetch(HEEBO_TTF_URL)
    if (!res.ok) {
      console.warn('[auto-stamp] Hebrew font fetch returned', res.status)
      return null
    }
    cachedHebrewFontBytes = new Uint8Array(await res.arrayBuffer())
    return cachedHebrewFontBytes
  } catch (err) {
    console.warn('[auto-stamp] Hebrew font fetch threw:', err)
    return null
  }
}

/**
 * Coordinate overrides for Path B manual-overtake re-stamp.
 * Each subfield is partial — missing keys fall through to FORM_LAYOUTS defaults.
 * Used by the office click-to-place UI to nudge stamp / date placement when
 * auto-stamp's default location is wrong for a specific signed PDF.
 */
/**
 * Coordinate overrides for Path B manual placement.
 *
 * Two sub-modes per element:
 *   - LEGACY (top-left): `x` / `yFromTop` directly. Used by old call sites.
 *   - CENTER: `centerX` / `centerY` — the visual CENTER of the element.
 *     For images (officeStamp) the backend converts center→top-left AFTER
 *     embedding the PNG and reading the real aspect ratio. This eliminates
 *     the drift caused by approximating the aspect on the client side
 *     (Shay 2026-05-14: "actually does it more down" was because the
 *     frontend assumed aspect=0.5 but the real autograph PNG aspect is
 *     larger, so the top-left subtraction was wrong).
 *   - For text elements (officeDate, officeFirmName, clientDate), `centerY`
 *     is treated as the text baseline since text is single-line. `centerX`
 *     is offset by half the rendered text width — backend uses pdf-lib's
 *     `font.widthOfTextAtSize(...)` for the actual width.
 *
 * When BOTH a center value and a top-left value are provided, center wins.
 */
export interface ApplyStampCoordOverrides {
  officeStamp?: {
    x?: number; yFromTop?: number; widthPt?: number
    centerX?: number; centerY?: number
  }
  officeDate?: {
    x?: number; yFromTop?: number; fontSize?: number
    centerX?: number; centerY?: number
  }
  officeFirmName?: {
    x?: number; yFromTop?: number; fontSize?: number; text?: string
    centerX?: number; centerY?: number
  }
  /**
   * Path B v2 also lets the office reposition the client date painted by
   * the `alsoFillClientDate` backup path. When provided + alsoFillClientDate
   * is true, paints at the override; else falls through to FORM_LAYOUTS.
   */
  clientDate?: {
    x?: number; yFromTop?: number; fontSize?: number
    centerX?: number; centerY?: number
  }
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

  // Pull center-override fields up front for clarity.
  const ovStamp = options.coordOverrides?.officeStamp
  const ovDate = options.coordOverrides?.officeDate
  const ovFirm = options.coordOverrides?.officeFirmName
  const ovClientDate = options.coordOverrides?.clientDate

  // Office stamp — supports center-mode (Path B v2 drag UI). When center
  // coords supplied, use REAL embedded-PNG aspect for the height offset
  // instead of any client-side approximation. Eliminates the "ends up more
  // down than clicked" drift Shay flagged 2026-05-14.
  if (effOfficeStamp) {
    const stamp = getManagerStamp(options.manager)
    const png = await pdfDoc.embedPng(stamp.png)
    const aspect = png.height / png.width
    const stampWidth = effOfficeStamp.widthPt
    const stampHeight = stampWidth * aspect

    let topLeftX = effOfficeStamp.x
    let topLeftYFromTop = effOfficeStamp.yFromTop
    if (typeof ovStamp?.centerX === 'number' && typeof ovStamp?.centerY === 'number') {
      topLeftX = ovStamp.centerX - stampWidth / 2
      topLeftYFromTop = ovStamp.centerY - stampHeight / 2
    }

    page.drawImage(png, {
      x: topLeftX,
      y: height - topLeftYFromTop - stampHeight,
      width: stampWidth,
      height: stampHeight,
      opacity: 0.9,
    })
  }

  if (effOfficeDate) {
    let x = effOfficeDate.x
    let yFromTop = effOfficeDate.yFromTop
    if (typeof ovDate?.centerX === 'number' && typeof ovDate?.centerY === 'number') {
      const textWidth = font.widthOfTextAtSize(dateStr, effOfficeDate.fontSize)
      x = ovDate.centerX - textWidth / 2
      yFromTop = ovDate.centerY
    }
    page.drawText(dateStr, {
      x,
      y: height - yFromTop,
      size: effOfficeDate.fontSize,
      font,
      color: rgb(0, 0, 0),
    })
  }

  if (effOfficeFirmName) {
    // Hebrew text — Helvetica throws on Hebrew code points. Fetch + cache
    // Heebo TTF on first need. Soft-degrade: if fetch fails, firm name
    // silently skips so stamp + dates still render.
    try {
      const hebrewBytes = await getHebrewFontBytes()
      if (hebrewBytes) {
        pdfDoc.registerFontkit(fontkit)
        const hebrewFont = await pdfDoc.embedFont(hebrewBytes, { subset: true })

        let x = effOfficeFirmName.x
        let yFromTop = effOfficeFirmName.yFromTop
        if (typeof ovFirm?.centerX === 'number' && typeof ovFirm?.centerY === 'number') {
          const textWidth = hebrewFont.widthOfTextAtSize(effOfficeFirmName.text, effOfficeFirmName.fontSize)
          x = ovFirm.centerX - textWidth / 2
          yFromTop = ovFirm.centerY
        }
        page.drawText(effOfficeFirmName.text, {
          x,
          y: height - yFromTop,
          size: effOfficeFirmName.fontSize,
          font: hebrewFont,
          color: rgb(0, 0, 0),
        })
      } else {
        console.warn('[auto-stamp] firm name skipped — Hebrew font unavailable')
      }
    } catch (firmNameErr) {
      console.error('[auto-stamp] firm name paint failed:',
        firmNameErr instanceof Error ? firmNameErr.message : String(firmNameErr))
    }
  }

  // Client date — Path B v2 lets the office reposition this too (was: hard-
  // coded to FORM_LAYOUTS clientDate). Override falls back to FORM_LAYOUTS
  // when not supplied.
  if (options.alsoFillClientDate) {
    let x = layout.clientDate.x
    let yFromTop = layout.clientDate.autoStampTextBaselineFromTop
    const fontSize = ovClientDate?.fontSize ?? layout.clientDate.autoStampFontSize

    if (typeof ovClientDate?.centerX === 'number' && typeof ovClientDate?.centerY === 'number') {
      const textWidth = font.widthOfTextAtSize(dateStr, fontSize)
      x = ovClientDate.centerX - textWidth / 2
      yFromTop = ovClientDate.centerY
    } else if (typeof ovClientDate?.x === 'number' && typeof ovClientDate?.yFromTop === 'number') {
      x = ovClientDate.x
      yFromTop = ovClientDate.yFromTop
    }

    page.drawText(dateStr, {
      x,
      y: height - yFromTop,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    })
  }

  const out = await pdfDoc.save()
  return Buffer.from(out)
}

/** Re-exported for callers that import from auto-stamp.ts. */
export { formNeedsAutoStamp } from './form-layouts'
